import { dayOffset, eventDate, localDate, log, readLog, type GardenEvent } from '../state';
import { ORNAMENTS, ornamentForIndex } from '../home/ornamentCatalog';

export const MARKET_KEY = 'garden.market.v1';
// Keep the storage key/version: older builds used v1 for both the three-gift schema and this allocation ledger.
export const MARKET_FORMAT = 1;

export const PRODUCE = [
  ['banana', 'Bananas'], ['strawberry', 'Strawberries'], ['apple', 'Apples'],
  ['mandarin', 'Mandarins'], ['mango', 'Mangoes'], ['blueberry', 'Blueberries'],
  ['pear', 'Pears'], ['tomato', 'Tomatoes'], ['eggplant', 'Aubergines'],
] as const;
export type PlantId = typeof PRODUCE[number][0];
export type ProduceCounts = Partial<Record<PlantId, number>>;
export type OrnamentId = typeof ORNAMENTS[number]['id'];
export { ORNAMENTS, ornamentForIndex };

const LEGACY_ORNAMENT_IDS: Record<string, OrnamentId> = {
  'golden-token': 'golden-watering-token',
  'pot-bow': 'tiny-pot-bow',
};

export function ornamentAt(index: number): OrnamentId {
  const value = ornamentForIndex(index) as unknown;
  return (typeof value === 'string' ? value : (value as { id: OrnamentId }).id) as OrnamentId;
}
export const ornamentName = (id: OrnamentId): string => ORNAMENTS.find(item => item.id === id)?.name ?? id;

export interface HarvestUnit {
  /** Current v3/v4 actionId is globally unique because it contains its round id. */
  id: string;
  roundId: string;
  plant: PlantId;
  reward: number;
  date: string;
  t: number;
}

export interface MarketTrade {
  id: string;
  week: string;
  at: number;
  date: string;
  resultIds: string[];
  byPlant: ProduceCounts;
  total: number;
  /** Every productive exchange has a reward. Null only occurs in un-migrated input, never in a parsed trade. */
  ornament: OrnamentId;
  /** Zero-based total reward count; the gift is ornamentForIndex(rewardIndex), modulo the twelve designs. */
  rewardIndex: number;
  cycle: number;
}

export interface MarketLedger {
  v: typeof MARKET_FORMAT;
  trades: MarketTrade[];
  owned: OrnamentId[];
  equipped: OrnamentId | null;
}

export interface Inventory {
  units: HarvestUnit[];
  byPlant: ProduceCounts;
  total: number;
}

export interface TradeResult {
  trade: MarketTrade;
  duplicate: boolean;
  /** The reward for this trade (also set on a repeated twelve-design cycle). */
  newOrnament: OrnamentId | null;
}

const emptyLedger = (): MarketLedger => ({ v: MARKET_FORMAT, trades: [], owned: [], equipped: null });
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isPlant = (value: unknown): value is PlantId => PRODUCE.some(([id]) => id === value);
function isOrnament(value: unknown): value is OrnamentId {
  if (typeof value === 'string' && value in LEGACY_ORNAMENT_IDS) return true;
  return ORNAMENTS.some(item => item.id === value);
}
const normalizedOrnament = (id: OrnamentId): OrnamentId => LEGACY_ORNAMENT_IDS[id] ?? id;
const safeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

/**
 * Only displayed, mature v3 and v4 results become produce; no open-ended future-version acceptance. In particular,
 * v2 venture_pick history is deliberately not converted. v4's normal/beta evidence stays opaque: the Market reads
 * only the shared result surface and never normalizes those records into v3 or reinterprets their sampling rules.
 * Duplicate raw deliveries of one actionId are idempotent; the first structurally eligible result is authoritative.
 */
export function harvestUnits(events: readonly GardenEvent[]): HarvestUnit[] {
  const seen = new Set<string>();
  const units: HarvestUnit[] = [];
  for (const event of events) {
    if (event.type !== 'venture_harvest_result') continue;
    const p = event.payload;
    if (!p || (p.v !== 3 && p.v !== 4) || p.maturedBeforeRoundEnd !== true || !isPlant(p.plant)
      || typeof p.actionId !== 'string' || !p.actionId || typeof p.roundId !== 'string' || !p.roundId
      || !safeInteger(p.reward) || p.reward <= 0 || !validDate(p.date)
      || !safeInteger(event.t) || seen.has(p.actionId)) continue;
    seen.add(p.actionId);
    units.push({ id: p.actionId, roundId: p.roundId, plant: p.plant, reward: p.reward, date: p.date, t: event.t });
  }
  return units;
}

