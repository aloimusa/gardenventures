# Garden documentation

## Index

1. **[Product and design manifest](./product-manifest.md)** — explicit design intentions, current implemented demo contracts, superseded prototypes, tentative health concepts, and unresolved questions.
2. **[Repository and product-alignment review](./repository-review.md)** — what the code currently does, what was consolidated, what can be retained, and what still needs product definition or implementation.
3. **[Reflect reply backend](./backend.md)** — same-origin DeepSeek development proxy, request boundaries, fallback behavior, and production requirements.

## Source-of-truth rule

The supplied design conversation is the source for the intentions quoted here. Repository code and the current implementation contract are evidence of demo behavior, not evidence that a behavior was clinically specified or validated. Commit messages describe implementation history; they do not turn an experiment into a product requirement.

In particular, **no document in this repository defines a drift metric, a therapeutic claim, or evidence from the unnamed paper mentioned by the user**. Venture's compensated displayed timer is not a validated metric. Those require separate sources, explicit definitions, and validation.

## Documentation status

Reviewed against the working tree on 2026-11-14. The current Reflect/Wind down/Toolkit increment was deployed after a passing production build and **68/68 Reflect**, **26/26 Wind down**, and **14/14 Toolkit** live checks. Backend checks pass **7/7**. Venture's revised timed foraging loop has a separate implementation/check cycle; integrated/PWA totals are updated after its release. The manifest preserves unresolved ideas rather than filling their gaps with implementation inventions.
