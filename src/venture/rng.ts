// Auditable v4 reward sampling. Species and decorative geometry never enter this algorithm.
// Beta(22,3) is a selected fallback (mean 0.88), not a parameter recovered from the paper.

export const VENTURE_RNG_VERSION = 'venture-normal-beta-rng-v2';
export const REWARD_CONFIG = Object.freeze({
  initialDistribution: 'normal',
  normalMean: 10,
  normalSd: 1,
  depletionDistribution: 'beta',
  betaAlpha: 22,
  betaShape2: 3,
  betaMean: 22 / 25,
  roundingRule: 'nearest_whole',
  negativeNormalRule: 'untruncated_no_reroll_clamp_negative_rounded_reward_to_zero',
  uniformTransform: 'uint32_plus_1_div_4294967297',
  normalTransform: 'box_muller_cosine',
  gammaTransform: 'marsaglia_tsang_2000',
  betaParameterStatus: 'chosen_fallback_not_recovered_from_paper',
});

export interface VentureRngSample {
  rngVersion: typeof VENTURE_RNG_VERSION;
  occurrenceChainSeed: number;
  drawIndex: number;
  rngDrawIndex: number;
  rngDrawCount: number;
  rngStateBefore: number;
  rngStateAfter: number;
  rngValue: number;
  uniformValues: number[];
  distribution: 'normal_mean_10_sd_1_rounded' | 'beta_22_3_multiplicative_rounded';
  initialStandardNormal: number | null;
  initialNormalValue: number | null;
  negativeNormalObserved: boolean;
  negativeRewardPrevented: boolean;
  gammaAlpha: number | null;
  gammaShape2: number | null;
  selectedFactor: number | null;
  previousObservedYield: number | null;
  reward: number;
}

/** FNV-1a over exact ASCII namespaces; occurrence chains are independent. */
export function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function occurrenceChainSeed(roundSeed: number, occurrenceIndex: number): number {
  return fnv1a(`${VENTURE_RNG_VERSION}|${roundSeed >>> 0}|${occurrenceIndex}`);
}

/** Decorative seeds retain their separate namespace and never consume a reward transition. */
export function occurrenceVisualSeed(roundSeed: number, occurrenceIndex: number): number {
  return fnv1a(`venture-consumer-visual-v1|${roundSeed >>> 0}|${occurrenceIndex}`);
}

export interface MulberryDraw {
  stateBefore: number;
  stateAfter: number;
  value: number;
  u: number;
}

/** One Mulberry32 transition. The open-interval transform avoids log(0) and endpoint -1/+1 outcomes. */
export function mulberry32Draw(stateBefore: number): MulberryDraw {
  const before = stateBefore >>> 0;
  const stateAfter = (before + 0x6D2B79F5) >>> 0;
  let t = stateAfter;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = (t ^ (t >>> 14)) >>> 0;
  return { stateBefore: before, stateAfter, value, u: (value + 1) / 4294967297 };
}

interface Sampler {
  state: number;
  values: number[];
}

function uniform(sampler: Sampler): number {
  const draw = mulberry32Draw(sampler.state);
  sampler.state = draw.stateAfter;
  sampler.values.push(draw.value);
  return draw.u;
}

/** Box–Muller cosine transform; exactly two uniforms are consumed. */
function standardNormal(sampler: Sampler): number {
  const u1 = uniform(sampler), u2 = uniform(sampler);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Marsaglia–Tsang gamma(shape, scale=1), including the shape<1 boost for independent unit testing. */
function gamma(shape: number, sampler: Sampler): number {
  if (!(shape > 0) || !Number.isFinite(shape)) throw new Error('gamma shape must be positive');
  if (shape < 1) return gamma(shape + 1, sampler) * Math.pow(uniform(sampler), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (let attempts = 0; attempts < 1_000_000; attempts++) {
    const x = standardNormal(sampler), base = 1 + c * x;
    if (base <= 0) continue;
    const v = base * base * base, u = uniform(sampler);
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
  throw new Error('gamma rejection sampler did not converge');
}

/** Lazily sample only when the result is actually displayed; no result is drawn on a tap or a prompt. */
export function sampleVentureReward(
  chainSeed: number,
  stateBefore: number,
  drawIndex: number,
  previousObservedYield: number | null,
): VentureRngSample {
  const sampler: Sampler = { state: stateBefore >>> 0, values: [] };
  const rngDrawIndex = 0; // Filled by the replay helper below; replay validation compares state, not a global counter.
  if (previousObservedYield === null) {
    const z = standardNormal(sampler), raw = REWARD_CONFIG.normalMean + REWARD_CONFIG.normalSd * z;
    const rounded = Math.round(raw), reward = Math.max(0, rounded);
    return {
      rngVersion: VENTURE_RNG_VERSION,
      occurrenceChainSeed: chainSeed >>> 0,
      drawIndex,
      rngDrawIndex,
      rngDrawCount: sampler.values.length,
      rngStateBefore: stateBefore >>> 0,
      rngStateAfter: sampler.state >>> 0,
      rngValue: sampler.values[0],
      uniformValues: [...sampler.values],
      distribution: 'normal_mean_10_sd_1_rounded',
      initialStandardNormal: z,
      initialNormalValue: raw,
      negativeNormalObserved: raw < 0,
      negativeRewardPrevented: rounded < 0,
      gammaAlpha: null,
      gammaShape2: null,
      selectedFactor: null,
      previousObservedYield,
      reward,
    };
  }
  const shape1 = gamma(REWARD_CONFIG.betaAlpha, sampler), shape2 = gamma(REWARD_CONFIG.betaShape2, sampler);
  const factor = shape1 / (shape1 + shape2);
  const reward = Math.max(0, Math.round(previousObservedYield * factor));
  return {
    rngVersion: VENTURE_RNG_VERSION,
    occurrenceChainSeed: chainSeed >>> 0,
    drawIndex,
    rngDrawIndex,
    rngDrawCount: sampler.values.length,
    rngStateBefore: stateBefore >>> 0,
    rngStateAfter: sampler.state >>> 0,
    rngValue: sampler.values[0],
    uniformValues: [...sampler.values],
    distribution: 'beta_22_3_multiplicative_rounded',
    initialStandardNormal: null,
    initialNormalValue: null,
    negativeNormalObserved: false,
    negativeRewardPrevented: false,
    gammaAlpha: shape1,
    gammaShape2: shape2,
    selectedFactor: factor,
    previousObservedYield,
    reward,
  };
}

/** Independent replay helper: no storage or UI side effects, including when a zero reward repeats. */
export function replayVentureRewards(chainSeed: number, count: number): VentureRngSample[] {
  const samples: VentureRngSample[] = [];
  let state = chainSeed >>> 0, previous: number | null = null, transitions = 0;
  for (let drawIndex = 0; drawIndex < count; drawIndex++) {
    const sample = sampleVentureReward(chainSeed, state, drawIndex, previous);
    sample.rngDrawIndex = transitions;
    transitions += sample.rngDrawCount;
    samples.push(sample);
    state = sample.rngStateAfter;
    previous = sample.reward;
  }
  return samples;
}
