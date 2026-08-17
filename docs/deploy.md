# Deploying HE Overlay

The application is a static build served by nginx. There is no server to run, no
database, no state: the container serves three HTML pages and their assets.

Image: `ghcr.io/maximebier/he-overlay:latest`, `linux/amd64`, published by GitHub
Actions on every push to `main`. It listens on **8080** as an unprivileged user
and exposes **`/healthz`**.

## Deploy behind Traefik

Copy `compose.yaml` onto the host and run:

```bash
docker compose pull && docker compose up -d
```

The router needs a host rule, the HTTPS entrypoint, a certificate resolver, and
the service port — all of them are in `compose.yaml`. Adjust the resolver name
and the network name to match the installation.

## Never add a headers middleware to this router

This is the one rule that matters here, and the reason is not obvious.

The page is served over **HTTPS**, but it connects to obs-websocket **in the
clear**, on `ws://localhost:4455`. obs-websocket speaks no TLS, so that
connection cannot be upgraded — it can only be broken.

Two things break it silently:

- **A second Content-Security-Policy.** Two policies do not override each other,
  they intersect, and the most restrictive wins. A `connect-src 'self'` added by
  a middleware would cut the connection to OBS while the image's own CSP stays
  perfectly correct — nothing in the served headers would look wrong.
- **`upgrade-insecure-requests` or `block-all-mixed-content`.** Either rewrites
  or blocks exactly that WebSocket.

The symptom in both cases is an overlay that loads, renders nothing, and reports
no error. Expect to spend hours on it.

To prove Traefik added nothing:

```bash
curl -sSI https://he-overlay.wardensquad.fr/overlay.html \
  | grep -i -e content-security -e permissions-policy -e cache-control
```

Expected: **one** `content-security-policy` line, containing `ws://localhost:*`.

## The OBS password goes in the fragment

The browser source URL:

```
https://he-overlay.wardensquad.fr/overlay.html#password=<password>
```

Note the `#`, not `?`. **A fragment is never sent to the server** — that is a
property of HTTP, not a setting — so the password stays on the streamer's
machine. A query string, by contrast, arrives verbatim in this host's access
log: accepting one would mean collecting our users' OBS credentials without
anyone having decided to.

**A password in the query string is ignored.** Not read, not honoured — the
overlay simply connects without one. Keeping it working would keep the leaking
path alive for anyone copying an old URL.

`#port=` is only needed if obs-websocket was moved off its default port, 4455.
The port may also be passed as `?port=`: it is not a secret, and seeing it in
the logs helps diagnose. The fragment wins if both are present.

The access log is scrubbed of query strings as well (`log_format no-query`), so
that a password typed into one by mistake is not filed anyway.

The password remains visible in the OBS source properties, which is assumed and
documented — but that is the streamer's own screen, not our server.

## Run it yourself

Nothing ties the image to our domain:

```bash
docker run -p 8080:8080 ghcr.io/maximebier/he-overlay
```

Then open `http://localhost:8080/capture.html`.

This is also the fallback for the day the CEF bundled with OBS starts enforcing
the local network access permission: served from `localhost`, the overlay and
OBS share an origin host, and the permission never comes up.

## What the image serves, and why

| Header | Reason |
| --- | --- |
| `Content-Security-Policy` with `connect-src … ws://localhost:* ws://127.0.0.1:*` | the only way the page can reach obs-websocket. The port wildcard is required: the port is configurable in OBS |
| `style-src 'unsafe-inline'` | `overlay.html` carries its transparent background in a `<style>` tag, which must apply before the module loads |
| `Permissions-Policy: hid=(self), …` | WebHID is gated by this policy. Omitting the header would leave the permissive default, but writing it closes the other sensors and records that `hid` is a hard dependency |
| `Cache-Control: no-cache` on the pages | the CEF inside OBS keeps a persistent disk cache. A source stuck on a stale version keeps working, which makes it hard to even suspect |
| `Cache-Control: …, immutable` on `/assets/` | Vite hashes those filenames, so the name changes with the content |

`scripts/check-headers.sh` is the executable version of this table. It runs the
image and probes what it actually serves; the CI runs it before pushing anything
to the registry.

## The package must be public

At its first publication the GHCR package is private, and the host cannot pull
it. Make it public once, in the package settings on GitHub — otherwise
`docker compose pull` fails with an authentication error that says nothing about
visibility.
