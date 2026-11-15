# Venture redesign implementation plan

**Status:** reviewed/approved planning contract for a fresh implementation agent; implementation is not complete  
**Date:** 2026-11-14; revised 2026-11-15  
**Scope:** consumer Venture only; no implementation is included in this planning change

## 0. Decision and implementation contract

Build an explicitly **foraging-inspired, protocol-informed consumer adaptation**, not a clinical task and not a strict replication. Keep one round per demo-calendar day, the unlocked plant-card collection, the attractive static plant models, and the current daily completion mark. Replace finite per-fruit tapping with a repeated two-choice loop:

> **Harvest** and observe a stochastic multi-produce reward, or **Move** to a fresh occurrence after a visible time cost.

Use these normative defaults throughout implementation:

| Setting | Consumer default |
|---|---|
| Round | **180,000 ms (3:00)**, one per local/demo day |
| Actions | **Harvest · 2 s** / **Move to fresh plant · 3 s** buttons |
| Timing | **2,000 ms harvest and 3,000 ms move windows, including time since the decision prompt**; never pause the round clock |
| Travel conditions | One clearly labelled **consumer fixed 3 s** condition; no blocks or counterbalancing |
| Rewards | New, separately versioned stochastic consumer algorithm defined below; integer multi-produce rewards |
| Display | Show the last observed reward and current round total; **never show or imply an exact next reward** |
| Capacity | No economic fruit/target cap and **no forced Move**; Harvest remains available even at zero reward |
| Incentive | Game produce only; no money, cash-equivalent claim, grade, diagnosis, or health output |
| Persistence | Append-only raw **v3** events, deterministic absolute-time recovery, v2 retained read-only |
| Mode label | `consumer_foraging_v1`, `consumer_timing_v1`, `venture-consumer-rng-v1` |

The paper supports design inspiration, not equivalence. Its protocol uses repeated Harvest/Stay versus Move/Leave to a fresh tree (printed p. 6; Fig. 1B, p. 2), initial normal mean 10/SD 1 and beta-distributed multiplicative decay averaging 12% (p. 6), a 2 s harvest delay and RT-inclusive harvest/travel timing (p. 6), clearly signalled 3 s/10 s travel in four alternating, counterbalanced 7-minute blocks after training (p. 6; Fig. 1B, p. 2), and a $0.01/apple incentive (pp. 2, 6). Our shorter daily round, one travel condition, plant selection, stochastic approximation, lack of cash incentive, and lack of training are deliberate consumer adaptations.

The paper's three-minute result came from increasing initial portions of the **first long-travel block**, not from a standalone daily three-minute consumer protocol (Fig. 2E and caption, printed p. 4). It describes displaying the number returned after each harvest (p. 6), not an exact next-reward forecast. Do not advertise this redesign as a validated three-minute assessment. The supplied seven-page article does not include the supplement or original task software needed to establish beta shapes and exact recurrence/action details (supplement link p. 1; software availability ref. 44, p. 6). See `docs/venture-foraging-review.md` for the direct audit.

Current v2 instead gives instant deterministic rewards `max(1, round(12 × .88^harvestIndex))` (starting 12, 11, 9…), previews the exact next yield, uses 8–9 finite targets and 700 ms same-species walks. Clearing targets economically forces another walk. This redesign removes those mechanics rather than merely renaming them. Keep **180 s** because it fits the existing one-daily-round product and is short enough for a calm daily interaction; that convenience does not adopt the paper's three-minute analysis as a validated procedure. Replace 700 ms with **3 s** so Move has a perceptible opportunity cost alongside 2 s Harvest. The single fixed 3 s move is a consumer simplification using the short-condition magnitude, not a paper-aligned travel protocol.

## 1. Product goals, non-goals, and claims boundary

### Goals

1. Make Stay/Leave a real repeated decision rather than an unavoidable response to empty targets.
2. Make time, rather than tapping speed or target acquisition, the main action cost.
3. Preserve outcome uncertainty until each harvest is revealed.
4. Offer a calm, legible, accessible three-minute daily interaction with beautiful plants and few controls.
5. Preserve enough raw, replayable observations to audit what the software did.
6. Preserve the separately implemented unlocked-only plant cards, harvest-visit counts, and first-actual-pick sparkle semantics.

