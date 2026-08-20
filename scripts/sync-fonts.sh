#!/usr/bin/env bash
#
# Refresh src/assets/fonts/ from the @fontsource packages.
#
# The woff2 files are committed rather than pulled from node_modules at build
# time, so that what ships is visible in the repository and reviewable in a
# diff. That trade has one cost — nothing says where those bytes came from, or
# whether they still match the declared version — and this script is the
# answer: it is how they got there, and running it again is how you check.
#
# `--check` compares without writing. CI uses it; a mismatch means someone
# bumped the package without re-running this, or hand-edited a font file.
set -euo pipefail

cd "$(dirname "$0")/.."

DEST=src/assets/fonts

# Only the weights the design actually uses (handoff, spec §16.2). Latin only:
# the interface is English and the key labels come from the browser's layout
# map, which returns latin for every layout we support (spec §8.6).
ARCHIVO_WEIGHTS=(400 500 600 700)

check=false
[ "${1:-}" = "--check" ] && check=true

status=0

copy() {
  local from="$1" to="$2"
  [ -f "$from" ] || {
    echo "FAIL: $from is missing — run npm install first" >&2
    exit 1
  }
  if $check; then
    if ! cmp -s "$from" "$to"; then
      echo "FAIL: $to differs from $from" >&2
      status=1
    fi
  else
    cp "$from" "$to"
    echo "ok   : $(basename "$to")"
  fi
}

mkdir -p "$DEST"

for weight in "${ARCHIVO_WEIGHTS[@]}"; do
  name="archivo-latin-${weight}-normal.woff2"
  copy "node_modules/@fontsource/archivo/files/$name" "$DEST/$name"
done

name=ibm-plex-mono-latin-400-normal.woff2
copy "node_modules/@fontsource/ibm-plex-mono/files/$name" "$DEST/$name"

# Both faces are under the SIL Open Font License, which requires the licence to
# travel with them. The build inlines the woff2 into dist/assets and leaves the
# text behind, so the repository is where it has to live.
copy node_modules/@fontsource/archivo/LICENSE "$DEST/LICENSE-Archivo.txt"
copy node_modules/@fontsource/ibm-plex-mono/LICENSE "$DEST/LICENSE-IBM-Plex-Mono.txt"

if $check && [ "$status" -eq 0 ]; then
  echo "Fonts match the installed packages."
fi

exit "$status"
