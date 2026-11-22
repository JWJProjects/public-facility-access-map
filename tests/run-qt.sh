#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."
export ATLAS_ROOT="$PWD"
export ATLAS_PORT="${ATLAS_PORT:-8912}"
export ATLAS_URL="http://127.0.0.1:$ATLAS_PORT/"
tmp="$(mktemp -d)"
cleanup() { if [ -n "${server:-}" ]; then kill "$server" 2>/dev/null || true; fi; rm -rf "$tmp"; }
trap cleanup EXIT
mkdir -p "$tmp"/{config,cache,data,run}
chmod 700 "$tmp/run"
export XDG_CONFIG_HOME="$tmp/config" XDG_CACHE_HOME="$tmp/cache" XDG_DATA_HOME="$tmp/data" XDG_RUNTIME_DIR="$tmp/run"
export QTWEBENGINE_DISABLE_SANDBOX=1 QT_QPA_PLATFORM=minimal QT_OPENGL=software
export QT_QPA_PLATFORM_PLUGIN_PATH="${QT_QPA_PLATFORM_PLUGIN_PATH:-/usr/lib/x86_64-linux-gnu/qt5/plugins/platforms}"
export QTWEBENGINE_CHROMIUM_FLAGS="--disable-gpu --disable-software-rasterizer"
python -m http.server "$ATLAS_PORT" --bind 127.0.0.1 --directory "$ATLAS_ROOT" >"$tmp/http.log" 2>&1 &
server=$!
timeout 45s "${SLICER_BIN:-/opt/slicer/5.12.4/Slicer}" --no-splash --no-main-window --python-script "$ATLAS_ROOT/tests/qt-capture.py"
grep -q '"pass": true' docs/browser-results.json
