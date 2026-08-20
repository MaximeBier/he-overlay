/**
 * The build identifier stamped in by `define` in `vite.config.ts`.
 *
 * A literal at compile time, not a variable: the diagnostics panel reads it to
 * name its own build in a report (spec §11).
 */
declare const __BUILD__: string;
