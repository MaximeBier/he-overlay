#!/usr/bin/env bash
#
# What the overlay actually downloads.
#
# The overlay is the bundle OBS keeps loaded for the whole stream (spec §5.1),
# and everything below leaked into it at some point during milestone 3 — twice
# by the same mechanism: a module shared between the two entry points drags all
# of its file along, so separating two *objects* separates nothing. Unit tests
# cannot see this, because they check modules and the leak happens in chunks.
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "FAIL: $1" >&2
  exit 1
}
ok() { echo "ok   : $1"; }

[ -f dist/overlay.html ] || fail "dist/overlay.html is missing — run npm run build first"

# Every script the overlay page pulls in, preloads included.
mapfile -t chunks < <(grep -oE '(src|href)="/assets/[^"]+\.js"' dist/overlay.html |
  sed -E 's/.*"(\/assets\/[^"]+)".*/dist\1/' | sort -u)

[ "${#chunks[@]}" -gt 0 ] || fail "no javascript found in dist/overlay.html"
echo "overlay loads: ${chunks[*]}"

absent() {
  local needle="$1" what="$2"
  if grep -qF -- "$needle" "${chunks[@]}"; then
    fail "$what reaches the overlay bundle (found \"$needle\")"
  fi
  ok "$what stays out of the overlay bundle"
}

absent 'bad-length' 'the HID decoder'
absent 'unknown-low-bits' 'the decoder anomalies'
absent 'borderPopover' 'the interface palette'
absent 'panelWidth' 'the interface layout tokens'
absent 'keyboardHint' 'the status bar wording'
absent 'overlay.html?port=' 'the overlay URL builder'
absent 'heOverlayDev' 'the development door'
absent 'he-overlay:config' 'the configuration storage'

echo
echo "Overlay bundle is clean."
