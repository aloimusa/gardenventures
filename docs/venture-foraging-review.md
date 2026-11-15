# Venture and the supplied foraging paper

Reviewed `plantpickingpaper.pdf` directly on 2026-11-14. Page references below use the printed article pages. The supplied seven-page main article links to—but does not include—the supplementary appendix and original task software.

## Decision

Current Venture is a **foraging-inspired consumer-game adaptation**, not a replication of the study protocol. Its events cannot be presented as a validated measure of depression, depression severity, anhedonia, treatment response, or longitudinal “drift.”

## Material protocol differences

| Paper protocol | Current Venture |
|---|---|
| Repeated **Harvest/Stay versus Move/Leave** decisions. A harvest returns multiple apples; Move reveals a fresh, unharvested tree (p. 6; Fig. 1B, p. 2). | Eight or nine finite tappable targets per occurrence. Exhaustion disables picking and effectively requires Walk, which is not equivalent to a voluntary economic leave. |
| New tree's initial harvest is normally distributed with **mean 10 apples, SD 1**; later rewards decay by a factor drawn from a beta distribution with **average 12% decay** and are rounded to whole apples (p. 6). | Deterministic `max(1, round(12 × .88^n))`, starting at 12. The next reward is displayed in advance, removing outcome uncertainty. |
| Each harvest includes a **2 s delay**; reaction time is included inside harvest/travel timing so it does not determine total apple yield (p. 6; Fig. 1B). | Picking pays immediately. Faster tapping and decision-making increase opportunities and yield. |
| Travel costs a signalled **3 s or 10 s**, in counterbalanced alternating blocks; training includes both conditions (p. 6; Fig. 1B). | Every Walk costs 700 ms, after the Walk decision, with no block conditions or protocol training. |
| **Four 7-minute foraging blocks** after training (p. 6; Fig. 1B). The three-minute association came from analyzing increasing initial portions of the **first long-travel block** (p. 3; Fig. 2E, p. 4). | One absolute-timestamped 180 s round per demo/local day. This is not the validated three-minute procedure. |
| The explicit goal is to maximize apples for **$0.01 per apple** (p. 2 and p. 6). | Abstract yield plus a daily completion mark; no equivalent incentive contingency. |

Multiple plant species, daily unlocking, 3D models, direct tapping, sparkles, daily locking, and completion metadata are product adaptations. They can remain part of a calm game but are not paper protocol features.

## Leaving-point semantics

The paper analyzes the **observed apple reward in the harvest immediately preceding Leave**, especially averaged by condition (Fig. 2A–F, p. 4). In current logs:

- `lastYield` on `venture_walk` is the closest analogue, but is not comparable numerically to the paper's stochastic multi-apple reward.
- `nextYield` and normalized `leavingValue` are deterministic forecasts/depletion indices, **not** the paper's observed leaving point.
- A Walk with `harvests=0` has no observed preceding reward and must not be averaged as a zero-reward leaving point.
- A Walk at `remainingTargets=0` is forced by the finite adaptation and must not be pooled with voluntary leaves.
- Species, days, and any future travel conditions must not be pooled as interchangeable protocol trials.

## Limits on evidence and replication

The main article does not supply the beta distribution's shape parameters, exact truncation/rounding recurrence, or complete action-sequencing details needed for strict software replication. Those must come from the supplementary appendix or original task software cited under Data, Materials, and Software Availability (ref. 44, p. 6); they must not be guessed.

The reported classification and severity findings concern average leaving points under the study conditions. Participants were 50 moderately/severely depressed patients and 70 controls under specific study criteria; diagnostic specificity, broader populations, medication effects, and longitudinal monitoring remain unestablished. The authors explicitly call for longitudinal work before monitoring use (pp. 2–6). No personal threshold or score is justified here.

## Engineering direction

1. Keep the current experience explicitly **foraging-inspired**, with raw event history and no clinical interpretation.
2. If a strict research task is later required, obtain the supplement/original software first, then specify repeated Stay/Leave actions, stochastic rewards, 2 s harvest cycles, 3/10 s RT-inclusive travel conditions, counterbalanced 7-minute blocks, training, and the intended incentive context. Do not disguise those changes as a visual tweak to the existing consumer game.
3. For meaningful later analysis, retain protocol/software/session/block identifiers, condition, timestamps for prompt/choice/reward/arrival, observed integer rewards, voluntary versus forced/censored leaves, and RNG/distribution version or auditable sampled values.
4. Update browser checks to distinguish the consumer adaptation from any future protocol implementation. Passing current checks proves adapted software behavior, not experimental validity.
