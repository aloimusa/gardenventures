# Live Market and check-in behavior

Implementation: `src/market/{index,model,visual,environment}.ts`; fixtures: `scripts/check-market.mjs`.

## Weekend and scene

- Only Saturday/Sunday local demo-calendar dates expose Market. Weekdays hide both portal and world; a calendar transition out of the weekend returns Home safely. Day one does not bypass this rule. ISO market weeks remain distinct from weekend presence.
- One WebGL Market renderer supplies both directions of the live portal. The expanded camera starts from the actual `market-produce-cart` plus Moss union bounds at `39°` vertical FOV, then iterates projected corners and normalized off-axis framing until the complete foreground fits safely (`0.88` maximum absolute NDC coordinates, with a width close to the available panel rather than distant toy-town framing). Resize fitting uses the best finite safe candidate, not just a Moss center point. The aperture is `min(188px, 48vw)` wide with proportional height, at the same inset in either world. Trade dialogue is bottom-centered and the concise heading keeps clear of the enlarged portal.
- The Market panel reserves its remaining height for the world, anchors the per-species basket to the bottom panel without overlap, and places the floating Questions action immediately beneath the subtitle above the model. There is no duplicate lower dropdown.
- Check-ins are a separated, full-view `aria-modal` surface. The Market shell, title, controls, basket and portal become inert/hidden and keyboard focus is trapped in the questions. A scrollable question body reaches item nine while the action footer remains fixed above the pane's bottom safe area. Focus starts within the flow and returns to the opener; Back to Market, Escape, and navigation to other panes clean up without inventing answers.
- The plaza uses cool slate/petrol, lichen/celadon, pale blue/lavender, and cool chalk materials. Natural Moss fur, fruit, and wood remain recognizable. The cathedral is still a quiet background easter egg with Nordic white-blue walls and dark slate domes.

## Ornament picker and reduced-motion lifecycle

- Home uses a top-left circular `aria-expanded` ornament control; the independent Market portal stays top-right. Its floating owned selector and explicit Place action use a compact `min(220px, calc(50vw - 40px))` menu that clears the portal. A zero-owned state uses the first catalog icon only as a fallback and explicitly says no ornaments are owned. It never grants default ownership. Menu dismissal restores the toggle, never starts watering, and the control is absent over Market/question surfaces.
- `visual.ts` reads the effective reduced-motion media preference at frame time rather than relying only on delivery of a media-query change event. A queued frame cannot keep rendering under the stale preference. The static preview exposes `data-reduced-preview` and `data-rendered-frame` only after drawing real geometry, while `snapshot().visual.reduced` reports the actual renderer state. Other explicit actions (resize, trade, visibility changes) can still redraw once legitimately.

## PHQ-2 → PHQ-9 state machine

The short weekly instrument and the full monthly instrument have different identities and time anchors. This avoids accidentally running both step-up and monthly completion twice.

1. **Weekend arrival with no PHQ-2 this ISO week:** show the two genuine PHQ-2 items. Two choices complete and save PHQ-2. Back leaves Home without inventing a response.
2. **PHQ-2 Not now:** append only `market_phq2(status='skipped')`, dismiss immediately to the actual Market, and allow trade. There is no replacement forced surface. If this month has no full-instrument sequence, the independent monthly flow remains offerable through the explicit Questions action instead.
3. **Answered PHQ-2 total ≥ 3:** start `market_phq9(trigger='phq2_step_up')`, retaining the first two raw answers and their PHQ-2 sequence id/total as the anchor. Only items 3–9 appear next. The raw sequence begins as pending, then becomes answered or skipped.
4. **Otherwise, if no PHQ-9 sequence owns the current calendar month:** offer `market_phq9(trigger='calendar_month')`. When the current weekly answers exist, they seed the first two items and only the remaining seven are shown next. If PHQ-2 was skipped or no answers exist, the monthly instrument starts in the original nine-item order with unanswered values represented as `null`, never healthy zeroes.
5. **Any current-month PHQ-9 pending, answered, or skipped event suppresses automatic re-prompting.** Pending work can be continued only by explicitly choosing Questions. Back does not manufacture a response. A new calendar month gets a new sequence even if the previous month was skipped.
6. The visible card never owns produce or rewards. Trading dismisses the visible card and never prompts it again after the trade. Multiple same-week/same-month visits do not nag after their relevant status exists.

PHQ-9 uses items 1–9 in their standard order. A pending record can contain selected responses, always `null` for missing responses. A skip records its actual stage and those partial responses with `total: null`. Only nine valid 0–3 responses produce `status='answered'`, an overall 0–27 total, and `answered_at`. Raw append-only local events include item index/key/value, trigger, sequence id, month, and the PHQ-2 anchor for step-up. There is no diagnosis, treatment, referral, care-team notification, or conversion to Venture/drift measurements.

A nonzero ninth response immediately exposes the user's existing safety plan/contact path without blocking trade. `market_support_shown` records only the support presentation/count and resource path, not the answer or any aggregate inference.

**Clinical review note:** this implements the full step-up/monthly PHQ-9, not a future placeholder. Follow-up scale selection still needs human review with Aalto: the clinic may use MADRS or BDI rather than assuming PHQ-2/PHQ-9 for every setting.

## Inventory compatibility

`harvestUnits` explicitly accepts only the shared matured result surfaces `payload.v = 3` and `payload.v = 4`. v3 history remains valid. v4 keeps its `vittala_foraging_adaptation_v1` provenance, `venture-normal-beta-rng-v2`, Normal(mean 10, SD 1) initial records, and selected-fallback Beta(22,3) multiplicative records untouched. Market reads only IDs, species, date, integer positive reward, and maturity; it does not run or normalize the v4 sampling algorithm. v2 and unknown future versions remain excluded. Allocation IDs, duplicate suppression, exact species totals, and ledger migrations are unchanged.
