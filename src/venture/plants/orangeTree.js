// Mature orange tree: glossy lance leaves and bright, dimpled citrus fruit.
import * as THREE from 'three';
import { V, TAU, random, material, ground, branch, blob, leaf, orange, pickable, finishModel } from './shared.js';

export const name = 'Orange tree';

export function create(seed = 1) {
  const rnd = random(seed), group = new THREE.Group(), body = new THREE.Group();
  group.name = 'venture-orange-tree';
  group.add(ground(0.84), body);
  const wood = material(0x79513a);
  const canopyMats = [0x376f43, 0x4b8649, 0x60984e].map(c => material(c, { roughness: 0.82 }));
  const leaves = [0x3f7e46, 0x5b9955].map(c => material(c, { side: THREE.DoubleSide, roughness: 0.48 }));

  branch(body, [V(0, 0, 0), V(0.035, 0.38, 0), V(-0.02, 0.76, 0.015), V(0.02, 1.15, 0)], 0.12, 0.045, wood, 18);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.35;
    const tip = V(Math.cos(a) * (0.48 + rnd() * 0.12), 1.08 + (i % 2) * 0.3, Math.sin(a) * (0.48 + rnd() * 0.12));
    branch(body, [V(0, 0.5 + i * 0.055, 0), V(tip.x * 0.5, tip.y - 0.08, tip.z * 0.5), tip], 0.045, 0.012, wood, 12);
    for (let j = 0; j < 3; j++) {
      blob(body, canopyMats[(i + j) % 3], tip.clone().add(V((rnd() - 0.5) * 0.37, j * 0.12, (rnd() - 0.5) * 0.37)),
        [0.34 + rnd() * 0.1, 0.32 + rnd() * 0.08, 0.35 + rnd() * 0.08], 1);
    }
    for (let j = 0; j < 7; j++) {
      leaf(body, leaves[(i + j) % 2], {
        at: tip.clone().add(V((rnd() - 0.5) * 0.32, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.32)),
        yaw: a + j * 2.4, pitch: -0.2 + rnd() * 0.65, roll: (rnd() - 0.5) * 0.5,
        length: 0.26 + rnd() * 0.1, width: 0.063 + rnd() * 0.018, kind: 'lance',
      });
    }
  }
  blob(body, canopyMats[1], V(0, 1.58, 0), [0.48, 0.4, 0.48], 1);

  const pickables = [];
  const fruit = [
    [-0.48, 0.68, 0.69], [0.02, 0.61, 0.80], [0.51, 0.76, 0.62],
    [-0.28, 0.89, 0.85], [0.33, 0.95, 0.77], [-0.35, 1.20, 0.97],
    [0.03, 1.20, 0.78], [0.49, 1.16, 0.56],
  ];
  fruit.forEach(([x, y, z], i) => {
    const f = orange(0.14);
    f.position.set(x, y, z); f.rotation.y = rnd() * TAU;
    body.add(f);
    branch(body, [V(x * 0.5, y + 0.25, 0.4), V(x, y + 0.14, z)], 0.009, 0.006, wood, 4);
    pickable(pickables, `orange-${i + 1}`, 'orange', f, 0.18);
  });

  return finishModel(name, group, body, pickables);
}
