/**
 * Android file system abstraction via SAF (Storage Access Framework) content URIs.
 *
 * On Android, file access goes through the system file picker, which returns
 * content:// URIs.  These are passed to the Rust backend, which delegates to
 * the Kotlin FileAccessPlugin that uses Android's ContentResolver.
 *
 * Desktop builds do NOT use this module — it is only imported from mobile code paths.
 */

export interface MobileFileHandle {
  /** SAF content URI, e.g. content://com.android.externalstorage.documents/... */
  uri: string;
  /** Display name shown in the editor header */
  name: string;
}

export interface DraftRecord {
  uri: string | null;
  name: string;
  content: string;
  updatedAt: number;
}

function isCancelled(result: unknown): boolean {
  if (result && typeof result === "object" && "cancelled" in result) {
    return (result as Record<string, unknown>).cancelled === true;
  }
  return false;
}

/**
 * Open the Android system file picker and return the selected file's URI and
 * content.  Returns null if the user cancelled.
 */
export async function pickAndReadFile(): Promise<{
  handle: MobileFileHandle;
  content: string;
} | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<Record<string, unknown>>("pick_and_read_file");
  if (!result || isCancelled(result)) return null;
  return {
    handle: {
      uri: result.uri as string,
      name: (result.name as string) || "untitled.md",
    },
    content: (result.content as string) || "",
  };
}

/**
 * Write content back to an existing file via its SAF content URI.
 * Returns true on success.
 */
export async function writeFileViaUri(
  uri: string,
  content: string
): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_file_via_uri", { uri, content });
  return true;
}

/**
 * Create a new file via the system file picker (SAF CREATE_DOCUMENT).
 * Returns the handle, or null if cancelled.
 */
export async function createNewFile(): Promise<{
  handle: MobileFileHandle;
} | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<Record<string, unknown>>("create_new_file");
  if (!result || isCancelled(result)) return null;
  return {
    handle: {
      uri: result.uri as string,
      name: (result.name as string) || "untitled.md",
    },
  };
}

/**
 * Save content to a new file location (SAF CREATE_DOCUMENT for "Save As").
 * Returns null if cancelled.
 */
export async function saveFileAs(
  content: string,
  suggestedName: string
): Promise<MobileFileHandle | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<Record<string, unknown>>("save_file_as", {
    content,
    suggestedName,
  });
  if (!result || isCancelled(result)) return null;
  return {
    uri: result.uri as string,
    name: (result.name as string) || suggestedName,
  };
}

/**
 * Save a draft record for crash recovery.
 * Now saves uri, name, content, and timestamp — not just a global string.
 */
export async function saveDraft(
  uri: string | null,
  name: string,
  content: string
): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_android_draft", { uri: uri ?? "", name, content });
}

/**
 * Load the draft previously saved for a specific document.  Returns null if
 * none exists.
 */
export async function loadDraft(uri: string | null): Promise<DraftRecord | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<Record<string, unknown> | null>(
    "load_android_draft",
    { uri: uri ?? "" }
  );
  if (!result || (result.uri === "" && !result.name && !result.content))
    return null;
  return {
    uri: (result.uri as string) || null,
    name: (result.name as string) || "未命名.md",
    content: (result.content as string) || "",
    updatedAt: (result.updatedAt as number) || 0,
  };
}

/**
 * Delete the saved draft for a specific document.
 */
export async function clearDraft(uri: string | null): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("clear_android_draft", { uri: uri ?? "" });
}
