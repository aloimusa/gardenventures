// One state object, persisted in localStorage, plus an append-only event log. Every user action is logged with
// its timestamp; later readings are derived from the log, so nothing in it is ever rewritten or removed.

export type PaneId = 'winddown' | 'reflect' | 'home' | 'venture' | 'toolkit';

export interface GardenState {
  v: 1;
  /** local date (YYYY-MM-DD) of the last completed watering, or null */
  wateredOn: string | null;
}

export interface GardenEvent {
  t: number;           // ms since epoch
  type: string;
  payload?: Record<string, unknown>;
}

const STATE_KEY = 'garden.state';
const LOG_KEY = 'garden.log';

export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function load(): GardenState {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (s && s.v === 1) return { v: 1, wateredOn: typeof s.wateredOn === 'string' ? s.wateredOn : null };
  } catch { /* a corrupt state starts fresh; the log keeps the history */ }
  return { v: 1, wateredOn: null };
}

export const state: GardenState = load();

export function save(): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function readLog(): GardenEvent[] {
  try {
    const l = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch { return []; }
}

export function log(type: string, payload?: Record<string, unknown>): void {
  const ev: GardenEvent = payload ? { t: Date.now(), type, payload } : { t: Date.now(), type };
  const all = readLog();
  all.push(ev);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(all)); } catch { /* storage full: never break the app */ }
}

export function wateredToday(): boolean {
  return state.wateredOn === localDate();
}

// for the designers in the console: garden.log(), garden.state
(globalThis as any).garden = { state, log: readLog };
