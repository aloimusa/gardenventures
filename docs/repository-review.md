# Repository and product-alignment review

Reviewed on 2026-11-14 against the current working tree. This review describes implemented behavior, not clinical validity.

## 1. System inventory

### Runtime and build

- **TypeScript + Three.js + Vite PWA**, plus a dependency-free Node development proxy for same-origin DeepSeek Flash replies. There is no account system or remote application database.
- `src/main.ts` owns five sliding panes, navigation, dark Wind down styling, daily completion marks, and refresh/visibility integration.
- `index.html` is a minimal application mount; `public/manifest.webmanifest` and the generated service worker provide the PWA shell.
- `npm run build` performs strict TypeScript checking and a production build. `npm run check` runs the browser behavior, accessibility/contrast, persistence, and pane-specific checks.
- `npm run deploy` builds and synchronizes `dist/` to `/srv/http/garden-app/` for `garden.hopeajahti.lol`.

### Local data

`src/state.ts` provides:

- `GardenState` in `localStorage` under `garden.state`, including local watering and Venture completion state;
- an append-only event array under `garden.log` with millisecond timestamps and payloads;
- local/demo-date helpers and daily predicates;
- a demo-day offset in `localStorage`, advanced by Toolkit's **Skip day** control;
- a console test hook for state, log reading, and provisional mood setting.

Reflect rebuilds cards from the event log. Its drafts also use local storage, and photo blobs use IndexedDB through `src/reflect/photos.ts`. The safety plan and contacts use `garden.safetyPlan.v1` in local storage. Venture restores rounds from dated pick events. These are sensitive mental-health entries and local interaction records; there is no account sync or remote application database. New Reflect entry text, mood, and a photo-presence boolean can be submitted through the same-origin Node proxy to the configured inference provider; photos, plans, contacts, and event history are not forwarded.

### Source layout

| Area | Active source | Current role |
|---|---|---|
| Shell | `src/main.ts`, `src/style.css`, `src/icons.ts` | Five-pane navigation and visual shell |
| State | `src/state.ts` | Local/demo dates, state, and append-only events |
| Home | `src/home/index.ts`, `src/home/orchidRig.ts`, `src/home/sceneUtils.ts`, `src/home/rig.ts` | Hold-to-water interaction and single orchid rig |
| Home orchid model | `src/home/lab/plants/orchid.js`, `src/home/lab/plants/organs.js`, `src/home/lab/style.js` | Calendar-age geometry, animation, and appearance |
| Reflect | `src/reflect/` | Event-derived cards, composer, photos, moods, bounded service replies, in-card plan actions |
| Venture | `src/venture/index.ts`, `src/venture/plants/` | Daily harvest round, unlocked collection, and eight mature models |
| Toolkit | `src/toolkit/index.ts`, `src/toolkit/plan.ts`, `src/style.css` | Expandable tools, local safety plan and contacts, explicit placeholders, demo-day control |
| Inference proxy | `server/`, `src/reflect/reply.ts` | Same-origin DeepSeek Flash reply/flag request with bounded fallback |
| Checks | `scripts/check*.mjs` | Full app, backend, Toolkit, Reflect, and Venture checks |
| Documentation | `docs/` | Source-of-truth manifest and this review |

The `lab` directory name is historical provenance, not a second running product. `SOURCE.json` records the original snapshot and its older file list.

## 2. Product alignment by area

### Home — retain interaction and artwork; product semantics remain open

**Implemented:**

- Home opens first.
- A 600 ms hold on a generous plant/can screen region or the watering button completes one watering per local day. Keyboard activation is supported.
- The watering can animates and the orchid receives a positive celebration/perk treatment. Repeated same-day holds do not add another completion.
- The orchid's geometry comes from elapsed local days since the first `app_open`, not from the user's Reflect mood or Venture performance.
- Home's daily growth refreshes after Toolkit's **Skip day** advances the demo offset.
- The model has an initial growth ladder and a repeating mature lifecycle. Its mood input is fixed at the best value; watering adds glow/lift but does not drive calendar age.
- The app saves only the last watering date, not a water-to-growth mapping.

