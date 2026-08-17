export const DEFAULT_OBS_PORT = 4455;

/**
 * The overlay connects to obs-websocket as an ordinary client: it needs the
 * port and the password, both carried in the browser source URL (spec §6.1).
 * The password is therefore visible in the source properties; this is assumed
 * and documented.
 */
export function readOverlayParams(search: string): { port: number; password: string } {
  const params = new URLSearchParams(search);
  const rawPort = Number.parseInt(params.get('port') ?? '', 10);
  return {
    port: Number.isFinite(rawPort) && rawPort > 0 ? rawPort : DEFAULT_OBS_PORT,
    password: params.get('password') ?? '',
  };
}
