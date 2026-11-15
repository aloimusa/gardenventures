// Mature apple tree: an open, branching crown with individually pickable apples.
import * as THREE from 'three';
import { V, TAU, random, material, ground, branch, blob, leaf, apple, pickable, finishModel } from './shared.js';

export const name = 'Apple tree';

export function create(seed = 1) {
  const rnd = random(seed), group = new THREE.Group(), body = new THREE.Group();
  group.name = 'venture-apple-tree';
  group.add(ground(0.94), body);
  const wood = material(0x74513b), woodLight = material(0x8b6244);
  const greens = [0x477d43, 0x5c914d, 0x73a45a].map(c => material(c, { side: THREE.DoubleSide, roughness: 0.84 }));
  const leafMat = material(0x639c52, { side: THREE.DoubleSide });

  branch(body, [V(0, 0, 0), V(-0.035, 0.4, 0.02), V(0.04, 0.85, -0.025), V(0.02, 1.3, 0)], 0.145, 0.065, wood, 20);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    branch(body, [V(Math.cos(a) * 0.04, 0.13, Math.sin(a) * 0.04), V(Math.cos(a) * 0.27, 0.045, Math.sin(a) * 0.27), V(Math.cos(a) * 0.4, 0.025, Math.sin(a) * 0.4)], 0.065, 0.012, wood, 8);
  }

  const tips = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.399963 + 0.25, r = 0.52 + rnd() * 0.18;
    const tip = V(Math.cos(a) * r, 1.28 + (i % 3) * 0.2 + rnd() * 0.12, Math.sin(a) * r);
    const start = V(0.015, 0.65 + i * 0.065, 0);
    const middle = start.clone().lerp(tip, 0.55); middle.y += 0.13;
    branch(body, [start, middle, tip], 0.064 - i * 0.004, 0.018, i % 2 ? woodLight : wood, 14);
    tips.push(tip);
    for (let j = 0; j < 3; j++) {
      const p = tip.clone().add(V((rnd() - 0.5) * 0.5, (rnd() - 0.25) * 0.36, (rnd() - 0.5) * 0.5));
      blob(body, greens[(i + j) % greens.length], p, [0.38 + rnd() * 0.12, 0.31 + rnd() * 0.13, 0.36 + rnd() * 0.12], 1);
    }
  }
  blob(body, greens[1], V(0, 1.83, 0), [0.58, 0.46, 0.55], 1);

  // Individual leaves break up the clustered canopy's silhouette.
  tips.forEach((tip, i) => {
    for (let j = 0; j < 3; j++) {
      leaf(body, leafMat, {
        at: tip.clone().add(V(0, (j - 1) * 0.13, 0)), yaw: i * 2.4 + j * 1.8,
        pitch: -0.1 + j * 0.25, roll: (rnd() - 0.5) * 0.5,
        length: 0.3 + rnd() * 0.09, width: 0.095 + rnd() * 0.025,
      });
    }
  });

  const pickables = [];
  // Fruit follows the open lower crown rather than a flat picking grid.
  const apples = [
    [-0.58, 0.77, 0.78], [0.05, 0.70, 0.94], [0.57, 0.83, 0.72],
    [-0.40, 1.01, 0.94], [0.30, 1.04, 1.02], [-0.82, 1.38, 1.08],
    [-0.16, 1.44, 1.28], [0.40, 1.34, 1.14],
  ];
  apples.forEach(([x, y, z], i) => {
    const f = apple(i % 3 === 0 ? 0xe15b43 : 0xcf3f3f, 0.14);
    f.position.set(x, y, z); f.rotation.y = rnd() * TAU;
    body.add(f);
    branch(body, [V(x * 0.45, y + 0.34, 0.46), V(x, y + 0.19, z), V(x + 0.02, y + 0.15, z)], 0.011, 0.007, wood, 5);
    pickable(pickables, `apple-${i + 1}`, 'apple', f, 0.18);
  });

  return finishModel(name, group, body, pickables);
}
