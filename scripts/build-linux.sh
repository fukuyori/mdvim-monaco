#!/bin/bash
# mdvim Linux Build Script
# Tested on Ubuntu 24.04

set -e

echo "=== mdvim Linux Build Script ==="
echo ""

CLEAN_BUILD=0
if [[ "${1:-}" == "--clean" || "${1:-}" == "-c" ]]; then
    CLEAN_BUILD=1
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "Usage: ./scripts/build-linux.sh [--clean]"
    echo ""
    echo "  --clean    Remove node_modules and src-tauri/target before building"
    exit 0
fi

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "Error: Do not run this script as root"
    exit 1
fi

# Detect distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
    VERSION=$VERSION_ID
    echo "Detected: $DISTRO $VERSION"
else
    echo "Warning: Cannot detect distribution"
    DISTRO="unknown"
fi

if [[ "$DISTRO" != "ubuntu" && "$DISTRO" != "debian" ]]; then
    echo "Error: This script currently supports Ubuntu/Debian only."
    echo "Install the required Tauri system packages manually, then run:"
    echo "  npm ci"
    echo "  npm run tauri build"
    exit 1
fi

# Install dependencies
echo ""
echo "=== Installing dependencies ==="
sudo apt update
sudo apt install -y \
    curl \
    wget \
    pkg-config \
    build-essential \
    libglib2.0-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    libsoup-3.0-dev \
    libjavascriptcoregtk-4.1-dev

# Check Node.js
echo ""
echo "=== Checking Node.js ==="
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
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

# Clean previous build if requested
if [[ "$CLEAN_BUILD" -eq 1 ]]; then
    echo "Cleaning previous build artifacts..."
    rm -rf node_modules
    rm -rf src-tauri/target
fi

# Install npm dependencies from lockfile
echo "Installing npm dependencies..."
npm ci

# Build Tauri app
echo "Building Tauri app..."
npm run tauri build

# Show result
echo ""
echo "=== Build Complete ==="
echo ""
echo "Output files:"
ls -la src-tauri/target/release/bundle/deb/ 2>/dev/null || echo "No .deb found"
ls -la src-tauri/target/release/bundle/rpm/ 2>/dev/null || echo "No .rpm found"
ls -la src-tauri/target/release/bundle/appimage/ 2>/dev/null || echo "No AppImage found"

echo ""
echo "To install:"
echo "  sudo dpkg -i src-tauri/target/release/bundle/deb/mdvim_*.deb"
echo ""
echo "To run:"
echo "  mdvim"
echo "  mdvim <file.md>"
echo "  mdvim -e"
