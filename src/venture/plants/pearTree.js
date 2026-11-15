// Mature pear tree: a narrow, upright crown with green-gold, broad-based pears.
import * as THREE from 'three';
import { V, TAU, random, material, mesh, ground, branch, blob, leaf, pickable, finishModel } from './shared.js';

export const name = 'Pear tree';

function pear(radius, color) {
  const g = new THREE.Group();
  const profile = [
    [0, -1.18], [0.45, -1.14], [0.82, -0.94], [1, -0.57], [0.96, -0.2],
    [0.75, 0.16], [0.46, 0.48], [0.3, 0.82], [0.31, 1.1], [0.18, 1.3], [0, 1.34],
  ].map(([x, y]) => new THREE.Vector2(x * radius, y * radius));
  mesh(g, new THREE.LatheGeometry(profile, 14), material(color, { roughness: 0.58 }));

  const wood = material(0x665037);
  branch(g, [V(0, radius * 1.22, 0), V(0.015, radius * 1.55, 0), V(0.035, radius * 1.88, 0.01)],
    radius * 0.085, radius * 0.05, wood, 5);
  leaf(g, material(0x668c48, { side: THREE.DoubleSide }), {
    at: V(0.02, radius * 1.5, 0), yaw: 0.8, pitch: 0.25,
    length: radius * 1.25, width: radius * 0.38, kind: 'lance',
  });
  return g;
}


export function create(seed = 1) {
  const rnd = random(seed), group = new THREE.Group(), body = new THREE.Group();
  group.name = 'venture-pear-tree';
  group.add(ground(0.82), body);
  const wood = material(0x76543d), woodLight = material(0x8b694a);
  const greens = [0x587f45, 0x709553, 0x86a65e].map(c => material(c, { roughness: 0.84 }));
  const leafMat = material(0x769d56, { side: THREE.DoubleSide });

  branch(body, [V(0, 0, 0), V(0.025, 0.46, 0), V(-0.025, 0.98, 0.015), V(0.015, 1.47, 0), V(0, 1.84, 0)],
    0.125, 0.026, wood, 22);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + 0.2;
    branch(body, [V(0, 0.15, 0), V(Math.cos(a) * 0.23, 0.045, Math.sin(a) * 0.23),
      V(Math.cos(a) * 0.35, 0.02, Math.sin(a) * 0.35)], 0.052, 0.01, wood, 8);
  }

  const tips = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.399963 + 0.3;
    const r = 0.28 + (8 - i) * 0.012 + rnd() * 0.035;
    const start = V(0, 0.54 + i * 0.115, 0);
    const tip = V(Math.cos(a) * r, 1.08 + i * 0.073 + rnd() * 0.05, Math.sin(a) * r);
    const middle = start.clone().lerp(tip, 0.55); middle.y += 0.11;
    branch(body, [start, middle, tip], 0.047 - i * 0.003, 0.011, i % 2 ? woodLight : wood, 13);
    tips.push(tip);

    for (let j = 0; j < 3; j++) {
      const p = tip.clone().add(V((rnd() - 0.5) * 0.22, (j - 1) * 0.14, (rnd() - 0.5) * 0.22));
      blob(body, greens[(i + j) % greens.length], p,
        [0.25 + rnd() * 0.055, 0.26 + rnd() * 0.06, 0.25 + rnd() * 0.055], 1);
    }
    for (let j = 0; j < 3; j++) {
      leaf(body, leafMat, {
        at: tip.clone().add(V(0, (j - 1) * 0.13, 0)), yaw: a + j * 2.1,
        pitch: -0.15 + rnd() * 0.5, roll: (rnd() - 0.5) * 0.45,
        length: 0.27 + rnd() * 0.08, width: 0.085 + rnd() * 0.025,
      });
    }
  }
  blob(body, greens[1], V(0, 1.88, 0), [0.29, 0.29, 0.28], 1);

  const pickables = [];
  const fruit = [
    [-0.30, 0.80, 0.58], [0.22, 0.75, 0.62], [0.36, 0.95, 0.44],
    [-0.32, 1.02, 0.58], [0.04, 1.12, 0.68], [-0.34, 1.34, 0.90],
    [0.16, 1.40, 0.86], [0.02, 1.46, 0.46],
  ];
  fruit.forEach(([x, y, z], i) => {
    const f = pear(0.12, i % 3 === 0 ? 0xd0bd55 : 0xaebc51);
    f.position.set(x, y, z); f.rotation.y = rnd() * TAU;
    body.add(f);
    branch(body, [V(x * 0.4, y + 0.37, 0.3), V(x + 0.015, y + 0.26, z), V(x + 0.025, y + 0.21, z)],
      0.009, 0.005, wood, 5);
    pickable(pickables, `pear-${i + 1}`, 'pear', f, 0.19);
  });

  return finishModel(name, group, body, pickables);
}
