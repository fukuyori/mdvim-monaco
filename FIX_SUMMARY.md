# 修正履歴

---

## v1.0.1 - 画像ファイルの重複対策

### 追加機能

画像ファイルをドラッグ＆ドロップ、ペースト、挿入する際に、同じ名前の画像が既に存在する場合は自動的に連番を付けてリネームするようになりました。

### 対象操作

| 操作 | 動作 |
|------|------|
| 画像のドラッグ＆ドロップ | 重複時に `_2`, `_3`... を付与 |
| 画像のペースト（Ctrl+V） | 重複時に連番付与 |
| 画像の挿入（`:image`） | 重複時に連番付与 |
| URL埋め込み画像の取得 | 重複時に連番付与 |

### 修正内容

| 関数 | 修正内容 |
|------|----------|
| `generateImageId` | 重複チェックを追加、連番を付けた一意のIDを生成 |
| `generateImageIdFromUrl` | 重複チェックを追加、連番を付けた一意のIDを生成 |

### 動作例

既存画像: `screenshot.png`
- ドロップ → `screenshot_2.png`
- 再度ドロップ → `screenshot_3.png`

---

## v1.0.1 - インポート時の自動リネーム機能

### 追加機能

ドラッグ＆ドロップ、`:vpaste`、ファイルインポートなどで同名ファイルが存在する場合、自動的に連番を付けてリネームするようになりました。

### 対象操作

| 操作 | 動作 |
|------|------|
| ドラッグ＆ドロップ（md/txt） | 重複時に `_2`, `_3`... を付与 |
| `:vpaste` コマンド | 重複時に `_2`, `_3`... を付与 |
| `:import` / ファイルインポート | 重複時に `_2`, `_3`... を付与 |

### 修正内容

| 関数 | 修正内容 |
|------|----------|
| `getUniqueFileName` | 新規追加：重複時に連番を付けた一意の名前を生成 |
| `createNewFileInProject` | `autoRename`パラメータを追加（インポート系は自動リネーム） |
| `addMarkdownFileToProject` | 重複時に自動リネーム |
| `addMarkdownContentToProject` | 重複時に自動リネーム |
| `importMarkdownFile` | 重複時に自動リネーム |
| `handleDrop` (txt処理) | 重複時に自動リネーム |

### 動作例

既存ファイル: `chapter.md`
- インポート → `chapter_2.md`
- 再度インポート → `chapter_3.md`

### 手動作成との違い

| 操作 | 重複時の動作 |
|------|-------------|
| `:new`, `:vnew`, UIボタン | エラー表示して拒否 |
| インポート系（vpaste、ドロップ等） | 自動リネーム |

---

## v1.0.1 - 同名ファイル作成の禁止

### 追加機能

新規ファイル作成時およびファイル名変更時に、同じ名前のファイルが既に存在する場合はエラーを表示して操作を拒否するようになりました。

### 修正内容

| 関数 | 修正内容 |
|------|----------|
| `isFileNameDuplicate` | 新規追加：ファイル名の重複をチェックするヘルパー関数 |
| `createNewFileInProject` | 重複チェックを追加、重複時はエラー表示してreturn |
| `renameFileInProject` | 重複チェックを追加、重複時はエラー表示してreturn |
| `confirmNewFileDialog` | モーダルでの作成前に重複チェックを追加 |

### 動作

- 重複チェックは**大文字小文字を区別しない**（`Untitled` と `untitled` は同一とみなす）
- リネーム時は自分自身を除外してチェック
- エラーメッセージ: `(error: "ファイル名" already exists)`

---

## v1.0.1 - 同名ファイルが区別できない問題の修正

### 問題の現象

同じ名前のファイル（例：「untitled」が2つ）がプロジェクト内にある場合、両方のファイルが同じ内容になってしまう問題がありました。

### 問題の原因

1. **保存時**: manifestの`chapters`配列にファイル名のみを保存しており、ファイルIDが保存されていなかった
2. **重複ファイル名**: 同じファイル名でZIPに保存すると、後のファイルが前のファイルを上書きしていた
3. **読み込み時**: ファイル名でファイルを検索するため、同名ファイルの区別ができなかった

### 修正内容

| 関数 | 修正内容 |
|------|----------|
| `saveProject` | manifestに`files`配列（ID、path、name、orderを含む）を追加。重複ファイル名には連番サフィックスを付与 |
| `loadMdebookFromZip` | `files`配列が存在する場合は優先的に使用（IDを保持） |
| `loadMdebookProject` | 同上（ブラウザ環境用） |

### 保存形式の変更

```json
{
  "version": "2.0",
  "metadata": { "title": "Project" },
  "chapters": ["untitled.md", "untitled_2.md"],
  "files": [
    { "id": "uuid-1", "path": "untitled.md", "name": "untitled", "order": 0 },
    { "id": "uuid-2", "path": "untitled_2.md", "name": "untitled", "order": 1 }
  ]
}
```

