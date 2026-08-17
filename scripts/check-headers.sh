#!/usr/bin/env bash
#
# Probes the image as actually built. Everything checked here shares one
# property: the page loads, it renders, and nothing works. None of these
# defects produces a visible error (spec §12.4).
set -euo pipefail

IMAGE="${1:-he-overlay:ci}"
PORT="${PORT:-8080}"
BASE="http://localhost:${PORT}"

cid=$(docker run -d -p "${PORT}:8080" "$IMAGE")
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 30); do
  if curl -fsS "${BASE}/healthz" >/dev/null 2>&1; then break; fi
  sleep 1
done

failures=0
fail() { echo "FAIL : $1" >&2; failures=$((failures + 1)); }
ok()   { echo "ok   : $1"; }

headers=$(curl -sSI "${BASE}/overlay.html")

if grep -qiE '^HTTP/[0-9.]+ 200' <<<"$headers"; then
  ok "overlay.html is served"
else
  fail "overlay.html is not served"
fi

# The obs-websocket port is configurable (spec §6.1): the wildcard is required,
# pinning 4455 would break every install that uses another one.
if grep -qi 'content-security-policy:.*ws://localhost:\*' <<<"$headers"; then
  ok "the CSP allows the loopback"
else
  fail "the CSP does not allow ws://localhost:* — the OBS connection would be blocked"
fi

# That directive rewrites ws:// into wss://, and obs-websocket speaks no TLS.
if grep -qi 'upgrade-insecure-requests' <<<"$headers"; then
  fail "upgrade-insecure-requests would rewrite ws:// into wss://"
else
  ok "no scheme rewriting"
fi

# Without this entry WebHID is closed, and the whole capture page with it.
if grep -qi 'permissions-policy:.*hid=(self)' <<<"$headers"; then
  ok "WebHID stays allowed"
else
  fail "the permissions policy would close WebHID"
fi

# The CEF inside OBS keeps a persistent disk cache: a source stuck on a stale
# version keeps working, which makes it hard to even suspect.
if grep -qi 'cache-control:.*no-cache' <<<"$headers"; then
  ok "overlay.html is revalidated"
else
  fail "overlay.html would be cached by OBS"
fi

for page in index.html capture.html; do
  if curl -fsSI "${BASE}/${page}" >/dev/null 2>&1; then
    ok "${page} is served"
  else
    fail "${page} is not served"
  fi
done

asset=$(curl -sS "${BASE}/overlay.html" | grep -oE '/assets/[^"]+\.js' | head -1)
if [ -z "$asset" ]; then
  fail "no hashed asset referenced by overlay.html"
elif curl -sSI "${BASE}${asset}" | grep -qi 'cache-control:.*immutable'; then
  ok "hashed assets are cached forever"
else
  fail "hashed assets are not cached forever"
fi

# A query string reaches the access log verbatim. Since we host the page, an
# old-style URL carrying ?password=… would file our users' OBS credentials on
# our own server. The fragment is the real fix (src/overlay/params.ts); this
# keeps the log clean for whoever has not migrated yet.
canary="canary-$$-do-not-log"
curl -sS -o /dev/null "${BASE}/overlay.html?password=${canary}"
if docker logs "$cid" 2>&1 | grep -q "$canary"; then
  fail "the access log records query strings — an OBS password would be stored here"
else
  ok "query strings stay out of the access log"
fi

if [ "$failures" -gt 0 ]; then
  echo "" >&2
  echo "${failures} check(s) failed." >&2
  exit 1
fi

echo ""
echo "Headers are compliant."
