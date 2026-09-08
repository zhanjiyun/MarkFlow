// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn is_markdown_ext(arg: &str) -> bool {
    let lower = arg.to_lowercase();
    lower.ends_with(".md")
        || lower.ends_with(".markdown")
        || lower.ends_with(".mdown")
        || lower.ends_with(".mdx")
}

fn main() {
    // Collect markdown file paths from command-line arguments.
    // When the app is set as the default handler for .md files, Windows passes
    // the file path as the first argument after the executable.
    let startup_files: Vec<String> = std::env::args_os()
        .skip(1)
        .filter_map(|arg| arg.into_string().ok())
        .filter(|arg| is_markdown_ext(arg))
        .collect();

    app_lib::run(startup_files);
}
