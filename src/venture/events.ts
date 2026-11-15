import {
  BACKGROUND_LEAVE_THRESHOLD_MS, DEFAULT_HARVEST_MS, DEFAULT_MOVE_MS, DEFAULT_ROUND_MS,
  VENTURE_FORMAT, VENTURE_HARVEST_INTERACTION, VENTURE_MODE, VENTURE_RULES_VERSION, VENTURE_TIMING_VERSION,
  VENTURE_TRAVEL_CONDITION, backgroundInvalid, harvestReadyAt,
  makeActionId, makeDecisionId, makeOccurrenceId, makeTravelId, scheduledReadyAt,
  type VenturePhase,
} from './rules';
import {
  REWARD_CONFIG, VENTURE_RNG_VERSION, occurrenceChainSeed, occurrenceVisualSeed, sampleVentureReward,
  type VentureRngSample,
} from './rng';
import type { VenturePlantId } from './plants/index.js';

export interface VentureRawEvent {
  t: number;
  d?: number;
  type: string;
  payload?: Record<string, unknown>;
}

export interface RoundInfo {
  id: string;
  date: string;
  day: number;
  plant: VenturePlantId;
  roundSeed: number;
  startedAt: number;
  durationMs: number;
  endsAt: number;
  harvestDurationMs: number;
  moveDurationMs: number;
  harvestInteraction: typeof VENTURE_HARVEST_INTERACTION;
}

export interface OccurrenceReplay {
  id: string;
  index: number;
  chainSeed: number;
  visualSeed: number;
  revealedAt: number;
  arrivalTravelId: string | null;
  results: VentureRawEvent[];
  rngState: number;
  rngTransitionCount: number;
  lastObservedYield: number | null;
}

export interface DecisionReplay {
  id: string;
  occurrenceId: string;
  occurrenceIndex: number;
  promptedAt: number;
  harvestDurationMs: number;
  moveDurationMs: number;
  harvestsDisplayed: number;
  lastObservedYield: number | null;
}

export interface ActionReplay {
  id: string;
  travelId: string | null;
  decisionId: string;
  chosenAction: 'harvest' | 'move';
  via: string;
  choiceAt: number;
  decisionPromptAt: number;
  fromOccurrenceId: string;
  fromOccurrenceIndex: number;
  toOccurrenceId: string | null;
  toOccurrenceIndex: number | null;
  scheduledConditionMs: number;
  scheduledReadyAt: number;
  scheduledPostChoiceWaitMs: number;
  harvestsDisplayed: number;
  lastObservedYield: number | null;
  harvestInteraction: typeof VENTURE_HARVEST_INTERACTION | null;
}

export interface BackgroundIntervalReplay {
  id: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  openAtLastSession: boolean;
  ended: boolean;
}

export interface RoundReplay {
  round: RoundInfo;
  phase: Exclude<VenturePhase, 'selection' | 'practice'>;
  occurrences: OccurrenceReplay[];
  currentOccurrence: OccurrenceReplay;
  decision: DecisionReplay | null;
  pendingAction: ActionReplay | null;
  decisionCount: number;
  actionCount: number;
  roundYield: number;
  displayedHarvestCount: number;
  backgroundIntervals: BackgroundIntervalReplay[];
  backgroundDurationMs: number;
  backgroundOpen: boolean;
  end: VentureRawEvent | null;
  resolution: 'harvest_result' | 'move_arrival' | 'travel_not_arrived' | null;
  invalidReason: string | null;
}

export const numberValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
export const integerValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) ? value : null;
export const stringValue = (value: unknown): string | null => typeof value === 'string' && value ? value : null;

function samePayload(a: VentureRawEvent, b: VentureRawEvent): boolean {
  return a.type === b.type && JSON.stringify(a.payload ?? null) === JSON.stringify(b.payload ?? null);
}

class ReplayError extends Error {}

function requireFields(event: VentureRawEvent, fields: string[]): void {
  for (const field of fields) {
    if (!(field in (event.payload ?? {})) || event.payload?.[field] === undefined) {
      throw new ReplayError(`${event.type} missing ${field}`);
    }
  }
}

function requireNumbers(event: VentureRawEvent, fields: string[]): void {
  requireFields(event, fields);
  for (const field of fields) if (numberValue(event.payload?.[field]) === null) {
    throw new ReplayError(`${event.type} invalid ${field}`);
  }
}

function requireStrings(event: VentureRawEvent, fields: string[]): void {
  requireFields(event, fields);
  for (const field of fields) if (stringValue(event.payload?.[field]) === null) {
    throw new ReplayError(`${event.type} invalid ${field}`);
  }
}

