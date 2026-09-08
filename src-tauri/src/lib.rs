use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

// Desktop-only imports (TCP single-instance, OS shell commands)
#[cfg(not(target_os = "android"))]
use std::io::Read;
#[cfg(not(target_os = "android"))]
use std::net::{TcpListener, TcpStream};
#[cfg(not(target_os = "android"))]
use std::process::Command;
#[cfg(not(target_os = "android"))]
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    endpoint: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatResponse {
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeepSeekResponse {
    choices: Option<Vec<DeepSeekChoice>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeepSeekChoice {
    message: Option<DeepSeekMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeepSeekMessage {
    content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeepSeekError {
    error: Option<DeepSeekErrorBody>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeepSeekErrorBody {
    message: Option<String>,
}

#[tauri::command]
async fn chat_with_ai(request: ChatRequest) -> Result<ChatResponse, String> {
    let mut endpoint = request.endpoint.trim().to_string();
    if endpoint.is_empty() || !endpoint.starts_with("http") {
        return Err(format!("Invalid API endpoint: {}", endpoint));
    }

    if !endpoint.ends_with("/chat/completions") {
        endpoint = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let body = serde_json::json!({
        "model": request.model.trim(),
        "messages": request.messages.iter().map(|message| {
            serde_json::json!({
                "role": message.role,
                "content": message.content,
            })
        }).collect::<Vec<_>>(),
        "stream": false,
    });

    let response = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header(
            "Authorization",
            format!("Bearer {}", request.api_key.trim()),
        )
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();

    if !status.is_success() {
        let err_body = response
            .json::<DeepSeekError>()
            .await
            .unwrap_or(DeepSeekError { error: None });
        let message = err_body
            .error
            .and_then(|error| error.message)
            .unwrap_or_else(|| format!("HTTP {}", status));
        return Err(message);
    }

    let data = response
        .json::<DeepSeekResponse>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = data
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.message)
        .and_then(|message| message.content)
        .unwrap_or_else(|| "(No response content)".to_string());

    Ok(ChatResponse { content })
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}

/// Writes binary data (e.g. a pasted image) to `path`, creating parent
/// directories as needed. Goes through Rust instead of the fs plugin so it is
/// not limited by the fs capability scope — the target directory is wherever
/// the user's document lives.
#[tauri::command]
fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_mtime(path: String) -> Result<Option<u64>, String> {
    match std::fs::metadata(&path) {
        Ok(meta) => match meta.modified() {
            Ok(time) => {
                let millis = time
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_millis() as u64;
                Ok(Some(millis))
            }
            Err(_) => Ok(None),
        },
        Err(_) => Ok(None),
    }
}

// ── Session persistence ──

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Unable to determine app data directory: {e}"))
}

fn session_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn is_valid_json(data: &str) -> bool {
    matches!(
        serde_json::from_str::<serde_json::Value>(data),
        Ok(serde_json::Value::Object(_))
    )
}

fn write_synced_file(path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(data).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn replace_file(source: &std::path::Path, destination: &std::path::Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();

    let result = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };

    if result == 0 {
        Err(std::io::Error::last_os_error().to_string())
    } else {
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn replace_file(source: &std::path::Path, destination: &std::path::Path) -> Result<(), String> {
    std::fs::rename(source, destination).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_session(app: tauri::AppHandle, data: String) -> Result<(), String> {
    if !is_valid_json(&data) {
        return Err("Refusing to save an invalid session document".to_string());
    }

    let dir = session_dir(&app)?;
    let path = dir.join("session.json");
    let tmp = dir.join("session.json.tmp");
    let bak = dir.join("session.json.bak");

    write_synced_file(&tmp, data.as_bytes())
        .map_err(|e| format!("Failed to write temporary session file: {e}"))?;

    if path.exists() {
        if let Ok(previous) = std::fs::read_to_string(&path) {
            if is_valid_json(&previous) {
                let _ = std::fs::copy(&path, &bak);
            }
        }
    }

    replace_file(&tmp, &path).map_err(|e| format!("Failed to replace session file: {e}"))?;

    Ok(())
}

#[tauri::command]
fn load_session(app: tauri::AppHandle) -> Result<String, String> {
    let dir = session_dir(&app)?;
    let path = dir.join("session.json");
    let tmp = dir.join("session.json.tmp");
    let bak = dir.join("session.json.bak");

    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if is_valid_json(&data) {
                return Ok(data);
            }
        }
    }

    if bak.exists() {
        if let Ok(data) = std::fs::read_to_string(&bak) {
            if is_valid_json(&data) {
                if write_synced_file(&tmp, data.as_bytes()).is_ok() {
                    let _ = replace_file(&tmp, &path);
                }
                return Ok(data);
            }
        }
    }

    Ok(String::new())
}

// ── Desktop-only: OS shell commands ──

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", target.display()))
            .spawn()
            .map_err(|e| format!("Failed to reveal in Explorer: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Failed to reveal in Finder: {e}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let directory = target
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| target.clone());

        Command::new("xdg-open")
            .arg(directory)
            .spawn()
            .map_err(|e| format!("Failed to open containing folder: {e}"))?;
    }

    Ok(())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn open_app_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = session_dir(&app)?;
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ── Untitled document recovery ──

#[derive(Debug, Serialize, Deserialize)]
struct UntitledDoc {
    id: String,
    name: String,
    content: String,
}

fn untitled_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = session_dir(app)?.join("untitled");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn save_untitled_docs(app: tauri::AppHandle, docs: Vec<UntitledDoc>) -> Result<(), String> {
    let dir = untitled_dir(&app)?;
    for doc in docs {
        let path = dir.join(format!("{}.json", doc.id));
        let json = serde_json::to_string(&doc).map_err(|e| e.to_string())?;
        std::fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn load_untitled_docs(app: tauri::AppHandle) -> Result<Vec<UntitledDoc>, String> {
    let dir = untitled_dir(&app)?;
    let mut docs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "json") {
                if let Ok(data) = std::fs::read_to_string(&path) {
                    if let Ok(doc) = serde_json::from_str::<UntitledDoc>(&data) {
                        docs.push(doc);
                    }
                }
            }
        }
    }
    Ok(docs)
}

#[tauri::command]
fn remove_untitled_doc(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = untitled_dir(&app)?.join(format!("{}.json", id));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════
// Android SAF (Storage Access Framework) commands
// ═══════════════════════════════════════════════════════════════════════════
//
// On Android the system file picker returns content:// URIs that must be
// read and written through the ContentResolver.  These commands delegate to a
// Kotlin plugin (FileAccessPlugin.kt, see
// src-tauri/gen/android/app/src/main/java/com/markflow/editor/) whose
// @Command methods are invoked via the plugin handle registered in `init`.
// File-picker results and error messages are forwarded verbatim.

#[cfg(target_os = "android")]
mod android_saf {
    use super::*;
    use serde_json::json;
    use tauri::plugin::PluginHandle;
    use tauri::Manager;

    /// Handle to the Kotlin `FileAccessPlugin`, created in the plugin setup hook.
    /// Holds the `PluginHandle` used to invoke `@Command` methods on the Kotlin side.
    struct FileAccessHandle(PluginHandle<tauri::Wry>);

    fn plugin_handle(app: &tauri::AppHandle) -> Result<PluginHandle<tauri::Wry>, String> {
        app.try_state::<FileAccessHandle>()
            .map(|handle| handle.0.clone())
            .ok_or_else(|| "fileaccess plugin is not initialized".to_string())
    }

    /// Tauri plugin that registers the Kotlin `FileAccessPlugin` on the native
    /// side via JNI (`register_android_plugin`), so Rust commands can invoke its
    /// `@Command` methods through the plugin handle.
    pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
        use tauri::plugin::Builder;
        Builder::new("fileaccess")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.markflow.editor", "FileAccessPlugin")?;
                app.manage(FileAccessHandle(handle));
                Ok(())
            })
            .build()
    }

    #[tauri::command]
    pub async fn pick_and_read_file(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
        plugin_handle(&app)?
            .run_mobile_plugin_async::<serde_json::Value>("pickAndReadFile", ())
            .await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn write_file_via_uri(
        app: tauri::AppHandle,
        uri: String,
        content: String,
    ) -> Result<(), String> {
        let result: serde_json::Value = plugin_handle(&app)?
            .run_mobile_plugin_async("writeFileViaUri", json!({ "uri": uri, "content": content }))
            .await
            .map_err(|e| e.to_string())?;
        // The Kotlin plugin returns { "ok": true } on success
        if result.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
            Ok(())
        } else {
            let msg = result
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error writing file");
            Err(msg.to_string())
        }
    }

    #[tauri::command]
    pub async fn create_new_file(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
        plugin_handle(&app)?
            .run_mobile_plugin_async::<serde_json::Value>("createNewFile", ())
            .await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn save_file_as(
        app: tauri::AppHandle,
        content: String,
        suggested_name: String,
    ) -> Result<serde_json::Value, String> {
        plugin_handle(&app)?
            .run_mobile_plugin_async(
                "saveFileAs",
                json!({ "content": content, "suggestedName": suggested_name }),
            )
            .await
            .map_err(|e| e.to_string())
    }

    /// Drafts are stored per document URI so editing file B cannot clobber
    /// file A's unsaved draft. Untitled content uses a single shared slot.
    fn draft_path(app: &tauri::AppHandle, uri: &str) -> Result<PathBuf, String> {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let dir = session_dir(app)?.join("drafts");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        let mut hasher = DefaultHasher::new();
        if uri.is_empty() {
            "untitled".hash(&mut hasher);
        } else {
            uri.hash(&mut hasher);
        }
        Ok(dir.join(format!("{:016x}.json", hasher.finish())))
    }

    #[tauri::command]
    pub async fn save_android_draft(
        app: tauri::AppHandle,
        uri: String,
        name: String,
        content: String,
    ) -> Result<(), String> {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let draft = json!({
            "uri": uri,
            "name": name,
            "content": content,
            "updatedAt": now_ms,
        });

        // Atomic replace so a kill mid-write cannot truncate the draft.
        let path = draft_path(&app, &uri)?;
        let tmp = path.with_extension("tmp");
        write_synced_file(
            &tmp,
            serde_json::to_vec(&draft)
                .map_err(|e| e.to_string())?
                .as_slice(),
        )
        .map_err(|e| e.to_string())?;
        replace_file(&tmp, &path)
    }

    #[tauri::command]
    pub async fn load_android_draft(
        app: tauri::AppHandle,
        uri: String,
    ) -> Result<serde_json::Value, String> {
        let path = draft_path(&app, &uri)?;
        if path.exists() {
            let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            match serde_json::from_str(&data) {
                Ok(value) => Ok(value),
                // Corrupted draft (e.g. truncated): drop it instead of failing
                // forever on every launch.
                Err(_) => {
                    let _ = std::fs::remove_file(&path);
                    Ok(json!(null))
                }
            }
        } else {
            Ok(json!(null))
        }
    }

    #[tauri::command]
    pub async fn clear_android_draft(app: tauri::AppHandle, uri: String) -> Result<(), String> {
        let path = draft_path(&app, &uri)?;
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// App builder — shared between desktop and mobile
// ═══════════════════════════════════════════════════════════════════════════

fn build_app() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
}

// ═══════════════════════════════════════════════════════════════════════════
// Desktop: single-instance TCP coordination
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(not(target_os = "android"))]
mod desktop_run {
    use super::*;

    const INSTANCE_PORT: u16 = 48721;

    #[derive(Debug, Serialize, Deserialize)]
    struct InstanceMessage {
        paths: Vec<String>,
    }

    struct PendingOpenFiles(std::sync::Mutex<Vec<String>>);

    #[tauri::command]
    fn take_pending_open_files(state: tauri::State<'_, PendingOpenFiles>) -> Vec<String> {
        state
            .0
            .lock()
            .map(|mut pending| std::mem::take(&mut *pending))
            .unwrap_or_default()
    }

    fn queue_open_files(app: &tauri::AppHandle, paths: Vec<String>) {
        if paths.is_empty() {
            return;
        }
        if let Some(state) = app.try_state::<PendingOpenFiles>() {
            if let Ok(mut pending) = state.0.lock() {
                pending.extend(paths);
            }
        }
    }

    fn forward_to_existing_instance(startup_files: &[String]) -> bool {
        if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", INSTANCE_PORT)) {
            let message = InstanceMessage {
                paths: startup_files.to_vec(),
            };
            if let Ok(data) = serde_json::to_vec(&message) {
                return stream.write_all(&data).and_then(|_| stream.flush()).is_ok();
            }
        }
        false
    }

    fn run_first_instance(startup_files: Vec<String>, listener: Option<TcpListener>) {
        let (tx, rx) = std::sync::mpsc::channel::<Vec<String>>();

        if let Some(listener) = listener {
            std::thread::spawn(move || {
                for stream in listener.incoming() {
                    if let Ok(mut stream) = stream {
                        let mut buf = String::new();
                        if stream.read_to_string(&mut buf).is_ok() {
                            if let Ok(message) = serde_json::from_str::<InstanceMessage>(&buf) {
                                let _ = tx.send(message.paths);
                            } else {
                                // Empty or invalid message → just activate window
                                let _ = tx.send(Vec::new());
                            }
                        }
                    }
                }
            });
        }

        build_app()
            .manage(PendingOpenFiles(std::sync::Mutex::new(startup_files)))
            .invoke_handler(tauri::generate_handler![
                // Shared commands
                chat_with_ai,
                read_file_content,
                write_file_content,
                write_binary_file,
                get_file_mtime,
                save_session,
                load_session,
                save_untitled_docs,
                load_untitled_docs,
                remove_untitled_doc,
                exit_app,
                // Desktop-only commands
                reveal_in_folder,
                open_app_data_dir,
                take_pending_open_files
            ])
            .setup(move |app| {
                if cfg!(debug_assertions) {
                    app.handle().plugin(
                        tauri_plugin_log::Builder::default()
                            .level(log::LevelFilter::Info)
                            .build(),
                    )?;
                }

                let handle = app.handle().clone();

                std::thread::spawn(move || {
                    for paths in rx {
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                        if !paths.is_empty() {
                            queue_open_files(&handle, paths);
                            let _ = handle.emit("open-file-requested", ());
                        }
                    }
                });

                Ok(())
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }

    pub fn run(startup_files: Vec<String>) {
        match TcpListener::bind(("127.0.0.1", INSTANCE_PORT)) {
            Ok(listener) => {
                run_first_instance(startup_files, Some(listener));
            }
            Err(_) => {
                if !forward_to_existing_instance(&startup_files) {
                    run_first_instance(startup_files, None);
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Mobile entry point
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(target_os = "android")]
mod mobile_run {
    use super::*;

    pub fn run(_startup_files: Vec<String>) {
        build_app()
            .plugin(android_saf::init())
            .invoke_handler(tauri::generate_handler![
                // Shared commands
                chat_with_ai,
                read_file_content,
                write_file_content,
                write_binary_file,
                get_file_mtime,
                save_session,
                load_session,
                save_untitled_docs,
                load_untitled_docs,
                remove_untitled_doc,
                exit_app,
                // Android-only SAF commands
                android_saf::pick_and_read_file,
                android_saf::write_file_via_uri,
                android_saf::create_new_file,
                android_saf::save_file_as,
                android_saf::save_android_draft,
                android_saf::load_android_draft,
                android_saf::clear_android_draft
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Unified entry point
// ═══════════════════════════════════════════════════════════════════════════

// Android: `mobile_entry_point` requires a zero-argument run().
#[cfg(target_os = "android")]
#[tauri::mobile_entry_point]
pub fn run() {
    mobile_run::run(Vec::new());
}

// Desktop: main.rs passes the markdown files opened via file association.
#[cfg(not(target_os = "android"))]
pub fn run(startup_files: Vec<String>) {
    desktop_run::run(startup_files);
}
