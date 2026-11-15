// Mature cherry tree: a broad crown with eight individually pickable front-facing cherries.
import * as THREE from 'three';
import { V, TAU, random, material, ground, branch, blob, leaf, fruitBody, pickable, finishModel } from './shared.js';

export const name = 'Cherry tree';

function cherry(rnd) {
  const g = new THREE.Group();
  const stemMat = material(0x687541, { roughness: 0.72 });
  const center = V(0, -0.25, 0), radius = 0.07;
  const { group: fruit } = fruitBody(radius, rnd() > 0.5 ? 0xd93b46 : 0xc73340, { height: 0.94, width: 1.03 });
  fruit.position.copy(center); g.add(fruit);
  branch(g, [V(0, 0, 0), V(0.025, -0.1, 0), V(center.x, center.y + radius * 0.9, center.z)], 0.0055, 0.0032, stemMat, 8);
  return g;
}

export function create(seed = 1) {
  const rnd = random(seed), group = new THREE.Group(), body = new THREE.Group();
  group.name = 'venture-cherry-tree';
  group.add(ground(0.94), body);
  const wood = material(0x704b3c), woodLight = material(0x89604a);
  const greens = [0x427847, 0x59904f, 0x6ca059].map(c => material(c, { roughness: 0.84 }));
  const leafMat = material(0x5c944f, { side: THREE.DoubleSide });

  branch(body, [V(0, 0, 0), V(-0.035, 0.35, 0.015), V(0.025, 0.72, -0.02), V(0, 1.13, 0)],
    0.135, 0.048, wood, 18);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    branch(body, [V(0, 0.13, 0), V(Math.cos(a) * 0.28, 0.04, Math.sin(a) * 0.28),
      V(Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42)], 0.06, 0.012, wood, 8);
  }

  const tips = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.18;
    const r = 0.66 + rnd() * 0.16;
    const start = V(0, 0.48 + (i % 4) * 0.1, 0);
    const tip = V(Math.cos(a) * r, 1.19 + (i % 3) * 0.12 + rnd() * 0.07, Math.sin(a) * r);
    const middle = start.clone().lerp(tip, 0.58); middle.y += 0.07;
    branch(body, [start, middle, tip], 0.057, 0.014, i % 2 ? woodLight : wood, 14);
    tips.push(tip);

    for (let j = 0; j < 3; j++) {
      const p = tip.clone().add(V((rnd() - 0.5) * 0.4, j * 0.09, (rnd() - 0.5) * 0.4));
      blob(body, greens[(i + j) % greens.length], p,
        [0.34 + rnd() * 0.09, 0.25 + rnd() * 0.07, 0.34 + rnd() * 0.09], 1);
    }
    for (let j = 0; j < 5; j++) {
      leaf(body, leafMat, {
        at: tip.clone().add(V((rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.3)),
        yaw: a + j * 2.4, pitch: -0.25 + rnd() * 0.55, roll: (rnd() - 0.5) * 0.5,
        length: 0.26 + rnd() * 0.09, width: 0.085 + rnd() * 0.025, kind: 'serrated',
      });
    }
  }
  blob(body, greens[1], V(0, 1.52, 0), [0.52, 0.34, 0.5], 1);

  const pickables = [];
  const clusters = [
    [-0.61, 0.90, 0.73], [-0.08, 0.84, 0.93], [0.52, 0.96, 0.69],
    [-0.33, 1.10, 0.86], [0.28, 1.12, 0.87], [-0.36, 1.40, 0.99],
    [0.04, 1.40, 0.79], [0.59, 1.28, 0.57],
  ];
  clusters.forEach(([x, y, z], i) => {
    const f = cherry(rnd);
    f.position.set(x, y, z); f.rotation.y = rnd() * TAU;
    body.add(f);
    branch(body, [V(x * 0.55, y + 0.14, 0.5), V(x, y + 0.07, z), V(x, y, z)],
      0.009, 0.005, wood, 5);
    pickable(pickables, `cherry-${i + 1}`, 'cherry', f, 0.22, V(0, -0.25, 0));
  });

  return finishModel(name, group, body, pickables);
}
