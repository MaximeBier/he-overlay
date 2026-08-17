/**
 * obs-websocket 5.x handshake (spec §3.7).
 * WebCrypto is asynchronous: this is harmless here, since authentication
 * happens once per connection and never on the frame path.
 */
async function sha256Base64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function computeAuth(
  password: string,
  salt: string,
  challenge: string,
): Promise<string> {
  const secret = await sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}
