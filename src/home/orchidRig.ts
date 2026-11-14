// The Home plant as the model worker's moth orchid (lab snapshot, src/home/lab/plants/orchid.js), in our clay pot


// Watering adds (perk, glow, sparks); nothing here makes the plant smaller, paler or lower than its resting pose.
import * as THREE from 'three';
import type { PlantRig } from './rig';
import { create as createOrchid } from './lab/plants/orchid.js';
import { C, damp, ease, mulberry, radialTexture, reduced, soft, taperedTube } from './gardenRig';
import { readLog, localDate } from '../state';

/** Amit, 2026-11-14 20:15: Home has only day progression. The plant shown is the model's own timeline for the
 *  day: the initial ladder (sapling day 0, first spike 3, first bloom ~12, five blooms 21, mature ~45), then its
 *  42-day loop. No head start, no cap, no mood (one fixed value below). */
const BEST_MOOD = 4;            // the orchid's mood runs 1..4; fixed: Home has no mood
const S = 1.85;                 // orchid scale in the pot
const SEED = 0;                 // the orchid's seed: shape jitter and bloom colour family

/** Whole local days since the first app_open in the log (0 on the first day). */
export function daysSinceFirstOpen(now = new Date()): number {
  const first = readLog().find(e => e.type === 'app_open');
  if (!first) return 0;
  const a = new Date(localDate(new Date(first.t)) + 'T12:00:00'), b = new Date(localDate(now) + 'T12:00:00');
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}
/** DEV override for demos and screenshots only: ?day=N in the URL, or localStorage 'garden.devDay'. */
function devDay(): number | null {
  try {
    const q = new URLSearchParams(location.search).get('day') ?? localStorage.getItem('garden.devDay');
    const n = q === null || q === '' ? NaN : Number(q);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}
export const orchidAge = (days: number) => devDay() ?? Math.max(0, days);

export function createOrchidRig(opts: { age?: number; seed?: number } = {}): PlantRig {
  const group = new THREE.Group();
  group.name = 'orchid-rig';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const rnd = mulberry(23);

  // ---------- light: soft sky, warm key from upper left, cool rim from behind ----------
  const hemi = new THREE.HemisphereLight(C.sky, C.ground, 1.55);
  const key = new THREE.DirectionalLight(C.key, 1.8);
  key.position.set(-2.5, 5, 4);
  const rim = new THREE.DirectionalLight(C.rim, 1.0);
  rim.position.set(2.5, 3, -4);
  group.add(hemi, key, rim);

  // ---------- ground shadow ----------
  const shadowTex = keep(radialTexture([[0, 'rgba(40,70,58,0.34)'], [0.45, 'rgba(40,70,58,0.15)'], [1, 'rgba(40,70,58,0)']]));
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.8, 1.8)),
    keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.32;
  shadow.renderOrder = -1;
  group.add(shadow);

  const float = new THREE.Group();
  group.add(float);

  // ---------- pot (as in gardenRig) ----------
  const potProfile = [
    [0.0, 0.0], [0.26, 0.0], [0.3, 0.02], [0.33, 0.06], [0.38, 0.2], [0.42, 0.36], [0.44, 0.48], [0.44, 0.54],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(keep(new THREE.LatheGeometry(potProfile, 56)), keep(soft(C.pot, { roughness: 0.9 })));
  const rimProfile = [
    [0.43, 0.52], [0.48, 0.535], [0.5, 0.56], [0.505, 0.62], [0.5, 0.66], [0.48, 0.675], [0.45, 0.675], [0.43, 0.66], [0.42, 0.6],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const potRim = new THREE.Mesh(keep(new THREE.LatheGeometry(rimProfile, 56)), keep(soft(C.potRim, { roughness: 0.55 })));
  const band = new THREE.Mesh(keep(new THREE.TorusGeometry(0.418, 0.008, 8, 64)), keep(soft(C.band, { roughness: 0.9 })));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.4;
  const soil = new THREE.Mesh(keep(new THREE.SphereGeometry(0.44, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
    keep(soft(C.soil, { roughness: 1 })));
  soil.scale.y = 0.12;
  soil.position.y = 0.6;
  float.add(pot, potRim, band, soil);
  // orchids sit in bark: a few warm chips instead of pebbles
  const chips = new THREE.InstancedMesh(keep(new THREE.DodecahedronGeometry(0.04, 0)), keep(soft(0xb98a62, { roughness: 0.9 })), 9);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4 + 0.3, r = 0.14 + rnd() * 0.22;
    const o = new THREE.Object3D();
    o.position.set(Math.cos(a) * r, 0.635, Math.sin(a) * r);
    o.scale.set(1.2 + rnd() * 0.6, 0.45, 0.8 + rnd() * 0.4);
    o.rotation.y = rnd() * 3;
    o.updateMatrix();
    chips.setMatrixAt(i, o.matrix);
  }
  float.add(chips);

  // ---------- the orchid ----------
  const orchid = createOrchid(opts.seed ?? SEED);
  orchid.group.remove(orchid.group.children[0]);           // its moss-and-soil ground: our pot holds it instead
  const plant = new THREE.Group();
  plant.position.y = 0.6;
  // mirrored (three.js flips the winding for a negative determinant) and turned so the leaves fan out sideways and
  // the first spike arches out to the left and toward the viewer, away from the can
  const MIRROR = -1;
  plant.scale.set(MIRROR * S, S, S);
  plant.rotation.y = 0.0;
  plant.add(orchid.group);
  float.add(plant);
  let age = -1;
  function setAge(a: number) {
    if (a <= age) return;                            // only ever forward
    age = a;
    orchid.set({ age, mood: BEST_MOOD });
    // its materials were made flat-shaded for a dark page: smooth them for the light one, soften the speculars
    orchid.body.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !(m as any).isMeshStandardMaterial || m.userData.lit) return;
      m.userData.lit = true;
      m.flatShading = false;
      m.roughness = Math.max(m.roughness, 0.6);
      m.needsUpdate = true;
    });
    orchid.body.updateMatrixWorld(true);
  }
  setAge(opts.age ?? orchidAge(daysSinceFirstOpen()));

  // plant extent in rig space, for the can's aim, the halo and the hit target
  group.updateMatrixWorld(true);
  const plantBox = new THREE.Box3().setFromObject(plant);
  const top = new THREE.Vector3(); plantBox.getCenter(top); top.y = plantBox.max.y;

  // a soft halo behind the plant: the magic, stronger on a watered day and at the moment of watering
  const haloTex = keep(radialTexture([[0, 'rgba(255,248,240,0.95)'], [0.3, 'rgba(244,218,246,0.55)'], [0.7, 'rgba(232,206,240,0.16)'], [1, 'rgba(232,206,240,0)']]));
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0.35 })));
  const haloAt = plantBox.getCenter(new THREE.Vector3());
  halo.position.set(haloAt.x, haloAt.y + 0.1, plantBox.min.z - 0.05);
  halo.scale.setScalar(Math.max(plantBox.max.x - plantBox.min.x, plantBox.max.y - plantBox.min.y) * 1.35);
  halo.renderOrder = -1;
  group.add(halo);
  const plantLight = new THREE.PointLight(0xffd9ec, 0.0, 2.4, 2);
  plantLight.position.set(haloAt.x, haloAt.y + 0.2, haloAt.z + 0.5);
  group.add(plantLight);

  // motes drifting around the blooms
  const dotTex = keep(radialTexture([[0, 'rgba(255,252,244,1)'], [0.25, 'rgba(255,214,236,0.9)'], [1, 'rgba(255,200,230,0)']], 64));
  const moteMat = keep(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false }));
  const motes: { s: THREE.Sprite; r: number; ph: number; sp: number; y: number; extra: boolean }[] = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(moteMat);
    s.scale.setScalar(0.06 + rnd() * 0.04);
    group.add(s);
    motes.push({ s, r: 0.45 + rnd() * 0.35, ph: rnd() * 6.28, sp: 0.25 + rnd() * 0.25, y: rnd(), extra: i >= 4 });
  }

  // ---------- watering can (as in gardenRig) ----------
  const can = new THREE.Group();
  const canBody = new THREE.Group();
  can.add(canBody);
  const canMat = keep(soft(C.can, { roughness: 0.6 }));
  const canDeepMat = keep(soft(C.canDeep, { roughness: 0.6 }));
  const canHandleMat = keep(soft(C.canHandle, { roughness: 0.7 }));
  const bodyProfile = [
    [0.0, -0.2], [0.2, -0.2], [0.235, -0.185], [0.25, -0.15], [0.25, 0.08], [0.235, 0.13], [0.2, 0.165], [0.13, 0.19], [0.12, 0.2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tub = new THREE.Mesh(keep(new THREE.LatheGeometry(bodyProfile, 40)), canMat);
  const lip = new THREE.Mesh(keep(new THREE.TorusGeometry(0.12, 0.018, 10, 32)), canDeepMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.2;
  const stripe = new THREE.Mesh(keep(new THREE.TorusGeometry(0.252, 0.012, 8, 48)), canHandleMat);
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = -0.1;
  const handle = new THREE.Mesh(keep(new THREE.TorusGeometry(0.17, 0.026, 10, 32, Math.PI * 1.1)), canHandleMat);
  handle.position.set(0.17, 0.02, 0);
  handle.rotation.z = -Math.PI / 2 - 0.05;
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, -0.1, 0), new THREE.Vector3(-0.34, -0.02, 0),
    new THREE.Vector3(-0.48, 0.12, 0), new THREE.Vector3(-0.56, 0.24, 0),
  ]);
  const spout = new THREE.Mesh(keep(taperedTube(spoutCurve, 16, 10, u => 0.055 - 0.025 * u)), canMat);
  const roseG = new THREE.Group();
  spoutCurve.getPointAt(1, roseG.position);
  const rose = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.075, 0.035, 0.08, 20)), canDeepMat);
  roseG.rotation.z = 0.62;
  roseG.add(rose);
  const roseFace = new THREE.Object3D();
  roseFace.position.set(0, 0.045, 0);
  roseG.add(roseFace);
  canBody.add(tub, lip, stripe, handle, spout, roseG);
  const REST = new THREE.Vector3(Math.max(0.7, plantBox.max.x + 0.05), top.y + 0.15, 0.15);
  can.position.copy(REST);
  can.rotation.y = -0.25;
  group.add(can);
  // where the water should land: just above the plant's centre, a little in front so the stream reads
  const aim = new THREE.Vector3(0.12, top.y + 0.28, 0.3);

  // ---------- water: a stream of instanced drops in rig space ----------
  const N = 640;
  const dropGeo = keep(new THREE.SphereGeometry(0.0135, 6, 4));
  const dropMat = keep(new THREE.MeshStandardMaterial({
    color: 0x5ea8e6, emissive: new THREE.Color(0x8cc8f2), emissiveIntensity: 0.5, roughness: 0.25, transparent: true, opacity: 0.88,
  }));
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, N);
  drops.frustumCulled = false;
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(drops);
  const dp = Array.from({ length: N }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));

  // splashes where the stream meets the soil: small rings that grow and fade
  const ringTex = keep(radialTexture([[0, 'rgba(140,200,240,0)'], [0.62, 'rgba(140,200,240,0)'], [0.78, 'rgba(160,210,245,0.7)'], [1, 'rgba(160,210,245,0)']], 64));
  const ringMat = keep(new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false }));
  const ringGeo = keep(new THREE.PlaneGeometry(1, 1));
  const rings = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(ringGeo, ringMat.clone());
    disposables.push(m.material as THREE.Material);
    m.rotation.x = -Math.PI / 2; m.visible = false; float.add(m);
    return { m, k: 1 };
  });
  let ringNext = 0, ringAcc = 0;

  // the sparkle burst for the day's watering
  const burst = Array.from({ length: 16 }, () => {
    const s = new THREE.Sprite(moteMat);
    s.visible = false;
    float.add(s);
    return { s, a: 0, r: 0, y: 0 };
  });

  // ---------- hit targets: generous, invisible ----------
  const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
  const pw = Math.max(0.5, (plantBox.max.x - plantBox.min.x) / 2), ph = plantBox.max.y;
  const plantHit = new THREE.Mesh(keep(new THREE.CylinderGeometry(pw, 0.55, ph, 12)), hitMat);
  plantHit.position.set((plantBox.max.x + plantBox.min.x) / 2, ph / 2, 0);
  float.add(plantHit);
  const canHit = new THREE.Mesh(keep(new THREE.SphereGeometry(0.34, 12, 8)), hitMat);
  can.add(canHit);

  // ---------- state ----------
  let pouring = false, watered = false;
  let tilt = 0, pulse = 0, glow = 0, spawn = 0, pourT = 0;
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  const roseW = new THREE.Vector3(), dirW = new THREE.Vector3(), pourPos = new THREE.Vector3().copy(REST);

  function update(dt: number, t: number) {
    dt = Math.min(dt, 0.05);
    const calm = reduced() ? 0.25 : 1;
    pulse = Math.max(0, pulse - dt * 0.55);
    const lift = ease(Math.min(1, pulse * 1.6)) * (pulse > 0 ? 1 : 0);
    glow = damp(glow, (watered ? 1 : 0) + (pouring ? 0.4 : 0), 2.2, dt);

    float.position.y = 0.07 * Math.sin(t * 0.55) * calm + 0.08 * lift;
    float.rotation.z = 0.018 * Math.sin(t * 0.4) * calm;
    float.rotation.x = 0.01 * Math.cos(t * 0.33) * calm;
    const h = float.position.y;
    shadow.scale.setScalar(1 - h * 0.6);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 1 - h * 1.2;

    orchid.update(dt, t * calm, { perk: 0.35 * glow + 1.2 * lift, mood: BEST_MOOD });
    const g = S * (1 + 0.03 * lift); plant.scale.set(MIRROR * g, g, g);
    halo.position.y = haloAt.y + 0.1 + h;
    (halo.material as THREE.SpriteMaterial).opacity = 0.5 + 0.25 * glow + 0.35 * lift + 0.05 * Math.sin(t * 1.3);
    plantLight.intensity = 0.15 * glow + 0.45 * lift;
    for (const M of motes) {
      const on = !M.extra || glow > 0.5 || lift > 0;
      M.s.visible = on;
      if (!on) continue;
      const a = t * M.sp * (1 + 0.5 * glow) * calm + M.ph;
      M.s.position.set(haloAt.x + Math.cos(a) * M.r, haloAt.y + h + (M.y - 0.3) * 0.7 + 0.08 * Math.sin(a * 1.7), Math.sin(a) * M.r * 0.6);
    }

    // the can: rests above and to the right with a small bob; while pouring it moves so its rose sits over the
    // plant, and tips. The rose is steered to `aim` by feedback, so the stream always lands on the plant.
    pourT = damp(pourT, pouring ? 1 : 0, pouring ? 9 : 3.2, dt);
    tilt = damp(tilt, pouring ? 0.78 : -0.1, pouring ? 9 : 3.5, dt);
    canBody.rotation.z = tilt + 0.03 * Math.sin(t * 0.8) * calm * (1 - pourT);
    can.updateMatrixWorld(true);
    roseFace.getWorldPosition(roseW); group.worldToLocal(roseW);
    if (pouring) pourPos.addScaledVector(tmp.subVectors(aim, roseW), Math.min(1, dt * 10));
    else pourPos.lerp(REST, Math.min(1, dt * 3));
    can.position.lerpVectors(REST, pourPos, pourT);
    can.position.y += 0.05 * Math.sin(t * 1.1 + 1) * calm * (1 - pourT);

    // the stream: drops leave the rose along its axis and fall in an arc onto the plant
    const flow = Math.max(0, Math.min(1, (tilt - 0.3) / 0.3));
    if (pouring && flow > 0) {
      spawn += dt * 500 * flow;
      roseFace.getWorldPosition(roseW); group.worldToLocal(roseW);
      dirW.set(0, 1, 0).applyQuaternion(roseFace.getWorldQuaternion(q)).normalize();
      while (spawn >= 1) {
        spawn -= 1;
        const d = dp.find(x => !x.alive);
        if (!d) break;
        d.alive = true;
        d.p.copy(roseW).add(tmp.set((Math.random() - 0.5) * 0.045, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.045));
        d.v.copy(dirW).multiplyScalar(0.8 + Math.random() * 0.15).add(tmp.set((Math.random() - 0.5) * 0.08, -0.7, (Math.random() - 0.5) * 0.08));
        d.s = 0.75 + Math.random() * 0.5;
      }
    } else spawn = 0;
    const floor = 0.66 + h;
    let landed = 0, live = 0;
    for (let i = 0; i < N; i++) {                   // only live drops are drawn: they are packed at the front
      const d = dp[i];
      if (!d.alive) continue;
      d.v.y -= 12 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < floor) { d.alive = false; landed++; continue; }
      q.setFromUnitVectors(up, tmp.copy(d.v).normalize());
      const stretch = 1 + Math.min(2.6, d.v.length() * 0.9);
      m4.compose(d.p, q, sc.set(d.s, d.s * stretch, d.s));
      drops.setMatrixAt(live++, m4);
    }
    drops.count = live;
    drops.instanceMatrix.needsUpdate = true;
    ringAcc += landed;
    while (ringAcc >= 12) {
      ringAcc -= 12;
      const R = rings[ringNext++ % rings.length];
      R.k = 0; R.m.visible = true;
      R.m.position.set(aim.x + (Math.random() - 0.5) * 0.25, 0.665, aim.z - 0.1 + (Math.random() - 0.5) * 0.2);
    }
    for (const R of rings) {
      if (!R.m.visible) continue;
      R.k += dt * 1.6;
      if (R.k >= 1) { R.m.visible = false; continue; }
      R.m.scale.setScalar(0.08 + 0.3 * R.k);
      (R.m.material as THREE.MeshBasicMaterial).opacity = 1 - R.k;
    }

    for (const B of burst) {
      if (pulse <= 0) { B.s.visible = false; continue; }
      const k = 1 - pulse;
      B.s.visible = true;
      const r = B.r * (0.4 + k * 1.1);
      B.s.position.set(Math.cos(B.a + k * 1.2) * r, 0.7 + B.y + k * 1.3, Math.sin(B.a + k * 1.2) * r);
      B.s.scale.setScalar(0.1 * Math.sin(Math.PI * Math.min(1, k * 1.3)) + 0.001);
    }
  }

  return {
    group,
    update,
    setPouring(on) { pouring = on; },
    celebrate() {
      pulse = 1;
      for (const B of burst) { B.a = Math.random() * 6.28; B.r = 0.25 + Math.random() * 0.45; B.y = Math.random() * 0.5; }
      setAge(orchidAge(daysSinceFirstOpen()));      // a new day may have begun since load
    },
    setWatered(w) { watered = w; },
    hitTargets: [plantHit, canHit],
    dispose() {
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}
