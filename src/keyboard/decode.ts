/** Page d'usage des interfaces analogiques du Wooting Two HE ARM (spec §3.2). */
export const ANALOG_USAGE_PAGE = 0xff53;
/** Taille exacte d'un rapport analogique. Sert de contrôle de cohérence. */
export const ANALOG_REPORT_BYTES = 64;
export const ENTRY_BYTES = 4;
/** 64 / 4 : un rapport plein ne contient aucune sentinelle de fin. */
export const MAX_ENTRIES = ANALOG_REPORT_BYTES / ENTRY_BYTES;
/** Course maximale, bornée par construction : un uint16 décalé de 6 bits. */
export const MAX_TRAVEL = 1023;
/** Bits 1..5 : étiquettes de type d'entrée. Une entrée principale les a tous nuls. */
export const LOW_BITS_MASK = 0x3e;
/** Seuls les bits 3 et 4 ont été observés levés. Le reste est inattendu. */
export const KNOWN_LOW_BITS = 0x18;

export interface AnalogEntry {
  /** Index matriciel : clé d'identification stable d'une touche (spec §3.4). */
  index: number;
  /** Usage HID, positionnel : sert à retrouver le libellé, jamais à afficher. */
  usage: number;
  /** Course native de 0 à 1023. */
  travel: number;
  /** Verdict d'actuation du firmware : la touche produit une frappe clavier. */
  active: boolean;
}

export type DecodeAnomaly =
  | { kind: 'unknown-low-bits'; index: number; field: number }
  | { kind: 'bad-length'; length: number };

export interface DecodeResult {
  entries: AnalogEntry[];
  anomalies: DecodeAnomaly[];
}

export function decodeAnalogReport(data: Uint8Array): DecodeResult {
  const entries: AnalogEntry[] = [];
  const anomalies: DecodeAnomaly[] = [];

  if (data.length !== ANALOG_REPORT_BYTES) {
    return { entries, anomalies: [{ kind: 'bad-length', length: data.length }] };
  }

  for (let i = 0; i < MAX_ENTRIES; i++) {
    const offset = i * ENTRY_BYTES;
    const index = data[offset]!;
    const usage = data[offset + 1]!;

    // Fin de liste. Une course nulle ne suffit pas : une touche tout juste
    // relâchée reste présente avec une valeur nulle (spec §3.1).
    if (index === 0 && usage === 0) break;

    const field = data[offset + 2]! | (data[offset + 3]! << 8);
    const low = field & LOW_BITS_MASK;

    if (low !== 0) {
      // Entrée étiquetée : elle porte l'actuation d'avant arbitrage Rappy
      // Snappy, jamais celle qu'on affiche. Un bit hors des deux observés est
      // journalisé plutôt que décodé au jugé.
      if ((low & ~KNOWN_LOW_BITS) !== 0) {
        anomalies.push({ kind: 'unknown-low-bits', index, field });
      }
      continue;
    }

    entries.push({
      index,
      usage,
      travel: field >> 6,
      active: (field & 1) === 1,
    });
  }

  return { entries, anomalies };
}
