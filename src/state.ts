// One state object, persisted in localStorage, plus an append-only event log. Every user action is logged with
// its timestamp; later readings are derived from the log, so nothing in it is ever rewritten or removed.

export type PaneId = 'winddown' | 'reflect' | 'home' | 'venture' | 'toolkit';

export interface GardenState {
  v: 1;
  /** local date (YYYY-MM-DD) of the last completed watering, or null */
  wateredOn: string | null;
  /** the launch check-in's answer, 0 Bad .. 3 Good, or null: a new Reflect card takes it. Stub until the check-in
   *  exists; set it from the console with garden.setMood(n). */
  mood: number | null;
  /** local demo-calendar date of the first completed Venture round, or null */
  venturedOn: string | null;
}

export interface GardenEvent {
  t: number;           // real ms since epoch, including while the demo calendar is advanced
  d?: number;          // demo-day offset when appended; later offsets never reinterpret history
  type: string;
  payload?: Record<string, unknown>;
}

const STATE_KEY = 'garden.state';
const LOG_KEY = 'garden.log';
const DAY_OFFSET_KEY = 'garden.dayOffset';

/** Whole demo days advanced from Toolkit. Kept separately from event timestamps so history stays append-only. */
export function dayOffset(): number {
  const n = Number(localStorage.getItem(DAY_OFFSET_KEY) || 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function offsetDate(source: Date, offset: number): string {
  // Calendar arithmetic at local noon avoids DST's 23/25-hour days and midnight edges.
  return formatDate(new Date(source.getFullYear(), source.getMonth(), source.getDate() + offset, 12));
}

/** The app's local date. Explicit dates remain historical; omitting the argument applies the demo-day offset. */
export function localDate(d?: Date): string {
  return d ? formatDate(d) : offsetDate(new Date(), dayOffset());
}

/** Place an event on the demo calendar as it was when the event happened. Later skips must not move history. */
export function eventDate(timestamp: number, atOffset?: number): string {
  const offset = atOffset ?? readLog().reduce((n, e) => n + (e.type === 'day_skipped' && e.t < timestamp ? 1 : 0), 0);
  return offsetDate(new Date(timestamp), offset);
}

/** Whole local days since the first app_open, including days skipped from Toolkit. */
export function daysSinceFirstOpen(now?: Date): number {
  const first = readLog().find(e => e.type === 'app_open');
  if (!first) return dayOffset();
  const a = new Date(formatDate(new Date(first.t)) + 'T12:00:00');
  const b = new Date((now ? offsetDate(now, dayOffset()) : localDate()) + 'T12:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

/** Advance the demo calendar without rewriting any state/history. Returns the new local app date. */
export function skipDay(): string {
  const offset = dayOffset() + 1;
  localStorage.setItem(DAY_OFFSET_KEY, String(offset));
  const date = localDate();
  log('day_skipped', { offset, date });
  return date;
}

function load(): GardenState {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (s && s.v === 1) return { v: 1, wateredOn: typeof s.wateredOn === 'string' ? s.wateredOn : null,
      mood: Number.isInteger(s.mood) && s.mood >= 0 && s.mood <= 3 ? s.mood : null,
      venturedOn: typeof s.venturedOn === 'string' ? s.venturedOn : null };
  } catch { /* a corrupt state starts fresh; the log keeps the history */ }
  return { v: 1, wateredOn: null, mood: null, venturedOn: null };
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
  const ev: GardenEvent = payload ? { t: Date.now(), d: dayOffset(), type, payload } : { t: Date.now(), d: dayOffset(), type };
  const all = readLog();
  all.push(ev);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(all)); } catch { /* storage full: never break the app */ }
}

export function wateredToday(): boolean {
  return state.wateredOn === localDate();
}

export function ventureDoneToday(): boolean {
  return state.venturedOn === localDate();
}

// for the designers in the console: garden.log(), garden.state
(globalThis as any).garden = { state, log: readLog,
  setMood(n: number | null) { state.mood = n; save(); } };