/**
 * Read both the current every-trade ledger and the original first-per-week schema. Each valid historical productive
 * trade remains a reward event: old null ornaments are not collapsed into the first trade, and established gifts are
 * never granted a second time. Legacy ids are aliases, not extra inventory.
 */
export function parseLedger(raw: string | null): MarketLedger {
  if (!raw) return emptyLedger();
  try {
    const value = JSON.parse(raw) as Partial<MarketLedger>;
    if (value.v !== MARKET_FORMAT || !Array.isArray(value.trades) || !Array.isArray(value.owned)) return emptyLedger();
    const allocated = new Set<string>(), ids = new Set<string>();
    const trades: MarketTrade[] = [];
    for (const candidate of value.trades) {
      if (!candidate || typeof candidate !== 'object') continue;
      const trade = candidate as Partial<MarketTrade>;
      if (typeof trade.id !== 'string' || !trade.id || ids.has(trade.id) || typeof trade.week !== 'string'
        || !validDate(trade.date) || !safeInteger(trade.at) || !Array.isArray(trade.resultIds)
        || !safeInteger(trade.total) || !trade.byPlant || typeof trade.byPlant !== 'object') continue;
      const resultIds = [...new Set(trade.resultIds.filter((id): id is string => typeof id === 'string' && !!id))]
        .filter(id => !allocated.has(id));
      // A malformed entry cannot consume the same harvest twice, nor masquerade as a productive exchange.
      if (!resultIds.length || resultIds.length !== trade.resultIds.length || trade.total <= 0) continue;
      const byPlant: ProduceCounts = {};
      let sum = 0, validCounts = true;
      for (const [plant, count] of Object.entries(trade.byPlant)) {
        if (!isPlant(plant) || !safeInteger(count) || count <= 0) { validCounts = false; break; }
        byPlant[plant] = count;
        sum += count;
      }
      if (!validCounts || sum !== trade.total) continue;
      const rewardIndex = trades.length;
      // Preserve a real old gift where present. Newly indexed null entries take their exact place in that sequence;
      // all new exchanges instead use ornamentAt(rewardIndex) directly in exchangeProduce.
      const ornament = isOrnament(trade.ornament) ? normalizedOrnament(trade.ornament) : ornamentAt(rewardIndex);
      resultIds.forEach(id => allocated.add(id)); ids.add(trade.id);
      trades.push({ id: trade.id, week: trade.week, at: trade.at, date: trade.date, resultIds,
        byPlant, total: trade.total, ornament, rewardIndex, cycle: Math.floor(rewardIndex / ORNAMENTS.length) });
    }
    const owned = [...new Set([
      ...value.owned.filter(isOrnament).map(normalizedOrnament),
      ...trades.map(trade => trade.ornament),
    ])];
    const requestedEquip = isOrnament(value.equipped) ? normalizedOrnament(value.equipped) : null;
    const equipped = requestedEquip && owned.includes(requestedEquip) ? requestedEquip : null;
    return { v: MARKET_FORMAT, trades, owned, equipped };
  } catch { return emptyLedger(); }
}

export function readMarketLedger(): MarketLedger {
  const raw = localStorage.getItem(MARKET_KEY);
  const ledger = parseLedger(raw);
  if (raw) {
    const normalized = JSON.stringify(ledger);
    // Best-effort idempotent migration. A storage failure does not block the in-memory projection or a later trade.
    if (raw !== normalized) {
      try { localStorage.setItem(MARKET_KEY, normalized); } catch { /* in-memory reconciliation still applies */ }
    }
  }
  return ledger;
}