function sharedMatches(event: VentureRawEvent, round: RoundInfo): void {
  const p = event.payload;
  if (p?.v !== VENTURE_FORMAT || p.mode !== VENTURE_MODE || p.date !== round.date || p.day !== round.day
    || p.roundId !== round.id || p.plant !== round.plant || p.rulesVersion !== VENTURE_RULES_VERSION
    || p.timingVersion !== VENTURE_TIMING_VERSION) throw new ReplayError(`${event.type} shared fields differ`);
}

function dedupeKey(event: VentureRawEvent): string {
  const p = event.payload ?? {};
  switch (event.type) {
    case 'venture_selection': return 'selection';
    case 'venture_round_start': return 'start';
    case 'venture_occurrence': return `occurrence:${String(p.occurrenceId)}`;
    case 'venture_decision_prompt': return `decision:${String(p.decisionId)}`;
    case 'venture_action': return `action:${String(p.actionId)}`;
    case 'venture_harvest_result': return `result:${String(p.actionId)}`;
    case 'venture_background_interval': return `background:${String(p.intervalId)}:${String(p.lifecycle)}`;
    case 'venture_travel_end': return `travel:${String(p.travelId)}`;
    case 'venture_round_end': return `end:${String(p.roundId)}`;
    default: return `${event.type}:${JSON.stringify(p)}`;
  }
}

export function backgroundAnnotation(intervals: readonly BackgroundIntervalReplay[]): {
  durationMs: number;
  open: boolean;
  invalid: boolean;
  reason: 'none' | 'over_leave_threshold' | 'open_at_last_session' | 'open_and_over_leave_threshold';
} {
  const durationMs = intervals.reduce((sum, interval) => sum + (interval.durationMs ?? 0), 0);
  const open = intervals.some(interval => !interval.ended || interval.openAtLastSession);
  const over = durationMs > BACKGROUND_LEAVE_THRESHOLD_MS;
  return { durationMs, open, invalid: backgroundInvalid(durationMs, open),
    reason: open && over ? 'open_and_over_leave_threshold' : open ? 'open_at_last_session'
      : over ? 'over_leave_threshold' : 'none' };
}

function resultSample(event: VentureRawEvent, occurrence: OccurrenceReplay, roundYield: number): VentureRngSample {
  const p = event.payload ?? {};
  requireNumbers(event, ['drawIndex', 'rngDrawIndex', 'rngDrawCount', 'rngStateBefore', 'rngStateAfter', 'rngValue',
    'reward', 'roundYield', 'harvestIndex', 'rewardDueAt', 'rewardReadyAt', 'rewardDisplayedAt',
    'actualConditionDelayMs', 'actualPostChoiceWaitMs']);
  requireStrings(event, ['rngVersion', 'distribution']);
  requireFields(event, ['occurrenceChainSeed', 'initialStandardNormal', 'initialNormalValue', 'negativeNormalObserved',
    'negativeRewardPrevented', 'gammaAlpha', 'gammaShape2', 'selectedFactor', 'previousObservedYield', 'uniformValues']);
  const expected = sampleVentureReward(occurrence.chainSeed, occurrence.rngState, occurrence.results.length,
    occurrence.lastObservedYield);
  expected.rngDrawIndex = occurrence.rngTransitionCount;
  const numericKeys: (keyof VentureRngSample)[] = ['occurrenceChainSeed', 'drawIndex', 'rngDrawIndex', 'rngDrawCount',
    'rngStateBefore', 'rngStateAfter', 'rngValue', 'initialStandardNormal', 'initialNormalValue', 'gammaAlpha',
    'gammaShape2', 'selectedFactor', 'previousObservedYield', 'reward'];
  for (const key of numericKeys) if (p[key] !== expected[key]) throw new ReplayError(`result RNG ${String(key)} differs`);
  if (JSON.stringify(p.uniformValues) !== JSON.stringify(expected.uniformValues)
    || p.negativeNormalObserved !== expected.negativeNormalObserved
    || p.negativeRewardPrevented !== expected.negativeRewardPrevented
    || p.rngVersion !== VENTURE_RNG_VERSION || p.distribution !== expected.distribution
    || p.lastObservedYield !== expected.reward || p.roundYield !== roundYield + expected.reward
    || p.harvestIndex !== occurrence.results.length) throw new ReplayError('result observation differs');
  if (expected.reward < 0 || !Number.isInteger(expected.reward)
    || expected.selectedFactor !== null && (!(expected.selectedFactor > 0) || !(expected.selectedFactor < 1))) {
    throw new ReplayError('result factor differs');
  }
  return expected;
}

