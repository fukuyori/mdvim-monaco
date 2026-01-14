// mdvim Desktop Application
// Rust Backend with Tauri v2

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};

/// ファイル情報
#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub content: String,
    pub modified: bool,
}

/// アプリケーション情報を取得
#[tauri::command]
fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "mdvim",
        "version": "0.9.0",
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
