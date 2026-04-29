#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$ROOT_DIR/build/bin"
APP_NAME="SQLCompass"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Clean output directory once at the start
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# -------------------------------------------------------
# macOS (Universal Binary)
# -------------------------------------------------------
build_macos() {
  info "Building macOS Universal Binary..."
  wails build -platform darwin/universal
  (cd "$OUTPUT_DIR" && zip -r "${APP_NAME}-macOS-Universal.zip" "${APP_NAME}.app")
  info "macOS build done: ${OUTPUT_DIR}/${APP_NAME}-macOS-Universal.zip"
}

# -------------------------------------------------------
# Windows (Cross-compile via mingw-w64)
# -------------------------------------------------------
build_windows() {
  if ! command -v x86_64-w64-mingw32-gcc &>/dev/null; then
    warn "mingw-w64 not found, installing via Homebrew..."
    brew install mingw-w64
  fi

  info "Building Windows amd64 Binary..."
  CGO_ENABLED=1 CC=x86_64-w64-mingw32-gcc wails build -platform windows/amd64
  (cd "$OUTPUT_DIR" && mv "${APP_NAME}.exe" "${APP_NAME}-Windows-amd64.exe" 2>/dev/null || true)
  info "Windows build done: ${OUTPUT_DIR}/${APP_NAME}-Windows-amd64.exe"
}

# -------------------------------------------------------
# Linux (Build inside Docker to avoid GTK/WebKit issues)
# -------------------------------------------------------
build_linux() {
  if ! command -v docker &>/dev/null; then
    error "Docker is required for Linux cross-compilation. Please install Docker first."
    exit 1
  fi

  info "Building Linux amd64 Binary via Docker..."

  docker run --rm \
    -v "$ROOT_DIR":/src \
    -w /src \
    -e CGO_ENABLED=1 \
    golang:1.25-bookworm \
    bash -c '
      set -euo pipefail
      echo "Installing system dependencies..."
      apt-get update -qq && apt-get install -y -qq \
        libgtk-3-dev libwebkit2gtk-4.1-dev > /dev/null 2>&1
      echo "Installing Node.js..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
      apt-get install -y -qq nodejs > /dev/null 2>&1
      echo "Installing frontend dependencies..."
      cd frontend && npm install --silent && cd ..
      echo "Installing Wails CLI..."
      go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
      export PATH="$PATH:$(go env GOPATH)/bin"
      echo "Building Linux binary..."
      wails build -clean -tags webkit2_41
      cd build/bin && tar czf '"${APP_NAME}"'-Linux-amd64.tar.gz '"${APP_NAME}"'
      echo "Linux build done."
    '

  info "Linux build done: ${OUTPUT_DIR}/${APP_NAME}-Linux-amd64.tar.gz"
}

# -------------------------------------------------------
# Main
# -------------------------------------------------------
TARGET="${1:-all}"

case "$TARGET" in
  macos|mac|darwin)
    build_macos
    ;;
  windows|win)
    build_windows
    ;;
  linux)
    build_linux
    ;;
  all)
    info "Building all platforms..."
    build_macos
    build_windows
    build_linux
    info "All builds completed! Output directory: $OUTPUT_DIR"
    ls -lh "$OUTPUT_DIR"
    ;;
  *)
    echo "Usage: ./build_all.sh [macos|windows|linux|all]"
    exit 1
    ;;
esac
