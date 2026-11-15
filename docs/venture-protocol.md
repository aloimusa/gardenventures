# Venture protocol: Vittala PNAS 2026 task match (adapted v4)

**Status:** active consumer protocol v4; implemented in `src/venture/**` and covered by `scripts/check-venture.mjs`  
**Protocol identifier:** `vittala_foraging_adaptation_v1`  
**Rules/timing versions:** `vittala_adaptation_rules_v1` / `vittala_adaptation_timing_v1`  
**RNG version:** `venture-normal-beta-rng-v2`

This release replaces v3's continuous-hold interaction with the requested **one tap followed by a fixed 2 s harvest**, rounded normal starting rewards, beta multiplicative depletion, and a clearly signalled **10 s travel cost**. It is deliberately closer to the mechanics printed in Vittala et al. (PNAS 2026), while remaining an adapted game: one absolute 180 s daily round, cosmetic species, no cash incentive, and no four-block/counterbalanced session. It does not produce a clinical score, diagnosis, severity estimate, normalized leaving point, wellbeing trend, or claim of clinical validation.

## 1. Direct source evidence and provenance

Reviewed on 2026-11-15:

- Aadith Vittala et al., “Decisional reference point pathology: A cognitive mechanism for and a correlate of major depressive disorder in humans,” **PNAS 123(21), e2518826123**, DOI [10.1073/pnas.2518826123](https://doi.org/10.1073/pnas.2518826123). The supplied `plantpickingpaper.pdf` is seven printed pages.
- Printed p. 6, **Foraging Task**: one of two key choices; after Harvest, 2 s elapses and the returned apple number is displayed. Later harvests multiply by a beta-distributed factor with average 12% decay and round to whole apples. Travel is a fixed 3 s or 10 s delay depending on block. Fresh trees start normally around mean 10, SD 1. Reaction time is included within total travel or harvest delay. Participants trained, then completed four clearly signalled, alternating 7-minute blocks with counterbalanced order and a $0.01/apple incentive.
- Printed Fig. 1B, p. 2: sequential Stay versus Leave, 2 s Stay, and 3 s/10 s Leave, in four 7-minute blocks.
- Printed p. 3 and Fig. 2E, p. 4: the reported three-minute result sampled increasing initial portions of the **first long-travel block**. It was not a standalone three-minute consumer protocol.
- The public repository [avittala/reference_point_mdd](https://github.com/avittala/reference_point_mdd) and its recursive file tree were inspected. At review time it contained the README, analysis notebook, and `.pkl` data files, not original task software or recovered task beta parameters.
- The PNAS page links `pnas.2518826123.sapp.pdf`; direct retrieval returned HTTP 403 here. [PMC13213967](https://pmc.ncbi.nlm.nih.gov/articles/PMC13213967/) exposes a supplementary DOCX link whose retrieval presented the NCBI download challenge instead of the document. The accessible three-page [bioRxiv supplemental figures](https://www.biorxiv.org/content/biorxiv/early/2025/04/23/2025.04.18.649538/DC1/embed/media-1.pdf?download=true) were downloaded and reviewed and contain no normal/beta implementation parameters.

Therefore the exact task beta shapes were **not practically recovered in this environment**. This is not a claim that the final publisher supplement lacks them. The active fallback is an explicit modeling selection, not a recovered parameter: **Beta(22,3)**, mean `22 / (22 + 3) = 0.88`. If verified supplementary/original-software shapes later become available, changing them requires a new protocol/RNG version and golden vectors, not silent reinterpretation of v4 history.

### What matches the printed mechanics, and what does not

Aligned within this adapted variant:

- Repeated Harvest/Stay versus Move/Leave choices.
- One accepted tap/click or Enter/Space on the plant schedules one 2 s harvest; every completed harvest displays its actual integer reward. There is no next-reward forecast.
- Initial fresh-occurrence reward is `round(Normal(10,1))`; later reward is `round(previous × Beta(22,3))`.
- Travel is the long condition magnitude, 10 s, with the reaction-time-inclusive condition window described below.
- Absolute ends and due ordering survive indecision, delays, reloads, and application backgrounding.

Deliberate differences / not paper-equivalent:

- The user-specified harvest is **one tap then a fixed 2 s after that tap**, not continuous contact and not v3's old timing behavior. Release has no effect. Move retains `max(prompt + 10 s, choice)` RT-inclusive scheduling.
- One 180 s local/demo-day round, only the 10 s travel condition, no four 7-minute blocks, no alternation/counterbalancing, no study incentive, and no assertion about three-minute clinical performance.
- Nine cosmetic plant species and stylized 3D models are product presentation. Species is logged and can be used to audit/filter eligibility, but is never a reward/timing covariate or normalized mood score.
- The short first-use practice and daily completion mark are product additions.
- Background annotations are data-quality flags for a future evaluator, not a mood, attention, reaction-time, or health inference.

## 2. Exact interaction and absolute timing

Production values are immutable at runtime:

| Setting | Value |
|---|---:|
| Real daily round | 180,000 ms |
| Harvest after one accepted tap | 2,000 ms |
| Move condition window | 10,000 ms |
| Future-background `leave_threshold` | strictly greater than 20,000 ms |

For decision prompt `P` and accepted Harvest choice `C`, `scheduledReadyAt = rewardDueAt = C + 2000`. The accepted `venture_action` is appended immediately on pointer-down or non-repeating keydown. There is no RNG result at contact or release. The controls lock synchronously, so later taps, clicks, auto-repeat, pointer movement, `pointerup`, `pointercancel`, focus loss, and blur cannot cancel, shorten, or duplicate that action. Enter and Space provide an equivalent keyboard path; native Enter/Space also works on focused Move/practice buttons.

For Move, `scheduledReadyAt = max(P + 10000, C)` and `scheduledPostChoiceWaitMs = scheduledReadyAt - C`. Outgoing, colorful path/transit, and incoming views stay inside this cost; reduced-motion keeps the logical delay without offscreen animation. The button says Move 10 s. A very late choice may therefore have no remaining travel animation, matching the logged RT-inclusive formula rather than an invented additional wait.

Indecision still spends the absolute round clock. Holding a pointer longer, releasing efficiently, or input spam never changes a queued reward, and there is no auto-repeat/catch-up yield. No action is manufactured on the player's behalf. At or after `endsAt`, new input is rejected. A due action settles first only when `scheduledReadyAt <= endsAt`; otherwise it never samples or pays. Equality settles once, then the round ends. Late actual reveal/end recording is retained rather than compensated.

Hidden apps do not reveal a result merely because a browser timer matured. On reveal/recovery, a due-valid result is sampled/logged/displayed once, with actual `rewardDisplayedAt`; otherwise the absolute round closure is recorded without a draw. `state.venturedOn` is updated only at actual/administrative daily completion, never on selection, practice, a tap, or result.

Development overrides require `?venture-test=1` and are repeated exactly on the real round start (`explicit_test_override` and the relevant override fields). Ignoring them without that query preserves production `180000/2000/10000`. The existing `garden.test.ventureSeconds` development duration hook remains only under the same explicit test query.

## 3. Exact deterministic reward algorithm

### Occurrence and PRNG namespaces

1. A real start generates one uint32 `roundSeed` using `crypto.getRandomValues`, or logs the explicitly allowed test seed. `Math.random` is not used.
2. Each occurrence chain is independent: `occurrenceChainSeed = FNV1a32("venture-normal-beta-rng-v2|" + roundSeed + "|" + occurrenceIndex)`. FNV starts at `2166136261`; each ASCII code applies `h = imul(h ^ code,16777619) >>> 0`.
3. Decorative variation remains separate as `FNV1a32("venture-consumer-visual-v1|" + roundSeed + "|" + occurrenceIndex)`. Species, camera choices, prompts, practices, and geometry do not enter the occurrence reward chain.
4. Each Mulberry32 state is uint32:

   ```text
   stateAfter = (stateBefore + 0x6D2B79F5) >>> 0
   t = stateAfter
   t = Math.imul(t ^ (t >>> 15), t | 1)
   t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
   value = (t ^ (t >>> 14)) >>> 0
   u = (value + 1) / 4294967297
   ```

   The open `u` avoids `log(0)` and exact endpoint uniforms.

### Initial fresh occurrence

Consume exactly two uniforms using the Box–Muller cosine transform:

```text
z = sqrt(-2 ln(u1)) cos(2πu2)
raw = 10 + 1 × z
rounded = Math.round(raw)       // nearest whole; exact positive .5 ties go upward in JS
reward = max(0, rounded)
```

The normal is **not** the retired discrete uniform 8–12 and is not pre-truncated. The distribution has nonzero theoretical negative tail probability. Every first result records raw `initialStandardNormal`, `initialNormalValue`, `negativeNormalObserved` (raw value below zero), and `negativeRewardPrevented` (rounded value below zero and therefore clamped). No negative integer is displayed. No normal rejection/reroll or concealed post-display replacement occurs. This explicit nonnegative clamp is an implementation rule, not a recovered paper detail.

### Subsequent harvest on the same occurrence

Sample independent `X ~ Gamma(shape=22, scale=1)` and `Y ~ Gamma(shape=3, scale=1)` using the log-acceptance form of Marsaglia–Tsang (2000), then:

```text
factor = X / (X + Y)            // Beta(22,3), selected fallback; mean .88
reward = max(0, Math.round(previousObservedYield * factor))
```

Gamma uses Box–Muller normals and rejection internally as specified by the algorithm, before display; this is not post-display rerolling. The sampler implementation also supports shape values below one using the standard `Gamma(a+1) × u^(1/a)` boost, although active 22 and 3 do not need it.

There are **no five listed factors, previous-minus-one clamp, minimum-one rule, finite fruit cap, or forced Move**. Values may repeat; zero is allowed and can repeat. A zero continuation still samples/logs its beta factor. The first reward on a later fresh occurrence restarts from the independent normal chain; occurrence-local previous reward otherwise drives recurrence.

### When draws happen and what is logged

No reward transitions occur on prompts, tap acceptance, spam, practice Start, Move, decorative rendering, discard, early expiry, or reload. Sampling occurs lazily only when an actual result is revealed. Reload replay deterministically validates stored samples without advancing persisted chain state. No sampled result appears in an action before reveal.

Every real result includes complete input/choice/due/ready/display timestamps; `plant`, `roundId`, `occurrenceId`, `decisionId`, `actionId`; integer `reward`; previous/current/round totals; and:

- `rngVersion`, `occurrenceChainSeed`, `drawIndex` (result ordinal);
- `rngStateBefore`, `rngStateAfter`, `rngValue` (first uint32 in this result);
- `uniformValues` (all uint32 inputs used by this result, including gamma rejection inputs);
- `rngDrawIndex` (PRNG transitions before this result), `rngDrawCount`, `distribution`;
- initial raw normal/negative flags or gamma X/Y and `selectedFactor`, with explicit nulls where not applicable.

`venture_round_start` repeats the complete `rewardConfig`: initial distribution, mean 10, SD 1, beta distribution and shapes 22/3, mean .88, rounding and negative-normal rules, uniform/normal/gamma transforms, and `betaParameterStatus: "chosen_fallback_not_recovered_from_paper"`.

## 4. One-time interactive practice

On an incomplete first-run marker, choosing an unlocked plant opens a short practice for that same plant; it does not start today's real round. One tap queues the same 2 s interaction, then an integer practice reward appears and **Start today's round** becomes enabled. Start follows the original choice and creates exactly one real selection/start/occurrence/prompt. There is no lengthy tutorial or additional travel. No Skip/Not-now control is shipped, so skipping is neither forced nor logged.

Practice is classified only by separate event types: `venture_practice_start`, `venture_practice_action`, `venture_practice_result`, `venture_practice_complete`. Their payloads have `classification: "practice"`, `practiceId`, `practiceVersion`, and cosmetic `plant`, but no real `roundId`, daily round timing/totals, visit count, completion state, clinical data, or measuring score. The practice uses an isolated fixed practice namespace and cannot consume an occurrence chain. It is excluded from real `venture_harvest_result`, Market result counts, and card sparkle eligibility.

Completion is mirrored by `garden.venture.practice.v4 = "complete"` and independently recoverable from `venture_practice_complete`; subsequent days and reloads do not repeat onboarding. Once Start is offered, the plant stage changes to a non-action group so the native Start button is not disabled by an ancestor's aria-disabled state.

## 5. Application-background intervals and invalid annotation

Only application/visibility lifecycle creates these intervals; navigating to another Garden pane is not application background. Each interval is tied to the real `roundId` and deterministic `intervalId`:

| Record | Important fields (plus shared v4 fields) |
|---|---|
| `venture_background_interval`, `lifecycle: "start"` | `visibility: "hidden"`, `source: visibility_hidden/pagehide`, `startedAt`, `endedAt: null`, `durationMs: null`, `openAtLastSession: false`, `ended: false` |
| Same type/ID, `lifecycle: "end"` | original `startedAt`; `visibility: revealed` and actual `endedAt`/`durationMs` for a real reveal, or `visibility: hidden`, both null, `openAtLastSession: true` when the round ended before reveal; `source: visibility_revealed/pageshow/app_lifecycle/round_end`; `ended: true` |

Repeated visibility/page lifecycle notifications are deduped by interval ID and lifecycle. Exact repeated raw events are idempotent; conflicts fail closed. Multiple intervals retain their individual start/end/durations. The round's absolute endpoints are unchanged.

The round-end summary records `backgroundIntervalCount`, sum of **closed** `backgroundDurationMs`, `backgroundOpenAtEnd`, `backgroundInvalid`, `backgroundInvalidReason`, and `leave_threshold: 20000`:

- closed total `> 20000` → `over_leave_threshold`;
- open at the last active session/end → `open_at_last_session` (or `open_and_over_leave_threshold` when both apply);
- otherwise `none`, including exactly 20,000 ms.

Long waits or delayed callbacks alone are never mislabeled as background. An open interval is not assigned a fabricated reveal end or duration. These annotations let a future evaluator exclude an affected round while retaining all raw values; they do not delete rewards, change Market eligibility, pause the game clock, or create a health/mood judgment.

## 6. Raw v4 schema and recovery

Shared real-round envelope: global `{t,d?,type,payload}`; v4 payload includes `mode`, `date`, demo `day`, `roundId`, cosmetic `plant`, `rulesVersion`, and `timingVersion`. IDs use `venture-v4:${date}:${startedAtBase36}:${roundSeedBase36}` and deterministic occurrence/decision/action/travel suffixes. All timestamps are epoch milliseconds. There are no hidden `research`, `diagnosis`, `blockId`, or `sessionId` fields and no normalized next-yield/leave forecasts.

| Event | Protocol-specific raw contents |
|---|---|
| `venture_selection` | `selectedAt`, `via`, `unlockedCount` |
| `venture_round_start` | seed/start/duration/absolute end, harvest/move durations, fixed interaction, `long_travel_10s_v1`, RNG/version and full reward config, logged development overrides, `leave_threshold` |
| `venture_occurrence` | ID/index, reward and visual seeds, `revealedAt`, nullable `arrivalTravelId` |
| `venture_decision_prompt` | decision ID/index, occurrence ID/index, `promptedAt`, durations, actual displayed count, `lastObservedYield` (null before first result, including a new occurrence) |
| `venture_action` | canonical Harvest/Move IDs, accepted input/via, actual prompt/choice, scheduled condition/ready/post-choice durations; Move also gets from/to occurrence/travel IDs, actual displayed count, last actual result, `voluntaryLeave: true`, and before-first/after-observed `leaveKind` |
| `venture_harvest_result` | full action linkage, choice/due/ready/actual display and actual waits, `restored`, `maturedBeforeRoundEnd`, harvest/result counts, previous/actual/current round totals, and every RNG field in §3 |
| `venture_background_interval` | paired lifecycle records in §5 |
| `venture_travel_end` | action/travel/from/to IDs, prompt/start/scheduled arrival/finished/actual arrival state, actual delays, restored/reason |
| `venture_round_end` | original absolute start/end, logical end vs actual recording, reason/category/context, nullable pending action, actual result/total/arrival counts, last actual result, and complete background annotation |
| `venture_legacy_close` | v2-only administrative closure with original ID/times/version/reason; never a v4 trial or converted reward |

Replay preserves append order and dedupes exact IDs. A pending tap before maturity restores its original deadline. If due before or exactly at expiry, recovery settles once; if later, it cannot pay, cancel, or draw again. A Move similarly arrives only when due-valid. The original prompt and absolute endpoints are not restarted. Round totals are sums of displayed results only; duplicate deliveries cannot increase them. Conflicting active sequences fail closed without inventing observations.

`lastObservedYield` is only the last actual integer rendered on this occurrence. It is null before the first result on each fresh occurrence and may legitimately be numeric zero after one. Move carries that value (or null); no forecast is used.

### Compatibility and migration boundary

- v3 hold records are **opaque and immutable**: v4 never replays, cancels, backfills, converts, or repays them. Their current-day start blocks a replacement daily round through a read-only administrative view. v2 retains the existing one-time administrative close behavior. Unknown/unversioned data remains untouched.
- v2/v3 card visit history remains available. v3/v4 results are not numerically compared as one normalized score. Only a v4 valid matured/displayed `venture_harvest_result` updates the new-protocol sparkle/first-result eligibility; practice and zero-action starts do not.
- Real results retain Market's existing integration surface: event type `venture_harvest_result`, string `actionId`/`roundId`, catalogue `plant`, safe integer `reward`, `date`, `t`, and `maturedBeforeRoundEnd`. The version boundary is intentional: v4 results are not silently relabeled v3; any Market reader update must explicitly accept v4. Zero remains a valid observation but is not positive inventory.
- All species are eligible for the same raw adapted task observations. Species-specific visual differences are cosmetic. Future analysis should retain/stratify species and protocol versions, not pool them into a normalized mood metric. Practice, malformed/early-expired actions, and v2/v3 history are measurement-ineligible; background-invalid rounds are annotated for separate future exclusion, not rewritten.

## 7. Verification scope

`scripts/check-venture.mjs` contains independently recomputed normal/beta golden vectors, rounded-normal and beta-mean property checks, repeated-positive and seeded-zero trails, real pointer/keyboard timing and spam behavior, 10 s outgoing/offscreen/incoming/reload behavior, same-seed species checks, all nine original art factories, first-use exclusion, exact-once pending recovery, duplicate/conflict behavior, open and 21 s background annotations, natural zero/Move behavior, and v3 immutability. These are software-protocol checks, not evidence of study replication or clinical validity. Browser captures cover first-use practice, actual harvest feedback, 10 s offscreen travel, and first-day/second-day/third-day plant results.
