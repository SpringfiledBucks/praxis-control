#!/bin/sh
set -eu

display=${PRAXIS_XVFB_DISPLAY:-:99}
log_file=${PRAXIS_XVFB_LOG:-/tmp/praxis-xvfb.log}
Xvfb "$display" -screen 0 1280x900x24 -nolisten tcp -ac >"$log_file" 2>&1 &
xvfb_pid=$!

cleanup() {
  kill "$xvfb_pid" 2>/dev/null || true
  wait "$xvfb_pid" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

sleep 1
if ! kill -0 "$xvfb_pid" 2>/dev/null; then
  cat "$log_file" >&2
  exit 1
fi

DISPLAY="$display" "$@"
