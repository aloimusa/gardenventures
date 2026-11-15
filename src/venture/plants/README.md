# Venture plant models

Nine standalone, code-generated Three.js models in a soft low-poly style: banana, strawberry, apple, mandarin, mango, blueberry, pear, tomato, and eggplant. Their creative fruit, foliage, blossoms, pots, and seeded proportions are decorative scenery; they have no age, watering, persistence, or round logic.

The v3 interaction is a whole-plant two-second hold, not produce-target picking. The catalogue exposes only `{ group, dispose }` for each factory. It deliberately has no pickables, target bounds, or inventory semantics. Harvesting never removes or refits geometry; moving creates a differently seeded occurrence of the same species.

The renderer fits the **entire model group's bounds** through an orthographic, species-specific three-quarter camera. It never infers fruit positions or averages removed target sets. Empty/invalid bounds are rejected rather than used to construct a NaN camera pose. Every standalone pack retains its own geometry and deterministic seed-based appearance.

```js
import { createPlant } from './plants/index.js';

const plant = createPlant('strawberry', 42);
scene.add(plant.group); // fit with Box3().setFromObject(plant.group)
plant.dispose();
```

`VENTURE_PLANTS` lists catalogue definitions (`id`, `name`, `category`, `create`) in unlock order. Corresponding strings in `plants/icons/<species>.ts` provide the accessible-feedback-safe, `aria-hidden` SVG artwork used beside +N harvest rewards; no emoji or old fruit-pick placeholders are substituted.
