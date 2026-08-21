/**
 * Whether each fold of the sidebar is open, kept across reloads (spec §9.3).
 *
 * One key per fold rather than one shared record: a single value would tie
 * the journal to the layout selector, and closing one would close both.
 */
const keyFor = (id: string) => `he-overlay:open:${id}`;

const OPEN = '1';
const SHUT = '0';

export function loadOpenState(
  storage: Pick<Storage, 'getItem'>,
  id: string,
  fallback: boolean,
): boolean {
  const raw = storage.getItem(keyFor(id));
  // Only the two values we write count. Reading anything else as "closed"
  // would silently reverse a choice somebody made on purpose.
  if (raw === OPEN) return true;
  if (raw === SHUT) return false;
  return fallback;
}

export function saveOpenState(storage: Pick<Storage, 'setItem'>, id: string, open: boolean): void {
  try {
    storage.setItem(keyFor(id), open ? OPEN : SHUT);
  } catch {
    // A browser with storage blocked loses the memory of a fold, not the use
    // of the page. Throwing here would abort the click that opened it.
  }
}