### Non-goals

- No depression, anhedonia, severity, treatment-response, reference-point, “drift,” wellbeing, or monitoring inference from current or future consumer play.
- No individual threshold, leaving-point score, percentile, risk label, longitudinal trend, or comparison with study participants.
- No claim of protocol equivalence, clinical validity, biomarker status, or therapeutic benefit.
- No four-block research session, cash payout, research training protocol, or hidden diagnostic mode.
- No motor-speed, reaction-time, tap-accuracy, or produce-clearing performance objective.

### Claims boundary and demo presentation

Garden is a **hackathon demo**: prefer less text and show features through the interaction, visual states, and controls rather than explanatory or policy paragraphs. Keep the claims boundary in this plan, the direct paper audit, and the reviewer acceptance contract; do **not** add a visible health-assessment disclaimer or other policy copy. Visible Venture copy must remain terse, neutral, and nonclinical; do not use clinical or diagnostic language in Venture UI, event fields, analytics, completion copy, or plant appearance. Raw `lastObservedYield` is only the last reward rendered by the app; it must not be renamed or interpreted as a psychological reference point.

Any future strict research mode is a separate project requiring the supplement/original software, verified parameters and sequencing, study governance and informed consent, training, counterbalancing, four 7-minute blocks, explicit 3/10 s conditions, and the intended incentive context. Do not add a dormant `research` flag or imply that switching constants would create a validated mode.

## 2. Target player loop and presentation

### 2.1 Plant list and start

1. On an unplayed day, show **“Choose a plant for today”**, the unlocked-only vertical cards, and **3:00**. There is no preview model and no automatic plant selection.
2. Below the list/setup text, keep only the compact essential explanation: **“Harvest 2 s · Move 3 s, including decision time · One 3-minute round today.”** Do not repeat it on each decision screen or add a longer introduction.
3. Activating a card starts one round immediately. Log selection and start once, reveal occurrence 0 of that species, and focus the heading/status rather than unexpectedly moving focus to the canvas.
4. All unlocked cards remain enabled before selection. After start/completion, hide the list as the current round UI does; no second species or second round that day.

No tutorial or research-training flow is part of this implementation. If a later product increment adds one, it must be a **simple, separate interactive tutorial** that demonstrates the same controls, rather than tutorial text embedded in each decision screen; it must not silently change this contract's timing, RNG, or daily-round mechanics.

### 2.2 Ready for a decision

Keep the current species-specific static three-quarter camera and full-plant framing. The canvas remains decorative (`aria-hidden`); there are no fruit hit targets, drag/rotation controls, or required pointer gestures. Show:

- species and occurrence label, e.g. **“Apple · Fresh plant 2”**;
- **3:00** countdown and **Collected 0** (abstract produce, not apples or money);
- before the first harvest, **“Harvest here, or Move to a fresh plant.”**;
- after a result, **“Last harvest +7 · Collected 43”**;
- two large controls: primary **“Harvest · 2 s”** and secondary **“Move to fresh plant · 3 s”**. On narrow screens use a shorter visible secondary label **“Move · 3 s”**, retaining the full accessible name.

Both actions are always available at a decision, including at occurrence 0 and after a zero reward. Keyboard activation uses native Enter/Space on focused buttons. Also support unmodified **H** and **M** while Venture is active, advertise them with `aria-keyshortcuts`, and ignore shortcuts with modifiers or while another editable control has focus. Minimum target size is 44×44 CSS px with visible focus and adequate contrast.

### 2.3 Harvest and Move feedback

On an accepted choice, synchronously lock both controls before any asynchronous work. Repeated pointer/keyboard input during the wait is ignored and not logged.

