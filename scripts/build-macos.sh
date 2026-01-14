#!/bin/bash
# mdvim macOS Build Script
# Tested on macOS 14 (Sonoma)

set -e

echo "=== mdvim macOS Build Script ==="
echo ""

# Check Xcode Command Line Tools
if ! xcode-select -p &> /dev/null; then
    echo "Installing Xcode Command Line Tools..."
    xcode-select --install
    echo "Please run this script again after installation completes."
    exit 1
fi

# Check Node.js
echo "=== Checking Node.js ==="
if ! command -v node &> /dev/null; then
    echo "Node.js not found."
    echo "Please install Node.js from https://nodejs.org/"
    echo "Or using Homebrew: brew install node"
    exit 1
fi
node --version
npm --version

# Check Rust
echo ""
echo "=== Checking Rust ==="
if ! command -v cargo &> /dev/null; then
    echo "Rust not found. Installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi
rustc --version
cargo --version

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Build
echo ""
echo "=== Building mdvim ==="
cd "$PROJECT_DIR"

# Clean previous build
rm -rf node_modules
rm -rf src-tauri/target

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

# Build Tauri app
echo "Building Tauri app..."
npm run tauri build

# Show result
echo ""
echo "=== Build Complete ==="
echo ""
echo "Output files:"
ls -la src-tauri/target/release/bundle/dmg/ 2>/dev/null || echo "No .dmg found"
ls -la src-tauri/target/release/bundle/macos/ 2>/dev/null || echo "No .app found"

echo ""
echo "To install:"
echo "  Open the .dmg file and drag mdvim to Applications"
echo ""
echo "To run:"
echo "  /Applications/mdvim.app/Contents/MacOS/mdvim"
echo "  Or open from Applications folder"
