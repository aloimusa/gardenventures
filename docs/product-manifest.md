# Product and design manifest

This document distinguishes the supplied design conversation, current implemented demo contracts, tentative ideas, and unresolved questions. It does not infer a clinical model.

## 1. Health-technology and product concepts

### 1.1 Watering and the plant — proposed, not fully specified

The opening idea asks whether **watering a plant should be one of the primary functions**. The associated thoughts are:

- Watering is an understandable, simple caretaking action.
- The plant could grow through watering.
- The plant need not die; the exchange contemplates a basic, non-punitive game rather than plant death as a requirement.
- A plant appearing **weak or strong** might “possibly” indicate or encode **drift** in a way that is **not immediately obvious**.

The weak/strong plant and its drift encoding are explicitly tentative. The dump does **not** define:

- what construct “drift” names;
- weak/strong states or their visual mapping;
- whether watering, growth, or another behavior is the measured variable;
- observations, ground truth, scoring, time windows, thresholds, or validation;
- the referenced paper, its intervention, or its therapeutic evidence.

Therefore the product must not claim that plant appearance, watering, Home growth, or Venture performance measures drift.

### 1.2 Venture measurement constraint — explicit user correction

The user subsequently rejected excessive plant variance as a basis for a drift signal and said measurement is defensible **per plant**, not by treating differently shaped plants as interchangeable.

The fixed-task recipe is explicit:

- **8–10 pickables per plant**, with low variance and similar hitboxes.
- Pickables are on **one camera-facing side** only.
- Plants **cannot be turned around**; searching by rotation is removed.
- Foliage or other visual geometry does **not** make a fruit unpickable.
- Use a **static, separately angled shallow three-quarter camera for each species**, showing the models' depth rather than forcing a uniform isometric view.
- Fit the complete model within shared limits and bias framing subtly toward a common produce-position mean rather than forcing identical target bounds.
- Natural asymmetric arrangements with varied depth and reduced vertical spread replace the former mechanical grids.
- The resulting recipe should be low-noise.

This is an interaction-standardization requirement. It does not itself define a signal, establish within-plant reliability, or make cross-plant scores comparable.

### 1.3 Venture demo round and collection — current implementation contract

- There is **one playable round per demo-calendar day**.
- One new plant unlocks per day in this order: **apple, orange, pear, cherry, tomato, strawberry, blueberry, eggplant**. The daily cycle then repeats while the unlocked collection is retained.
- Partial and completed rounds are restored from dated `venture_pick` events. If all final picks exist but the completion event is missing, completion is recovered.
- Previously unlocked plants remain available as a **view-only** collection, not as extra playable rounds.
- The camera walks between static unlocked plant models. Picking is disabled during walks.
- Randomized walking jitter is limited to **±700 ms** and tapered by the number of remaining targets. Cumulative compensation is clamped to **±2.5 s**.
- The displayed timer linearly interpolates compensated elapsed time. Raw timestamps and durations remain preserved in the event log.

The timer and walking compensation are demo implementation details, **not a validated measurement metric**.

### 1.4 Product philosophy supported by the text

Without adding clinical claims, the design conversation supports these product-level constraints:

- Keep actions few and understandable: water, write/Add, take a photo, or pick a target.
- Avoid making the user operate unnecessary modes or controls.
- Keep the person in the interaction when an acknowledgement or plan is relevant.
- Preserve a calm visual hierarchy rather than presenting a large blank card as another object to understand.
- Treat reflective writing and its reply as sensitive data; the specified photos remain on-device.
- A placeholder reply is explicitly a placeholder, not a therapeutic model.

These are design constraints from the exchange, not evidence of clinical efficacy.

## 2. Reflect — current explicit HCI contract

The latest padded 4:3 height-to-length card direction supersedes the earlier 5:4, tall 2:3, and wide 3:2 versions.

### 2.1 Composition

- New writing happens **directly on the pane background**, not inside a large empty-card object.
- The writer occupies **only a few lines at the bottom**, remains **well under half the screen height**, and has a **thin rule above it in the suggested mood colour**.
- The composer has **camera on the left and Add on the right**.
- **Add explicitly commits** the entry. Leaving the pane does not commit it.
- Voice/transcript is removed from the composer. The mood control is not part of ordinary composition.
- When Add is pressed, the new card joins the stack **already turned over** and waits for its sentence. The writing area is **locked until that reply arrives**.

The explicit-Add decision resolves the earlier flagged-entry concern: the person is still on Reflect when its acknowledgement and plan become available.

### 2.2 Card stack, typography, and gestures

- Committed cards are **4:3 height:length with a tasteful 20 px side margin**, measuring **350 × 466.67 px (reported as 350 × 467 px) at the tested 390 px viewport**. This supersedes the earlier 5:4, tall 2:3, and wide 3:2 contracts. The input writer stays full width rather than inheriting the card margins.
- Reflect type is raised **20% from the over-reduced values**: **20.16 / 15.84 / 12.96 px on cards**, **15.84 / 12.96 px in the writer**, and **15.84 px for replies**.
- Older cards appear by **scrolling upward above the newest card**.
- A **tap** turns a committed card.
- A **hold** shakes it and opens limited **text rewriting** with a **Done** control.
- The mood button is visible **only during hold-to-edit** and is hidden again on **Done**.
- A photo card cycles through **photo**, **reply over the blurred photo**, and **front** on successive taps.
- When the keyboard opens, the writer uses its **actual bottom margin in flex layout**. The list shrinks to fit and cannot collide with the writer; this is not a transform-based workaround.