- **Harvest wait:** show **“Harvesting…”**, a determinate visual countdown/progress treatment, and `aria-busy="true"` on the round status region. At maturity reveal **“+N”**, update Last harvest and Collected, briefly highlight a fruit/cluster or basket, then immediately offer the next Harvest/Move decision. There is no auto-repeat.
- **Move wait:** show **“Moving to a fresh Apple… · about 2 s left”** (seconds may round up), dim the outgoing plant, and disable both actions. On arrival reveal a fresh static model and announce **“Arrived at a fresh Apple. Harvest or Move.”**
- The numeric round timer never pauses for animation, a hidden tab, reload, offline state, or indecision. A delayed browser callback is recorded as an actual late display, not silently compensated.
- A polite live region announces only start, each reward once, arrival once, and completion. Do not announce countdown ticks or floating animation text repeatedly.

Reduced motion removes travel fades, sparkling motion, fruit/basket movement and animated progress interpolation; it **does not shorten the logical 2 s/3 s windows**. Use static status text and an instantly updated progress value instead. Plants remain fully visible and attractive at rest.

### 2.4 Finite targets, visual depletion, and voluntary leaving

Remove `remainingTargets`, `nextYield`, and `leavingValue` from v3 gameplay and display. Existing 8–9 fruit meshes become **decorative clusters, not inventory**. They are not permanently removed as economic actions occur; a short highlight/fade can supply harvest feedback, then the resting composition returns. Do not show “N left here,” an empty-plant state, a depletion percentage, or a forecast bar.

This deliberately eliminates visible-produce exhaustion as a mechanic. A player may stay for any number of harvests, including after rewards reach zero, and may Move whenever ready. **Every player-selected Move is voluntary; there is no forced-leave event in v3.** Do not manufacture a visual exhaustion leave category. The model's stable composition is a consumer visual simplification, not a paper protocol feature.

At 3:00, end the round regardless of plant/reward state. Show **“Round complete · N collected. Your daily mark is set.”** No performance adjective, grade, leaving-point summary, or clinical interpretation. Zero-action and zero-reward completions are valid.

## 3. Exact timing state machine

Use phases `selection`, `decision`, `harvest_wait`, `move_wait`, and `complete`. `decisionId`, `actionId`, occurrence IDs and logical deadlines are deterministic and persisted through events.

### Decision windows include deliberation

For a decision prompted at `P`:

- nominal Harvest due time is `P + 2000`;
- nominal Move arrival due time is `P + 3000`;
- when the accepted choice occurs at `C`, set `scheduledReadyAt = max(P + actionDuration, C)`;
- thus a choice inside the window has only the remaining post-choice wait, while a choice after the window settles in the same reconciliation tick;
- record both scheduled condition duration and actual prompt-to-ready and choice-to-ready durations.

This is the consumer interpretation of RT-inclusive timing, not a claim to reproduce undisclosed original software behavior. The label “2 s”/“3 s” refers to the window beginning at the enabled decision prompt, which the inline instructions explain.

### State transitions

1. **Start/arrival/reward display → decision:** create one decision prompt with absolute `promptedAt`; enable both buttons.
2. **Decision → harvest_wait:** one accepted Harvest creates one action. Move is disabled. No reward is drawn or revealed at button press.
3. **Harvest_wait → decision:** at due time, draw/reveal exactly one reward and total it once. If the round still has time, create the next decision; otherwise complete.
4. **Decision → move_wait:** one accepted Move logs the current voluntary leave and travel start. Harvest is disabled.
5. **Move_wait → decision:** at due time, log arrival once, create the next same-species occurrence, then its first decision. A Move before any harvest has no numeric leaving point.
6. **Any active phase → complete:** absolute `round.endsAt` is authoritative. Do not auto-Harvest or auto-Move during inactivity or while catching up.

### Expiry ordering

Use deterministic ordering when a sleeping/background tab resumes:

- Settle a pending result/arrival only if its `scheduledReadyAt <= round.endsAt`, even if actual reconciliation is later; record `maturedBeforeRoundEnd: true` and the actual late display/arrival timestamps. Then complete without creating another decision if time has expired.
- If `scheduledReadyAt > round.endsAt`, do not draw/pay a pending Harvest and do not reveal a pending destination. Record travel as not arrived or the round end context as `harvest_wait` as appropriate.
- A decision with no accepted action simply expires. Inputs at or after `endsAt` are rejected.
- `round_end` contains logical `endedAt` and actual `endRecordedAt`; expiry UI shows 0:00. Daily completion is set once after recovery as well as during live play.