export function inventoryFrom(events: readonly GardenEvent[], ledger: MarketLedger): Inventory {
  const allocated = new Set(ledger.trades.flatMap(trade => trade.resultIds));
  const units = harvestUnits(events).filter(unit => !allocated.has(unit.id));
  const byPlant: ProduceCounts = {};
  let total = 0;
  for (const unit of units) {
    byPlant[unit.plant] = (byPlant[unit.plant] ?? 0) + unit.reward;
    total += unit.reward;
  }
  return { units, byPlant, total };
}

function dateAtNoon(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

/** ISO weekday/week number, evaluated on the app's local demo-calendar date. */
export function marketWeek(date: string): string {
  const source = dateAtNoon(date);
  const utc = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate(), 12));
  utc.setUTCDate(utc.getUTCDate() + 3 - ((utc.getUTCDay() + 6) % 7));
  const isoYear = utc.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  const week = 1 + Math.round((utc.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function mondayIndex(date: string): number {
  const d = dateAtNoon(date);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12);
  return Math.floor(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / (7 * 86400000));
}

/** Retained for old callers/fixtures; new rewards are driven by total trade index, not by ISO week. */
export function ornamentForWeek(week: string): OrnamentId {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) return ornamentAt(0);
  const jan4 = new Date(Number(match[1]), 0, 4, 12);
  const index = mondayIndex(jan4.toISOString().slice(0, 10)) + Number(match[2]) - 1;
  return ornamentAt(index);
}

export function marketPresence(date: string, demoDay: number): { present: boolean; week: string; nextDate: string | null } {
  // Calendar weekends alone determine discovery; the original demo never forces a weekday Market open.
  void demoDay;
  const weekday = dateAtNoon(date).getDay();
  const present = weekday === 6 || weekday === 0;
  let nextDate: string | null = null;
  if (!present) {
    for (let n = 1; n <= 7; n++) {
      const d = dateAtNoon(date); d.setDate(d.getDate() + n);
      const candidate = localDate(d), candidateDay = dateAtNoon(candidate).getDay();
      if (candidate !== date && (candidateDay === 6 || candidateDay === 0)) { nextDate = candidate; break; }
    }
  }
  return { present, week: marketWeek(date), nextDate };
}

function allocationId(week: string, ids: string[]): string {
  const text = ids.slice().sort().join('\u001f');
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return `market-${week}-${a.toString(36)}${b.toString(36)}-${ids.length}`;
}

function writeLedger(ledger: MarketLedger): boolean {
  try {
    localStorage.setItem(MARKET_KEY, JSON.stringify(ledger));
    return localStorage.getItem(MARKET_KEY) === JSON.stringify(ledger);
  } catch { return false; }
}

/**
 * Select all still-unallocated raw v3 ids, snapshot their exact per-species totals, then atomically replace the local
 * allocation ledger. The committed resultIds are consumed before the activity event is appended. Retries/reloads and
 * duplicate pointer events therefore observe either no balance or the same deterministic trade id, never another gift.
 */
export function exchangeProduce(at = Date.now(), date = localDate()): TradeResult | null {
  const initial = readMarketLedger();
  const available = inventoryFrom(readLog(), initial);
  if (!available.units.length || available.total <= 0) return null;
  const week = marketWeek(date);
  const resultIds = available.units.map(unit => unit.id).sort();
  const id = allocationId(week, resultIds);
  const old = initial.trades.find(trade => trade.id === id && trade.resultIds.join('\u001f') === resultIds.join('\u001f'));
  if (old) return { trade: old, duplicate: true, newOrnament: null };
  const rewardIndex = initial.trades.length;
  const ornament = ornamentAt(rewardIndex);
  const byPlant: ProduceCounts = {};
  for (const unit of available.units) byPlant[unit.plant] = (byPlant[unit.plant] ?? 0) + unit.reward;
  const cycle = Math.floor(rewardIndex / ORNAMENTS.length);
  const trade: MarketTrade = { id, week, at, date, resultIds, byPlant, total: available.total,
    ornament, rewardIndex, cycle };
  const owned = [...initial.owned];
  if (!owned.includes(ornament)) owned.push(ornament);
  const next: MarketLedger = { ...initial, trades: [...initial.trades, trade], owned };
  if (!writeLedger(next)) return null;
  log('market_trade', { v: MARKET_FORMAT, tradeId: id, week, date, total: trade.total,
    byPlant, resultIds, ornament, rewardIndex, cycle, newOrnament: ornament });
  return { trade, duplicate: false, newOrnament: ornament };
}