/** Parse exactly one round in raw append order. Exact duplicate IDs are idempotent; conflicting duplicates fail closed. */
export function replayVentureRound(
  input: VentureRawEvent[],
  plantIds: readonly VenturePlantId[],
  now: number,
): RoundReplay {
  const start = input.find(event => event.type === 'venture_round_start');
  if (!start) throw new ReplayError('round start missing');
  requireStrings(start, ['roundId', 'date', 'plant', 'mode', 'rulesVersion', 'timingVersion', 'rngVersion', 'harvestInteraction']);
  requireNumbers(start, ['day', 'roundSeed', 'startedAt', 'durationMs', 'endsAt', 'harvestDurationMs', 'moveDurationMs']);
  const sp = start.payload!;
  if (sp.v !== VENTURE_FORMAT || sp.mode !== VENTURE_MODE || !plantIds.includes(sp.plant as VenturePlantId)
    || sp.rulesVersion !== VENTURE_RULES_VERSION || sp.timingVersion !== VENTURE_TIMING_VERSION
    || sp.rngVersion !== VENTURE_RNG_VERSION || sp.harvestInteraction !== VENTURE_HARVEST_INTERACTION
    || sp.travelCondition !== VENTURE_TRAVEL_CONDITION || (sp.roundSeed as number) < 0
    || (sp.roundSeed as number) > 0xffffffff || !Number.isInteger(sp.roundSeed)
    || (sp.startedAt as number) < 0 || (sp.durationMs as number) <= 0
    || sp.endsAt !== (sp.startedAt as number) + (sp.durationMs as number)
    || (sp.harvestDurationMs as number) <= 0 || (sp.moveDurationMs as number) <= 0) {
    throw new ReplayError('invalid round start');
  }
  const round: RoundInfo = { id: sp.roundId as string, date: sp.date as string, day: sp.day as number,
    plant: sp.plant as VenturePlantId, roundSeed: sp.roundSeed as number, startedAt: sp.startedAt as number,
    durationMs: sp.durationMs as number, endsAt: sp.endsAt as number,
    harvestDurationMs: sp.harvestDurationMs as number, moveDurationMs: sp.moveDurationMs as number,
    harvestInteraction: VENTURE_HARVEST_INTERACTION };
  const own = input.filter(event => event.payload?.roundId === round.id && event.payload?.v === VENTURE_FORMAT);
  const occurrences: OccurrenceReplay[] = [];
  const backgroundIntervals: BackgroundIntervalReplay[] = [];
  let decision: DecisionReplay | null = null;
  let pendingAction: ActionReplay | null = null;
  let end: VentureRawEvent | null = null;
  let resolution: RoundReplay['resolution'] = null;
  let roundYield = 0;
  let displayedHarvestCount = 0;
  let sawStart = false;
  let sawSelection = false;
  let expectedOccurrence: { index: number; travelId: string | null; revealedAt: number } | null =
    { index: 0, travelId: null, revealedAt: round.startedAt };
  const seen = new Map<string, VentureRawEvent>();

  try {
    for (const event of own) {
      const key = dedupeKey(event);
      const previous = seen.get(key);
      if (previous) {
        if (!samePayload(previous, event)) throw new ReplayError(`conflicting duplicate ${key}`);
        continue;
      }
      seen.set(key, event);
      sharedMatches(event, round);
      if (end) throw new ReplayError('activity after round end');
      const p = event.payload!;
      if (event.type === 'venture_selection') {
        requireNumbers(event, ['selectedAt', 'unlockedCount']);
        requireStrings(event, ['via']);
        if (sawSelection || sawStart || occurrences.length) throw new ReplayError('out-of-order selection');
        sawSelection = true;
        continue;
      }
      if (event.type === 'venture_round_start') {
        requireFields(event, ['travelCondition', 'timingProfile', 'durationOverrideMs', 'harvestDurationOverrideMs',
          'moveDurationOverrideMs', 'seedOverride', 'rewardConfig', 'leave_threshold']);
        if (event !== start || sawStart || occurrences.length || decision || pendingAction) {
          throw new ReplayError('duplicate start position');
        }
        const expectedDurationOverride = sp.durationMs === DEFAULT_ROUND_MS ? null : sp.durationMs;
        const expectedHarvestOverride = sp.harvestDurationMs === DEFAULT_HARVEST_MS ? null : sp.harvestDurationMs;
        const expectedMoveOverride = sp.moveDurationMs === DEFAULT_MOVE_MS ? null : sp.moveDurationMs;
        const hasOverride = expectedDurationOverride !== null || expectedHarvestOverride !== null
          || expectedMoveOverride !== null || sp.seedOverride !== null;
        if (sp.durationOverrideMs !== expectedDurationOverride || sp.harvestDurationOverrideMs !== expectedHarvestOverride
          || sp.moveDurationOverrideMs !== expectedMoveOverride
          || sp.seedOverride !== null && sp.seedOverride !== sp.roundSeed
          || sp.leave_threshold !== BACKGROUND_LEAVE_THRESHOLD_MS
          || JSON.stringify(sp.rewardConfig) !== JSON.stringify(REWARD_CONFIG)
          || sp.timingProfile !== (hasOverride ? 'explicit_test_override' : 'adaptation_default') || !sawSelection) {
          throw new ReplayError('round start override record differs');
        }
        sawStart = true;
        continue;
      }
      if (!sawStart) throw new ReplayError(`${event.type} before start`);
      if (event.type === 'venture_selection') throw new ReplayError('selection after start');
      if (event.type === 'venture_occurrence') {
        requireStrings(event, ['occurrenceId']);
        requireNumbers(event, ['occurrenceIndex', 'occurrenceChainSeed', 'visualSeed', 'revealedAt']);
        requireFields(event, ['arrivalTravelId']);
        if (!expectedOccurrence || decision || pendingAction || p.occurrenceIndex !== expectedOccurrence.index
          || p.occurrenceId !== makeOccurrenceId(round.id, expectedOccurrence.index)
          || p.arrivalTravelId !== expectedOccurrence.travelId || p.revealedAt !== expectedOccurrence.revealedAt
          || p.occurrenceChainSeed !== occurrenceChainSeed(round.roundSeed, expectedOccurrence.index)
          || p.visualSeed !== occurrenceVisualSeed(round.roundSeed, expectedOccurrence.index)) {
          throw new ReplayError('unexpected occurrence');
        }
        const occurrence: OccurrenceReplay = { id: p.occurrenceId as string, index: p.occurrenceIndex as number,
          chainSeed: p.occurrenceChainSeed as number, visualSeed: p.visualSeed as number,
          revealedAt: p.revealedAt as number, arrivalTravelId: p.arrivalTravelId as string | null,
          results: [], rngState: p.occurrenceChainSeed as number, rngTransitionCount: 0, lastObservedYield: null };
        if (occurrence.chainSeed < 0 || occurrence.chainSeed > 0xffffffff || occurrence.visualSeed < 0
          || occurrence.visualSeed > 0xffffffff) throw new ReplayError('occurrence seed outside uint32');
        occurrences.push(occurrence); expectedOccurrence = null;
        resolution = occurrence.arrivalTravelId ? 'move_arrival' : null;
        continue;
      }
      if (event.type === 'venture_background_interval') {
        requireStrings(event, ['intervalId', 'lifecycle', 'visibility', 'source']);
        requireNumbers(event, ['startedAt']);
        requireFields(event, ['endedAt', 'durationMs', 'openAtLastSession', 'ended']);
        const id = p.intervalId as string;
        const existing = backgroundIntervals.find(interval => interval.id === id);
        if (p.lifecycle === 'start') {
          if (existing || p.visibility !== 'hidden' || p.endedAt !== null || p.durationMs !== null
            || p.openAtLastSession !== false || p.ended !== false
            || (p.startedAt as number) < round.startedAt || (p.startedAt as number) > round.endsAt) {
            throw new ReplayError('invalid background start');
          }
          backgroundIntervals.push({ id, startedAt: p.startedAt as number, endedAt: null, durationMs: null,
            openAtLastSession: false, ended: false });
          continue;
        }
        if (p.lifecycle !== 'end' || !existing || existing.ended || p.startedAt !== existing.startedAt
          || p.ended !== true || !['visibility_revealed', 'pageshow', 'app_lifecycle', 'round_end'].includes(String(p.source))) {
          throw new ReplayError('invalid background end');
        }
        if (p.openAtLastSession === true) {
          if (p.endedAt !== null || p.durationMs !== null) throw new ReplayError('open background has an end');
          existing.endedAt = null; existing.durationMs = null; existing.openAtLastSession = true;
        } else {
          if (p.openAtLastSession !== false || numberValue(p.endedAt) === null
            || (p.endedAt as number) < existing.startedAt || p.durationMs !== (p.endedAt as number) - existing.startedAt) {
            throw new ReplayError('invalid background duration');
          }
          existing.endedAt = p.endedAt as number; existing.durationMs = p.durationMs as number;
        }
        existing.ended = true;
        continue;
      }
      const current = occurrences.at(-1);
      if (!current) throw new ReplayError(`${event.type} before occurrence`);
      if (event.type === 'venture_decision_prompt') {
        requireStrings(event, ['decisionId', 'occurrenceId']);
        requireNumbers(event, ['decisionIndex', 'occurrenceIndex', 'promptedAt', 'harvestDurationMs', 'moveDurationMs',
          'harvestsDisplayed']);
        requireFields(event, ['lastObservedYield']);
        if (decision || pendingAction || expectedOccurrence || p.occurrenceId !== current.id
          || p.occurrenceIndex !== current.index || p.decisionId !== makeDecisionId(round.id, countTypes(seen, 'decision') - 1)
          || p.decisionIndex !== countTypes(seen, 'decision') - 1 || (p.promptedAt as number) >= round.endsAt
          || p.promptedAt !== current.results.at(-1)?.payload?.rewardDisplayedAt
            && p.promptedAt !== current.revealedAt
          || p.harvestDurationMs !== round.harvestDurationMs || p.moveDurationMs !== round.moveDurationMs
          || p.harvestsDisplayed !== current.results.length || p.lastObservedYield !== current.lastObservedYield) {
          throw new ReplayError('invalid decision prompt');
        }
        decision = { id: p.decisionId as string, occurrenceId: current.id, occurrenceIndex: current.index,
          promptedAt: p.promptedAt as number, harvestDurationMs: p.harvestDurationMs as number,
          moveDurationMs: p.moveDurationMs as number, harvestsDisplayed: p.harvestsDisplayed as number,
          lastObservedYield: p.lastObservedYield as number | null };
        resolution = null;
        continue;
      }
      if (event.type === 'venture_action') {
        requireStrings(event, ['actionId', 'decisionId', 'requestedAction', 'chosenAction', 'via', 'fromPhase', 'toPhase',
          'travelCondition']);
        requireNumbers(event, ['actionIndex', 'choiceAt', 'decisionPromptAt', 'scheduledConditionMs', 'scheduledReadyAt',
          'scheduledPostChoiceWaitMs']);
        requireFields(event, ['requestAccepted']);
        if (!decision || pendingAction || expectedOccurrence || p.requestAccepted !== true
          || p.decisionId !== decision.id || p.actionId !== makeActionId(round.id, countTypes(seen, 'action') - 1)
          || p.actionIndex !== countTypes(seen, 'action') - 1
          || p.requestedAction !== p.chosenAction || (p.chosenAction !== 'harvest' && p.chosenAction !== 'move')
          || p.decisionPromptAt !== decision.promptedAt || p.choiceAt !== numberValue(p.choiceAt)
          || (p.choiceAt as number) < decision.promptedAt || (p.choiceAt as number) >= round.endsAt
          || p.fromPhase !== 'decision' || p.toPhase !== `${String(p.chosenAction)}_wait`
          || p.travelCondition !== VENTURE_TRAVEL_CONDITION) throw new ReplayError('invalid action');
        const duration = p.chosenAction === 'harvest' ? round.harvestDurationMs : round.moveDurationMs;
        const expectedReadyAt: number = p.chosenAction === 'harvest'
          ? harvestReadyAt(p.choiceAt as number, duration)
          : scheduledReadyAt(decision.promptedAt, p.choiceAt as number, duration);
        if (p.chosenAction === 'harvest' && p.harvestInteraction !== VENTURE_HARVEST_INTERACTION) {
          throw new ReplayError('invalid harvest interaction');
        }
        if (p.scheduledConditionMs !== duration || p.scheduledReadyAt !== expectedReadyAt
          || p.scheduledPostChoiceWaitMs !== (p.scheduledReadyAt as number) - (p.choiceAt as number)) {
          throw new ReplayError('invalid action timing');
        }
        const moving = p.chosenAction === 'move';
        let travelId: string | null = null, toId: string | null = null, toIndex: number | null = null;
        if (moving) {
          requireStrings(event, ['travelId', 'toOccurrenceId', 'leaveKind']);
          requireNumbers(event, ['toOccurrenceIndex', 'harvestsDisplayed']);
          requireFields(event, ['lastObservedYield', 'voluntaryLeave']);
          travelId = p.travelId as string; toIndex = p.toOccurrenceIndex as number; toId = p.toOccurrenceId as string;
          if (travelId !== makeTravelId(round.id, current.index + 1) || toIndex !== current.index + 1
            || toId !== makeOccurrenceId(round.id, current.index + 1) || p.voluntaryLeave !== true
            || p.harvestsDisplayed !== current.results.length || p.lastObservedYield !== current.lastObservedYield
            || p.leaveKind !== (current.results.length ? 'after_observed_harvest' : 'before_first_harvest')
            || (!current.results.length && p.lastObservedYield !== null)) throw new ReplayError('invalid voluntary move');
        }
        pendingAction = { id: p.actionId as string, travelId, decisionId: decision.id, chosenAction: p.chosenAction,
          via: p.via as string, choiceAt: p.choiceAt as number, decisionPromptAt: decision.promptedAt,
          fromOccurrenceId: current.id, fromOccurrenceIndex: current.index, toOccurrenceId: toId,
          toOccurrenceIndex: toIndex, scheduledConditionMs: duration, scheduledReadyAt: p.scheduledReadyAt as number,
          scheduledPostChoiceWaitMs: p.scheduledPostChoiceWaitMs as number,
          harvestsDisplayed: current.results.length, lastObservedYield: current.lastObservedYield,
          harvestInteraction: p.chosenAction === 'harvest' ? VENTURE_HARVEST_INTERACTION : null };
        decision = null; resolution = null;
        continue;
      }
      // A tapped harvest has no cancellation event: release, blur and reload preserve its absolute due time.
      if (event.type === 'venture_harvest_result') {
        requireStrings(event, ['actionId', 'decisionId', 'occurrenceId', 'harvestInteraction']);
        requireNumbers(event, ['occurrenceIndex', 'decisionPromptAt', 'choiceAt']);
        requireFields(event, ['restored', 'maturedBeforeRoundEnd', 'previousObservedYield', 'lastObservedYield']);
        if (!pendingAction || pendingAction.chosenAction !== 'harvest' || p.actionId !== pendingAction.id
          || p.decisionId !== pendingAction.decisionId || p.occurrenceId !== current.id
          || p.occurrenceIndex !== current.index || p.decisionPromptAt !== pendingAction.decisionPromptAt
          || p.choiceAt !== pendingAction.choiceAt || p.rewardDueAt !== decisionDue(pendingAction)
          || p.harvestInteraction !== VENTURE_HARVEST_INTERACTION
          || p.rewardReadyAt !== pendingAction.scheduledReadyAt || p.maturedBeforeRoundEnd !== true
          || (p.rewardReadyAt as number) > round.endsAt
          || (p.rewardDisplayedAt as number) < pendingAction.scheduledReadyAt
          || p.actualConditionDelayMs !== (p.rewardDisplayedAt as number) - pendingAction.decisionPromptAt
          || p.actualPostChoiceWaitMs !== (p.rewardDisplayedAt as number) - pendingAction.choiceAt
          || typeof p.restored !== 'boolean') throw new ReplayError('invalid harvest timing IDs');
        const sample = resultSample(event, current, roundYield);
        current.results.push(event); current.rngState = sample.rngStateAfter;
        current.rngTransitionCount += sample.rngDrawCount; current.lastObservedYield = sample.reward;
        roundYield += sample.reward; displayedHarvestCount++;
        pendingAction = null; resolution = 'harvest_result';
        continue;
      }
      if (event.type === 'venture_travel_end') {
        requireStrings(event, ['travelId', 'actionId', 'decisionId', 'fromOccurrenceId', 'toOccurrenceId',
          'travelCondition']);
        requireNumbers(event, ['fromOccurrenceIndex', 'toOccurrenceIndex', 'decisionPromptAt', 'travelStartedAt',
          'scheduledArrivalAt', 'finishedAt', 'scheduledConditionMs', 'actualConditionDelayMs',
          'actualPostChoiceWaitMs']);
        requireFields(event, ['arrivedAt', 'arrived', 'restored']);
        requireStrings(event, ['reason']);
        if (!pendingAction || pendingAction.chosenAction !== 'move' || p.actionId !== pendingAction.id
          || p.travelId !== pendingAction.travelId || p.decisionId !== pendingAction.decisionId
          || p.fromOccurrenceId !== current.id || p.fromOccurrenceIndex !== current.index
          || p.toOccurrenceId !== pendingAction.toOccurrenceId || p.toOccurrenceIndex !== pendingAction.toOccurrenceIndex
          || p.decisionPromptAt !== pendingAction.decisionPromptAt || p.travelStartedAt !== pendingAction.choiceAt
          || p.scheduledArrivalAt !== pendingAction.scheduledReadyAt || p.scheduledConditionMs !== round.moveDurationMs
          || p.travelCondition !== VENTURE_TRAVEL_CONDITION || typeof p.arrived !== 'boolean'
          || typeof p.restored !== 'boolean'
          || p.actualConditionDelayMs !== (p.finishedAt as number) - pendingAction.decisionPromptAt
          || p.actualPostChoiceWaitMs !== (p.finishedAt as number) - pendingAction.choiceAt) {
          throw new ReplayError('invalid travel end');
        }
        if (p.arrived) {
          if ((p.scheduledArrivalAt as number) > round.endsAt || p.arrivedAt !== p.finishedAt
            || (p.finishedAt as number) < pendingAction.scheduledReadyAt) throw new ReplayError('late arrival revealed');
          expectedOccurrence = { index: current.index + 1, travelId: pendingAction.travelId,
            revealedAt: p.finishedAt as number };
          resolution = 'move_arrival';
        } else {
          if (p.arrivedAt !== null) throw new ReplayError('unarrived travel has arrival');
          if (expectedOccurrence) throw new ReplayError('unexpected travel resolution');
          resolution = 'travel_not_arrived';
        }
        pendingAction = null;
        continue;
      }
      if (event.type === 'venture_round_end') {
        if (expectedOccurrence) throw new ReplayError('round ended before destination reveal');
        requireNumbers(event, ['startedAt', 'endsAt', 'endedAt', 'endRecordedAt', 'durationMs', 'displayedHarvestCount',
          'totalCollected', 'arrivedOccurrenceCount', 'backgroundDurationMs', 'backgroundIntervalCount', 'leave_threshold']);
        requireStrings(event, ['reason', 'endCategory', 'endContext', 'backgroundInvalidReason']);
        requireFields(event, ['pendingActionId', 'lastObservedYield', 'backgroundOpenAtEnd', 'backgroundInvalid']);
        const background = backgroundAnnotation(backgroundIntervals);
        if (p.startedAt !== round.startedAt || p.endsAt !== round.endsAt || p.durationMs !== round.durationMs
          || p.displayedHarvestCount !== displayedHarvestCount || p.totalCollected !== roundYield
          || p.arrivedOccurrenceCount !== occurrences.length || p.lastObservedYield !== current.lastObservedYield
          || !['time_expired', 'day_changed', 'invalid_state'].includes(String(p.reason))
          || p.endCategory !== (p.reason === 'time_expired' ? 'time_exhausted' : 'administrative')
          || p.reason === 'time_expired' && (p.endedAt !== round.endsAt || (p.endRecordedAt as number) < round.endsAt)
          || p.reason !== 'time_expired' && (p.endedAt as number) > round.endsAt
          || (p.endRecordedAt as number) < (p.endedAt as number)
          || p.backgroundDurationMs !== background.durationMs || p.backgroundIntervalCount !== backgroundIntervals.length
          || p.backgroundOpenAtEnd !== background.open || p.backgroundInvalid !== background.invalid
          || p.backgroundInvalidReason !== background.reason || p.leave_threshold !== BACKGROUND_LEAVE_THRESHOLD_MS
          || p.pendingActionId !== null && typeof p.pendingActionId !== 'string') {
          throw new ReplayError('round summary differs');
        }
        end = event;
        continue;
      }
      throw new ReplayError(`unknown v4 event ${event.type}`);
    }
    if (!sawSelection) throw new ReplayError('selection missing');
    if (!occurrences.length) throw new ReplayError('initial occurrence missing');
    if (!end && !decision && !pendingAction && !expectedOccurrence && now < round.endsAt) {
      throw new ReplayError('active round missing decision');
    }
  } catch (error) {
    return invalidReplay(round, occurrences, backgroundIntervals, decision, pendingAction, end, resolution, roundYield,
      displayedHarvestCount, (error as Error).message);
  }
  return { round, phase: end ? 'complete' : pendingAction ? `${pendingAction.chosenAction}_wait` : 'decision',
    occurrences, currentOccurrence: occurrences.at(-1)!, decision, pendingAction,
    decisionCount: countTypes(seen, 'decision'), actionCount: countTypes(seen, 'action'), roundYield,
    displayedHarvestCount, backgroundIntervals, backgroundDurationMs: backgroundAnnotation(backgroundIntervals).durationMs,
    backgroundOpen: backgroundAnnotation(backgroundIntervals).open, end, resolution, invalidReason: null };
}

