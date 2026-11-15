// The Home plant as the model worker's moth orchid (lab snapshot, src/home/lab/plants/orchid.js), in our clay pot


// Watering adds (perk, glow, sparks); nothing here makes the plant smaller, paler or lower than its resting pose.
import * as THREE from 'three';
import type { PlantRig, RigPoint } from './rig';
import { create as createOrchid } from './lab/plants/orchid.js';
import { C, damp, ease, mulberry, radialTexture, reduced, soft, taperedTube } from './sceneUtils';
import { createHomeOrnament, type HomeOrnament } from './ornaments';
import type { OrnamentId } from '../market/model';
import { daysSinceFirstOpen, wateredToday } from '../state';

/** Amit, 2026-11-14 20:15: Home has only day progression. The plant shown is the model's own timeline for the
 *  day: the initial ladder (sapling day 0, first spike 3, first bloom ~12, five blooms 21, mature ~45), then its
 *  42-day loop. No head start, no cap, no mood (one fixed value below). */
const BEST_MOOD = 4;            // the orchid's mood runs 1..4; fixed: Home has no mood
const S = 1.85;                 // orchid scale in the pot
const SEED = 0;                 // the orchid's seed: shape jitter and bloom colour family

export { daysSinceFirstOpen } from '../state';
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
  let activeOrnament: HomeOrnament | null = null;
  let ornamentId: OrnamentId | null = null;

  // ---------- clay pot ----------
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
  let age = -1, targetAge = 0, growthFrom = 0, growthElapsed = 0, growing = false;
  const calendarAge = (rewarded: boolean) => orchidAge(daysSinceFirstOpen()) + (rewarded ? 1 : 0);
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
  const initialAge = opts.age ?? calendarAge(wateredToday());
  setAge(initialAge);
  targetAge = growthFrom = initialAge;

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

  // ---------- powder-blue watering can ----------
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
  // A real watering-can spout starts almost horizontal in body space. Tipping the whole body 30–60 degrees,
  // rather than merely aiming an already-downward nozzle, makes the handle rise outward and the lid lean inward.
  // The end point lies on the same radial axis as the rose face, so the physical tube and its opening never kink
  // backwards while updateCanAim places that axis on the bark target.
  const spoutAxisAngle = THREE.MathUtils.degToRad(-171);
  const spoutAxis = new THREE.Vector3(Math.cos(spoutAxisAngle), Math.sin(spoutAxisAngle), 0);
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, -0.038, 0), new THREE.Vector3(-0.32, -0.06, 0),
    new THREE.Vector3(-0.51, -0.085, 0), spoutAxis.clone().multiplyScalar(0.67),
  ]);
  const spout = new THREE.Mesh(keep(taperedTube(spoutCurve, 16, 10, u => 0.055 - 0.025 * u)), canMat);
  const roseG = new THREE.Group();
  spoutCurve.getPointAt(1, roseG.position);
  const rose = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.075, 0.035, 0.08, 20)), canDeepMat);
  // CylinderGeometry's outlet points along local +y; turn that axis onto the measured shallow spout axis.
  roseG.rotation.z = spoutAxisAngle - Math.PI / 2;
  roseG.add(rose);
  const roseFace = new THREE.Object3D();
  roseFace.position.set(0, 0.045, 0);
  roseG.add(roseFace);
  const handleTip = new THREE.Object3D();
  handleTip.position.set(0.34, 0.02, 0);
  canBody.add(tub, lip, stripe, handle, spout, roseG, handleTip);
  const REST = new THREE.Vector3(Math.max(0.7, plantBox.max.x + 0.05), top.y + 0.15, 0.15);
  can.position.copy(REST);
  can.visible = false;                           // no ghost can, hit shape or idle bob: a hold creates it
  group.add(can);
  // Ballistic drops meet the bark at the centre of the plant, regardless of where the can is on its arc.
  const aim = new THREE.Vector3(0.12, 0.69, 0.25);
  const WATER_FLIGHT = 0.32, WATER_GRAVITY = 6;

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
  let holding = false, pouring = false, watered = false, waterFlow = 0;
  let pulse = 0, glow = 0, spawn = 0;
  let canAppear = 0, canX = 0.5, smoothX = 0.5;
  const canOrigin = REST.clone(), arcPosition = REST.clone();
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  const roseW = new THREE.Vector3(), handleW = new THREE.Vector3(), lastDropOrigin = new THREE.Vector3();
  let hasDropOrigin = false, outletAimDot = 1;
  const outletDirection = new THREE.Vector3(0, -1, 0), bodyUpDirection = new THREE.Vector3(0, 1, 0);
  const aimDirection = new THREE.Vector3(), canYaw = new THREE.Quaternion(), canTilt = new THREE.Quaternion();
  const localOutletPoint = new THREE.Vector3(), relativeTarget = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  // This is the rose face's actual axis in can space, not an assumed horizontal "pour" direction.
  const localOutletNormal = new THREE.Vector3(0, 1, 0).applyAxisAngle(zAxis, roseG.rotation.z).normalize();
  const localOutletAngle = Math.atan2(localOutletNormal.y, localOutletNormal.x);
  can.updateMatrixWorld(true);
  roseFace.getWorldPosition(localOutletPoint); group.worldToLocal(localOutletPoint).sub(can.position);

  function updateArc(): void {
    const angle = Math.PI * (1 - smoothX);
    const radius = Math.max(0.7, (plantBox.max.x - plantBox.min.x) * 0.48);
    // A small front offset avoids the singular straight-down yaw at the centre of the arc.
    arcPosition.set(Math.cos(angle) * radius, top.y + 0.15 + Math.sin(angle) * 0.55, 0.6);
  }
  function updateCanAim(): void {
    // Solve the exact offset-muzzle equation in the can's tilt plane: target = R*spout + k*R*outletNormal.
    // A two-entry lookup (opposite ballistic branches) avoids iterative lag and always places the physical rose on
    // the ray to the bark. Ry(yaw)*Rz(tilt) then turns that plane around its own measured mesh axis.
    can.updateMatrixWorld(true);
    roseFace.getWorldPosition(roseW); group.worldToLocal(roseW);
    relativeTarget.copy(aim).sub(can.position);
    const length = relativeTarget.length();
    if (length < 0.00001) { relativeTarget.set(0, -1, 0); }
    const horizontalLength = Math.hypot(relativeTarget.x, relativeTarget.z);
    const cross = localOutletNormal.x * localOutletPoint.y - localOutletNormal.y * localOutletPoint.x;
    const along = localOutletNormal.dot(localOutletPoint);
    const sine = THREE.MathUtils.clamp(can.scale.x * cross / Math.max(length, 0.00001), -1, 1);
    const asin = Math.asin(sine), cosine = Math.sqrt(Math.max(0, 1 - sine * sine));
    const wrap = (angle: number) => THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
    // Both facings of the tilt plane are valid algebraically. With the model's radial shallow spout, only the
    // forward upright branch remains at the arc: it tips the body 30–60 degrees and lifts the outer handle.
    // The alternatives would either emit backwards through the tub or turn its lid towards the soil.
    const candidates = [-1, 1].flatMap(sign => {
      const targetAngle = Math.atan2(relativeTarget.y, sign * horizontalLength);
      return [
        { sign, outlet: localOutletAngle + asin, k: length * cosine - can.scale.x * along },
        { sign, outlet: localOutletAngle + Math.PI - asin, k: -length * cosine - can.scale.x * along },
      ].map(c => ({ ...c, tilt: wrap(targetAngle - c.outlet) }));
    });
    // Never select a branch that shoots backwards through the can; otherwise prefer the most upright body.
    const valid = candidates.filter(c => c.k >= 0 && Math.cos(c.tilt) >= 0);
    const upright = candidates.filter(c => Math.cos(c.tilt) >= 0);
    const choices = valid.length ? valid : upright.length ? upright : candidates;
    choices.sort((a, b) => Math.cos(b.tilt) - Math.cos(a.tilt) || b.k - a.k);
    const tilt = choices[0].tilt;

    canTilt.setFromAxisAngle(zAxis, tilt);
    const yaw = Math.atan2(-relativeTarget.z, relativeTarget.x) + (choices[0].sign < 0 ? Math.PI : 0);
    canYaw.setFromAxisAngle(up, yaw);
    can.quaternion.copy(canYaw).multiply(canTilt);
    can.updateMatrixWorld(true);
    roseFace.getWorldPosition(roseW); group.worldToLocal(roseW);
    handleTip.getWorldPosition(handleW); group.worldToLocal(handleW);
    outletDirection.copy(localOutletNormal).applyQuaternion(can.quaternion).normalize();
    bodyUpDirection.copy(up).applyQuaternion(can.quaternion).normalize();
    aimDirection.copy(aim).sub(roseW).normalize();
    outletAimDot = outletDirection.dot(aimDirection);
  }
  function clearWater(): void {
    pouring = false; waterFlow = 0; spawn = 0; hasDropOrigin = false;
    for (const d of dp) d.alive = false;
    drops.count = 0;
    drops.instanceMatrix.needsUpdate = true;
    for (const R of rings) R.m.visible = false;
  }
  updateArc();

  function update(dt: number, t: number) {
    dt = Math.min(dt, 0.05);
    if (growing) {
      growthElapsed += dt;
      const k = reduced() ? 1 : ease(Math.min(1, growthElapsed / 1.15));
      setAge(growthFrom + (targetAge - growthFrom) * k);
      if (k >= 1) growing = false;
    }
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

    // A hold grows the can out of the exact press point. Horizontal motion then follows a smooth semicircle
    // above the orchid. Flow is gated by Home independently, so the first second never emits a drop.
    smoothX = reduced() ? canX : damp(smoothX, canX, 12, dt);
    canAppear = reduced() && holding ? 1 : damp(canAppear, holding ? 1 : 0, 13, dt);
    updateArc();
    if (holding) {
      const appear = ease(canAppear);
      can.visible = true;
      can.position.lerpVectors(canOrigin, arcPosition, appear);
      can.scale.setScalar(Math.max(0.001, appear));
    } else {
      can.visible = false;
      can.position.copy(canOrigin);
    }
    if (can.visible) updateCanAim();

    // Drops start at that exact transformed rose face and follow a ballistic path to the fixed bark target.
    waterFlow = pouring ? 1 : 0;
    if (pouring) {
      spawn += dt * 500 * waterFlow;
      roseFace.getWorldPosition(roseW); group.worldToLocal(roseW);
      while (spawn >= 1) {
        spawn -= 1;
        const d = dp.find(x => !x.alive);
        if (!d) break;
        d.alive = true;
        d.p.copy(roseW).add(tmp.set((Math.random() - 0.5) * 0.035, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.035));
        lastDropOrigin.copy(d.p); hasDropOrigin = true;
        d.v.copy(aim).add(tmp.set((Math.random() - 0.5) * 0.16, 0, (Math.random() - 0.5) * 0.14)).sub(d.p).divideScalar(WATER_FLIGHT);
        d.v.y += 0.5 * WATER_GRAVITY * WATER_FLIGHT;
        d.s = 0.75 + Math.random() * 0.5;
      }
    } else spawn = 0;
    const floor = 0.66 + h;
    let landed = 0, live = 0;
    for (let i = 0; i < N; i++) {                   // only live drops are drawn: they are packed at the front
      const d = dp[i];
      if (!d.alive) continue;
      d.v.y -= WATER_GRAVITY * dt;
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
    setHolding(on, origin) {
      holding = on;
      if (on) {
        canOrigin.copy(origin ?? REST);
        can.position.copy(canOrigin);
        can.scale.setScalar(0.001);
        can.visible = true;
        canAppear = 0;
        updateCanAim();
        clearWater();
      } else {
        can.visible = false;
        clearWater();
      }
    },
    moveHold(horizontal) {
      canX = Math.max(0, Math.min(1, horizontal));
      if (canAppear < 0.01) smoothX = canX;
      updateArc();
    },
    setPouring(on) {
      pouring = holding && on;
      if (!pouring) { spawn = 0; waterFlow = 0; }
    },
    celebrate() {
      pulse = reduced() ? 0 : 1;
      for (const B of burst) { B.a = Math.random() * 6.28; B.r = 0.25 + Math.random() * 0.45; B.y = Math.random() * 0.5; }
      targetAge = calendarAge(true);
      if (targetAge <= age || reduced()) { growing = false; setAge(targetAge); }
      else { growthFrom = age; growthElapsed = 0; growing = true; }
    },
    setWatered(w) {
      watered = w;
      if (growing) return;
      targetAge = calendarAge(w);
      setAge(targetAge);
    },
    setOrnament(id) {
      if (ornamentId === id) return;
      activeOrnament?.dispose();
      activeOrnament = null;
      ornamentId = id;
      if (id) {
        activeOrnament = createHomeOrnament(id);
        float.add(activeOrnament.group);
      }
    },
    refresh() {
      growing = false;
      watered = wateredToday();
      targetAge = calendarAge(watered);
      setAge(targetAge);
    },
    snapshot: () => ({
      age, targetAge, growing, canVisible: can.visible, canScale: can.scale.x,
      canPosition: can.position.toArray() as RigPoint,
      canOrigin: canOrigin.toArray() as RigPoint,
      arcPosition: arcPosition.toArray() as RigPoint,
      spoutPosition: roseW.toArray() as RigPoint,
      handlePosition: handleW.toArray() as RigPoint,
      waterTarget: aim.toArray() as RigPoint,
      outletDirection: outletDirection.toArray() as RigPoint,
      outletAimDot,
      canUp: bodyUpDirection.y,
      bodyUpDirection: bodyUpDirection.toArray() as RigPoint,
      lastDropOrigin: hasDropOrigin ? lastDropOrigin.toArray() as RigPoint : null,
      flowing: waterFlow > 0, drops: drops.count,
      ornament: ornamentId, ornamentMeshes: activeOrnament?.meshes ?? 0,
    }),
    hitTargets: [plantHit, canHit],
    dispose() {
      activeOrnament?.dispose();
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}