export function equipOrnament(id: OrnamentId): boolean {
  const ledger = readMarketLedger();
  const normalized = normalizedOrnament(id);
  if (!ledger.owned.includes(normalized) || ledger.equipped === normalized) return ledger.equipped === normalized;
  if (!writeLedger({ ...ledger, equipped: normalized })) return false;
  log('market_ornament_equipped', { v: MARKET_FORMAT, ornament: normalized, date: localDate(), week: marketWeek(localDate()) });
  return true;
}

export const PHQ9_ITEMS = [
  { key: 'interest', text: 'Little interest or pleasure in doing things' },
  { key: 'down', text: 'Feeling down, depressed, or hopeless' },
  { key: 'sleep', text: 'Trouble falling or staying asleep, or sleeping too much' },
  { key: 'tired', text: 'Feeling tired or having little energy' },
  { key: 'appetite', text: 'Poor appetite or overeating' },
  { key: 'self-worth', text: 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down' },
  { key: 'concentration', text: 'Trouble concentrating on things, such as reading the newspaper or watching television' },
  { key: 'movement', text: 'Moving or speaking so slowly that other people could have noticed. Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual' },
  { key: 'thoughts', text: 'Thoughts that you would be better off dead, or of hurting yourself in some way' },
] as const;
export type PHQItem = typeof PHQ9_ITEMS[number]['key'];
export type PHQKey = PHQItem;
export type PHQ9Trigger = 'phq2_step_up' | 'calendar_month';
export type PHQ9Status = 'pending' | 'answered' | 'skipped';
export type PHQValues = Array<number | null>;
export type PHQ2SequenceId = `market-phq2-${string}`;
export const phq2SequenceId = (week: string): PHQ2SequenceId => `market-phq2-${week}`;
export const phq9SequenceId = (trigger: PHQ9Trigger, month: string): string => `market-phq9-${trigger}-${month}`;

export interface PHQ9Record {
  status: PHQ9Status;
  trigger: PHQ9Trigger;
  answers: PHQValues;
  total: number | null;
  stage: string;
  sequenceId: string;
  anchorPhq2Total: number | null;
  anchorPhq2SequenceId: string | null;
}

function phq9Values(events: readonly GardenEvent[], month: string): PHQ9Record | null {
  const own = events.filter(event => event.type === 'market_phq9' && event.payload?.instrument === 'PHQ-9'
    && event.payload.month === month);
  const latest = own.at(-1)?.payload;
  if (!latest || !['pending', 'answered', 'skipped'].includes(String(latest.status))
    || !['phq2_step_up', 'calendar_month'].includes(String(latest.trigger))
    || !Array.isArray(latest.answers) || latest.answers.length !== PHQ9_ITEMS.length) return null;
  const values: PHQValues = (latest.answers as unknown[]).map((item, index): number | null => {
    const value = (item as { value?: unknown })?.value;
    const key = (item as { key?: unknown })?.key;
    const itemIndex = (item as { index?: unknown })?.index;
    if (itemIndex !== index + 1 || key !== PHQ9_ITEMS[index].key) return Number.NaN;
    if (value === null) return null;
    return typeof value === 'number' ? value : Number.NaN;
  });
  if (!values.every(value => value === null || safeInteger(value) && value >= 0 && value <= 3)) return null;
  const complete = values.every(value => safeInteger(value) && value >= 0 && value <= 3);
  const status = latest.status as PHQ9Status;
  if (status === 'answered' && !complete) return null;
  return {
    status, trigger: latest.trigger as PHQ9Trigger, answers: values,
    total: status === 'answered' ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
    stage: typeof latest.stage === 'string' ? latest.stage : 'remaining_items',
    sequenceId: typeof latest.sequenceId === 'string' ? latest.sequenceId : phq9SequenceId(latest.trigger as PHQ9Trigger, month),
    anchorPhq2Total: safeInteger(latest.anchor_phq2_total) ? latest.anchor_phq2_total : null,
    anchorPhq2SequenceId: typeof latest.anchor_phq2_sequence_id === 'string' ? latest.anchor_phq2_sequence_id : null,
  };
}

/** Any pending/answered/skipped full-check-in owns its month; only the next calendar month offers a new sequence. */
export function phq9ForMonth(events: readonly GardenEvent[], month: string): PHQ9Record | null {
  return /^\d{4}-\d{2}$/.test(month) ? phq9Values(events, month) : null;
}

export function savePHQ9(input: {
  month: string;
  trigger: PHQ9Trigger;
  status: PHQ9Status;
  answers: PHQValues;
  stage: string;
  anchorPhq2Total?: number | null;
  anchorPhq2SequenceId?: string | null;
}): boolean {
  if (!/^\d{4}-\d{2}$/.test(input.month) || input.answers.length !== PHQ9_ITEMS.length) return false;
  const answers = input.answers.map(value => value === null ? null : value);
  if (!answers.every(value => value === null || safeInteger(value) && value >= 0 && value <= 3)) return false;
  const complete = answers.every(value => safeInteger(value) && value >= 0 && value <= 3);
  if (input.status === 'answered' && !complete || input.status !== 'answered' && complete) return false;
  const existing = phq9ForMonth(readLog(), input.month);
  const sequenceId = phq9SequenceId(input.trigger, input.month);
  // A new sequence cannot begin twice. A pending sequence may be explicitly reviewed, completed, or skipped once.
  if (existing && (existing.status !== 'pending' || input.status === 'pending' || existing.sequenceId !== sequenceId)) return false;
  const total = input.status === 'answered' ? answers.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  log('market_phq9', {
    v: MARKET_FORMAT, instrument: 'PHQ-9', trigger: input.trigger, status: input.status,
    month: input.month, year: Number(input.month.slice(0, 4)), calendar_month: input.month,
    sequenceId, stage: input.stage,
    answers: answers.map((value, index) => ({ index: index + 1, key: PHQ9_ITEMS[index].key, value })),
    answered_at: input.status === 'answered' ? new Date().toISOString() : null,
    total,
    anchor_phq2_total: input.trigger === 'phq2_step_up' ? input.anchorPhq2Total ?? null : null,
    anchor_phq2_sequence_id: input.trigger === 'phq2_step_up' ? input.anchorPhq2SequenceId ?? null : null,
    responded_items: answers.filter(value => value !== null).length,
    storage: 'local-append-only',
  });
  return true;
}

export interface PHQStatus { status: 'answered' | 'skipped'; answers: [number, number] | null }
export function phqForWeek(events: readonly GardenEvent[], week: string): PHQStatus | null {
  const own = events.filter(event => event.type === 'market_phq2' && event.payload?.week === week);
  const latest = own.at(-1)?.payload;
  if (!latest || (latest.status !== 'answered' && latest.status !== 'skipped')) return null;
  if (latest.status === 'skipped') return { status: 'skipped', answers: null };
  const answers = latest.answers;
  if (!Array.isArray(answers) || answers.length !== 2) return null;
  const values = answers.map(item => (item as { answer?: unknown })?.answer);
  if (!values.every(value => safeInteger(value) && value >= 0 && value <= 3)) return null;
  return { status: 'answered', answers: values as [number, number] };
}

export function savePHQ(answers: [number, number] | null, date = localDate()): boolean {
  const week = marketWeek(date);
  if (phqForWeek(readLog(), week)) return false;
  if (answers && !answers.every(value => safeInteger(value) && value >= 0 && value <= 3)) return false;
  const items: PHQItem[] = ['interest', 'down'];
  log('market_phq2', {
    v: MARKET_FORMAT, instrument: 'PHQ-2', week, date, sequenceId: phq2SequenceId(week), status: answers ? 'answered' : 'skipped',
    answers: answers ? answers.map((answer, index) => ({ item: items[index], answer, date })) : null,
    total: answers ? answers[0] + answers[1] : null,
    storage: 'local-append-only',
  });
  return true;
}

/** Session dates use the event's captured demo offset; advancing days never reinterprets earlier sessions. */
export function marketSessionPayload(): Record<string, unknown> {
  const date = localDate();
  return { v: MARKET_FORMAT, date, week: marketWeek(date), dayOffset: dayOffset(), local: true };
}

export { eventDate };