There are no session blocks, pauses, timer compensation offsets, catch-up rewards, catch-up moves, or automatic decisions. Absolute wall-clock timestamps are used because reload/background recovery must produce the same timeline.

## 4. Consumer reward algorithm: `venture-consumer-rng-v1`

This is **our design**, not the paper's missing beta algorithm. It is intentionally simple, bounded, non-increasing and testable.

### Distributions and recurrence

At each realized harvest, draw exactly one value from that occurrence's independent deterministic PRNG chain:

- **First harvest:** `r0 = 8 + floor(5 * u)`, where `u ∈ [0,1)`. Thus each integer **8, 9, 10, 11, 12** is intended equally likely. This discrete uniform has mean 10 and population SD √2; it is not the paper's normal SD 1.
- **Later harvests:** with `FACTORS = [0.80, 0.84, 0.88, 0.92, 0.96]`, use `factor = FACTORS[floor(5 * u)]`. Its arithmetic mean is 0.88, but this five-point distribution is not a beta distribution and not a recovered paper parameter.
- Compute `rounded = Math.round(previousReward * factor)` and then:
  - if `previousReward === 0`, `nextReward = 0`;
  - otherwise `nextReward = Math.min(previousReward - 1, Math.max(0, rounded))`.

The final clamp makes every positive reward decrease by at least one and eventually reach zero. It is a consumer recurrence choice, not a claim about paper rounding/truncation. There is no floor of one and no negative/fractional reward. Zero is a valid displayed reward and does not force Move.

### Deterministic PRNG

Generate one unsigned 32-bit `roundSeed` with `crypto.getRandomValues` at round start and log it. In test mode allow a logged seed override. Do not use `Math.random`. Derive each occurrence's chain independently from the ASCII string `venture-consumer-rng-v1|${roundSeed}|${occurrenceIndex}` using FNV-1a 32-bit (`h = 2166136261`; for each character code, `h = Math.imul(h ^ code, 16777619) >>> 0`). Visual model seeds remain a separate deterministic namespace and never consume reward draws.

Use Mulberry32 with state held as `uint32`:

```text
stateAfter = (stateBefore + 0x6D2B79F5) >>> 0
t = stateAfter
t = Math.imul(t ^ (t >>> 15), t | 1)
t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
value = (t ^ (t >>> 14)) >>> 0
u = value / 4294967296
```

Advance once per **displayed** harvest result: first draw selects the initial integer; each subsequent draw selects a decay factor. Do not draw on occurrence reveal, decision prompt, button press, rejected spam, reload, or an action that expires before maturity. This lazy rule means pending rewards are not exposed in advance even in the raw action event. The complete before/after state is recoverable from the logged previous result and occurrence chain seed.

Log `rngVersion`, chain seed, draw index (`0` for the first reward, incrementing by one per displayed result), `rngStateBefore`, `rngStateAfter`, raw `rngValue`, distribution name, selected factor when applicable, previous reward (`null` on the first), and observed reward on each result. Sample state must never advance twice during restore. “Last observed reward” is updated only by `venture_harvest_result`, never by scheduling a Harvest.

### Required algorithm tests

- Checked-in independent golden vectors for at least two fixed round seeds, multiple harvests, and occurrence 1; do not generate expected values by calling the function under test.
- Same logged seed and realized action sequence yields exactly the same rewards after fresh replay/reload; occurrence chains and visual seeds cannot affect one another.
- First rewards are integers in 8…12; all five outcomes occur across a broad deterministic smoke sample. Do not test against normal/beta clinical distributions.
- Later rewards use exactly one listed factor, remain integers, satisfy `0 <= next < previous` for positive previous, and remain zero after zero.
- Prompts, clicks, Move, duplicate settlement, rejected input and pre-maturity expiry consume no RNG draw. One displayed result consumes exactly one.
- Round total equals the sum of displayed results only. Tests establish software/design properties, never clinical equivalence.

