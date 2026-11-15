// Venture's standalone decorative model catalogue. Nothing here reads app state or implements round logic.
import { createBanana } from './banana.js';
import { createStrawberry } from './strawberry.js';
import { createApple } from './apple.js';
import { createMandarin } from './mandarin.js';
import { createMango } from './mango.js';
import { createBlueberry } from './blueberry.js';
import { createPear } from './pear.js';
import { createTomato } from './tomato.js';
import { createEggplant } from './eggplant.js';

// User-facing unlock and demo-calendar cycle order. These IDs are persisted in v3 events.
export const VENTURE_PLANTS = Object.freeze([
  { id: 'banana', name: 'Banana', category: 'plant', create: createBanana },
  { id: 'strawberry', name: 'Strawberry', category: 'plant', create: createStrawberry },
  { id: 'apple', name: 'Apple tree', category: 'tree', create: createApple },
  { id: 'mandarin', name: 'Mandarin tree', category: 'tree', create: createMandarin },
  { id: 'mango', name: 'Mango tree', category: 'tree', create: createMango },
  { id: 'blueberry', name: 'Blueberry', category: 'plant', create: createBlueberry },
  { id: 'pear', name: 'Pear tree', category: 'tree', create: createPear },
  { id: 'tomato', name: 'Tomato', category: 'plant', create: createTomato },
  { id: 'eggplant', name: 'Eggplant', category: 'plant', create: createEggplant },
]);

export function createPlant(id, seed = 1) {
  const definition = VENTURE_PLANTS.find(plant => plant.id === id);
  if (!definition) throw new Error(`Unknown Venture plant: ${id}`);
  return definition.create(seed);
}

export { createBanana } from './banana.js';
export { createStrawberry } from './strawberry.js';
export { createApple } from './apple.js';
export { createMandarin } from './mandarin.js';
export { createMango } from './mango.js';
export { createBlueberry } from './blueberry.js';
export { createPear } from './pear.js';
export { createTomato } from './tomato.js';
export { createEggplant } from './eggplant.js';