### 重複ファイル名の処理

同じファイル名が複数ある場合、保存時に連番サフィックスを付与：
- `untitled.md` → `untitled.md`
- `untitled.md` (2つ目) → `untitled_2.md`
- `untitled.md` (3つ目) → `untitled_3.md`

表示名（`name`）は元のまま保持されるため、UIでは同じ名前で表示されます。

---

## v1.0.1 - プロジェクト名が「Untitled」になる問題の修正

### 問題の現象

`.mdvim`/`.mdebook` ファイルを読み込んだ時、左上のプロジェクト名が「Untitled」と表示される問題がありました。

例: `BBS歴史.mdvim` を開くと「Untitled - 第２章　BBS/MS-DOS編」と表示される

### 問題の原因

ブラウザ環境でのファイル読み込み関数（`loadMdvimProject`、`loadMdebookProject`）で、manifestのタイトルがデフォルト値（「Untitled」など）の場合にファイル名から更新するロジックがありませんでした。

Tauri環境の `loadMdvimV2FromZip` にはこのロジックがありましたが、ブラウザ環境では欠落していました。

### 修正内容

| 関数 | 修正内容 |
|------|----------|
| `loadMdvimProject` | ファイル名からタイトルを更新するロジックを追加 |
| `loadMdebookProject` | ファイル名からタイトルを更新するロジックを追加 |
| `loadMdvimV2FromZip` | `manifest.metadata` が undefined の場合の対応を追加 |

### 修正コード

```typescript
// Update project title from filename if it's a default name
const projectTitleFromFile = file.name.replace(/\.(mdvim|mdebook)$/, '');
const currentTitle = manifest.metadata?.title || '';
const defaultTitles = ['New Project', 'Untitled', 'chapter-1', ''];
if (defaultTitles.includes(currentTitle)) {
  if (!manifest.metadata) {
    manifest.metadata = { title: projectTitleFromFile };
  } else {
    manifest.metadata.title = projectTitleFromFile;
  }
}
```

### デフォルトタイトル一覧

以下のタイトルはファイル名で上書きされます：
- `New Project`
- `Untitled`
- `Imported Project`（mdebook用）
- `chapter-1`
- 空文字列 `''`

---

## v1.0.0 - TOC（目次）が表示されない問題の修正

## 問題の原因

**CRLF（Windows形式の改行 `\r\n`）** を使用したMarkdownファイルで、TOC（目次）が正しく生成されない問題がありました。

### 技術的詳細

JavaScriptの `split('\n')` はCRLFを `\n` のみで分割するため、各行末に `\r` が残ります：

```javascript
"## Test\r\nContent".split('\n')
// => ["## Test\r", "Content"]  ← \r が残る
```

これにより、見出しの正規表現 `/^(#{1,3})\s+(.+)$/` が **マッチしなくなっていました**：

```javascript
"## Test\r".match(/^(#{1,3})\s+(.+)$/)  // => null（マッチしない）
"## Test".match(/^(#{1,3})\s+(.+)$/)    // => マッチする
```

## 修正箇所

| 箇所 | 行番号 | 修正内容 |
|------|--------|----------|
| `updateToc()` | 3773-3784 | 各行から `\r` を除去 |
| プロジェクト内検索 | 7347 | 各行から `\r` を除去 |
| YAML frontmatter | 4604 | 正規表現と split を CRLF 対応に |
| Qiita notes | 4630 | 正規表現を CRLF 対応に |
| GitHub alerts | 4641 | 正規表現と split を CRLF 対応に |
| Obsidian Callouts | 4657 | 正規表現と split を CRLF 対応に |

## 修正例

### Before
```typescript
const lines = content.split('\n');
lines.forEach((line, index) => {
  const match = line.match(/^(#{1,3})\s+(.+)$/);
```

### After
```typescript
const lines = content.split('\n');
lines.forEach((line, index) => {
  // Remove trailing \r for CRLF line endings
  const normalizedLine = line.replace(/\r$/, '');
  const match = normalizedLine.match(/^(#{1,3})\s+(.+)$/);
```

## 影響を受けていたファイル

アップロードされた `PDFVIEW.mdvim` 内のファイル：

| ファイル | 改行コード | 見出し有無 |
|----------|------------|------------|
| デザイン.md | CRLF | ✓ あり |
| データ構造.md | CRLF | ✓ あり |
| 設計書.md | CRLF | ✓ あり |
| RUSTコアAPI.md | CRLF | ✓ あり |
| UI Libraries.md | CRLF | ✓ あり |
| 開発言語.md | CRLF | ✗ なし（テーブルのみ） |
| PDFVIEW.mdvim.md | LF | ✗ なし（箇条書きのみ） |

**注**: 見出しがないファイルは修正後も「No headings found」と表示されます（正常動作）。

## 適用方法

修正した `main.ts` を `src/main.ts` に置き換えてください。
