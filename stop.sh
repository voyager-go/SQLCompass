#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
MODE="${1:-all}"
DESKTOP_BINARY="${DESKTOP_BINARY:-$RUN_DIR/SQLTool-dev}"

stop_process() {
  local name="$1"
  local quiet_missing="${2:-false}"
  local pid_file="$RUN_DIR/$name.pid"

  if [ ! -f "$pid_file" ]; then
    if [ "$quiet_missing" != "true" ]; then
      echo "$name is not running."
    fi
    return 1
  fi

  local pid
  pid="$(cat "$pid_file")"

    if kill -0 "$pid" 2>/dev/null; then
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        pkill -KILL -P "$pid" 2>/dev/null || true
        kill -9 "$pid" 2>/dev/null || true
      fi
      echo "Stopped $name."
      rm -f "$pid_file"
      return 0
    else
      echo "$name was not running."
      rm -f "$pid_file"
      return 1
    fi
}

stop_desktop_fallback() {
  if pkill -f "$DESKTOP_BINARY" 2>/dev/null; then
    echo "Stopped desktop."
    rm -f "$RUN_DIR/desktop.pid"
    return
  fi

  echo "desktop was not running."
  rm -f "$RUN_DIR/desktop.pid"
}

case "$MODE" in
  web)
    stop_process "web"
    ;;
  desktop)
    if ! stop_process "desktop" "true"; then
      stop_desktop_fallback
    fi
    ;;
  all)
    if ! stop_process "desktop" "true"; then
      stop_desktop_fallback
    fi
    stop_process "web"
    ;;
  *)
    echo "Usage: ./stop.sh [web|desktop|all]"
    exit 1
    ;;
esac