**Alignment:**

- The simple caretaking action and non-punitive positive feedback are compatible with the opening proposal.
- The current plant is not an implementation of the tentative weak/strong drift encoding. No such mapping should be inferred from age, glow, fixed mood, or Skip day behavior.
- Whether growth should depend on watering rather than elapsed days is unresolved in the supplied design text.

**Keep:** renderer, hold behavior, accessibility, orchid assets, positive watering response.  
**Define before rebuilding semantics:** growth cause, weak/strong states, drift mapping, and evidence requirements.

### Reflect — current padded 4:3 height:length card HCI; service and plan behavior need review

**Implemented contract:**

- Low bottom writer on the pane ground, three-row textarea, and a suggested-mood rule.
- Camera left, Add right; no composer voice control.
- Explicit Add, new card opens on pending reply/back, writer locked until the reply resolves, and leaving preserves rather than commits a draft.
- **Side-padded 4:3 height:length cards**, **350 × 466.67 px (reported as 350 × 467 px) at the tested 390 px mobile viewport**, with 20 px side margins. The input writer remains full width at 390 px.
- Reflect type raised 20% from the over-reduced values: **20.16 / 15.84 / 12.96 px on cards**, **15.84 / 12.96 px in the writer**, and **15.84 px replies**.
- Older entries above, tap-to-turn, and hold-to-rewrite with shake, Done, and Remove.
- Hold-to-edit hides the entire writer until Done, Escape, pane exit, or removal. The mood and Remove controls appear only in edit mode.
- Removal appends `card_deleted { id }`, removes the card from the derived stack and reloads, and preserves its prior events/photos rather than claiming to erase all local data.
- Photo → blurred photo/reply → front cycle, with a **full-width 4:3 height:length camera preview**.
- Keyboard layout reserves the writer's actual bottom margin in flex so the list shrinks and cannot collide with it; it does not use a transform workaround.
- For a flagged turned card, a static lower third **inside the card** points to the saved plan and its first callable contact; no separate plan panel moves below the card.
- Original text retained in append-only events, blank edits permitted, and first reply intentionally frozen.
- Real camera with local photo persistence; a photo file fallback when camera access is unavailable.
- Character limit plus line-break and rendered-fit limits, reduced-motion behavior, and browser coverage.

**Service boundaries and pending behavior:**

- `src/reflect/reply.ts` submits the current entry through `/api/reflect-reply` to DeepSeek Flash via the Node proxy. A forced failure, unavailable service, invalid response, or five-second timeout returns `I have this.` The live Caddy route reaches a Node instance on port 8816 and returned a real service response during verification; reboot-persistent process management remains separate.
- Model flags are loose, unvalidated suggestions to display the writer's own plan, not emergency assessments or reviewed safety logic. Test/demo hooks also remain.
- The Toolkit plan maker supplies the saved text and contacts. `Call …` uses a real `tel:` link; “Open my plan” opens the expanded Toolkit editor. Garden does not monitor the plan or contact anyone itself.
- Launch mood is only a validated value in local state, set by a console hook. There is no actual launch check-in or suggestion engine.
- Three demo cards are seeded on first use, including a flagged heavy entry and a packaged photo. They are demonstration content, not user data or therapeutic output.
- Frozen replies after editing are deliberately preserved; their possible inconsistency remains a product decision.

**Keep:** the current card/composer interaction, local photos, and event-derived history.  
**Rebuild/integrate:** launch check-in and reviewed response/flag behavior. Do not present the model placeholder or local plan as a clinically validated system.

### Venture — daily round, retained collection, and compensated demo timing

The active implementation has:

- one playable round per **demo-calendar day**;
- one new plant unlocked per day in **apple, orange, pear, cherry, tomato, strawberry, blueberry, eggplant** order, after which the daily cycle repeats while the collection is retained;
- prior unlocked plants presented as **view-only**, not additional playable rounds;
- partial and completed rounds restored from dated `venture_pick` events;
- completion recovery when all final picks exist but the completion event is missing;
- eight targets on each tree/eggplant and nine on tomato/strawberry/blueberry;
- explicit natural per-species arrangements with varied depth and compact vertical spread rather than a mechanical grid;
- consistent nominal hit radii within each plant and one shared **56 CSS-pixel diameter** pointer hit area in the renderer;
- no rotation controls, drag rotation, automatic turning, or `venture_turn` behavior;
- no foliage raycast or eligibility rejection: all remaining targets are pickable;
- static plant models shown through separate shallow three-quarter yaw/pitch/zoom settings chosen for each species, not a uniform isometric view;
- complete-model framing within shared limits, biased subtly toward the common produce-position mean rather than forcing identical target geometry; harvesting does not change that static framing;
- camera walks between static unlocked plant models, with picking disabled during walks;
- randomized walking jitter capped at **±700 ms** and tapered by remaining targets;
- cumulative timing compensation clamped to **±2.5 s**;
- a displayed timer that linearly interpolates compensated elapsed time, while raw timestamps and durations remain preserved in the event log;
- picking events, calm completion, and daily completion persisted by demo date.

These implementation choices reduce mechanical variance but do **not** prove that fruit geometry, visual salience, motor demands, timing, or responses are psychometrically equal. Counts and nominal target sizes are fixed by species rather than randomized per round, but 8 versus 9 counts and different produce shapes still rule out unexamined cross-species score comparisons. The compensated displayed timer is **not a validated metric**.

**Current records:** plant-selection events, dated/timestamped pick events containing species/fruit/remaining count/input route, raw timing information, and completion events/date. There is no formal protocol, scored response-time measure, drift score, or clinical interpretation.

**Keep:** the models, fixed task recipe, daily restoration, and view-only collection.  
**Define next:** per-species protocol, permitted variation, session identity, outcome variables, and validation. Do not label the daily completion mark or displayed timer “drift.”

### Wind down — local two-category soundscape mixer

The pane is a compact warm-night mixer rather than a voice-mode visualization. It has only **Static** and **Nature** categories, with two choices each. Sounds can be layered across categories with independent volume controls, master volume, Play/Pause, and an Off/15/30/45-minute sleep timer with a final fade. Settings and daily first-play completion persist locally. Playback never autostarts, including after reload, and keyboard/reduced-motion/mobile behavior are covered by focused checks.

The default Static choice is the complete local **“White Noise and Heartbeat” by canton** MP3 retrieved through Abitti's public Taustaäänet asset URL. Its source and the inspected unversioned CC BY attribution are disclosed in the UI and `public/audio/SOURCES.md`; no license version has been invented. A synthesized soft-static preview and clearly labeled synthesized rain/stream placeholders are also local. Playback makes no foreign-origin requests. Audio assets enter a local cache for offline use. No calming, sleep, or clinical efficacy is claimed.

**Status:** functional soundscape app. Production-quality nature recordings/seamless loops remain future media work; reboot-persistent backend management is unrelated to this local feature.

### Toolkit — reusable options implemented; product functions pending

The pane has expandable tools built on one reusable option shape:

- **My safety plan** persists four freeform sections locally. Inline contacts support add/edit/remove, pointer dragging, accessible move buttons, and real `tel:` links. Save/reload and Reflect integration are implemented. The plan explicitly states that it is local and unmonitored.
- **Wearable** is an inert placeholder: no device is connected and no sensor data is read or stored.
- **Drift measurer** is an inert placeholder: construct, observations, scoring, ground truth, and validation remain undefined. It explicitly rejects Venture timing and plant appearance as drift measures.
- **Skip day** advances the `localStorage` demo offset, and Home's daily growth refreshes afterward.
- **Reset demo** requires confirmation, clears local content/settings/progress and the IndexedDB photo store, then reloads the fresh seeded demo. Cancelling preserves content. Cached application/audio assets remain as non-personal installation data.

