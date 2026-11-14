// The Home plant: a moth orchid (Phalaenopsis), slightly enchanted.
//
// Timeline (days since planting; the user gets a sapling, not a seed):
//   day 0      three leaves (two lying out, one upright), one root tip, no spike
//   days 1-5   a new leaf unfurls; day 3 the first spike emerges and rises visibly every day until day 8
//   days 8-12  the spike arches, buds swell; first bloom opens ~day 12
//   days 12-21 blooms open one after another to five by day 21
//   days 22-45 full bloom held; plant reaches mature size; new leaves every two weeks
//   from 45    THE LOOP: period 42 days. A spike every 42 days from alternating sides, blooms open on cycle
//              days 12-21 and last ~36 days, so one spike's flowers overlap the next. A leaf every 21 days,
//              each living 126, so there are always six. Nothing ever runs out and nothing grows forever.
//
// Mood (1-4) is read from the moment, never stored: leaf pitch, flower openness, leaf tint, sway amplitude.
// API: create(seed) -> { group, body, set({age, mood}), update(dt, t, {perk, mood}), attachPoints(), name }
import * as THREE from 'three';
import { palette, matte, seeded, lerp, clamp } from '../style.js';
import { grow, life, bladeGeo, stem, orchid, bud, ground, leafColor, smooth } from './organs.js';

export const name = 'Orchid';

// ---- schedule ----
const LEAF_BIRTHS = [-45, -25, -8, 1, 15, 29, 43, 57];          // the ramp; then every 21 days
const leafBorn = k => k < LEAF_BIRTHS.length ? LEAF_BIRTHS[k] : 81 + 21 * (k - LEAF_BIRTHS.length);
const LEAF_GROW = 6, LEAF_SPAN = 126, LEAF_WITHER = 12;
const LOOP_START = 45, LOOP = 42;
const spikeBorn = i => i === 0 ? 3 : LOOP_START + LOOP * (i - 1);
const SPIKE_SPAN = 66, SPIKE_WITHER = 8;
// maturity: overall size, 0.5 at planting -> 1 by ~day 60
const maturity = age => 0.5 + 0.5 * (1 - Math.exp(-Math.max(0, age) / 22));

const FAMILIES = [
  { petal: 0xd9b6ff, lip: 0xc43ea0, glow: 0.22 },   // lilac
  { petal: 0xf48ad6, lip: 0x8e1f72, glow: 0.2 },    // magenta
  { petal: 0xffc9b0, lip: 0xe25a86, glow: 0.18 },   // peach
];

