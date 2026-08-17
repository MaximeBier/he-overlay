export { DEFAULT_OBS_PORT } from '../transport/obs';
import { DEFAULT_OBS_PORT } from '../transport/obs';

/** Highest port number a TCP URL can carry. Beyond it, `new WebSocket` throws. */
const MAX_PORT = 65535;

/**
 * The overlay connects to obs-websocket as an ordinary client: it needs the
 * port and the password, both carried in the browser source URL (spec §6.1).
 * The password is therefore visible in the source properties; this is assumed
 * and documented.
 *
 * The port is clamped rather than trusted. A typo in the OBS source URL would
 * otherwise throw inside the WebSocket constructor during component setup, and
 * the overlay would never mount — a blank source with nothing to look at.
 */
export function readOverlayParams(search: string): { port: number; password: string } {
  const params = new URLSearchParams(search);
  const rawPort = Number.parseInt(params.get('port') ?? '', 10);
  const validPort = Number.isFinite(rawPort) && rawPort > 0 && rawPort <= MAX_PORT;
  return {
    port: validPort ? rawPort : DEFAULT_OBS_PORT,
    password: params.get('password') ?? '',
  };
}