## 5. Event schema v3 and recovery

### 5.1 Shared rules

Retain the global event envelope `{t, d, type, payload}` and append-only `garden.log`. Every Venture v3 payload contains `v: 3`, `mode: "consumer_foraging_v1"`, `date`, `day`, `roundId`, and `plant`. Use `venture-v3:${date}:${startedAtBase36}:${roundSeedBase36}` for new consumer `roundId` values. `venture_legacy_close` instead preserves the old ID in both `roundId` and `legacyRoundId`; it never allocates a v3 round. Every event also carries relevant `rulesVersion`, `timingVersion`, `travelCondition: "consumer_move_3s_v1"` (round start may define it, but repeat it on action/travel events) and deterministic IDs.

There is one consumer round/session and no blocks: **emit `roundId` only; do not invent `blockId` or `sessionId`**. A future research design must define those separately. All timestamps are epoch milliseconds; `null` is explicit for a missing observed reward. Species labels are catalogue IDs, not free text.

Use these event types and required fields:

| Event | Required observation fields in addition to shared fields |
|---|---|
| `venture_selection` | `selectedAt`, `via`, `unlockedCount` |
| `venture_round_start` | `roundSeed`, `startedAt`, `durationMs` (`180000` in production), `endsAt`; timing profile (record actual test overrides as such) and algorithm versions |
| `venture_occurrence` | `occurrenceId`, `occurrenceIndex`, `occurrenceChainSeed`, separate `visualSeed`, `revealedAt`, `arrivalTravelId` (`null` for occurrence 0) |
| `venture_decision_prompt` | `decisionId`, `occurrenceId/index`, `promptedAt`, `harvestDurationMs`, `moveDurationMs`, `harvestsDisplayed`, `lastObservedYield` |
| `venture_action` | `actionId`, `decisionId`, `requestedAction`, `chosenAction` (`harvest`/`move`), `requestAccepted: true`, `via`, `choiceAt`, `decisionPromptAt`, `fromPhase`, `toPhase`, `scheduledConditionMs`, `scheduledReadyAt`, `scheduledPostChoiceWaitMs` |
| `venture_harvest_result` | all timing IDs plus `rewardDueAt`, `rewardReadyAt`, `rewardDisplayedAt`, `actualConditionDelayMs`, `actualPostChoiceWaitMs`, `restored`, `maturedBeforeRoundEnd`; `harvestIndex`, `previousObservedYield`, `reward`, `lastObservedYield`, `roundYield`; complete RNG sample fields from §4 |
| `venture_travel_end` | `travelId/actionId`, from/to occurrence IDs and indices, `decisionPromptAt`, `travelStartedAt` (choice), `scheduledArrivalAt`, `finishedAt`, `arrivedAt` or `null`, `arrived`, `reason`, scheduled/actual condition and post-choice durations, `restored` |
| `venture_round_end` | `startedAt`, `endsAt`, logical `endedAt`, `endRecordedAt`, `durationMs`, `reason: time_expired/day_changed/invalid_state`, `endCategory: time_exhausted/administrative`, `endContext`, `pendingActionId` or `null`, displayed harvest count, `totalCollected`, arrived occurrence count, current `lastObservedYield` |
| `venture_legacy_close` | one-time migration record only; `legacyVersion`, `legacyRoundId`, original start/end, `closedAt`, `reason: schema_migration/time_expired`; never a v3 trial/action |

For a `venture_action` choosing Move, additionally log `travelId`, destination ID/index, occurrence `harvestsDisplayed`, `lastObservedYield`, `voluntaryLeave: true`, and `leaveKind: "before_first_harvest"` when no result has been displayed or `"after_observed_harvest"` otherwise. If before-first-harvest, `lastObservedYield` must be `null`, not zero. The paper's leaving point is the **last displayed/observed reward before Leave**, not a next-reward or normalized forecast (Fig. 2A–B, printed p. 4). Zero after an observed harvest remains a real numeric zero.

Do not create a Move event for expiry, day change, reload, migration, missing data, or completion with a pending action. Those are administrative/time-exhausted endings, not voluntary leaves. There are no economic forced leaves in v3. Legacy v2 Moves with `remainingTargets === 0` are forced and must never be relabelled voluntary.