### 2.3 Mood and launch integration

- A new card receives the **suggested mood**, described in the exchange as the mood chosen at launch.
- Mood changes belong to the hold-to-edit state, not the composer or ordinary card view.
- The earlier prototype deliberately left a skipped launch check-in without a face and used grey rather than silently stamping “Okay.” This matters to the pending launch integration.

A real launch check-in is not specified or wired. Its flow, skip behavior, and how a suggestion is produced remain integration work.

### 2.4 Replies, flagged entries, and the plan

- The reply function now submits the current entry through a **same-origin server proxy to DeepSeek Flash**, with deliberately basic guidance. Failure, invalid output, or timeout still yields `I have this.`
- Model flags are **loose, unvalidated signals** to surface the writer's own plan, not emergency assessments.
- For a flagged entry, the person receives an acknowledgement while still present.
- A flagged turned card has a **static lower third inside the card** with the saved plan line, an available contact action, and **Open my plan**. There is no separate moving panel beneath it.
- The plan editor supplies four freeform local sections. The response and flag guidance still require product/privacy/safety review.

### 2.5 Editing history and frozen replies

- Limited editing is hold-to-edit; unrestricted card editing is not wanted.
- Hold-to-edit hides the composer and exposes **Done**, mood, and **Remove**.
- Removing a card appends `card_deleted { id }` and excludes it from the visible stack after reload. Prior events and local photo blobs are retained; this is not represented as secure erasure.
- Editing preserves the original in the **append-only event log**, including an edit to blank.
- The existing reply remains **frozen** after text or mood edits.

The frozen reply is intentional in the selected prototype, but the conversation explicitly acknowledges that it can respond to words no longer present. Whether to retain that behavior permanently is **unresolved**. It must not be silently fixed by generating a new reply and must not be described as consistent with edited text.

### 2.6 Camera and photos

- The camera replaces the writing area with a **full-width 4:3 height:length preview**.
- The intended PWA uses the real device camera.
- Captured photos remain **on-device**; the inference request includes only text, mood, and a photo-presence boolean.
- Entry text can leave the device through the same-origin backend/provider route; this is distinct from the local card/photo history and requires explicit production privacy handling.
- There is no voice/transcript feature in the selected concept.

## 3. Superseded Reflect exploration — do not revive accidentally

Earlier prototypes included a large empty composer card, wide 3:2 and alternative tall cards, a Tweak menu, composer voice/mood controls, commit on leaving, and a reply revealed after leaving. Those variations are historical, not parallel current options.

The selected contract is the full-width low bottom writer, explicit Add, side-padded 4:3 height:length committed cards and camera preview, length-scaled typography, and mood editing/removal only during hold-to-edit with the writer hidden. Character/line-fit limits survive in the implementation, but their first description was prototype detail rather than a newly restated clinical requirement.

## 4. Shell, Toolkit, and engineering boundaries

- Development is in this repository as a **PWA**, not a request to send a Shipdeck/Claude artifact.
- The main application order remains **Home first**.
- Pane top headings and subtitles are **visually hidden but available to accessibility**. The visible bottom navigation remains.
- Toolkit uses one expandable option shape throughout. **My safety plan** stores four freeform sections locally and supports inline contacts with editing, removal, drag/button reordering, and real `tel:` links. The plan is explicit that it is unmonitored and Garden never contacts anyone itself.
- **Wearable** and **Drift measurer** are clearly inert placeholders. The latter states that its construct, observations, scoring, ground truth, and validation are undefined; neither reads devices or invents a score.
- **Skip day** advances the demo offset in `localStorage`; Home's daily growth refreshes after Skip day.
- **Reset demo** is confirmed destructively: it clears local cards/settings/plans/progress and local photos, then reloads the first-run demo. It does not remove non-personal cached application/audio assets.
- Home's orchid and Venture's harvest plants are separate implementations and separate concepts. Neither establishes a drift claim.
- Wind down is a local **Static/Nature** soundscape mixer with independent track/master volumes, Play/Pause, a sleep/fade timer, persistence, offline assets, and first-play daily completion. The requested Canton MP3 is bundled with source/unversioned CC BY attribution; nature sounds are explicitly synthesized placeholders. No wellness efficacy is claimed.
- No Shipdeck orchestrator state may be treated as a substitute for decisions absent from the dump.

## 5. Decisions still required

1. **Drift definition:** construct, paper/evidence, therapeutic intent, observations, direction, scoring, ground truth, and validation.
2. **Plant encoding:** whether weak/strong appearance remains wanted; its exact mapping and whether/how watering affects growth.
3. **Per-plant Venture protocol:** allowable within-species variation, session structure, measurements, comparisons, and interpretation. Framing consistency and compensated demo timing are not a protocol.
4. **Reply review:** DeepSeek guidance, production privacy/consent, safety review, and the frozen-reply-after-edit decision.
5. **Launch check-in:** real UI, suggestion source, and skip behavior.
6. **Toolkit:** wearable/wellbeing definitions and any further safety-plan protocol beyond the local editor/contacts.
7. **Media polish:** replacement of Wind down's synthesized nature placeholders with appropriately licensed, well-looping recordings, if wanted.
