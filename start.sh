#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
MODE="${1:-web}"

FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"
DESKTOP_BINARY="${DESKTOP_BINARY:-$RUN_DIR/SQLTool-dev}"
DESKTOP_BUILD_TAGS="${DESKTOP_BUILD_TAGS:-production}"
DESKTOP_MACOS_MIN_VERSION="${DESKTOP_MACOS_MIN_VERSION:-15.0}"
GOCACHE="${GOCACHE:-$ROOT_DIR/.gocache}"
GOMODCACHE="${GOMODCACHE:-$ROOT_DIR/.gomodcache}"
GOPROXY="${GOPROXY:-https://proxy.golang.org,direct}"
# macOS deployment target for linker warnings
export MACOSX_DEPLOYMENT_TARGET="$DESKTOP_MACOS_MIN_VERSION"

mkdir -p "$RUN_DIR" "$GOCACHE" "$GOMODCACHE"

spawn_detached() {
  local log_file="$1"
  shift

  if command -v setsid >/dev/null 2>&1; then
    nohup setsid "$@" >"$log_file" 2>&1 < /dev/null &
  else
    nohup "$@" >"$log_file" 2>&1 < /dev/null &
  fi

  echo $!
}

wait_for_process() {
  local pid="$1"
  local attempts="${2:-10}"
  local sleep_seconds="${3:-1}"

  while [ "$attempts" -gt 0 ]; do
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    attempts=$((attempts - 1))
    sleep "$sleep_seconds"
  done

  return 1
}

find_desktop_pid() {
  local attempts="${1:-10}"
  local sleep_seconds="${2:-1}"
  local pid=""

  while [ "$attempts" -gt 0 ]; do
    pid="$(pgrep -f "$DESKTOP_BINARY" | tail -n 1 || true)"
    if [ -n "$pid" ]; then
      echo "$pid"
      return 0
    fi
    attempts=$((attempts - 1))
    sleep "$sleep_seconds"
  done

  return 1
}

ensure_frontend_deps() {
  if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    (cd "$ROOT_DIR/frontend" && npm install)
  fi
}

is_running() {
  local pid_file="$1"
  if [ ! -f "$pid_file" ]; then
    return 1
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  rm -f "$pid_file"
  return 1
}

start_web() {
  local pid_file="$RUN_DIR/web.pid"
  local log_file="$RUN_DIR/web.log"

  if is_running "$pid_file"; then
    echo "Web preview is already running. Open http://$FRONTEND_HOST:$FRONTEND_PORT"
    exit 0
  fi

  ensure_frontend_deps

  local pid
  pid="$(spawn_detached "$log_file" /bin/zsh -lc "cd \"$ROOT_DIR/frontend\" && npm run dev -- --host \"$FRONTEND_HOST\" --port \"$FRONTEND_PORT\"")"
  echo "$pid" >"$pid_file"

  if ! wait_for_process "$pid" 5 1; then
    rm -f "$pid_file"
    echo "Web preview failed to stay running."
    echo "Check log: $log_file"
    exit 1
  fi

  echo "Web preview started."
  echo "URL: http://$FRONTEND_HOST:$FRONTEND_PORT"
  echo "Log: $log_file"
  echo "Stop: ./stop.sh web"
}

start_desktop() {
  local pid_file="$RUN_DIR/desktop.pid"
  local log_file="$RUN_DIR/desktop.log"
  local existing_pid

  if is_running "$pid_file"; then
    echo "Desktop dev mode is already running."
    echo "Log: $log_file"
    exit 0
  fi

  existing_pid="$(pgrep -f "$DESKTOP_BINARY" | tail -n 1 || true)"
  if [ -n "$existing_pid" ]; then
    echo "$existing_pid" >"$pid_file"
    echo "Desktop dev mode is already running."
    echo "Log: $log_file"
    exit 0
  fi

  ensure_frontend_deps
  echo "Building frontend bundle..."
  (cd "$ROOT_DIR/frontend" && npm run build >/dev/null)

  echo "Building desktop binary..."
  (
    cd "$ROOT_DIR"
    env \
      MACOSX_DEPLOYMENT_TARGET="$DESKTOP_MACOS_MIN_VERSION" \
      CGO_CFLAGS="-mmacosx-version-min=$DESKTOP_MACOS_MIN_VERSION" \
      CGO_LDFLAGS="-framework UniformTypeIdentifiers -mmacosx-version-min=$DESKTOP_MACOS_MIN_VERSION" \
      GOPROXY="$GOPROXY" \
      GOCACHE="$GOCACHE" \
      GOMODCACHE="$GOMODCACHE" \
      go build -tags "$DESKTOP_BUILD_TAGS" -o "$DESKTOP_BINARY" . 2>&1 | grep -v "was built for newer 'macOS' version" || true
  )

  : >"$log_file"

  local pid
  open "$DESKTOP_BINARY"

  if ! pid="$(find_desktop_pid 10 1)"; then
    echo "Desktop app failed to stay running."
    echo "Check log: $log_file"
    exit 1
  fi

  echo "$pid" >"$pid_file"

  echo "Desktop app started."
  echo "Log: $log_file"
  echo "Binary: $DESKTOP_BINARY"
  echo "Stop: ./stop.sh desktop"
}

case "$MODE" in
  web)
    start_web
    ;;
  desktop)
    start_desktop
    ;;
  *)
    echo "Usage: ./start.sh [web|desktop]"
    exit 1
    ;;
esac