function countTypes(seen: Map<string, VentureRawEvent>, kind: 'decision' | 'action'): number {
  return [...seen.keys()].filter(key => key.startsWith(`${kind}:`)).length;
}

function decisionDue(action: ActionReplay): number {
  return action.chosenAction === 'harvest'
    ? harvestReadyAt(action.choiceAt, action.scheduledConditionMs)
    : action.decisionPromptAt + action.scheduledConditionMs;
}

function invalidReplay(round: RoundInfo, occurrences: OccurrenceReplay[], backgroundIntervals: BackgroundIntervalReplay[],
  decision: DecisionReplay | null, pendingAction: ActionReplay | null, end: VentureRawEvent | null,
  resolution: RoundReplay['resolution'], roundYield: number, displayedHarvestCount: number, reason: string): RoundReplay {
  const current = occurrences.at(-1) ?? { id: makeOccurrenceId(round.id, 0), index: 0, chainSeed: 0, visualSeed: 0,
    revealedAt: round.startedAt, arrivalTravelId: null, results: [], rngState: 0, rngTransitionCount: 0,
    lastObservedYield: null };
  const background = backgroundAnnotation(backgroundIntervals);
  return { round, phase: end ? 'complete' : pendingAction ? `${pendingAction.chosenAction}_wait` : 'decision',
    occurrences, currentOccurrence: current, decision, pendingAction, decisionCount: 0, actionCount: 0,
    roundYield, displayedHarvestCount, backgroundIntervals, backgroundDurationMs: background.durationMs,
    backgroundOpen: background.open, end, resolution, invalidReason: reason };
}

