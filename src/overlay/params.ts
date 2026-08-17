import { DEFAULT_OBS_PORT } from '../transport/obs';

export { DEFAULT_OBS_PORT };

/** Highest port number a TCP URL can carry. Beyond it, `new WebSocket` throws. */
const MAX_PORT = 65535;

/**
 * The overlay connects to obs-websocket as an ordinary client: it needs the
 * port and the password, both carried in the browser source URL (spec §6.1).
 *
 * **The password is read from the fragment only.** A fragment is never sent to
 * the server — a property of HTTP, not a setting — whereas a query string lands
 * verbatim in the access log of whoever hosts the page. Since we are that host
 * (spec §5.5), accepting a password from the query string would keep alive the
 * one path that hands us a credential we have no business holding.
 *
 * The port is read from either place, the fragment winning: it is not a secret,
 * and seeing it in the logs helps diagnose.
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

  const rawPort = Number.parseInt(fromHash.get('port') ?? fromQuery.get('port') ?? '', 10);
  const validPort = Number.isFinite(rawPort) && rawPort > 0 && rawPort <= MAX_PORT;

  return {
    port: validPort ? rawPort : DEFAULT_OBS_PORT,
    password: fromHash.get('password') ?? '',
  };
}