**Status:** the plan/contact UI is functional, not a reviewed clinical safety protocol. Wearable, wellbeing, drift semantics, and any urgent-support escalation remain undefined.

### Navigation and PWA shell

Five tabs, flick navigation, dark Wind down treatment, local-day refreshes, and per-pane completion marks exist. Pane top headings and subtitles are visually hidden while remaining available to accessibility; the visible bottom navigation remains. Venture opts out of pane swipes to keep taps within its task.

The production service worker precaches the shell, uses network-first navigation, and serves cached assets offline. The deployed origin passed Chromium installability and offline checks, including an offline shell with fonts and Reflect cards/photo content.

The app is not a Shipdeck artifact viewer. The only application backend is the small same-origin Reflect inference proxy; there is no account system, remote application database, or separate Shipdeck runtime.

## 3. Consolidation and current scope

Earlier consolidation removed unused Home rigs and adapters, centralized shared orchid helpers, limited lab synchronization to used modules, unified Venture plant layouts/model lifecycle, and replaced Venture's rotation/occlusion behavior with the fixed-task contract. Deleted obsolete implementations remain recoverable from git history; they were not product requirements.

Current work adds Venture's timed foraging round and daily species selection, the padded 4:3 height:length Reflect contract with edit-mode removal, the simplified Wind down player, Toolkit's reusable options and Skip day control, and accessible pane headings. No external orchestrator queue or Shipdeck state supplies additional product decisions.

## 4. What remains to make again

### Retain as the foundation

- PWA build/deploy shell and local event history;
- five-pane navigation and accessibility patterns;
- Reflect's current padded 4:3 height:length card and full-width composer UI;
- Home's orchid artwork and watering gesture;
- Venture's eight models, front-only layouts, daily restoration, static plant models, and view-only collection;
- browser checks that exercise the intended behaviors.

### Define before implementing further health behavior

1. Name the paper and construct behind “drift.” Specify what is measured, why it matters, and what evidence would be required.
2. Decide whether Home's plant should encode anything at all. If so, specify weak/strong states, inputs, mapping, time course, and a non-deceptive explanation appropriate to the product.
3. Specify separate per-plant Venture protocols and whether fruit count, target geometry, or cosmetic presentation may vary within a species.
4. Review DeepSeek reply and flag guidance, privacy/consent expectations, the known frozen-reply inconsistency, and failure/timeout behavior.
5. Specify launch mood suggestion and skip behavior, Toolkit wearable/wellbeing functions, and any further safety-plan protocol.

### Build after those decisions

- Launch check-in and reviewed reply/flag integrations;
- Toolkit's wearable, wellbeing, and drift definitions;
- reboot-persistent management and monitoring of the live inference Node process;
- any formal Venture session/measurement layer;
- any approved Home growth/drift mapping.

The durable UI/3D foundation can stay. The clinical construct, measurement protocol, response logic, and unfinished product functions are the substantive missing work.

## 5. Verification baseline

Current increment verification:

- `npm run build` and `npm run check:backend` pass, with **7/7** backend checks;
- the release reached `https://garden.hopeajahti.lol/` before the revised Venture loop was complete, following the requested smaller-release workflow;
- deployed focused checks pass **68/68 Reflect**, **26/26 Wind down**, and **14/14 Toolkit**, including reset cancellation/data clearing, real DeepSeek consumption, audio graph/keyboard/timer behavior, and no foreign-origin Wind down requests;
- local production-preview slices passed the same behavior suites before deployment;
- mobile screenshots were read back for the padded 4:3 height:length Reflect front/edit layouts and both Wind down categories;
- the next integrated `npm run check` total and deployed PWA checks will be recorded after Venture's revised foraging suite is complete. The earlier 130/130 baseline predates these increments and is not presented as current coverage.

These checks verify software behavior in Chromium. They are not human-factors validation, psychometric reliability analysis, safety review, or clinical evidence.