`requestedAction` records the accepted user request; `chosenAction` records the canonical state-machine action and should equal it. Ignore and do not log invalid, repeated or late requests, so the log cannot be flooded by spam. The production three-minute timing bounds each round to fewer than 300 v3 events with the transitions above; add a regression assertion for this bound rather than truncating/pruning history. Never log free text, mood, notes, health fields, user identifiers, monetary value, diagnoses or interpretations. Total collected is a raw game tally, not a wellness score.

### 5.2 Absolute reload/restoration

Rebuild solely from raw events at mount/visibility reconciliation:

- Deduplicate by deterministic `roundId`, `decisionId`, `actionId`, `travelId`, `occurrenceId` plus result type. Never append a second start, result, arrival or end for the same ID.
- Restore `decision` from its original `promptedAt`; do not restart its action windows on reload.
- During `harvest_wait`/`move_wait`, restore the pending action and original `scheduledReadyAt`. Before maturity, show the remaining delay; at/after maturity, settle exactly once using §3 expiry ordering.
- Recompute occurrence RNG state from its chain seed and displayed result sequence. A pending harvest has no draw until displayed; reload cannot reroll it.
- If the destination did not arrive before expiry, do not create its occurrence. If it did arrive, create/log it once even when recovery is late, then end without inventing additional choices.
- Preserve absolute `startedAt`/`endsAt`; reconcile late actual timestamps honestly. No timer compensation and no pause duration subtraction.

### 5.3 v2 and older legacy compatibility

Never edit, delete, backfill or synthesize paper-compatible fields on existing events.

- Completed v2 rounds remain historical and preserve the daily lock. Their `venture_pick` values remain v2 observations; never compare them numerically with v3 rewards.
- On first v3 load, an unfinished v2 round is closed once with `venture_legacy_close`. If already past its `endsAt`, use reason `time_expired`; otherwise use `schema_migration`. Mark that date complete and do not offer a replacement v3 round that day. Copy only the historical total for a calm completion message if desired; do not resume v2 under v3 rules.
- v2 card history is preserved as specified below. v2 events have no v3 RNG/timing fields added.
- Pre-v2/unversioned or unknown Venture payloads remain untouched and are not used to reconstruct or lock a v3 round, matching the current corrected-v2 migration boundary. Do not write a converter for unknown legacy shapes.
- With no current-day v3 start and no other v3 activity, show selection rather than crash. If an expected start is missing/corrupt but other v3 activity exists, do not offer a replacement round. A malformed active sequence with a recoverable `roundId` must fail closed to one `venture_round_end` with `reason: "invalid_state"` and `endCategory: "administrative"`; preserve raw history and never guess rewards. Add fixtures for missing, duplicate and out-of-order events rather than silently resetting storage.

## 6. Exact daily unlock and plant-card semantics

Preserve the current selection product intent and adapt only the event predicates needed for v3.

1. Unlock count is `min(daysSinceFirstOpen() + 1, 8)`. One species is added per elapsed local/demo day in this exact order: **apple, orange, pear, cherry, tomato, strawberry, blueberry, eggplant**. Day 1 shows only Apple; day 2 adds Orange; day 8 has all eight. Later days retain all eight and the daily catalogue cycle repeats; no locked cards, placeholders or disabled locked species are rendered.
2. Before a round, every unlocked card is enabled and keyboard selectable. Choosing any unlocked species starts the day's only round. Skip day continues to use the existing demo calendar; it does not rewrite history.
3. Card text remains **“Harvested N time/times”**, where N is the number of distinct started **round visits** for that species across v2 and v3—not fruit count, successful harvest count, or days elapsed. Count unique valid `venture_round_start.roundId` per species, including a zero-action start and the administratively closed v2 start. Duplicate recovery logs cannot add a visit.
4. A species is new/sparkling until its **first actual pick**. For v2, an actual pick is any historical `venture_pick` for that species. For v3, it is the first displayed `venture_harvest_result`; the initial result is necessarily positive. Merely selecting a card, starting a round, pressing Harvest, waiting, reloading, expiring, or moving does not remove it. Remove the badge and sparkle when the first v3 result is displayed, and keep them removed after reload and on every later day.
5. While new on its actual unlock day, badge text is **“New today”**. While still new on later days, it is **“New”**. “New” has priority over unlock-day highlighting only as described; there is no separate consumed-on-selection state. A selected zero-result round therefore leaves the species new on following days.
6. Sparkle is supplementary: the text badge and accessible label must also convey newness. Reduced motion makes the sparkle static. Accessible names retain the species, **“Harvested N times”**, new/no-produce-picked-yet status when applicable, and **“Start today's daily harvest round.”**
7. Cards derive from the append-only log, not a second mutable unlock/sparkle store. `state.venturedOn` remains only the daily completion mirror; the dated v3 end/legacy-close events are authoritative for recovery.

