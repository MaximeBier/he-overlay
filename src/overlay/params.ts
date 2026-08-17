import { DEFAULT_OBS_PORT } from '../transport/obs';

export { DEFAULT_OBS_PORT };

/** Highest port number a TCP URL can carry. Beyond it, `new WebSocket` throws. */
const MAX_PORT = 65535;

/**
 * The overlay connects to obs-websocket as an ordinary client: it needs the
 * port and the password, both carried in the browser source URL (spec §6.1).
 *
 * **The password belongs in the fragment**, never in the query string. A
 * fragment is never sent to the server — a property of HTTP, not a setting —
 * whereas a query string lands verbatim in the access log of whoever hosts the
 * page. Since we are that host (spec §5.5), a password in the query string
 * would mean collecting our users' OBS credentials without anyone deciding to.
 *
 * The query string is still read, so browser sources configured before this
 * change keep working; the fragment wins parameter by parameter. The port is
 * not a secret and may stay in the query string, where it helps diagnose.
 *
 * The password remains visible in the OBS source properties: that part is
 * assumed and documented (spec §6.1, §10).
 */
export function readOverlayParams(
  search: string,
  hash = '',
): { port: number; password: string } {
  const fromQuery = new URLSearchParams(search);
  const fromHash = new URLSearchParams(hash.replace(/^#/, ''));
  const read = (key: string) => fromHash.get(key) ?? fromQuery.get(key);

  const rawPort = Number.parseInt(read('port') ?? '', 10);
  const validPort = Number.isFinite(rawPort) && rawPort > 0 && rawPort <= MAX_PORT;

  return {
    port: validPort ? rawPort : DEFAULT_OBS_PORT,
    password: read('password') ?? '',
  };
}
