# TOC（目次）が表示されない問題の修正

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