export interface PlantHistory {
  visits: number;
  picked: boolean;
}

/** Cards are projections of history, never a second unlock/badge store. */
export function venturePlantHistory(events: VentureRawEvent[], plantIds: readonly VenturePlantId[]): Map<VenturePlantId, PlantHistory> {
  const result = new Map<VenturePlantId, PlantHistory>(plantIds.map(id => [id, { visits: 0, picked: false }]));
  const starts = new Set<string>();
  const startPlants = new Map<string, VenturePlantId>();
  for (const event of events) {
    const p = event.payload;
    if (!p || (p.v !== 2 && p.v !== 3 && p.v !== VENTURE_FORMAT) || !plantIds.includes(p.plant as VenturePlantId)) continue;
    const plant = p.plant as VenturePlantId;
    if (event.type === 'venture_round_start' && typeof p.roundId === 'string' && p.roundId
      && numberValue(p.startedAt) !== null) {
      const key = `${p.v}:${p.roundId}`;
      if (!starts.has(key)) { starts.add(key); startPlants.set(key, plant); result.get(plant)!.visits++; }
    }
    if ((p.v === 2 && event.type === 'venture_pick')
      || ((p.v === 3 || p.v === VENTURE_FORMAT) && event.type === 'venture_harvest_result')) {
      const hasRound = typeof p.roundId === 'string' && startPlants.get(`${p.v}:${p.roundId}`) === plant;
      const validResult = p.v === 2 || integerValue(p.reward) !== null && (p.reward as number) >= 0
        && (p.v === 3 || p.maturedBeforeRoundEnd === true);
      if (hasRound && validResult) result.get(plant)!.picked = true;
    }
  }
  return result;
}

