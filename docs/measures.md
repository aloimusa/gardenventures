# My line: measures, evidence, and the reviewed-not-implemented contract

**Part 1 review only — evidence current through 2026-11-15. No implementation, simulator output, deployment, or clinical validation is claimed here.**

This document is self-contained. It uses the supplied the paper (not included in this repository), [`docs/venture-foraging-review.md`](venture-foraging-review.md), and [`docs/venture-redesign-plan.md`](venture-redesign-plan.md), and checks the current working-tree event producers/readers directly. **Current source wins over the older plan/review where they disagree.** In particular, current Venture is a two-second continuous whole-plant hold (`hold_2s_v1`), not merely a two-second Harvest delay after a button click ([rules.ts:3–12, 42–45](../src/venture/rules.ts#L3-L12); [index.ts:687–740](../src/venture/index.ts#L687-L740)).

## 1. Definition, boundaries, and bottom line

### 1.1 The only intended meaning of “drift”

Here, **drift** means:

> A sustained change away from the person's **own baseline**, in a direction associated with depression, visible in **at least two unrelated measurement families**.

Drift is therefore an operational pattern for further human review. It is **not** a diagnosis, a universal mood or wellbeing score, a determination of severity, a causal attribution, a prediction of relapse, or evidence that treatment is needed. One odd day does not qualify. One odd measure does not qualify. Even the specified two-family rule is only weak coherence until it has prospective longitudinal validation.

“Unrelated” is a lineage constraint, not a claim of statistical independence. Each family contributes at most once. Two transformations of the same raw event stream are not independent replication. In particular, self-report has one vote even if it contains both launch check-ins and card moods; Venture has one vote even if it contains leaving yield and timing; and C-grade measures have no vote.

### 1.2 Non-negotiable exclusions and boundaries

1. **Flagged Reflect entries follow their own immediate support path.** Their contents, moods, word counts, typing behavior, photo completion, card use, and engagement features derived from them never contribute to drift. They do not supply mood, a keyword flag, a safety assessment, or a diagnosis to any other view. Current support behavior lives in Reflect: local/server status plus the person's plan and optional contact links ([reflect/index.ts:194–259, 443–477](../src/reflect/index.ts#L194-L259); [flags.ts](../src/reflect/flags.ts)).
2. **PHQ-2 is an anchor, not a drift channel.** Weekly administration when the market truck comes may show its original two response totals and their time course separately. It does not establish a baseline, switch a measure/family off, vote for watching or drift, or create automatic healthcare escalation. The original instrument asks about the preceding two weeks, so adjacent weekly administrations overlap rather than forming independent observations ([Kroenke et al., 2003, source 6]).
3. Missing or unobserved is not zero mood, zero activity, a bad day, or proof of wellness/safety. No inference is made from silence beyond an explicitly insufficient-data state. Methods work and RADAR-MDD show that collection failures and incomplete data are material problems, not behavior to impute ([sources 18, 19, 24]).
4. No diagnostic labels are inferred from PHQ-2, card text, a local/server flag, a photo, plant appearance, watering, game produce, or any aggregate of these.

### 1.3 Evidence decision

- **No registry measure earns A for this intended use.** A would require replicated evidence for substantially the same operational measure and direction, including repeated within-person use appropriate to the claim—not merely two studies of a broadly related construct.
- **B is limited to explicit momentary self-report (with an indirect-scale/sampling caveat) and the paper-specific leaving-yield analogue.** B means single/indirect support for a directional hypothesis, not replication, clinical applicability, or validation of the consumer operationalization.
- All other measures are **C: presence/raw behavior only; no directional scoring and no family vote**. Several are C because actual findings are conflicting or two-sided, not merely because no study was found.
- Thus PSYCHOMOTOR/TYPING, ACTIVATION, RHYTHM, and ENGAGEMENT are suppressed. REWARD/EFFORT is useful only as an explicitly experimental bridge; if a reviewer requires a universal rather than paper-specific direction, `leave_threshold` must also drop to C. There is no scientific basis for rescuing a two-family demo by upgrading unrelated app activity.

## 2. Source review: method and what the primary studies actually show

### 2.1 Method and grading

This is a **systematic, source-bounded engineering review**, not a claim to a completed PRISMA review of every publication. Searches covered the supplied paper and its directly relevant foraging work, PHQ/momentary self-report, morning/evening diurnal variation, keystroke and survey timing, speech/written volume, app/activity and rest–activity rhythms, engagement/missingness, practice/reactance, and repeated relapse measurement. For each measure I selected one to three primary empirical sources (plus direct local artifacts) that best answer construct, direction, magnitude, repetition, and transfer. Negative or contrary findings are retained. Marketing material was not used as evidence. There was no Exa-key use.

The grades are deliberately measure-specific:

- **A — replicated:** substantially the same measure and direction have replicated primary support and adequate within-person/repeated use. General construct fame is insufficient.
- **B — single/indirect:** a primary source supports an indirect direction for a bridge measure, but replication, daily within-person use, protocol match, population match, or clinical applicability is absent or materially limited. The limitation must be printed beside the measure.
- **C — presence only:** no justified directional score, including unsupported, two-sided, missing-proxy, or confounded measures. C can appear in descriptive local history but cannot make a measure or family “off.”

“Repeated support” below distinguishes same-session reliability, repeated daily/within-person use, and actual prospective relapse prediction. These are not interchangeable. Practice is called out when a study measured it; “not reported” is not evidence of no practice effect.

### 2.2 SELF — momentary self-report and the weekly anchor

#### `checkin_mood`

- **What was measured:** Tamm et al. asked 71 moderately/severely depressed inpatients/day-clinic patients to rate current mood with one of five emojis, three times daily for seven weeks, as part of a four-item depression EMA. The depression EMA slopes were examined alongside weekly BDI-II and clinician-rated functioning ([source 1]).
- **Direction and magnitude:** improvement over intervention was in the expected lower-negative-symptom direction, but their reported comparisons concern the four-item EMA, not the isolated emoji. Reported EMA-depression standardized contrasts reach *d* = 0.26 and 0.62; WQA-depression contrasts were 0.10 and 0.47. These values **cannot be assigned to a four-face, isolated mood item** ([source 1]).
- **Repeated support and practice:** intensive within-person administration exists. Five prompt days were compared with weekly questionnaires; response averaged 55.77%. The authors found modality differences and substantial missingness, so neither approach is a drop-in substitute for the other. The EMA item order was randomized; this does not establish absence of habituation ([source 1]).
- **Corroborating but different evidence:** 47 depressed youths and 32 controls had repeated phone affect ratings in five four-day blocks over eight weeks. MDD youth had higher global NA (1.33 versus 1.11) and sadness (1.40 versus 1.09), lower PA:NA (2.16 versus 3.02), and their NA and sadness fell during treatment (within-week coefficients −0.02 and −0.03). This supports lower/worse momentary affect in depression, but not an adult four-face daily threshold ([source 4]). A VAMS taken at baseline and three months by remitted, recurrently depressed outpatients predicted time to relapse over 5.5 years (baseline HR 1.15 per cm toward sad; 6.3% estimated variance), but only two ratings were used and the authors explicitly called for daily reliability work; this is not daily drift validation ([source 5]).
- **Grade: B (indirect scale and construct; no exact four-face, twice-daily, sustained-change threshold).** Lower answered faces can describe worse self-reported affect. Causation, diagnosis, and referral are not implied.

#### `checkin_diurnal` (morning minus evening)

- **Repeated daily evidence:** 103 people treated for a major depressive episode completed morning and evening global depression ratings for 28 days after inpatient discharge. The original scale is **0 = most depression, 10 = no depression**. Evening-minus-morning averaged +0.33 points (SE 0.10; *p* = .0009), corresponding to the requested morning-minus-evening of −0.33 on average. Yet direction changed repeatedly: 38.9% of paired days improved, 39.1% had no difference, and 22.0% worsened during the day; successive-day diurnal differences had SD 1.9 points on a −10…10 scale ([source 2]).
- **Population-level pattern:** 3,744 STAR*D outpatients had a retrospective diurnal-mood item, not repeated momentary data. Diurnal variation occurred in 22.4%; among those reporting it, 31.9% named morning worsening, 19.5% afternoon, and 48.6% evening worsening. Different diurnal directions related to melancholic features ([source 3]).
- **Practice/within-person interpretation:** the Aggestrup study shows directly why one paired day is not a directionally valid deterioration signal. These analyses were exploratory, treatment conditions varied, and day-to-day heterogeneity was large ([source 2]).
- **Grade: C (explicitly two-sided).** Classic morning worsening would make the difference more negative, but evening worsening and flat/reversing patterns are common. Even if a future analysis reports lower values descriptively, they cannot count toward drift.

#### `card_mood`

The evidence is the same momentary-affect evidence as `checkin_mood` [sources 1, 4, 5]. There is an additional crucial measurement distinction: an entry-tied mood chosen when an experience prompts a card is not a scheduled check-in. Existing card mood edits also must not be presented as independent repeated check-ins ([reflect/model.ts:23–55](../src/reflect/model.ts#L23-L55); [reflect/index.ts:353–361, 480–494](../src/reflect/index.ts#L353-L361)).

**Grade: B only for initial, explicit, non-seed, unflagged creation-time mood; indirect event-contingent sampling.** If card mood instead uses a global stub, seed values, edited color cycles, reply/model output, or flags, it becomes C/invalid. Card mood and launch mood still cast only one family vote together.

#### `phq2_weekly` — ANCHOR ONLY

- **What was measured:** two frequency items (little interest/pleasure and feeling down/depressed/hopeless) over the **past two weeks**, each 0–3, total 0–6 ([source 6]).
- **Sample and magnitude:** 6,000 patients across eight primary-care and seven obstetrics/gynecology clinics. Against a mental-health-professional reinterview, PHQ-2 ≥3 had sensitivity 83% and specificity 92% for major depression in the original study. Higher scores tracked lower functioning and greater utilization ([source 6]).
- **Repeated within-person support:** the cited paper establishes screening/criterion validity, not weekly within-person responsiveness, daily baseline change, relapse prediction, or an optimal alert delay. Later active-plus-passive relapse work used other validated symptom instruments plus adjudication; it cannot be borrowed as PHQ-2 validation ([source 7]).
- **Grade: N/A (anchor; no drift grade or vote).** Higher means more frequent self-reported anhedonia/depressed-mood symptoms in the recall window, not diagnosis, drift, or relapse. Do not turn the screening cutpoint into an automatic clinical action or automatically notify anyone.

### 2.3 REWARD/EFFORT — the foraging analogue and its limits

#### `leave_threshold`

- **Primary finding:** the supplied study recruited 50 people with moderate/severe MDD and 70 healthy controls. Its target was the observed reward on the harvest immediately preceding Leave. Average leaving reference points were approximately 50% higher in MDD; within patients they correlated with contemporaneous MADRS at *r* = .71 (*p* = 6×10⁻⁹), and long-travel discrimination reached AUC = .85 ([source 8, printed pp. 2–4]). This is a **cross-sectional association**, not a within-person change, treatment response, or relapse finding.
- **Reliability versus longitudinal evidence:** reported test–retest ICC was 0.84 (95% CI 0.78–0.89) between first and last blocks in one three-hour session. It says nothing about stability across weeks, devices, recovery, or home use. The authors explicitly state that they do not know whether reference points decrease with recovery and that longitudinal repeated research is essential ([source 8, printed pp. 4–6]).
- **Practice/environment effects:** in two healthy-human foraging experiments (47 analyzed participants across experiments), thresholds moved with travel/depletion conditions; MVT-style learning outperformed TD accounts. The work used four 14-minute blocks and performance-based payment. It proves opportunity-cost learning and environmental dependence, not a stable personal trait ([source 9]).
- **Contrary/protocol-specific evidence:** 52 MDD participants (43 in episode) and 27 comparisons performed a different Effort Foraging Task. There was no diagnostic-group threshold difference, while greater overall depression related to **lower** exit thresholds (standardized estimate −0.33, *p* = .042). Populations, exclusion criteria, task travel/effort demands, and outcome differed; this cautions against calling every patch-leaving parameter a universal depression direction ([source 10]).
- **Grade: B only as a paper-specific, indirect observed-reward bridge; exploratory in consumer v3.** The exact consumer statistic is meaningful as the same *kind* of reference-point proxy, but the direction is not replicated, the related literature is not one-directional, and protocol fidelity is insufficient for a clinical label. If B is permitted in the demonstration, the display must say “experimental foraging analogue,” not “reference point measured.”

#### `harvest_latency`

No reviewed primary study measures `rewardDisplayedAt → next continuous hold start` in Garden or its paper counterpart. The supplied protocol instead includes reaction time within Harvest/travel timing so latency does not change total opportunity ([source 8, printed p. 6]). Current v3 changes both interaction and latency meaning. See §4.

Keyboard studies do not repair this bridge. In nine people with bipolar disorder over eight weeks, weekly average interkey delay positively related to HDRS (scaled coefficient 2.88, 95% CI 0.42–5.35; *p* = .022) within a multifeature model ([source 11]). In 147 BiAffect users (86,541 sessions, 543 PHQ-8s), PHQ-8 = 20 versus 0 corresponded to a **2.2% shorter median interkey delay** but 7.8% higher 95th-percentile pausing. These are different statistics and populations; they conflict with a simple “every delay increases toward depression” rule ([source 12]).

**Grade: C.** A median can be shown as software-observed planning/return latency, but it contains reward evaluation, decision, accessibility workflow, intentional exploration, and travel. It is not pure motor speed and must not inherit psychomotor scoring from keyboard work.

#### `round_completed`

A full 180-second round is a product-defined observation, not a research protocol completion or validated adherence behavior ([rules.ts](../src/venture/rules.ts); current round-end semantics in [venture/events.ts:420–454](../src/venture/events.ts#L420-L454)).

RADAR-MDD enrolled 623 people with previous MDD, yet only 110 had >50% availability across all data types. Five-second tasks and passive streams have different missingness; broadly, baseline symptom severity did not predict availability, although activity data had one availability difference. Completion cannot be mapped to direction ([source 18]). Intensively sampled EMA studies likewise show adherence as a design/outcome measure, not a universal mood measure ([sources 1, 19, 24]).

**Grade: C. No direction; exclude.** Current zero-action and background-recovered rounds can end validly, while `day_changed` and `invalid_state` are administrative rather than full 180-second completions.

### 2.4 PSYCHOMOTOR/TYPING — latency is metadata, not a typing phenotype

#### `first_key_latency`

Torous et al. found that first-view and submission timing from repeated symptom surveys related to later symptom scores in 16 outpatients with schizophrenia for up to 90 days. Faster viewing and slower completion could relate to worse scores, while platform and coverage differed by OS; the authors explicitly called these hypothesis-generating relationships ([source 17]). This is not a universal direction from a new Reflect draft's first focus to its first content-producing input. BiAffect measures subsequent interkey timing, not first focus latency ([sources 11, 12]).

**Grade: C.** Latency-to-first-input can be computed, but it may represent prompt reading, composing, interruption, cursor position, restored drafts, or device choice. There is no supported higher-is-toward rule for Garden, and no first-input latency sensor should be fabricated.

#### `interkey_median`

- Zulueta et al. used a custom Android keyboard, 626,641 keypresses, 9 rapid-cycling bipolar participants and weekly HDRS/YMRS for eight weeks. Weekly mean interkey delay related positively to HDRS (2.88, 95% CI 0.42–5.35), but the tiny selected sample, same-week outcome, multifeature model and diagnosis limit transfer ([source 11]).
- Vesel et al. used a custom iOS keyboard, >14 million presses across 250 users, with 147 PHQ-linked users. Higher PHQ-8 related to slightly shorter median IKD (−0.002 coefficient; modeled 2.2% shorter at PHQ-8 20 versus 0), longer upper-tail pause (+0.020 coefficient; 7.8%), and greater variability (+3.3%). Time of day mattered: median IKD was 11.36% slower around midnight than midday; age, handedness, and session length mattered too. The authors specifically called effects small and not clinically ready ([source 12]).
- Repeated/practice: these are dense within-person naturalistic records, not Garden-specific daily change thresholds. Custom keyboard replacement is not a single app's textarea. PHQ interpolation in Vesel and sparse repeated PHQ response also reduce causal/temporal precision ([source 12]).

**Grade: C (two-sided and statistic-dependent).** Do not encode “higher median interkey = toward.” Longer *tail* pauses, not the median, went in that direction in the larger study.

### 2.5 ACTIVATION — quantity of expression and task presence do not establish activation

#### `words_per_card`

Menne et al. compared one-minute positive and negative life narratives from 44 MDD patients and 52 controls in one laboratory visit. Temporal, lexical, and acoustic features differed; importantly, MDD participants produced **more**, not fewer, words for positive stories (mean 64 versus 39; η² = .54, adjusted *p* = .02). The negative-story difference was nonsignificant (109 versus 52; η² = .01, *p* = .6). This is cross-sectional prompted speech, not daily card-writing volume ([source 13]).

Two studies reported by Hur et al. (N = 467 total) link language sentiment to subsequent depression, but sentiment is not word count. The finding cannot support a lower-volume direction or a daily within-person score ([source 14]).

**Grade: C (contrary/unsupported direction).** A card may be shorter because of a photo choice, prompt, 220-character limit, language, editing, privacy preference, motor impairment, or intentional style. No “less speech/writing = depression” mapping is allowed.

#### `photo_task_done`

Dean et al. studied 19 young people (14–21) using participant photos to guide semi-structured interviews about depression and self-imagery. Ninety-three photographs were prompts for qualitative discussion—the photos themselves were not analyzed. The work concerns image meaning, not whether completing a photo prompt has a quantitative direction or daily reliability ([source 15]).

Current prompts are explicitly “never a task,” and completion/ignoring is not tracked ([reflect/prompts.ts:1–4](../src/reflect/prompts.ts#L1-L4)). Camera availability, a file fallback, a draft capture, and a committed photo card are distinct events ([reflect/index.ts:533–573](../src/reflect/index.ts#L533-L573)).

**Grade: C (presence/engagement only).** A lower photo-answer rate cannot be called lower activation. No eligible primary source reviewed supports a higher-is-worse or lower-is-worse direction for this exact prompt-completion behavior.

### 2.6 RHYTHM — actual actigraphy is not interchangeable with app timestamps

Shared limits for all five rhythm candidates: current app_open/pane/Wind down logs record product events, not wake time, sleep onset, sleep duration, rest, circadian phase, or activity amplitude. No embedded wearable/HealthKit/Health Connect/Bluetooth sensor is connected. App semantic gaps also include page close and visibility transitions incompletely recorded ([main.ts:91–105](../src/main.ts#L91-L105); [winddown/index.ts:120–177, 216–233](../src/winddown/index.ts#L120-L177)).

#### `first_open_time` and `last_activity_time`

- Zhang et al. analyzed 10,018 PHQ-8 records and corresponding 14-day Fitbit windows from 543 RADAR-MDD participants. After adjustment for season and covariates, greater PHQ-8 related to later device-estimated sleep onset (β = .55), offset (β = 1.12), M10 onset (β = .73), HR acrophase (β = .71), more sleep variability (β = .96 min), and fewer steps (β = −93.61 per PHQ-8 point). These are person-mean-normalized mixed models, not universal clock-time cutpoints; some effects varied by season ([source 16]).
- By contrast, Zulueta's phone-keypress “circadian baseline similarity” did not predict HDRS (*p* = .64) in nine bipolar participants; the authors specifically say phone patterns and sleep are not identical ([source 11]).
- Repeated/practice: dense wearable epochs are available, but current app has no corresponding sensor. A reload can also inflate opens and alter last-activity interpretation ([main.ts:99–105](../src/main.ts#L99-L105)).

**Grade: C for both.** Later is only an indirect hypothesis about device-estimated sleep, not a rule for first/last app interaction. Earlier or later app behavior has no universal valence.

#### `winddown_start_time`

The primary Wearable evidence above concerns sleep onset, not clicking a soundscape. Current every successful playback start/resume/sound restart can log `winddown_played`; requested timer minutes are not listening exposure, and natural timer expiry has no dedicated event. First play of a day is nevertheless computable as a product observation ([winddown/index.ts:144–177](../src/winddown/index.ts#L144-L177)).

**Grade: C.** Do not rename a Wind down start “bedtime” or infer sleep from it. Direction is unsupported and context-specific.

#### `night_use` (01:00–05:00)

Tonon et al. followed 93 adults with remitted MDD for a median 46 weeks (about 32,000 complete actigraphy days). Higher baseline nighttime activity related to subsequent adjudicated relapse (HR 1.86, 95% CI 1.32–2.62), as did lower sleep regularity, relative amplitude, sleep efficiency, and greater wake after sleep onset; time-varying phase deviation and lower relative amplitude also related to relapse. This is real actigraphy with defined epochs and adjudicated outcomes, not proof that Garden use between 01:00 and 05:00 is wakefulness, sleep disturbance, or prodrome ([source 7]).

**Grade: C.** Any count or boolean in that interval is descriptive app use only. More use may reflect a different schedule, shift work, caregiving, time zone, insomnia, hypomania, ordinary entertainment, or a demo control—not one pathological direction.

#### `regularity_sd_7d`

Tonon and Zhang support regularity/phase as real research constructs, but they use actigraphy and device-estimated physiological activity, respectively [sources 7, 16]. They do not justify standard deviation of app-open clock times as a substitute. Sampling itself determines SD: missed opens, reloads, demo-day skips, local clock changes, DST, and the finite seven-day window alter the metric even with no human routine change. Actigraphy literature warns against interpolating device data into ordinary log data ([sources 7, 18, 19, 24]).

**Grade: C.** A seven-day SD can describe recorded first-open dispersion, not circadian regularity. Late and early are both viable chronotypes/schedules, and neither is universally toward depression.

### 2.7 ENGAGEMENT — use, nonuse, and ordinary disengagement are not mood

#### `valid_day` and `panes_touched`

- Large within-person app-sensor work is inconsistent with a scalar “more usage = better” direction. In 1,013 participants over 16 weeks, within-person time at home predicted later PHQ-8 (distal β = .219), whereas circadian movement related to concurrent but not distal PHQ-8. App messaging related positively to impending/current PHQ-8 (β = .162), call/text features were not significantly related to PHQ-8, and overall models explained about 5% of symptom variance ([source 22]).
- The much smaller keyboard study found **more** sessions positively related to HDRS (scaled coefficient 2.18, *p* = .0025), contrary to its authors' expectation of withdrawal ([source 11]).
- Collection coverage changes not only observation but interpretation. RADAR-MDD's 110/623 fully multiparametric-available subgroup and the repeated-app-missingness methods work show why an absent record is not an observed absence of activity ([sources 18, 19, 24]).

**Grade: C for both.** `valid_day` and number of observed panes measure product interaction only. Lower or higher usage is not assigned a clinical direction, and stays out of watching/drift.

#### `home_watering`

The current watering event records a five-second intentional hold and one daily product mark. It has no independent clinical measurement properties. It also shares an overall app-use lineage with the other pane events and must not become a second vote for engagement ([home/index.ts:81–95, 132–174](../src/home/index.ts#L81-L95)).

The only supportable clinical-adjacent statement is the general missingness evidence above [sources 18, 19, 24]. No primary evidence establishes a depression direction for watering a virtual orchid.

**Grade: C, presence only and subordinate to ENGAGEMENT's C exclusion.** Earlier growth previews do not improve this: current orchid appearance is calendar/watering presentation, not a person's mental state ([home/orchidRig.ts:11–27, 98–116](../src/home/orchidRig.ts#L11-L27)).

## 3. Measure registry

### 3.1 Required derivation and validity conventions

The exact formula precedes each daily baseline calculation. Per-card/per-action values are observations emitted once; a daily aggregate is then formed as stated. “Observed zero” is allowed only where the registry says so, after opportunity coverage is known. `null`, skipped, not-answered, pending, censored, corrupt, seed, test override, and out-of-scope values do not create zero. Every measurement stream is tied to real epoch time and the demo-or-real `local_day`; Skip day cannot fabricate ordinary elapsed behavior.

All Venture eligibility is **per `mode + rulesVersion + timingVersion + rngVersion + plant`** (production only). Do not pool v2 with v3, plants, timing/test overrides, or incompatible algorithms. Angles/models vary and a raw measurement should remain per plant where applicable ([docs/product-manifest.md:26–41](product-manifest.md#L26-L41)). Any change creates a new lineage/baseline rather than a silent comparison.

| id | family | exact definition and unit | validity rule | direction (which way toward) | evidence grade | sources |
|---|---|---|---|---|---|---|
| `checkin_mood` | SELF | One answered launch check-in face, integer 0 Bad, 1 Not great, 2 Okay, 3 Good, emitted once per answered occasion; daily median across those independent answered occasions. Unanswered/not offered is missing. | Must be an intentional response to a versioned check-in opportunity with `answered = true` and valid 0–3. Morning/evening opportunities remain separately identifiable even though this family has one vote. Not the current `state.mood` console stub. | **lower** (indirect self-report only) | **B** — four-face/twice-daily threshold unvalidated | [1, 4, 5]; no current check-in schema ([state.ts:6–15](../src/state.ts#L6-L15)) |
| `checkin_diurnal` | SELF | Same-local-day `morningFace − eveningFace`, face points, range −3…3. | Both morning and evening check-ins valid on the same actual local day; unmatched is missing. No borrowing across days or demo days. | **C: two-sided/excluded.** Classic morning-worse is lower, evening-worse reverses. | **C** | [2, 3] |
| `card_mood` | SELF | Creation-time mood integer 0–3 on each user card; per-day median of eligible creation events. | Non-seed cards still present in the replayed visible collection, with an explicit creation mood, not later color cycling. An edited or deleted card's historical creation score is not resampled as a new check-in. Entire card is excluded if immediately or later flagged by local phrase/service logic. Never inferred from color/reply/text. | **lower** (event-contingent, indirect self-report) | **B** | [1, 4, 5]; [reflect/index.ts:480–494](../src/reflect/index.ts#L480-L494); [model.ts:23–55](../src/reflect/model.ts#L23-L55) |
| `phq2_weekly` | ANCHOR | Sum of the two original 0–3 answers, integer 0–6 for this market-truck administration. | Both items must be answered in their original wording and recall period; otherwise missing. Kept in a separately labelled anchor stream, not a scored measure. | Higher = more reported symptoms in the last two weeks; **not a drift direction and not diagnosis/relapse**. | **N/A anchor** | [6] |
| `leave_threshold` | REWARD/EFFORT | Arithmetic mean of integer `lastObservedYield` immediately before each voluntary after-harvest `venture_action chosenAction = move`; unit = consumer produce per Move, then one value per round. Zero after an observed result is a valid observed zero. | Production v3 replay valid; `voluntaryLeave = true`, `leaveKind = after_observed_harvest`, matching occurrence/action. Require ≥2 eligible Moves in a full 180-second round, all relevant visibility/background gaps ≤20s, and same protocol lineage/plant. Before-first, Expiry, cancel, forced/admin ends are excluded. | **Higher**, exactly the supplied paper's MDD direction; experimental analogue only. **Not lower/faster/simple persistence.** | **B** — single/indirect, protocol-limited; no daily/clinical transfer. **C (excluded) if requiring universal cross-task direction** | [8–10]; [index.ts:756–783](../src/venture/index.ts#L756-L783); [events.ts:297–343](../src/venture/events.ts#L297-L343) |
| `harvest_latency` | REWARD/EFFORT | `nextHold.choiceAt − previousResult.rewardDisplayedAt` in milliseconds; median of eligible intervals within the same occurrence and with no intervening Move. | ≥2 eligible intervals in a valid production round; same direct parent result and next accepted continuous hold; no intervening Move/destination; all intervals and relevant hidden/offscreen gaps ≤20s; no restored/test/corrupt rounds. Unanswered final result is right-censored, not a latency. | **C: higher was only an assumption; do not score.** | **C** | [8, 11, 12]; [index.ts:602–648, 687–746](../src/venture/index.ts#L602-L648) |
| `round_completed` | REWARD/EFFORT | 1 iff a production round ran its full `durationMs = 180000` and ended by valid `time_expired` expiry; 0 iff a confirmed started production opportunity did not satisfy that full-round condition. Administrative end/no start is missing, not zero. | Must parse exactly one valid start/end and not duplicate recovery. `day_changed`, `invalid_state`, v2, test overrides, or missing start cannot count as a completed full round, but a confirmed started day with those non-full outcomes can carry descriptive 0 without serving any health direction. | **C: presence only; no direction.** | **C** | [18, 19, 24]; [events.ts:420–454](../src/venture/events.ts#L420-L454) |
| `first_key_latency` | PSYCHOMOTOR/TYPING | Epoch ms from new empty Reflect editor `focus` to its first content-producing `beforeinput`; one value per new draft-initiation occasion. | Exclude autofocus, restoring old drafts, repeated focus, camera navigation, edits of existing cards, test/seed content, non-text insertion, IME/composition/autocorrect dictation/virtual paste as appropriate. Require matching focus and first input, and each relevant hidden gap excluded. No key identity/content may be logged. | **C: higher only assumed; unsupported and excluded.** | **C** | [17] |
| `interkey_median` | PSYCHOMOTOR/TYPING | Median adjacent content-producing input timestamp differences within one composition, milliseconds. | ≥20 eligible text-producing events/intervals in the same draft; omit intervals >5,000ms as pause boundaries, IME/composition/autocorrect/paste bulk insertion, card edits, and corrupted clocks. Only timing and coarse event class retained, never characters or key codes. | **C: two-sided/statistic-dependent; excluded.** Higher 95th-tail pausing differs from higher median evidence. | **C** | [11, 12] |
| `words_per_card` | ACTIVATION | Count Unicode letter/number tokens in creation text using `/[\\p{L}\\p{N}]+(?:['’\\-][\\p{L}\\p{N}]+)*/gu`; one integer per card. No text is copied into the measure stream. | Non-seed, creation-time exact text; entire immediately/later flagged card excluded. A photo-only card has observed 0 words but may be intentionally text-free and therefore cannot be interpreted clinically. Never use reply text or edited duplicates. | **C: contrary/two-sided; lower is not supported.** | **C** | [13, 14]; tokenizer pattern is visible in [reply.ts:25–27](../src/reflect/reply.ts#L25-L27), but no free text is exported by the derivation |
| `photo_task_done` | ACTIVATION | 0/1 for each genuinely visible `kind = photo` prompt opportunity: 1 iff a committed non-seed card with that prompt ID has an attached photo by opportunity end. Daily mean only over resolved opportunities. | A prompt display must actually be logged. Draft capture does not count. `card_created.photo` or exact later attachment counts once. Camera availability/failure, seed, and flagged entries stay distinct. 0 only when opportunity exposure and end are known; unseen/missing opportunity is missing. | **C: presence/engagement only; lower completion has no direction.** | **C** | [15]; [prompts.ts:1–4](../src/reflect/prompts.ts#L1-L4) |
| `first_open_time` | RHYTHM | Minutes after local midnight of the first real `app_open` on a real local day, with offset/time-zone context. | Reload count is allowed as product event but must be recorded. No open is invalid/unobserved, never midnight. Demo Skip/reset and fabricated timestamps excluded. No sleep/wake substitution. | **C: later only hypothesized from sensors, not this app; excluded.** | **C** | [11, 16]; [main.ts:99–105](../src/main.ts#L99-L105) |
| `last_activity_time` | RHYTHM | Minutes after local midnight of the final accepted non-administrative user event recorded on a real local day. | Must be a real semantic action, not a timer refresh, seed, test hook, `day_skipped`, or reset. No page-close/visibility completion ⇒ unknown end, never imputed midnight. | **C: later only; no universal valence.** | **C** | [11, 16]; event boundaries in [state.ts:17–22](../src/state.ts#L17-L22) |
| `winddown_start_time` | RHYTHM | Minutes after local midnight of first successful `winddown_played` on a real local day. | Resume/restart/sound change remains marked as such; first observed play only. No play is missing. Timer choice is not sleep, and natural completion is unknown if not logged. | **C: later only; not bedtime or sleep onset.** | **C** | [7, 16]; [winddown/index.ts:144–177](../src/winddown/index.ts#L144-L177) |
| `night_use` | RHYTHM | 1 if ≥1 accepted non-administrative user event has real local time ≥01:00 and <05:00 that day, else 0 only on reliably observed days; supplementary raw event count optional but not a health score. | Preserve actual local offset/time zone; seed/test/demo actions and corrupt logs excluded. No event does not prove sleep. | **C: more use/later or more irregular is not established clinically.** | **C** | [7, 11] |
| `regularity_sd_7d` | RHYTHM | Circular standard deviation, minutes, of `first_open_time` over the last 7 complete real days. Clock times use shortest-angle circular moments. | ≥4 valid first-open days in the seven; otherwise update invalid. Evaluate only same zone/offset epoch, not across Skip/reset. App coverage and reload structure are reported alongside. Not sleep-activity SD. | **C: larger deviation only as app-open irregularity; excluded as circadian signal.** | **C** | [7, 16, 24] |
| `valid_day` | ENGAGEMENT | 1 if at least one of four defined completions exists that day: Home `watered`, non-seed unflagged `card_created`, full v3 `round_completed = 1`, or first `winddown_done`. Else 0 only if a covered active day has none and no completion was possible but intentionally not taken. | Each definition is independently validated; duplicates/retries count once; administrative events and flags are not completions. No app coverage ⇒ missing, not 0. | **C: lower frequency is engagement only, not worse health.** | **C** | [11, 18, 22, 24]; [main.ts:75–77](../src/main.ts#L75-L77) |
| `panes_touched` | ENGAGEMENT | Number of distinct pane IDs with observed activity, 0–5: initial Home at `app_open` plus each changed `pane_view`; not time spent. | Initial Home must be included explicitly because no initial `pane_view` is emitted. Repeated tabs/reloads deduped within a day; no unknown initial pane inference after mid-session history unavailable. | **C: presence only; either direction confounded.** | **C** | [11, 18, 22, 24]; [main.ts:55–73](../src/main.ts#L55-L73) |
| `home_watering` | ENGAGEMENT | 1 iff at least one valid first completed `watered` for the local day, else 0 only on a confirmed covered active day with no completion. | Genuine five-second hold; repeat holds do not add counts. Invalid/hidden/blurred/cancelled attempts are excluded; no hold is missing on no-app days. Plant appearance is not an input. | **C: presence only; no contrary evidence.** | **C** | [18, 19, 24]; [home/index.ts:81–95, 132–174](../src/home/index.ts#L81-L95); [orchidRig.ts:11–27](../src/home/orchidRig.ts#L11-L27) |

### 3.2 Flagged-entry retrospective exclusion, without rewriting history

Append-only does not mean “all previously emitted values stay eligible.” For future derivation:

1. Compute a measure observation only after the entry's immediate flag status is resolved; a local immediate match never waits for a network response.
2. The authoritative drift reader replays source events, not a stale derived cache. If a later reply or edit makes the card flagged, **all measures derived from that entire card** become invalid in every recomputation, including earlier typing, mood, words, photo, and day engagement. No deletion of raw history is needed or allowed.
3. Never substitute a neutral mood or `flagged = false` when status is unavailable. A pending or failed reply leaves text-dependent observations unevaluated until the existing timeout/fallback status is known; fallback is not itself a flag.
4. The raw flag does not become a drift feature and is never displayed as diagnosis. Existing immediate support remains available independently of learning/quiet/steady states. Current code has both local phrase and server-seeded flags, including one seeded flagged example intended for the UI demo; seed data do not become a person's baseline ([reflect/model.ts:69–83](../src/reflect/model.ts#L69-L83)).

## 4. Supplied research protocol versus actual consumer v3

The older review describes v2; the redesign plan describes an intended button-click harvest state machine. Actual v3 differs from both in important ways. This table is authoritative for current implementation ([rules.ts](../src/venture/rules.ts), [rng.ts](../src/venture/rng.ts), [index.ts](../src/venture/index.ts), [events.ts](../src/venture/events.ts)).

| Decision dimension | Supplied paper (printed pages) | Actual current consumer v3 | Interpretive decision |
|---|---|---|---|
| Initial reward | Normal mean 10 apples, SD 1 (p. 6). | Independently seeded integer discrete uniform 8, 9, 10, 11, 12, intended equal probability (mean 10; population SD √2) ([rng.ts:56–63](../src/venture/rng.ts#L56-L63)). | **Not the paper's distribution.** Same nominal center only. Do not transfer variance, reliability, or threshold values. |
| Depletion | Multiplicative factor drawn from a beta distribution with mean 12% decay, rounded to whole apples; supplied article does not identify beta shapes or exact recurrence (p. 6 and review). | Listed factors [.80, .84, .88, .92, .96], rounded, then clamped so each positive reward falls at least one and eventually reaches 0 ([rng.ts:4–18, 56–74](../src/venture/rng.ts#L4-L18)). | **Not a recovered beta algorithm.** A five-point discrete set plus deterministic clamp changes trajectories and the last-yield distribution. Leaving yield is auditable but not study-comparable. |
| Display | The number returned after each harvest is displayed (p. 6). | Last result and total are visible; there is no exact next-yield preview in v3's accepted design. Decrement is invisible in the decorative stable model. | No-preview is conceptually closer to outcome uncertainty, but **reward generation/visible depletion is not matched.** Do not use leftover v2 forecasts or `leavingValue`. |
| Harvest input/timing | Two-second Harvest delay; reaction time is included within harvest time so it does not determine apple opportunity (Fig. 1B, p. 6). | A **fresh continuous whole-plant pointer/keyboard hold of 2,000ms from `choiceAt`**. Early release/movement cancels in memory; accepted action is generally logged at completed maturity; due is `choiceAt + 2000` regardless earlier decision prompt ([rules.ts:42–45](../src/venture/rules.ts#L42-L45); [index.ts:687–746](../src/venture/index.ts#L687-L746)). | **Major protocol mismatch.** It blends decision, motor/hold ability and cancellation/accessibility behavior, not the paper's two-keypress decision and RT-inclusive delay. Latency is not paper RT. |
| Travel/Move | Clearly signalled alternating 3s or 10s conditions; RT included; four counterbalanced blocks (p. 6). | One fixed consumer 3s Move condition. `scheduledReadyAt = max(promptedAt + 3000, choiceAt)` for Move, implemented as offscreen arrival ([rules.ts:34–45](../src/venture/rules.ts#L34-L45); [index.ts:542–567](../src/venture/index.ts#L542-L567)). | The shared “3s” label is not the research's two-condition manipulation. No between-condition thresholds can be recovered. Move is not an arrival decision; do not double count. |
| Session structure/training | Training with both travel times; four 7-minute blocks in one session; $0.01/apple monetary goal and up to about $30 (pp. 2, 6). | One absolute 180-second round per local or demo day; no research training, blocks, cash, or equivalent incentive; no tutorial profile currently; test overrides possible ([rules.ts:10–31](../src/venture/rules.ts#L10-L31); [index.ts:810–858](../src/venture/index.ts#L810-L858)). | **Different habituation, incentive and dose.** The paper's three-minute analysis used prefixes of the first long-travel block, not a validated standalone daily round. Consumer daily learning is unestimated. |
| Plant and depletion appearance | Fixed tree image with cumulative numerical decreasing outcome on repeated harvests; no exact next-yield forecast described. | Decorative stable green 3D plant remains; harvest highlight/flash and numeric yield show feedback, but economic depletion is undepicted. Multiple species, unlocks and visual novelty exist. | Users do not see inventory exhaustion (which is good—there is no forced leave), but they also lack a paper-identical visual/reward context. Species/novelty are confounds, not cosmetic nulls. |
| Voluntary Move and endings | Leave is a decision to travel to a fresh undepleted tree; analysis concerns observed reward before that decision. | Every accepted Move logs `voluntaryLeave: true`; last yield is attached at choice. Offscreen `travel_end` is separate. No target cap forces Move; zero reward does not force it ([index.ts:756–783](../src/venture/index.ts#L756-L783)). | **The raw last-observed-reward proxy is still meaningful as the same kind of reference-point proxy**, but exploratory only. It is not uninterpretable raw arithmetic; it is clinically unequated and not numerically comparable. |
| Supplement/software | Main article links to supplement and original software; the supplied seven pages do not contain all details needed for strict replication. | Consumer algorithm is explicitly versioned and auditable with seeds/RNG states, but it is invented, not reconstructed from the supplement ([rng.ts](../src/venture/rng.ts)). | Do not invent missing beta shapes, original action ordering, normal truncation/rounding, or hidden task behavior. |

### 4.1 What exactly the observed leaving value captures—and what it does not

`lastObservedYield` on an accepted voluntary after-harvest Move is the closest raw analogue to the paper's **last realized harvest before Leave**. It is not:

- a yield forecast, a depletion percentage, `nextYield`, v2 `leavingValue`, a normalized leaving point, or a psychometric reference point;
- arithmetic between `roundYield`, total collected or rate — these depend on number and timing of holds;
- equivalent to `harvest_latency`, which measures the next return to work and may include reward appraisal and accessibility workflow, not an economic threshold;
- numeric evidence that a person has MDD, anhedonia, a disturbed neural benchmark, or an emerging clinical state.

**Ending/censoring rules.**

1. `Move` before first result ⇒ structurally undefined (`null`), not zero, not included in the mean. Current replay enforces this distinction ([events.ts:324–340](../src/venture/events.ts#L324-L340)).
2. Valid observed zero after a real result remains a real zero; it is not missing.
3. `venture_round_end` from Expiry, `day_changed`, or `invalid_state` is not a voluntary leave and creates no leaving value. Round completion with a pending Move/Harvest also creates none ([index.ts:569–589](../src/venture/index.ts#L569-L589)).
4. `venture_harvest_cancel` (currently `reload_interrupted`) has no result, no RNG draw, and no leaving value ([events.ts:345–363](../src/venture/events.ts#L345-L363); [index.ts:667–685](../src/venture/index.ts#L667-L685)). An early release/offscreen cancellation may vanish in memory without an action event and is not a Move or valid zero.
5. `travel_end.arrived = false` is not a new voluntary leave. The accepted earlier Move remains exactly one leave decision if otherwise eligible; do not add another on arrival or use offscreen time as a separate leaving point ([events.ts:386–419](../src/venture/events.ts#L386-L419)).
6. Final result with no next hold is right-censored for `harvest_latency`; do not replace it with round end or 180s. Pending result is not zero reward.

### 4.2 Decision: same proxy-kind, exploratory only

Raw `leave_threshold` is **not uninterpretable**: its formula is well-defined and maps the paper's surface operational decision (observed reward just before Leave). But **consumer changes break transfer of construct and effect magnitude**. The most defensible conclusion is:

> It is a within-plant, versioned, last-realized-reward reference-point proxy for exploring software behavior. It is not the paper's assay and must not be described as a depression measurement. No fake clinical mapping is permitted.

## 5. Part 2–4 CONTRACT — reviewed, not yet implemented

Everything below is a proposed later implementation contract, **not current code or a generated outcome**. It preserves the user's thresholds as **unvalidated engineering/demo constants**, not clinical facts. Before writing code, main must resolve the event-schema contradictions in §7 and the approval question of whether the B leaving proxy may vote at all.

### 5.1 Pure derivation and append-only observations

Use one pure, deterministic, versioned derivation over the existing raw `garden.log` plus the separately identified launch check-in/PHQ anchor records. All measures share the minimal observation shape:

`{t, local_day, pane, type, value}`

- `t`: accepted observation's real epoch milliseconds (not the day the aggregator happened to run).
- `local_day`: real local day at observation plus explicit lineage for any demo calendar; never reinterpret an old timestamp with a later offset/time zone. Preserve source offset and zone in the source/provenance record.
- `pane`: owning product pane, not a clinical instrument.
- `type`: exact registry ID.
- `value`: exact scalar unit from §3. No score, z, family state, or arbitrary text in the observation.

The derivation must be pure for `(orderedRawEvents, registryVersion, configVersion) → same observations + same validity/reasons`. Append only generated observations; never rewrite/delete/prune raw events or replace a source value with a cleaned-up score. Late-arriving records require replay. **The minimal derived log is a cache, not authority**: replay validity from source raw events so retrospective flags/version incompatibility cannot leave a derived row active. An alternative is immutable observation plus append-only validity-reason projections; do not overload `value` with text, flags, or pseudo-clinical metadata.

Each valid observation must be traceable locally to a deterministic raw source type, source index/id, collection profile, and quality reason. These provenance details live in a separate derivation/provenance audit, not in free text or the minimal observation. Every day gets an explicit status: finalized-complete, incomplete/not-yet-final, unobserved, not-answered, structurally inapplicable, pending, censored, invalid, seed/test/demo, or context/version incompatible. Counts need an observed denominator, not just a numerator.

**Privacy and honesty constraints.**

- No journal text, replies, safety-plan prose, contacts, photo bytes/IDs, locations, or inference sent to a measurement backend. The measurement/local-export stream contains only explicitly selected numeric summaries. Existing Reflect content already has an inference-provider exception; the new measure path must not amplify or resend it ([reply.ts:66–78, 98–122](../src/reflect/reply.ts#L66-L78)).
- No keylogger and no raw keyboard content: no key names/codes, Unicode text, clipboard payload, IME text, writing history, or reconstructed content. Timing/classification only. Honor `input`/`beforeinput` without capturing text, and retain only coarse input classes needed for validity.
- No fake sensors: no sleep, HRV, steps, GPS, circadian phase, screen-on time, microphone/speech, passive emotion, wellbeing, or wearable output unless a real, user-opted integration and compatible validation exist. App-open/Wind down behavior must retain its product names.
- No user IDs, treatment labels, diagnoses, medical score, or automatic care recipient. Compute and keep on-device by default. Browser local storage is not represented as encrypted, tamper-evident, or durable health-record storage; current reads return `[]` on malformed JSON and current writes swallow quota failures ([state.ts:89–100](../src/state.ts#L89-L100)).

### 5.2 Per-measure baselines and signed robust distance

For each person, measure, lineage, and context:

1. **Formation epoch:** the first 14 complete, actual local days after collection begins for that lineage. A baseline never includes the current day and never spans reset, major UI/protocol change, travel/time-zone change, device/input-mode change, or an artificial Skip.
2. **Per-measure readiness:** require at least 7 valid daily aggregate values within those 14 days. A measure below seven remains ineligible; do not extend it quietly into decline experiences just to manufacture readiness. If a later explicit familiarization extension is wanted, it is a new named policy and needs fresh review.
3. **Global learning:** days 1–14 are `Learning`. After formation, if fewer than two distinct families have at least one B/A measure baseline-ready, stay `Learning / not enough independent measurement coverage`; this is honest abstention, not `Steady`. Optional channels can join only when their own valid baseline exists.
4. `m = median(B)` and `MAD = median(|x_i − m|)` over the frozen formation values B. Scaled MAD is `1.4826 × MAD`, a mathematical convention—not an assumption that sparse ordinal/app measures are normal ([source 27]).
5. Daily signed robust score for measure j with direction sign `s_j`: `z_j,d = s_j × (x_j,d − m_j) / max(1.4826 × MAD_j, floor_j)`. Use `s_j = +1` when higher is toward and `−1` when lower is toward. **Never calculate or use z for C or for the PHQ-2 anchor.**
6. **Off measure on day d:** rolling `[d−6, d]` contains ≥4 valid days and the median of those valid `z_j` values is strictly >1.5. The count is distinct local days, not event count or imputed values.
7. **Off family on day d:** at least one currently eligible **A or B** measure in the family is off. C never counts. Every family has at most one vote, irrespective of how many measures are off.

A formation baseline with very low spread is intrinsically unstable. A floor is merely an explicit escape from divide-by-zero/infinite change, not an empirical minimum detectable change. Any boundary conditions (`>` not `≥`) are part of the versioned contract.

### 5.3 State machine: Learning, Steady, Watching, Drift, Quiet

Evaluate only on finalized complete local days and after recomputing late source history. Use this precedence, after global learning is complete:

1. **`Drift`:** at least two **unrelated families are off on day d**, and that two-or-more-family conjunction is true on **at least 5 distinct days in `[d−6, d]`**. C and the anchor cannot satisfy either family. If current per-measure validity fails (<4 valid), the affected measure and its family are not off. Dropping below the two-family condition means the line no longer claims drift; no sticky clinical label.
2. **`Watching`:** the Drift conjunction is not satisfied, but at least one eligible A/B family is off on d. This includes one-family-off and the first 1–4 days of a new two-family conjunction. It is a low-level review hint, not “pre-relapse.” `watchEnterDelayDays = 0` is the initial provisional choice; no extra hidden watch delay is invented. Any later hold/clear delay belongs in central config and requires separate calibration.
3. **`Quiet`:** global learning is complete, Drift and Watching are unavailable, and fewer than 3 of the last 7 days have at least one valid value from a currently ready A/B measure. Quiet means **insufficient recent scored coverage**, not health/illness. **Never on silence:** a first-run/reset/no-baseline condition is `Learning`, not Quiet; Silence must not be rendered as Steady, Watching, Drift, or evidence of no problem. For later no-open test data, Quiet can appear only after a previously valid baseline/state exists and the `<3 valid days last7` condition holds.
4. **`Steady`:** global learning is complete and at least 3 of the last 7 days have valid scored coverage, but no eligible family is off. Wording must not imply that all is well or relapse is excluded.
5. **`Learning` remains default** for insufficient formation, incompatible versions, reset/new lineage, fewer than two baseline-ready score families, or unevaluable current context. A separate issue/data-quality explanation may accompany any state and must not turn into an off-family vote.

**Multiple comparisons and abstention.** Repeated overlapping windows are not independent alerts. More measures/families and more daily tests create more opportunities for chance conjunctions; two changed families does not solve multiplicity. Family “off” calls for jointly coherent structure must be calibrated on fixed non-drift logs, not invented as p-values. Longitudinal dependence, correlated channels, missingness, and local context require abstention instead of a hidden significance claim ([sources 23, 24, 25]).

### 5.4 One central configuration marked `UNVALIDATED`

Do not scatter thresholds. Version the whole configuration and record it with every computed status/export. Initial values are demonstration choices, not facts.

| Group | Constants |
|---|---|
| Formation/current coverage | `baselineDays = 14`, `baselineMinValidDays = 7`, `currentDays = 7`, `offMinValidDays = 4` |
| Trigger/coherence | `offMedianDirectionalZ > 1.5`, `driftFamilies = 2`, `driftDaysWithin7 = 5`, `watchEnterDelayDays = 0`, `quietMinValidDays = 3` |
| C/anchor | Always excluded globally, regardless of any other parameters |
| SELF floors | `faceSpanPoints = 0.25` for check-in/card; diurnal is C so no scored floor |
| Venture floors | `leaveYieldFloor = 0.5` consumer produce; `harvestLatencyFloorMs = 50` is C descriptive-only, not scored |
| Typing floors | `firstKeyFloorMs = 250`, `interkeyFloorMs = 50`, both C descriptive-only |
| ACTIVATION floors | `wordCountFloor = 1` token and `photoRateFloor = 0.10`, both C descriptive-only |
| RHYTHM floors | `clockFloorMinutes = 15` for first/last/Wind down times and `regularityFloorMinutes = 5`, all C descriptive-only |
| Rounding | Computational only; no z numbers or z-derived colors displayed anywhere |

There are no universal clinical floors. The face floor is particularly arbitrary for ordinal categories, binary measures cannot be treated as Gaussian, and no simulation result establishes a true false-alarm rate or clinically relevant change.

### 5.5 Independence, lifecycle, missingness, practice, and anchor governance

1. **Correlation/independence:** family labels are predeclared lineages, not statistically independent measurements. C excludes shared app events, Home, and pane interactions. SELF creation mood and launch responses share response style. Venture yield, latency, completion, and RNG share experimental context. Do not sum z-values, multiply votes, or claim a Bayes factor. Repeated anomaly co-occurrence in healthy controls makes this especially important ([source 25]).
2. **Practice/learning:** first 14 days is a guardrail, not proof habituation ends. Foraging has demonstrated environment learning [source 9]; survey completion can speed with familiarity [source 17]; typing changes by time of day and age [source 12]. Record exposure count, prompt/input route, plant/unlock/novelty, and game version. Do not claim “steady state was achieved.”
3. **Lifecycle:** need explicit focus/blur/visibility start/end/session context to distinguish background from deliberation, offscreen round recovery, device sleep, storage corruption, reload, and notification-driven use. Current schemas lack complete coverage; current 20-second rule cannot be made honest using only event gaps. Until then affected measures remain invalid, not approximated.
4. **Missingness:** a zero-valued observation is different from not answered/not used/not available/pending/censored/invalid. Missingness does not impute, forward-fill, or linearly interpolate mood or sensor values. Sleep interpolation from log timestamps is prohibited. Use negative controls and context annotations volunteered by the user ([sources 18, 19, 24]).
5. **Demo/day controls:** retain both real `t` and real `local_day`, and store demo offset/provenance. Kick out Skip, reset, test overrides, seeded cards, query/dev days, and artificial compressed sessions from real measurement. Demo-derived values never enter user/raw baselines.
6. **PHQ-2 anchor:** independently show raw total and response day, plus an honest overlap explanation and optional user-chosen summary. It never auto-escalates. A clinician-contact button opens only user-selected plan/contact details; no automatic call, notification, algorithmic referral, or “risk” label. Any supportive resource remains available without permission from drift.
7. **State abstention:** stop affected comparison on reset, corrupt/conflicting replay, new version, timezone/context/device shift, fake/synthetic values, or unknown day coverage. Missing output is preferable to an invented signal. No score maximization or opportunistic feature swaps to reach two families.

### 5.6 Fixed-seed, 90-day simulation plan (for later—not a result generated now)

Use deterministic **persona-defined logs**, not seeds searched or optimized until a desired outcome appears. No per-persona best-of-seed selection, threshold fitting, or score maximization. Freeze the state machine and persona logs before running. Non-C data uses only valid versions and actual semantic timestamps; invalid, duplicate, late, or out-of-order cases are separate fixtures rather than noise added at random.

Every run must print, for **each persona**, `dayOfFirst(learning)`, `dayOfFirst(steady)`, `dayOfFirst(watching)`, `dayOfFirst(drift)` or `never`, and `dayOfFirst(quiet)` or `never`, plus total days in each state, number of family-off changes, off families, off measures, and current coverage/denominators at each transition. Dates in the table below are **assertions to evaluate**, not fabricated observed outputs.

| Persona | Log pattern fixed before run | Expected assertions |
|---|---|---|
| `stable` | 90 days of regular, version-compatible two-family observations with no directional shift and ordinary small within-baseline variation. | `learning → steady`; zero drift; **≤1 watching day in 90**; no state triggered by a single odd measure; no unsupported C vote. No false multi-family coherence beyond that single permitted watch event. |
| `noisy-never-drift` | Same coverage but predeclared heavy-tailed/outlier observations, including isolated simultaneous anomalies and variable “bad” and “good” noise. No sustained directional component. | Any watching events are printed and auditable; **never drift in 90 days**; no removing C outliers after seeing results; visibly demonstrates uncorrected multiple comparisons and overlapping windows. |
| `three-bad-and-recover` | Three consecutive clearly directional bad days in only one family (or simultaneous two-family shift for only 3 days), then full recovery to previous baseline. | May enter `watching`, **never `drift`**; subsequently returns toward `steady`, subject to coverage; total watch episodes and state transitions printed. Confirms 5-of-7 persistence is necessary and that recovery is not relabelled drift. |
| `three-week-decline` | 21 consecutive days of sustained, compatible, directional change in at least two unrelated A/B families, after baseline. Values are sufficient to cross `offMedianDirectionalZ > 1.5`. | First two-family-off day printed; **first `drift` within 14 days after the rules first permit the two-family-off conjunction and both measures have ≥4 valid days**. Expected minimum persistence is five distinct qualifying days, so earliest possible drift day is exactly four calendar days after that conjunction if those five days end then. Before that, watching is permitted. This tests detection of explicit synthetic input, not clinical sensitivity. |
| `quiet-no-opens` | First establish a valid ready baseline, then introduce ≥7 consecutive days with no opens/valid measures. Also a fresh-install-no-opens control. | After four consecutive no-open days, the last-seven valid-day count normally drops below 3, so **the fifth consecutive no-open day should be `quiet`** in the basic full-coverage fixture. No watching/drift on silence. Fresh install with no baseline remains `learning`, never `quiet`; exact first states printed rather than hard-coded without the aggregation logic. |

Supporting fixed fixtures must independently cover: zero MAD with one changed day; a stable all-identical baseline; exactly z = 1.5 (not off); 3 vs 4 current valid days; 4 vs 5 drift days; family A/B vs C; the same raw event counted twice; two card moods still one SELF family; PHQ-2 high but no vote; immediate and late flagged card exclusion; skip/reset/DST/time-zone split; demo compressed round ineligibility; v2/v3 migration; initial/Moves-before-first-harvest null vs observed zero; expiry/cancel/travel nonarrival; >20s actual background vs long deliberation; late out-of-order events; renamed schema versions; storage corruption and append failure.

**Interpretation is constrained to software behavior.** Sensitivity/specificity, PPV/NPV, clinical thresholds, confidence, clinical precision, or improvement/recovery rate must not be reported from these synthetic personas. The simulation proves only that the deterministic contract behaves as intended on constructed data.

### 5.7 My line: exact copy and presentation

Use plain language with neutral, non-red colored dots plus text labels and the actual check-in face mouths, so color is never the only cue [reflect/moods.ts](../src/reflect/moods.ts). **No z values, confidence percentages, red risk states, scores, push notifications, relapse labels, or medical iconography.**

#### Permanent heading and one-line boundary

> **My line**
>
> Recorded changes from your own baseline. Not a diagnosis or a prediction of relapse.

#### State text

- **Learning**
  > **Learning your usual patterns.** The first 14 days are for building a baseline. Nothing is being inferred yet.
- **Steady**
  > **Close to your usual patterns.** Recent valid records do not cross the review rule. This does not rule out feeling worse.
- **Watching**
  > **One part of your routine has shifted.** This may be worth a look. One unusual day or measure does not make drift.
- **Drift**
  > **Two or more parts of your routine have stayed different from your usual. This may be worth showing care team.** Many things can cause these changes; this is not a diagnosis or a prediction of relapse.
- **Quiet**
  > **Not enough recent data to compare with your usual.** No wellbeing inference has been made.

The seventh word-for-word drift clause `may be worth showing care team` is intentionally preserved. Do not silently replace it with “you are relapsing” or “contact your doctor now.”

#### Plain family names and display rules

Show short labelled status rows, not technical IDs:

- `How you report feeling` — includes launch faces and card faces, one vote.
- `Choices in the foraging game` — experimental consumer analogue only; yield and latency are described, not equated to paper apples or clinical reference points.
- `Writing timing` — C context only; never used for drift.
- `Words and photo prompts` — C context only; never used for drift.
- `Times you use Garden` — C context only; never called sleep/circadian rhythm.
- `Using Garden and watering` — C context only; not global wellbeing.
- `Market-truck check-in (PHQ-2)` — a separate anchor, **never part of My line**.

Only A/B family dots can change state. C dots remain a fixed passive/neutral style with “context only, not used.” Every active family explanation contains current valid coverage and raw language, e.g. “Your recent last harvests before Move were higher on your scale than your baseline.” No z and no implication that a face is depression. Include “What was not measured” alongside unavailable or C sources.

#### Sharing: one user-controlled page

On explicit local action, render **one page, offline, for review before any OS share/download action**:

- date/day range and the exact state sentences above;
- each included family's plain name, raw current aggregate, raw baseline median, valid-day counts (current seven and first 14), and the reason/units/caveats in §3;
- C-context items only if the user separately selects them, clearly labelled “not used for drift”;
- an optional separate PHQ-2 anchor block with raw 0–6 totals and the two-week recall warning, included only on explicit opt-in;
- one static statement: “Recorded app behavior and self-reports can change for many reasons. This is not a diagnosis, a severity score, or a prediction of relapse.”
- an **opt-in** “Include my plan and selected contacts” area using the existing local plan store. Default off; no plan text, names, or numbers appear without this second action. Contacts are shown as where a `tel:` link may lead, never as a completed call or reached person.
- no source journal text, replies, photos, raw flags, keyboard history, full logs, z values, or hidden care-team upload. Nothing leaves the device automatically. Print/export is only after the user reviews this page. Previous exports cannot be remotely recalled.

### 5.8 Seeded demonstration: `Steady → Watching → Drift` in under one minute

Use only a separately namespaced **synthetic fixture** supporting two permitted A/B lineages. Its values are designed by the persona table; do not search real logs or outcomes to make a dramatic demo.

1. Show a bold **Demo** heading throughout. Include “Synthetic data · not your records · not a health signal.”
2. Preload a 14-day, per-measure-valid synthetic baseline. Start at `Steady` for up to 15 seconds.
3. Advance valid daily aggregates in one A/B family to make it off without two-family persistence: `Watching`.
4. Advance the second unrelated family over a fast-forwarded five-of-seven history. Show two-family `Drift`, including the required sentence. Target is **under 60 seconds total**, not compressed real events pretending to be timestamps in the actual dataset.
5. Keep **Skip** and **Reset** only under that Demo heading. They affect demo playback/fixture state only. Skip moves to the next scripted stage; Reset clears just the synthetic demo store. They do not call the real `skipDay`, do not change real `garden.dayOffset`, do not write fake events into `garden.log`, and never mix real baseline entries, plan data, flags, or PHQ-2 data into the playback.
6. Demo sharing remains local and visibly synthetic. There is no deployment, notification, or care-team transfer.

## 6. Every place the prompt is stronger than the evidence

This section is part of the approval decision, not a footnote.

1. **Causal association:** the supplied paper reports a case/control association and contemporaneous severity correlation. It does not show that an elevated leaving point causes depression, that depression causes it, or that changing the behavior changes health [source 8]. No primary source supports causal attribution of a Garden measure.
2. **Direction and clinical applicability:** a directional result in one task, cohort, and moment does not establish the same direction in a home adaptation or an individual's sustained change. Related foraging work found lower thresholds with greater depression [source 10], and the larger BiAffect sample found shorter median delay at higher PHQ-8 [source 12]. Consumer v3 changes reward, timing, interaction, incentive, practice, species, and opportunity. No numeric clinical mapping survives intact.
3. **Measurement independence:** SELF vote/check-in/card are not independent people or instruments; Venture measures share game context; app activity is mechanically shared with all panes. Two thresholds crossing simultaneously is temporal coherence, not independent proof. Non-overlapping fields do not imply statistical independence. Paired anomalies also happen in controls ([source 25]).
4. **PRACTICE effects and timing:** a fixed first-14-days baseline does not establish stability absent novelty. Foraging opportunity cost is learned [source 9]; survey response times can speed with familiarity [source 17]; card prompts and new plant unlocks change opportunity; typing has marked time-of-day and age effects [source 12]; repeated EMA can change burden/reactivity [sources 1, 19, 24]. A weekday, time-of-day, season, treatment change, or app version can mimic the target direction. The prompt does not establish stable measurement periods, dose equivalence, or a cross-day minimum detectable change.
5. **PHQ-2 is not a relapse or drift instrument here:** it is a brief screener over the prior two weeks, with validated discrimination in a general clinical sample. A weekly market-truck schedule does not establish weekly sensitivity to change, adjudicated relapse ground truth, or safe automated action ([source 6]). It must remain an anchor rather than a drift channel or an escalation trigger.
6. **Wearable/log interpolation and sensor fakes:** actigraphy-relative activity and Fitbit-estimated sleep have different constructs and quality controls from app timestamps [sources 7, 16]. Using first open, last event, Wind down start, 01:00–05:00 usage, or their SD to claim sleep/circadian disturbance is an inferential jump. Current repository does not connect a wearable, accelerometer, GPS, HRV, or HealthKit/Health Connect. Such values must not be fabricated.
7. **Twice-daily self-report burden and repetition:** frequent affect measurement is feasible in some samples but missingness, response burden, reactivity, and anchoring still matter [sources 1, 19, 24]. Current-affective-disorder participants in one two-week, five-per-day study had slightly higher burden while maintaining high adherence, which does not generalize a sustainable twice-daily consumer routine. Asking mood at launch and on each card also makes channels non-independent and may shape selection. Burden and acceptability need user research, not assumed compliance.
8. **No longitudinal relapse validation of the Garden rule:** the supplied foraging study calls for longitudinal recovery work itself. Existing actigraphy/relapse studies use much longer follow-up, quality-controlled sensor features, validated symptom scales, and adjudicated outcomes; their algorithms and thresholds are not transferrable to this registry [sources 7, 18]. The first-14-days baseline, seven valid days, MAD floor, z > 1.5, four valid days, 5/7 persistence, quiet threshold, and watching delay are unvalidated engineering choices. No evidence supports a clinical 5/7 rule or a specific day-of-onset.
9. **Simulation is illustrative only:** 90 days of personas can test deterministic logic and expected failure modes, but they cannot estimate sensitivity, specificity, PPV/NPV, clinical duration, false-alarm burden in real people, or the probability of recovery. A seeded steady/watching/drift transition demonstrates UI behavior, not a clinical phenomenon. Artificial Skip/demo time is not human longitudinal time.
10. **Project demonstration versus future validation:** what can be shown now is a transparent local aggregation, raw definitions, C suppression, abstention, user-controlled export, and software assertions. Future work needs a preregistered frozen protocol; real opt-in longitudinal use; version/device/context histories; practice and burden measurement; repeated independent symptom measures; a stable/remitted reference period including treatment changes; prospective outcomes with adequately dense timing and independent clinical adjudication; chronological/person-level holdout; missingness and false-output reporting; subgroup/device analysis; and eventually evaluation of whether a user-chosen response helps without harm. No demo should represent that sequence as already accomplished ([sources 7, 18, 20, 21]).

## 7. Approval blockers and event-schema contradictions for main to fix next

These are implementation prerequisites, **not edits made by this review**.

1. **No launch check-in or PHQ-2 event exists.** Current `state.mood` is described as a console stub, not a timestamped answered morning/evening launch response ([state.ts:6–15, 111–113](../src/state.ts#L6-L15)). Add a real versioned answered/opportunity lifecycle before scoring; do not score the stub.
2. **The redesign plan and older audit are stale about current Harvest.** Actual current interaction is a continuous hold with reload interruption cancellation, not a simple two-button Harvest window [rules.ts:42–45; index.ts:687–746]. The measurement contract must use current source or explicitly change/reapprove product behavior; it must not pretend plan semantics already hold.
3. **No honest 20-second background-gap coverage exists.** `window.blur/pagehide`, recoveries, and `restored` exist for Venture, but there is no complete visibility interval stream [index.ts:1077–1084; main.ts:93–98]. Event gaps are not background gaps. Until lifecycle telemetry exists, affected `leave_threshold` and `harvest_latency` rounds remain invalid rather than accidentally passing.
4. **Early hold cancellations are not fully logged.** Accepted action/result timing exists, but many early pointer/keyboard cancellations clear only memory [index.ts:743–753, 1024–1067]. Reconstructing every start, cancellation, retry, and hold choice is necessary for latencies and censoring; first/last accepted action is insufficient.
5. **Typing timestamps/coverage are absent.** Reflect has input handlers but no focus-start and timestamp-only content-input event suitable for `first_key_latency` or median interkey. Existing logs contain full card text and edit history, which are too sensitive to co-opt as a new timing stream [reflect/index.ts:129–149, 367–429]. Add a local no-content timing channel with the exclusions above; do not log key identities.
6. **Photo opportunity is deliberately not instrumented.** Current prompt is explicitly “never a task,” with no log proving the prompt was seen; shuffle events alone are not denominator-complete [prompts.ts:1–4; reflect/index.ts:86–107, 141–149]. `photo_task_done` requires an actual view/opportunity lifecycle and a later committed attachment. It must stay C even after instrumentation.
7. **Lifecycle/dwell is incomplete.** Initial Home has no `pane_view`, no matching pane leave or reliable close event exists, natural Wind down expiry is not logged, and last-activity only means last **observed** action [main.ts:55–73, 91–105; winddown/index.ts:120–177]. These cannot become stay-time, sleep, session-length, or passive-circadian metrics.
8. **Raw day and context are fragile.** Existing envelope has epoch `t` and demo offset `d`, but no complete original time-zone/session/lifecycle record; Skip changes dates without changing real elapsed behavior [state.ts:17–22, 49–70]. Keep real/demo calendar and context lineage explicit; no compression into the 90-day evidence claim.
9. **Flags are not single immutable creation fields.** Current status may be local immediate or arrive from a service/model and remains frozen to the original reply, while text is editable [reflect/model.ts:23–55; reflect/index.ts:441–477]. Pure replay must handle immediate/later flags and exclude entire cards, but never relabel flags as diagnoses.
10. **Append-only and storage reliability are weaker than the comment suggests.** `garden.log` is reread and rewritten to one localStorage array; malformed JSON becomes `[]`, and write errors are swallowed [state.ts:89–100]. A pure/append-only derivation needs known failure reporting, atomic/durable sequencing or acknowledged local limitations, deterministic IDs/replay, and no silent interpretation of unavailable days as healthy/no-data-zero.
11. **Consumer reward semantics must remain versioned and per plant.** Current stochastic recurrence, hold interaction, occurrence transitions, RNG/state, and test overrides cannot be numerically mixed with v2, research apples, another species, or future timing rules [rng.ts:4–18; rules.ts:3–31; events.ts:127–170]. `leave_threshold` automatically fails any comparison that does not preserve these identifiers.

## 8. Numbered sources

All URLs are direct DOI, PMID, or full-text primary-study links. Local artifact references appear beside the specific claims above.

1. Tamm J, Takano K, Just L, Ehring T, Rosenkranz T, Kopf-Beck J. **Ecological Momentary Assessment versus Weekly Questionnaire Assessment of Change in Depression.** *Depression and Anxiety* 2024;2024:9191823. doi:10.1155/2024/9191823. PMID:40226649. https://pmc.ncbi.nlm.nih.gov/articles/PMC11919112/
2. Aggestrup AS, Svendsen SD, Nørregaard L, et al. **Electronic self-monitored morning depression scores are related to sleep timing and sleep length in depressed patients.** *npj Biological Timing and Sleep* 2026;3:40. doi:10.1038/s44323-026-00100-5. https://www.nature.com/articles/s44323-026-00100-5 (full text also at https://pmc.ncbi.nlm.nih.gov/articles/PMC13534645/)
3. Morris DW, Rush AJ, Jain S, et al. **Diurnal mood variation in outpatients with major depressive disorder: implications for DSM-V from an analysis of the Sequenced Treatment Alternatives to Relieve Depression (STAR*D) study data.** *Journal of Clinical Psychiatry* 2007;68:1339–1347. PMID:17915971. https://pubmed.ncbi.nlm.nih.gov/17915971/
4. Silk JS, Forbes EE, Whalen DJ, et al. **Daily emotional dynamics in depressed youth: a cell-phone ecological momentary assessment study.** *Journal of Experimental Child Psychology* 2011;110(2):241–257. doi:10.1016/j.jecp.2010.10.007. PMID:21112595. https://pmc.ncbi.nlm.nih.gov/articles/PMC3061240/
5. van Rijsbergen GD, Bockting CLH, Berking M, Koeter MWJ, Schene AH. **Can a one-item mood scale do the trick? Predicting relapse over 5.5-years in recurrent depression.** *PLoS One* 2012;7(10):e46796. doi:10.1371/journal.pone.0046796. PMID:23056456. https://pmc.ncbi.nlm.nih.gov/articles/PMC3463530/
6. Kroenke K, Spitzer RL, Williams JBW. **The Patient Health Questionnaire-2: validity of a two-item depression screener.** *Medical Care* 2003;41(11):1284–1292. doi:10.1097/01.MLR.0000093487.78664.3C. PMID:14583691. https://pubmed.ncbi.nlm.nih.gov/14583691/
7. Tonon AC, Nexha AA, Cunningham JEA, et al. **One-Year Actigraphy Study of Sleep and Rest-Activity Rhythms as Markers of Relapse in Depression.** *JAMA Psychiatry* 2026 (online 11 February). doi:10.1001/jamapsychiatry.2025.4453. PMID:41670991. https://pubmed.ncbi.nlm.nih.gov/41670991/
8. Vittala A, Wu L, Yan D, et al. **Decisional reference point pathology: A cognitive mechanism for and a correlate of major depressive disorder in humans.** *PNAS* 2026;123(21):e2518826123. doi:10.1073/pnas.2518826123. PMID:42150067. **Direct supplied source:** the paper (not included in this repository), especially Fig. 1B and Fig. 2 (printed pp. 2–4), Discussion and Foraging Task (pp. 4–6). DOI landing page: https://doi.org/10.1073/pnas.2518826123
9. Constantino SM, Daw ND. **Learning the opportunity cost of time in a patch-foraging task.** *Cognitive, Affective, & Behavioral Neuroscience* 2015;15(4):837–853. doi:10.3758/s13415-015-0350-y. PMID:25917000. https://pmc.ncbi.nlm.nih.gov/articles/PMC4624618/
10. Bustamante LA, Barch DM, Solis J, et al. **Major depression symptom severity associations with willingness to exert effort and patch foraging strategy.** *Psychological Medicine* 2024;54(15):4396–4407. doi:10.1017/S0033291724002691. PMID:39618329. https://pmc.ncbi.nlm.nih.gov/articles/PMC11650159/
11. Zulueta J, Piscitello A, Rasic M, et al. **Predicting mood disturbance severity with mobile phone keystroke metadata: a BiAffect digital phenotyping study.** *Journal of Medical Internet Research* 2018;20(7):e241. doi:10.2196/jmir.9775. PMID:30030209. https://pmc.ncbi.nlm.nih.gov/articles/PMC6076371/
12. Vesel C, Rashidisabet H, Zulueta J, et al. **Effects of mood and aging on keystroke dynamics metadata and their diurnal patterns in a large open-science sample: a BiAffect iOS study.** *JAMIA* 2020;27(7):1007–1018. doi:10.1093/jamia/ocaa057. PMID:32467973. https://pmc.ncbi.nlm.nih.gov/articles/PMC7647317/
13. Menne F, Dörr F, Schräder J, et al. **The voice of depression: speech features as biomarkers for major depressive disorder.** *BMC Psychiatry* 2024;24:794. doi:10.1186/s12888-024-06253-6. https://link.springer.com/article/10.1186/s12888-024-06253-6
14. Hur JK, Rutledge RB. **Language sentiment predicts changes in depressive symptoms.** *PNAS* 2024;121:e2321321121. doi:10.1073/pnas.2321321121. PMID:39284070. https://pubmed.ncbi.nlm.nih.gov/39284070/
15. Dean RL, Orchard F, Pile V, Lester KJ. **“When I picture myself, I just see black and white and dull”: a photo-elicitation study exploring mental images of the self in young people with depression.** *BMC Psychiatry* 2025;25:642. doi:10.1186/s12888-025-07072-z. PMID:40597068. https://link.springer.com/article/10.1186/s12888-025-07072-z
16. Zhang Y, Folarin AA, Sun S, et al. **Longitudinal assessment of seasonal impacts and depression associations on circadian rhythm using multimodal wearable sensing: retrospective analysis.** *Journal of Medical Internet Research* 2024;26:e55302. doi:10.2196/55302. PMID:38941600. https://pmc.ncbi.nlm.nih.gov/articles/PMC11245656/
17. Torous J, Staples P, Barnett I, et al. **Characterizing the clinical relevance of digital phenotyping data quality with applications to a cohort with schizophrenia.** *npj Digital Medicine* 2018;1:15. doi:10.1038/s41746-018-0022-8. PMID:31304300. https://www.nature.com/articles/s41746-018-0022-8
18. Matcham F, Leightley D, Siddi S, et al. **Remote Assessment of Disease and Relapse in Major Depressive Disorder (RADAR-MDD): recruitment, retention, and data availability in a longitudinal remote measurement study.** *BMC Psychiatry* 2022;22:136. doi:10.1186/s12888-022-03753-1. PMID:35189842. https://pmc.ncbi.nlm.nih.gov/articles/PMC8860359/
19. van Genugten CR, Schuurmans J, Lamers F, et al. **Experienced burden of and adherence to smartphone-based ecological momentary assessment in persons with affective disorders.** *Journal of Clinical Medicine* 2020;9(2):322. doi:10.3390/jcm9020322. PMID:31979340. https://pmc.ncbi.nlm.nih.gov/articles/PMC7073581/
20. Vairavan S, Rashidisabet H, Li QS, et al. **Personalized relapse prediction in patients with major depressive disorder using digital biomarkers.** *Scientific Reports* 2023;13:18596. doi:10.1038/s41598-023-44592-8. https://www.nature.com/articles/s41598-023-44592-8
21. Langener AM, Stulp G, Jacobson NC, et al. **It's all about timing: Exploring different temporal resolutions for analyzing digital-phenotyping data.** *Advances in Methods and Practices in Psychological Science* 2024. doi:10.1177/25152459231202677. https://journals.sagepub.com/doi/10.1177/25152459231202677
22. Stamatis CA, Meyerhoff J, Meng Y, et al. **Differential temporal utility of passively sensed smartphone features for depression and anxiety symptom prediction: a longitudinal cohort study.** *npj Mental Health Research* 2024;3:1. doi:10.1038/s44184-023-00041-y. https://www.nature.com/articles/s44184-023-00041-y
23. Barnett I, Torous J, Staples P, et al. **Relapse prediction in schizophrenia through digital phenotyping: a pilot study.** *Neuropsychopharmacology* 2018;43:1660–1666. doi:10.1038/s41386-018-0030-z. PMID:29511333. https://pmc.ncbi.nlm.nih.gov/articles/PMC6006347/
24. Currey D, Torous J. **Increasing the value of digital phenotyping through reducing missingness: a retrospective review and analysis of prior studies.** *BMJ Mental Health* 2023;26(1):e300718. doi:10.1136/bmjment-2023-300718. PMID:37197799. https://pmc.ncbi.nlm.nih.gov/articles/PMC10231441/
25. Henson P, D'Mello R, Vaidyam A, Keshavan M, Torous J. **Anomaly detection to predict relapse risk in schizophrenia.** *Translational Psychiatry* 2021;11:28. doi:10.1038/s41398-020-01123-7. PMID:33431818. https://pmc.ncbi.nlm.nih.gov/articles/PMC7798381/
26. *Direct engineering artifacts used as instruments:* [`state.ts`](../src/state.ts), [`main.ts`](../src/main.ts), [`home/index.ts`](../src/home/index.ts), [`home/orchidRig.ts`](../src/home/orchidRig.ts), [`reflect/index.ts`](../src/reflect/index.ts), [`reflect/model.ts`](../src/reflect/model.ts), [`reflect/moods.ts`](../src/reflect/moods.ts), [`reflect/prompts.ts`](../src/reflect/prompts.ts), [`reflect/flags.ts`](../src/reflect/flags.ts), [`reflect/reply.ts`](../src/reflect/reply.ts), [`winddown/index.ts`](../src/winddown/index.ts), [`winddown/model.ts`](../src/winddown/model.ts), [`venture/rules.ts`](../src/venture/rules.ts), [`venture/rng.ts`](../src/venture/rng.ts), [`venture/index.ts`](../src/venture/index.ts), [`venture/events.ts`](../src/venture/events.ts), [`docs/venture-foraging-review.md`](venture-foraging-review.md), [`docs/venture-redesign-plan.md`](venture-redesign-plan.md), and [`docs/product-manifest.md`](product-manifest.md).
27. NIST/SEMATECH. **e-Handbook of Statistical Methods: Median Absolute Deviation.** Formula and the conventional approximately normal rescaling. https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/mad.htm
