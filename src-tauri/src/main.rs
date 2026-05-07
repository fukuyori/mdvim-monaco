// mdvim Desktop Application
// Rust Backend with Tauri v2

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// ファイル情報
#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub content: String,
    pub modified: bool,
}

#[derive(Default)]
struct PendingOpenFiles(Mutex<Vec<String>>);

/// アプリケーション情報を取得
#[tauri::command]
fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "mdvim",
        "version": "1.1.1",
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

/// Finder など OS 経由で渡されたファイルをフロントエンド起動後に取得する
#[tauri::command]
fn take_pending_open_files(state: tauri::State<PendingOpenFiles>) -> Vec<String> {
    let mut pending = state.0.lock().expect("pending open files lock poisoned");
    std::mem::take(&mut *pending)
}

fn main() {
    tauri::Builder::default()
        .manage(PendingOpenFiles::default())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            take_pending_open_files,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .into_iter()
                    .filter_map(|url| {
                        if url.scheme() == "file" {
                            url.to_file_path()
                                .ok()
                                .map(|path| path.to_string_lossy().into_owned())
                        } else {
                            Some(url.to_string())
                        }
                    })
                    .collect();

                if paths.is_empty() {
                    return;
                }

                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }

                {
                    let state = app_handle.state::<PendingOpenFiles>();
                    let mut pending = state.0.lock().expect("pending open files lock poisoned");
                    pending.extend(paths.clone());
                }

                let _ = app_handle.emit("mdvim://open-files", paths);
            }
        });
}
