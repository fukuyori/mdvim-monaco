// mdvim Desktop Application
// Rust Backend with Tauri

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use pulldown_cmark::{html, Options, Parser};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// ファイル情報
#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub content: String,
    pub modified: bool,
}

/// アプリケーション状態
#[derive(Debug, Default)]
pub struct AppState {
    pub current_file: Option<PathBuf>,
}

/// Markdownをパースしてプレビュー情報を返す
#[derive(Debug, Serialize)]
pub struct ParseResult {
    pub html: String,
    pub headings: Vec<Heading>,
    pub word_count: usize,
    pub char_count: usize,
    pub line_count: usize,
}

/// 見出し情報
#[derive(Debug, Serialize)]
pub struct Heading {
    pub level: u8,
    pub text: String,
    pub id: String,
}

/// MarkdownをHTMLに変換（Rustで高速処理）
#[tauri::command]
fn parse_markdown(content: &str) -> ParseResult {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_SMART_PUNCTUATION);

    let parser = Parser::new_ext(content, options);
    
    // HTMLを生成
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    
    // 見出しを抽出
    let headings = extract_headings(content);
    
    // 統計情報
    let word_count = count_words(content);
    let char_count = content.chars().count();
    let line_count = content.lines().count();

    ParseResult {
        html: html_output,
        headings,
        word_count,
        char_count,
        line_count,
    }
}

/// 見出しを抽出
fn extract_headings(content: &str) -> Vec<Heading> {
    let mut headings = Vec::new();
    
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            let level = trimmed.chars().take_while(|&c| c == '#').count() as u8;
            if level >= 1 && level <= 6 {
                let text = trimmed[level as usize..].trim_start_matches(' ').to_string();
                let id = slugify(&text);
                headings.push(Heading { level, text, id });
            }
        }
    }
    
    headings
}

/// スラグ化（見出しID生成）
fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// 単語数をカウント
fn count_words(content: &str) -> usize {
    content
        .split(|c: char| c.is_whitespace() || c == '\n')
        .filter(|s| !s.is_empty())
        .count()
}

/// ファイルを読み込み
#[tauri::command]
fn read_file(path: &str) -> Result<FileInfo, String> {
    let path_buf = PathBuf::from(path);
    
    match fs::read_to_string(&path_buf) {
        Ok(content) => {
            let name = path_buf
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled".to_string());
            
            Ok(FileInfo {
                path: path.to_string(),
                name,
                content,
                modified: false,
            })
        }
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

/// ファイルを保存
#[tauri::command]
fn write_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}

/// 新規ファイルを作成
#[tauri::command]
fn create_new_file(path: &str) -> Result<(), String> {
    fs::write(path, "").map_err(|e| format!("Failed to create file: {}", e))
}

/// ファイルが存在するか確認
#[tauri::command]
fn file_exists(path: &str) -> bool {
    PathBuf::from(path).exists()
}

/// デフォルトドキュメントパスを取得
#[tauri::command]
fn get_documents_path() -> Option<String> {
    dirs::document_dir().map(|p| p.to_string_lossy().to_string())
}

/// HTMLをエクスポート用に生成
#[tauri::command]
fn export_html(content: &str, title: &str) -> String {
    let parse_result = parse_markdown(content);
    
    format!(
        r#"<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #333;
        }}
        h1, h2, h3, h4, h5, h6 {{ margin-top: 1.5em; }}
        code {{
            background: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'JetBrains Mono', Consolas, monospace;
        }}
        pre {{
            background: #f4f4f4;
            padding: 1em;
            border-radius: 6px;
            overflow-x: auto;
        }}
        pre code {{ background: none; padding: 0; }}
        blockquote {{
            border-left: 4px solid #ddd;
            margin: 0;
            padding-left: 1em;
            color: #666;
        }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 0.5em; text-align: left; }}
        th {{ background: #f4f4f4; }}
        img {{ max-width: 100%; }}
        a {{ color: #0066cc; }}
    </style>
</head>
<body>
{}
</body>
</html>"#,
        title, parse_result.html
    )
}

/// アプリケーション情報を取得
#[tauri::command]
fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "mdvim",
        "version": "0.8.4",
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

/// 最近使ったファイルを取得（将来の実装用）
#[tauri::command]
fn get_recent_files() -> Vec<String> {
    // TODO: 最近使ったファイルの履歴を実装
    Vec::new()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            parse_markdown,
            read_file,
            write_file,
            create_new_file,
            file_exists,
            get_documents_path,
            export_html,
            get_app_info,
            get_recent_files,
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            
            // ウィンドウタイトルを設定
            window.set_title("mdvim - Vim風マークダウンエディタ").unwrap();
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