export function create(seed = 1) {
  const rnd = seeded(seed);
  const group = new THREE.Group();
  group.add(ground(0.6));
  const plantRoot = new THREE.Group(); group.add(plantRoot);
  const yawJit = Array.from({ length: 40 }, () => (rnd() - 0.5) * 0.16);
  const rollJit = Array.from({ length: 40 }, () => (rnd() - 0.5) * 0.2);
  const spikeJit = Array.from({ length: 24 }, () => (rnd() - 0.5) * 0.2);
  const familyOf = i => FAMILIES[(i + Math.floor(seed)) % FAMILIES.length];

  let built = { age: -1, mood: -1 }, swayers = [], disposables = [], points = [];
  const spikeMat = matte(0x8a8f5e, { roughness: 0.7, emissive: 0x2a2f1a, emissiveIntensity: 0.25 });   // garden: a lighter olive spike on the light page (was 0x6e5a80 purple)
  const rootMat = matte(palette.root), rootTipMat = matte(0xc9f0c0);

  function rebuild(age, mood) {
    plantRoot.clear(); swayers = []; points = [];
    for (const g of disposables) g.dispose(); disposables = [];
    // garden: leaf greens lifted and softened for the light page (were 0x2f8a4e / 0x6fc66f, emissive 0.35)
    const leafMat = matte(leafColor(0x4f9e74, mood), { side: THREE.DoubleSide, roughness: 0.42, emissive: 0x0b2a14, emissiveIntensity: 0.2 });
    const leafMatOld = matte(leafColor(0x2f8a4e, mood, 0.75), { side: THREE.DoubleSide, roughness: 0.6 });
    const leafMatYoung = matte(leafColor(0x86d48e, mood), { side: THREE.DoubleSide, roughness: 0.45, emissive: 0x1c4a1c, emissiveIntensity: 0.35 });
    const m = maturity(age);

    // crown
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * m + 0.02, 0.07 * m + 0.02, 0.09, 8), matte(palette.leafDeep));
    crown.position.y = 0.045; plantRoot.add(crown);

    // ---- leaves: collect the live ones, rank them newest-first, then place as a fan ----
    const live = [];
    for (let k = 0; ; k++) {
      const born = leafBorn(k); if (born > age) break;
      const { g, w } = life(age, born, LEAF_GROW, LEAF_SPAN, LEAF_WITHER); if (w >= 1) continue;
      live.push({ k, born, g, w });
    }
    live.sort((a, b) => b.born - a.born);
    live.forEach((L, rank) => {
      const { k, born, g, w } = L;
      const side = k % 2 ? 1 : -1;
      const mb = maturity(born + LEAF_GROW);                              // a leaf's final size is set by how mature the plant was when it grew
      const len = (0.26 + 0.27 * mb) * (0.35 + 0.65 * g), wid = (0.07 + 0.05 * mb) * (0.45 + 0.55 * g);
      const pivot = new THREE.Group();
      pivot.rotation.order = 'YXZ';                                           // yaw first, then pitch about the leaf's own base
      pivot.position.y = Math.max(0.04, 0.11 - rank * 0.011);
      // fan: same-side leaves alternate a little forward/back so they never share a plane
      // the fan plane is turned ~32° from the camera so leaves read in three-quarter view (a vertical new leaf is not edge-on)
      const yaw = 0.55 + side * Math.PI / 2 + side * (((rank >> 1) % 2) ? 0.26 : -0.26) + yawJit[k % 40];
      pivot.rotation.y = yaw;
      pivot.rotation.z = rollJit[k % 40] * side;
      const basePitch = Math.min(1.22, 0.1 + rank * 0.26 + (1 - g) * 0.2) + (2.5 - mood) * 0.05 + w * 0.5;
      pivot.rotation.x = basePitch;
      pivot.scale.setScalar(1 - w * 0.45);                                    // a withering leaf sags and shrinks away
      // a leaf still unfurling is a lighter, brighter green than the mature ones
      const mesh = new THREE.Mesh(bladeGeo(len, wid, 'strap', 0.016), w > 0 ? leafMatOld : g < 1 ? leafMatYoung : leafMat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      pivot.add(mesh); plantRoot.add(pivot);
      swayers.push({ obj: pivot, base: basePitch, phase: k * 1.3, amp: 0.012 });
      // an ornament can sit on a grown, healthy leaf: two thirds along the blade
      if (g >= 1 && w === 0) points.push({ kind: 'leaf', object: pivot, local: new THREE.Vector3(0, 0.012, len * 0.66) });
    });

    // ---- aerial roots: silvery, light tips; one at planting, up to five ----
    const nRoots = Math.min(5, 1 + Math.floor((age + 10) / 24));
    for (let r = 0; r < nRoots; r++) {
      const g = r === 0 ? 1 : grow(age, r * 24 - 10, 20); if (g <= 0) continue;
      const a = r * 2.1 + 0.9, L = (0.14 + 0.2 * g) * m;
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const pts = [new THREE.Vector3(d.x * 0.05, 0.06, d.z * 0.05), new THREE.Vector3(d.x * (0.05 + L * 0.5), 0.075, d.z * (0.05 + L * 0.5)), new THREE.Vector3(d.x * (0.05 + L), 0.025, d.z * (0.05 + L))];
      const rt = stem(pts, 0.013, 0.009, rootMat, 8); disposables.push(rt.mesh.geometry); plantRoot.add(rt.mesh);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), rootTipMat); tip.position.copy(pts[2]); plantRoot.add(tip);
    }

    // ---- spikes ----
    for (let i = 0; ; i++) {
      const born = spikeBorn(i); if (born > age) break;
      const first = i === 0;
      const { g, w } = life(age, born, first ? 8 : 12, SPIKE_SPAN, SPIKE_WITHER); if (w >= 1) continue;
      const side = i % 2 ? -1 : 1, j = spikeJit[i % 24];
      const sag = w * 0.45, S = (0.75 + 0.25 * m);
      const pts = [
        new THREE.Vector3(0, 0.07, 0),
        new THREE.Vector3(side * 0.08 * g * S, (0.07 + 0.34 * g) * S, 0.06 * g),
        new THREE.Vector3(side * 0.3 * g * S, (0.07 + (0.64 - sag * 0.3) * g) * S, (0.15 + j) * g),
        new THREE.Vector3(side * 0.56 * g * S, (0.07 + (0.74 - sag) * g) * S, (0.3 + j) * g),
      ];
      const sp = stem(pts, 0.014, 0.007, spikeMat, 14); disposables.push(sp.mesh.geometry); plantRoot.add(sp.mesh);
      swayers.push({ obj: sp.mesh, base: 0, phase: i * 2, amp: 0.008 });
      // a pale growing tip while the spike is rising, so a young spike reads as a living thing, not a wire
      const tipNub = new THREE.Mesh(new THREE.SphereGeometry(0.009 + 0.014 * (1 - g), 7, 6), g < 1 ? rootTipMat : spikeMat);
      tipNub.scale.set(1, 1.5, 1); tipNub.position.copy(pts[3]); plantRoot.add(tipNub);

      // blooms along the outer half, opening one after another
      const n = first ? 5 : 6 + (i % 2);
      const fam = familyOf(i);
      const budAt = born + (first ? 5 : 8), openAt = born + (first ? 9 : 12);
      const up = new THREE.Vector3(0, 1, 0), perp = new THREE.Vector3(), off = new THREE.Vector3();
      for (let b = 0; b < n; b++) {
        const t = 0.38 + 0.62 * (b / (n - 1));
        const bb = budAt + 1.2 * b, ob = openAt + 1.6 * b;
        const budG = grow(age, bb, 3); if (budG <= 0) continue;
        const openG = grow(age, ob, 2.5);
        const fade = smooth((age - ob - 36) / 6); if (fade >= 1) continue;
        // blooms alternate left/right of the spike on short pedicels, each leaning toward the viewer:
        // from a fixed camera they then stand clear of each other instead of stacking along the stem
        const p = sp.curve.getPointAt(t), tan = sp.curve.getTangentAt(t);
        const alt = b % 2 ? 1 : -1;
        perp.crossVectors(tan, up).normalize();
        off.copy(perp).multiplyScalar(alt * 0.07).add(new THREE.Vector3(0, -0.035, 0.06));
        const ped = stem([p, p.clone().addScaledVector(off, 0.5).add(new THREE.Vector3(0, -0.01, 0)), p.clone().add(off)], 0.005, 0.004, spikeMat, 4);
        disposables.push(ped.mesh.geometry); plantRoot.add(ped.mesh);
        const holder = new THREE.Group(); holder.position.copy(p).add(off);
        holder.rotation.order = 'YXZ';
        holder.rotation.y = (side > 0 ? -0.85 : Math.PI + 0.85) + alt * 0.28;   // faces out and toward the viewer
        holder.rotation.x = 0.12 + fade * 0.5;                                    // slightly pendent; droops as it fades
        holder.rotation.z = side * -0.2;
        if (openG <= 0) holder.add(bud(0.02 * (0.4 + 0.6 * budG), palette.leafPale));
        else {
          // each bloom a touch different in hue, all faintly luminous
          const c = new THREE.Color(fam.petal).offsetHSL((b - n / 2) * 0.008, 0, 0);
          holder.add(orchid({ color: c.getHex(), lip: fam.lip, glow: fam.glow, size: 1.4 * (1 - fade * 0.55), open: openG * lerp(0.9, 1, (mood - 1) / 3) }));
        }
        plantRoot.add(holder);   // garden: blooms 1.4 (was 1.1) so they read on a phone
      }
    }
    built = { age, mood };
  }

  function set({ age, mood }) {
    if (Math.abs(age - built.age) > 0.2 || mood !== built.mood) rebuild(age, mood);
  }

  function update(dt, t, { perk = 0, mood = 3 } = {}) {
    const amp = lerp(0.6, 1, (mood - 1) / 3);
    plantRoot.rotation.z = Math.sin(t * 0.5) * 0.006 * amp;
    for (const s of swayers) s.obj.rotation.x = s.base - perk * 0.08 + Math.sin(t * 0.9 + s.phase) * s.amp * amp;
  }

  return { group, body: plantRoot, set, update, attachPoints: () => points, name, LOOP_START, LOOP };
}