export function unfinishedV2Starts(events: VentureRawEvent[]): VentureRawEvent[] {
  const ended = new Set(events.filter(event => event.type === 'venture_round_end' && event.payload?.v === 2)
    .map(event => event.payload?.roundId));
  const closed = new Set(events.filter(event => event.type === 'venture_legacy_close'
    && (event.payload?.v === 3 || event.payload?.v === VENTURE_FORMAT)).map(event => event.payload?.legacyRoundId));
  const seen = new Set<string>();
  return events.filter(event => {
    const p = event.payload;
    if (event.type !== 'venture_round_start' || p?.v !== 2 || typeof p.roundId !== 'string'
      || ended.has(p.roundId) || closed.has(p.roundId) || seen.has(p.roundId)) return false;
    seen.add(p.roundId); return true;
  });
}

export function completedLegacyDates(events: VentureRawEvent[]): Set<string> {
  const dates = new Set<string>();
  const starts = new Map<string, VentureRawEvent>();
  for (const event of events) if (event.type === 'venture_round_start' && (event.payload?.v === 2 || event.payload?.v === 3)
    && typeof event.payload.roundId === 'string') starts.set(`${event.payload.v}:${event.payload.roundId}`, event);
  for (const event of events) {
    const p = event.payload;
    if (event.type === 'venture_legacy_close' && (p?.v === 3 || p?.v === VENTURE_FORMAT)
      && typeof p.date === 'string') dates.add(p.date);
    // A retired v3 start is never replayed or converted; its date still cannot receive a second daily round.
    if (event.type === 'venture_round_start' && p?.v === 3 && typeof p.date === 'string') dates.add(p.date);
    if (event.type !== 'venture_round_end' || (p?.v !== 2 && p?.v !== 3)) continue;
    const start = starts.get(`${p.v}:${String(p.roundId)}`);
    if (typeof start?.payload?.date === 'string') dates.add(start.payload.date);
  }
  return dates;
}
