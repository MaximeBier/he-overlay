/** Only what the copy needs, so a test can hand over a hostile one. */
interface ClipboardHost {
  clipboard?: { writeText(text: string): Promise<void> };
}

/**
 * Copies, and says whether it actually happened.
 *
 * Three ways this fails, and all three used to be reported as success:
 *
 * - **No clipboard at all.** `navigator.clipboard` is undefined outside a
 *   secure context, which is precisely the LAN host `http://<ip>:8080` this
 *   product documents as a real deployment. Optional chaining turned the call
 *   into `undefined`, the `await` resolved, and the button said "Copied".
 * - **The browser refuses** — an unfocused document, a denied permission. The
 *   promise rejects, and an unhandled rejection is a lie with a console error
 *   attached.
 * - **The call throws outright**, on a host that defines the property without
 *   implementing it.
 *
 * A button that lies about the clipboard is worse than one that cannot copy:
 * the person walks away, pastes nothing, and blames the paste.
 */
export async function copyToClipboard(host: ClipboardHost, text: string): Promise<boolean> {
  try {
    if (!host.clipboard) return false;
    await host.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
