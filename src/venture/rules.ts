// Pure, versioned rules for the Vittala-inspired consumer adaptation.
// Wall-clock injection keeps absolute deadlines and recovery boundaries testable.

export const VENTURE_FORMAT = 4;
export const VENTURE_MODE = 'vittala_foraging_adaptation_v1';
export const VENTURE_TIMING_VERSION = 'vittala_adaptation_timing_v1';
export const VENTURE_RULES_VERSION = 'vittala_adaptation_rules_v1';
export const VENTURE_TRAVEL_CONDITION = 'long_travel_10s_v1';
export const VENTURE_HARVEST_INTERACTION = 'single_tap_fixed_2s_v1';
export const BACKGROUND_LEAVE_THRESHOLD_MS = 20_000;

export const DEFAULT_ROUND_MS = 180_000;
export const DEFAULT_HARVEST_MS = 2_000;
export const DEFAULT_MOVE_MS = 10_000;

export type VenturePhase = 'selection' | 'practice' | 'decision' | 'harvest_wait' | 'move_wait' | 'complete';
export type VentureAction = 'harvest' | 'move';
export type DecisionInput = 'button' | 'keyboard' | 'choice' | 'pointer' | 'practice' | 'check';

export interface VentureTimingProfile {
  durationMs: number;
  harvestDurationMs: number;
  moveDurationMs: number;
  seedOverride: number | null;
  testOverride: boolean;
}

export const DEFAULT_TIMING: Readonly<VentureTimingProfile> = Object.freeze({
  durationMs: DEFAULT_ROUND_MS,
  harvestDurationMs: DEFAULT_HARVEST_MS,
  moveDurationMs: DEFAULT_MOVE_MS,
  seedOverride: null,
  testOverride: false,
});

/** Travel retains the paper's reaction-time-inclusive condition window. */
export function scheduledReadyAt(promptedAt: number, choiceAt: number, actionDurationMs: number): number {
  return Math.max(promptedAt + actionDurationMs, choiceAt);
}

export function scheduledPostChoiceWait(promptedAt: number, choiceAt: number, actionDurationMs: number): number {
  return scheduledReadyAt(promptedAt, choiceAt, actionDurationMs) - choiceAt;
}

/** The explicit v4 harvest starts on one accepted tap and cannot be shortened or cancelled by release. */
export function harvestReadyAt(choiceAt: number, harvestDurationMs = DEFAULT_HARVEST_MS): number {
  return choiceAt + harvestDurationMs;
}

export function inputAcceptedAt(choiceAt: number, endsAt: number): boolean {
  return choiceAt < endsAt;
}

export function actionMaturesBeforeRoundEnd(readyAt: number, endsAt: number): boolean {
  // Equality settles first: a result due exactly at expiry is displayed once, then the round ends.
  return readyAt <= endsAt;
}

export function backgroundInvalid(closedDurationMs: number, hasOpenInterval: boolean): boolean {
  // This is an annotation for a future evaluator, not a game outcome or interpretation.
  return hasOpenInterval || closedDurationMs > BACKGROUND_LEAVE_THRESHOLD_MS;
}

export function makeRoundId(date: string, startedAt: number, roundSeed: number): string {
  return `venture-v4:${date}:${startedAt.toString(36)}:${(roundSeed >>> 0).toString(36)}`;
}

export function makeOccurrenceId(roundId: string, occurrenceIndex: number): string {
  return `${roundId}:occurrence:${occurrenceIndex}`;
}

export function makeDecisionId(roundId: string, decisionIndex: number): string {
  return `${roundId}:decision:${decisionIndex}`;
}

export function makeActionId(roundId: string, actionIndex: number): string {
  return `${roundId}:action:${actionIndex}`;
}

export function makeTravelId(roundId: string, destinationOccurrenceIndex: number): string {
  return `${roundId}:travel:${destinationOccurrenceIndex}`;
}

function integerParam(params: URLSearchParams, key: string, minimum: number, maximum: number): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) return null;
  return value;
}

function seedParam(params: URLSearchParams): number | null {
  const raw = params.get('venture-seed');
  if (raw === null || !/^(0|[1-9]\d{0,9})$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff ? value >>> 0 : null;
}

/** Short profiles and fixed seeds require the explicit development query and are logged on the real round start. */
export function timingProfileFromQuery(search: string | URLSearchParams, testSeconds?: unknown): VentureTimingProfile {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  if (params.get('venture-test') !== '1') return { ...DEFAULT_TIMING };
  const durationMs = integerParam(params, 'venture-duration-ms', 100, DEFAULT_ROUND_MS);
  const seconds = Number(testSeconds);
  const legacyDurationMs = durationMs === null && testSeconds !== null && testSeconds !== undefined
    && testSeconds !== '' && Number.isFinite(seconds) && seconds > 0
    ? Math.round(Math.max(0.4, Math.min(180, seconds)) * 1000) : null;
  const harvestDurationMs = integerParam(params, 'venture-harvest-ms', 20, DEFAULT_HARVEST_MS);
  const moveDurationMs = integerParam(params, 'venture-move-ms', 20, DEFAULT_MOVE_MS);
  const seedOverride = seedParam(params);
  const testOverride = durationMs !== null || legacyDurationMs !== null || harvestDurationMs !== null
    || moveDurationMs !== null || seedOverride !== null;
  return {
    durationMs: durationMs ?? legacyDurationMs ?? DEFAULT_ROUND_MS,
    harvestDurationMs: harvestDurationMs ?? DEFAULT_HARVEST_MS,
    moveDurationMs: moveDurationMs ?? DEFAULT_MOVE_MS,
    seedOverride,
    testOverride,
  };
}

export function formatVentureTime(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