## 7. Implementation sequence, ownership, and verification

Keep the existing plant geometry/cameras intact. Do not overwrite the separate selection-card work; reuse its card markup/styles and change only shared predicates/contracts intentionally.

### Milestone 1 — pure rules and RNG, no live behavior switch

**Ownership:** new `src/venture/rules.ts` for timing/types/transitions and `src/venture/rng.ts` for the exact §4 algorithm; focused checks in `scripts/check-venture.mjs` or a dependency-free browser test module imported only by that check. Avoid new packages and shared `state.ts` changes.

- Implement constants, FNV-1a/Mulberry32, reward recurrence, due-time calculation and deterministic IDs with `now` injected.
- Add golden vectors, boundary tests (choice exactly at due/end, late choice, zero reward), and tests that indecision/spam/expiry do not draw.
- Keep production UI on v2 until the pure rules are accepted. Deployable checkpoint: build and all existing app checks pass unchanged.

### Milestone 2 — v3 engine, two-button loop, recovery and migration

**Ownership:** `src/venture/index.ts`, new `src/venture/events.ts` if useful for schema/replay/migration, and `scripts/check-venture.mjs`. `src/state.ts` continues to supply generic append/read/save only; keep other panes unaware of v3.

- Replace picking/travel internals with the §3 state machine and §5 events; use production 180 s/2 s/3 s defaults.
- Add test-only, logged timing and seed profiles selected at round start. Production reads must remain exactly 180000/2000/3000; tests also assert these before using short durations.
- Implement v2 close/history, v3 card first-result semantics, absolute restoration in every phase, duplicate prevention and expiry ordering.
- Replace target-count tests with readiness/action/reward/voluntary-leave tests. Test keyboard H/M and native button activation, ignored auto-repeat, Move before first harvest, zero reward with Harvest still enabled, and no next forecast in DOM/debug state.
- Deployable checkpoint: production build plus full Venture and integrated checks; no other implementation geometry changes required.

### Milestone 3 — presentation, accessibility, offline and documentation

**Ownership:** `src/venture/venture.css`, minimal `index.ts` feedback rendering, `src/venture/plants/README.md` (decorative cluster semantics), `docs/product-manifest.md` and `docs/venture-foraging-review.md` current-adaptation comparison. Preserve all paper facts and limitations in the audit. Do not change Home, Reflect, Toolkit or Wind down code for this redesign.

- Add polished static/wait/result/completion states, reduced-motion styling and responsive two-button layouts.
- Run `npm run build` and `npm run check`; run the deployed PWA check for offline/install behavior. Confirm no foreign network requests are introduced.
- Offline acceptance: after one successful online precache, load Venture offline, start/continue a round, reload during Harvest and Move, restore without reroll/duplication, and finish locally. Use the existing offline/service-worker test path on the deployed origin where the runner enables PWA checks.
- Confirm no regressions through existing Home watering, Reflect composer/cards/camera/replies, Toolkit plan/Skip day/reset, and Wind down single-sound playback/timer checks. Do not relax unrelated assertions to make this feature pass.

### Screenshots required for review

Capture at 390×844, with an additional desktop review at 1280×800 and compact review at 320×568 where noted:

1. `venture-v3-selection-day1.png`: Apple only, timing instructions, New today.
2. `venture-v3-selection-day2.png`: Apple `Harvested 1 time`; Orange New today and sparkling.
3. `venture-v3-selection-persisted-new.png`: a zero-action selected species still New next day; first-harvested species not new.
4. `venture-v3-decision.png` and `venture-v3-result.png`: static attractive plant, Last harvest/Collected, both actions, no remaining-target or next-yield UI.
5. `venture-v3-harvest-wait.png` and `venture-v3-move-wait.png`: unambiguous locked state and remaining delay.
6. `venture-v3-zero-stay.png`: observed zero with both Harvest and Move available.
7. `venture-v3-complete.png`: calm daily completion without grade/health output.
8. `venture-v3-all-unlocked-320.png` and `venture-v3-reduced-motion.png`: vertical overflow-free cards/static sparkle and reduced-motion round feedback.

Browser assertions should accompany screenshots; reviewer approval is visual as well as functional.

## 8. Non-blocking product questions and prohibitions

Only these product decisions remain; implementation should use the defaults without waiting:

- **Generic versus species-specific reward nouns:** default to generic **“collected”** and **“produce”** so Apple through Eggplant share accessible copy without inventing botanical basket units.
- **Zero-reward emphasis:** default to an honest neutral **“Last harvest +0”**, without a sad plant, failure colour, shake or punitive message.

### Do not do

- Do not invent beta shapes, normal truncation, paper rounding/state recurrence, exact original action sequencing, or supplement/software details.
- Do not claim strict replication, clinical validation, a three-minute diagnostic, monitoring utility or comparability with study leaving points.
- Do not display or log scores/grades/diagnoses/depression/severity/anhedonia/drift/mood interpretations, user thresholds, forecasts or normalized leaving values. Raw game yield and last observed yield are not health measures.
- Do not show an exact next stochastic reward, a depletion-derived equivalent, a hidden DOM forecast, or “about N” next-yield copy.
- Do not restore finite targets, instant per-tap rewards, auto-repeat, empty-plant forced Walk, or motor-speed-dependent payout.
- Do not pool before-first-harvest/forced/administrative/time-exhausted endings with voluntary after-harvest leaves; do not turn missing last yield into zero.
- Do not pool species, days, v2/v3, modes or travel conditions as interchangeable trials, and do not add a second consumer travel condition for comparison.
- Do not resample on reload, double-pay late callbacks, rewrite v2/legacy events, truncate history, or add free-text/clinical fields.
- Do not add cash incentives, research blocks, counterbalancing or a research toggle to this consumer release.

## 9. Main-reviewer acceptance checklist

- [ ] UI and documentation consistently call this a consumer foraging-inspired adaptation; no health inference or clinical output appears.
- [ ] One unlocked card starts one 180 s daily round; daily unlock, visit-count and first-actual-result sparkle behavior survive reload and zero-action rounds.
- [ ] Every decision offers Harvest and Move; no target count or forced leaving exists, including after zero reward.
- [ ] Harvest is multi-reward and wait-based; spam cannot increase payout; production windows are 2 s/3 s from decision prompt with deliberation included.
- [ ] Last reward and Collected are clear; no next-reward/forecast UI or `nextYield`/`leavingValue` v3 fields exist.
- [ ] Fixed-seed golden tests and depletion/RNG property tests pass; pending actions and restore consume no draw or duplicate samples.
- [ ] v3 raw events contain all prompt/choice/due/ready/display/travel timestamps, scheduled/actual delays, IDs, condition, RNG state and voluntary/null leaving semantics.
- [ ] Reload during decision, harvest delay and travel restores absolute state; due-before-expiry actions settle once, later actions do not, and daily end locks once.
- [ ] v2/legacy history is untouched; active v2 closes administratively without an extra same-day v3 round or cross-version comparison.
- [ ] Keyboard, screen reader, 44 px targets, contrast, reduced motion, 320/390 px layouts and offline recovery pass; required screenshots have been visually approved.
- [ ] Production build and complete integrated checks pass with no Home, Reflect, Toolkit or Wind down regressions and no new network dependency.
