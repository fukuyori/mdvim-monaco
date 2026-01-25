# mdvim Installer Build Guide

## Prerequisites

### All Platforms
- Node.js 18+
- npm
- Rust (rustup)

### Windows
- Visual Studio Build Tools 2022
- WebView2 (Windows 10/11 includes by default)

### macOS
- Xcode Command Line Tools
- For signing: Apple Developer account

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## Build Commands

### Quick Build (All Platforms)

```bash
# Install dependencies
npm install

# Build installer
npm run tauri build
```

### Platform-Specific Scripts

**Windows:**
```cmd
scripts\build-windows.bat
```

**macOS:**
```bash
./scripts/build-macos.sh
```

**Linux:**
```bash
./scripts/build-linux.sh
```

---

## Output Files

After successful build, installers are located in:

```
src-tauri/target/release/bundle/
├── msi/                    # Windows MSI installer
│   └── mdvim_1.0.0_x64.msi
├── nsis/                   # Windows NSIS installer
│   └── mdvim_1.0.0_x64-setup.exe
├── dmg/                    # macOS DMG
│   └── mdvim_1.0.0_x64.dmg
├── macos/                  # macOS App Bundle
│   └── mdvim.app
├── deb/                    # Debian/Ubuntu package
│   └── mdvim_1.0.0_amd64.deb
└── appimage/               # Linux AppImage
    └── mdvim_1.0.0_amd64.AppImage
```

---

## Installer Features

### Windows (NSIS)
- Language selector (English, Japanese)
- Per-user installation (no admin required)
- File associations (.md, .mdvim)
- Start menu shortcut
- Uninstaller

### macOS (DMG)
- Drag-to-install interface
- File associations
- App bundle with proper signing (if configured)

### Linux
- **AppImage**: Portable, no installation needed
- **DEB**: For Debian/Ubuntu with apt integration
- File associations for .md and .mdvim

---

## File Associations

The installer registers these file types:

| Extension | Description | MIME Type |
|-----------|-------------|-----------|
| `.md`, `.markdown` | Markdown Document | text/markdown |
| `.mdvim` | mdvim Project | application/x-mdvim |

---

## Code Signing (Optional)

### Windows
1. Obtain a code signing certificate
2. Set in `tauri.conf.json`:
```json
"windows": {
  "certificateThumbprint": "YOUR_THUMBPRINT",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

### macOS
1. Set up Apple Developer account
2. Configure signing:
```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name"
npm run tauri build
```

---

## Release Checklist

1. [ ] Update version in `package.json`
2. [ ] Update version in `src-tauri/tauri.conf.json`
3. [ ] Update version in `src-tauri/Cargo.toml`
4. [ ] Test build on all target platforms
5. [ ] Test installation and file associations
6. [ ] Test uninstallation
7. [ ] Create GitHub release with artifacts

---

## Troubleshooting

### Windows: "MSVC not found"
Install Visual Studio Build Tools:
```
winget install Microsoft.VisualStudio.2022.BuildTools
```

### macOS: "No signing identity found"
For unsigned builds:
```bash
npm run tauri build -- --no-bundle-sign
```

### Linux: "webkit2gtk not found"
```bash
sudo apt install libwebkit2gtk-4.1-dev
```

### Build is slow
For faster builds during development:
```bash
npm run tauri build -- --debug
```

---

## CI/CD (GitHub Actions)

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-22.04, windows-latest]
    runs-on: ${{ matrix.platform }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Install Rust
        uses: dtolnay/rust-action@stable
        
      - name: Install dependencies (Linux)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
          
      - name: Install npm dependencies
        run: npm install
        
      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: v__VERSION__
          releaseName: 'mdvim v__VERSION__'
          releaseBody: 'See CHANGELOG.md for details.'
          releaseDraft: true
          prerelease: false
```
