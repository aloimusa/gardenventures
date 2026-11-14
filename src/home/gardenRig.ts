// The Home plant, our own rig: an imaginary sprout in a clay pot, a pearl bud that glows, a powder-blue can.
// Everything is built from code (no assets), smooth-shaded, lit by its own soft lights, with a blob shadow
// instead of shadow maps so it stays cheap on a phone. It can never wilt: no state here makes it smaller,
// paler or lower than its resting pose. Watering only adds (glow, motes, a lift).
import * as THREE from 'three';
import type { PlantRig } from './rig';

const C = {
  stemDeep: 0x2f6e4a, stemTip: 0x5fae6e,
  leafBase: 0x3a8a5a, leafMid: 0x55b071, leafTip: 0x9fdcb8, leafEdge: 0xc6edc9, vein: 0xd8f2c8,
  pot: 0xd38a6f, potShade: 0xb86a52, potRim: 0xf2e6d4, band: 0xe8b49c,
  soil: 0x5a3c30, pebble: 0xf1e6d3,
  bud: 0xfff3df, budGlow: 0xffc27a, mote: 0xfff1c9,
  can: 0x8db7dc, canDeep: 0x6c98c4, canHandle: 0xf3ead8,
  water: 0x6fb1e3,
  sky: 0xeaf6f1, ground: 0xf0e3c8, key: 0xfff0dc, rim: 0xd8ecff,
};

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function soft(color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
}

function radialTexture(stops: [number, string][], size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A tube along a curve whose radius follows r(u). */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, seg: number, radial: number, r: (u: number) => number,
  colorAt?: (u: number) => THREE.Color) {
  const frames = curve.computeFrenetFrames(seg, false);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, p);
    const rad = r(u);
    const c = colorAt?.(u);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * rad, p.y + n.y * rad, p.z + n.z * rad);
      if (c) col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A leaf lying along +Z from its base: teardrop outline, folded at the midrib, tip curling up. */
function leafGeometry(len: number, wid: number, curl: number, fold: number, seed: number) {
  const NU = 18, NV = 10, rnd = mulberry(seed);
  const base = new THREE.Color(C.leafBase), mid = new THREE.Color(C.leafMid), tip = new THREE.Color(C.leafTip);
  const edge = new THREE.Color(C.leafEdge), vein = new THREE.Color(C.vein), tmp = new THREE.Color();
  const twist = (rnd() - 0.5) * 0.3;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.6) * (1 - 0.1 * u);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      const x = v * w;
      let y = v * v * w * fold + curl * u * u * len + 0.06 * len * Math.sin(Math.PI * u) * (1 - v * v);
      y += x * twist * u;
      const z = len * u;
      pos.push(x, y, z);
      if (u < 0.5) tmp.copy(base).lerp(mid, u / 0.5);
      else tmp.copy(mid).lerp(tip, (u - 0.5) / 0.5);
      tmp.lerp(edge, Math.pow(Math.abs(v), 3) * 0.35);
      tmp.lerp(vein, Math.max(0, 1 - Math.abs(v) * 14) * 0.18 * Math.sin(Math.PI * u));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j, b = a + NV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createGardenRig(): PlantRig {
  const group = new THREE.Group();
  group.name = 'garden-rig';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const rnd = mulberry(11);

  // ---------- light: soft sky, warm key from upper left, cool rim from behind ----------
  const hemi = new THREE.HemisphereLight(C.sky, C.ground, 1.6);
  const key = new THREE.DirectionalLight(C.key, 1.9);
  key.position.set(-2.5, 5, 4);
  const rim = new THREE.DirectionalLight(C.rim, 1.1);
  rim.position.set(2.5, 3, -4);
  group.add(hemi, key, rim);

  // ---------- ground shadow: a soft blob, smaller and lighter as the plant drifts up ----------
  const shadowTex = keep(radialTexture([[0, 'rgba(40,70,58,0.34)'], [0.45, 'rgba(40,70,58,0.15)'], [1, 'rgba(40,70,58,0)']]));
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.7, 1.7)),
    keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.32;
  shadow.renderOrder = -1;
  group.add(shadow);

  // everything that floats
  const float = new THREE.Group();
  group.add(float);

  // ---------- pot: a rounded clay pot with a lighter rim and a cream band ----------
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
  band.scale.set(1, 1, 1);
  const soilGeo = keep(new THREE.SphereGeometry(0.44, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2));
  const soil = new THREE.Mesh(soilGeo, keep(soft(C.soil, { roughness: 1 })));
  soil.scale.y = 0.12;
  soil.position.y = 0.6;
  float.add(pot, potRim, band, soil);
  const pebbleGeo = keep(new THREE.IcosahedronGeometry(0.035, 1));
  const pebbleMat = keep(soft(C.pebble, { roughness: 0.7 }));
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(pebbleGeo, pebbleMat);
    const a = i * 2.3 + 0.4, r = 0.22 + rnd() * 0.12;
    p.position.set(Math.cos(a) * r, 0.635, Math.sin(a) * r);
    p.scale.set(1 + rnd() * 0.5, 0.6, 1 + rnd() * 0.3);
    float.add(p);
  }

  // ---------- plant ----------
  const plant = new THREE.Group();
  plant.position.y = 0.64;
  float.add(plant);
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.04, 0.25, 0.02), new THREE.Vector3(-0.05, 0.58, 0),
    new THREE.Vector3(0.02, 0.88, 0.03), new THREE.Vector3(0.0, 1.08, 0.0),
  ]);
  const deep = new THREE.Color(C.stemDeep), tipC = new THREE.Color(C.stemTip);
  const stemMat = keep(soft(0xffffff, { vertexColors: true, roughness: 0.75 }));
  const stem = new THREE.Mesh(keep(taperedTube(stemCurve, 40, 10, u => 0.048 * (1 - u) + 0.02,
    u => deep.clone().lerp(tipC, u))), stemMat);
  plant.add(stem);

  const leafMat = keep(soft(0xffffff, { vertexColors: true, roughness: 0.86, side: THREE.DoubleSide }));
  leafMat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.32;');
  };
  type Leaf = { pivot: THREE.Group; pitch: number; yaw: number; roll: number; phase: number; f: number };
  const leaves: Leaf[] = [];
  const leafSpec = [
    // f along stem, yaw, pitch(up), len, wid   (yaw 0 = toward the camera)
    [0.18, 0.55, 0.22, 0.62, 0.32], [0.24, 2.75, 0.26, 0.6, 0.31], [0.3, 4.6, 0.3, 0.58, 0.3],
    [0.42, 1.5, 0.38, 0.54, 0.29], [0.5, 3.7, 0.44, 0.52, 0.28], [0.58, 5.6, 0.5, 0.48, 0.26],
    [0.68, 0.3, 0.6, 0.42, 0.24], [0.76, 2.4, 0.7, 0.38, 0.22], [0.84, 4.3, 0.82, 0.32, 0.19],
    [0.91, 1.2, 0.95, 0.26, 0.16],
  ];
  leafSpec.forEach(([f, yaw, pitch, len, wid], i) => {
    const pivot = new THREE.Group();
    stemCurve.getPointAt(f, pivot.position);
    const mesh = new THREE.Mesh(keep(leafGeometry(len, wid, 0.2, 0.2, 100 + i)), leafMat);
    mesh.position.z = 0.02;
    pivot.add(mesh);
    pivot.rotation.order = 'YXZ';
    const roll = -Math.sin(yaw) * 0.85;
    pivot.rotation.set(-pitch, yaw, roll);
    plant.add(pivot);
    leaves.push({ pivot, pitch, yaw, roll, phase: rnd() * 6.28, f });
  });

  // the bud: a pearl held in two small leaves, glowing warm
  const top = new THREE.Vector3();
  stemCurve.getPointAt(1, top);
  const budGroup = new THREE.Group();
  budGroup.position.copy(top).add(new THREE.Vector3(0, 0.13, 0));
  plant.add(budGroup);
  const budMat = keep(new THREE.MeshStandardMaterial({
    color: C.bud, emissive: new THREE.Color(C.budGlow), emissiveIntensity: 0.55, roughness: 0.35, metalness: 0,
  }));
  const bud = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1, 32, 20)), budMat);
  bud.scale.y = 1.15;
  budGroup.add(bud);
  const shellMat = keep(new THREE.MeshStandardMaterial({
    color: 0xfffaf0, emissive: new THREE.Color(0xffe0b0), emissiveIntensity: 0.5, roughness: 0.2,
    transparent: true, opacity: 0.35, depthWrite: false,
  }));
  const shell = new THREE.Mesh(keep(new THREE.SphereGeometry(0.135, 32, 20)), shellMat);
  shell.scale.y = 1.12;
  budGroup.add(shell);
  for (let k = 0; k < 2; k++) {                 // two sepals cupping the pearl from behind, opening sideways
    const cup = new THREE.Group();
    cup.position.set(0, -0.12, -0.02);
    const m = new THREE.Mesh(keep(leafGeometry(0.17, 0.1, 0.55, 0.35, 300 + k)), leafMat);
    cup.add(m);
    cup.rotation.order = 'YXZ';
    cup.rotation.set(-0.55, (k ? 1 : -1) * 2.0 + Math.PI, 0);
    budGroup.add(cup);
  }
  const haloTex = keep(radialTexture([[0, 'rgba(255,248,232,1)'], [0.22, 'rgba(255,214,150,0.55)'], [0.6, 'rgba(255,200,130,0.15)'], [1, 'rgba(255,200,130,0)']]));
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0.6 })));
  halo.scale.setScalar(0.75);
  budGroup.add(halo);
  const budLight = new THREE.PointLight(C.budGlow, 0.6, 1.6, 2);
  budGroup.add(budLight);

  // motes: small warm sparks that circle the bud; more of them on a watered day
  const dotTex = keep(radialTexture([[0, 'rgba(255,252,240,1)'], [0.25, 'rgba(255,204,120,0.9)'], [1, 'rgba(255,190,100,0)']], 64));
  const moteMat = keep(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false }));
  const motes: { s: THREE.Sprite; r: number; tilt: number; ph: number; sp: number; extra: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(moteMat);
    s.scale.setScalar(0.07 + rnd() * 0.04);
    budGroup.add(s);
    motes.push({ s, r: 0.22 + rnd() * 0.18, tilt: (rnd() - 0.5) * 1.1, ph: rnd() * 6.28, sp: 0.35 + rnd() * 0.3, extra: i >= 3 });
  }

  // ---------- watering can: powder blue, resting above and to the right; spout points toward the plant ----------
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
  const REST = new THREE.Vector3(0.74, 2.02, 0.15), POUR = new THREE.Vector3(0.74, 2.2, 0.55);
  can.position.copy(REST);
  can.rotation.y = -0.25;
  group.add(can);

  // ---------- water: instanced drops in world space (not under the tilting can) ----------
  const N = 160;
  const dropGeo = keep(new THREE.SphereGeometry(0.012, 6, 4));
  const dropMat = keep(new THREE.MeshStandardMaterial({
    color: C.water, emissive: new THREE.Color(C.water), emissiveIntensity: 0.45, roughness: 0.2, transparent: true, opacity: 0.85,
  }));
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, N);
  drops.frustumCulled = false;
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(drops);
  const dp = Array.from({ length: N }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));

  // sparkle burst for the day's watering
  const burst = Array.from({ length: 14 }, () => {
    const s = new THREE.Sprite(moteMat);
    s.visible = false;
    float.add(s);
    return { s, a: 0, r: 0, y: 0, ph: 0 };
  });

  // ---------- hit targets: generous, invisible ----------
  const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
  const plantHit = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.62, 0.55, 2.25, 12)), hitMat);
  plantHit.position.y = 0.98;
  float.add(plantHit);
  const canHit = new THREE.Mesh(keep(new THREE.SphereGeometry(0.5, 12, 8)), hitMat);
  can.add(canHit);

  // ---------- state ----------
  let pouring = false, watered = false;
  let tilt = 0, pulse = 0, glow = 0, spawn = 0, pourT = 0;
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  const roseW = new THREE.Vector3(), dirW = new THREE.Vector3();

  function update(dt: number, t: number) {
    dt = Math.min(dt, 0.05);
    const calm = reduced() ? 0.25 : 1;
    pulse = Math.max(0, pulse - dt * 0.6);
    const lift = ease(Math.min(1, pulse * 1.6)) * (pulse > 0 ? 1 : 0);
    glow = damp(glow, (watered ? 1 : 0) + (pouring ? 0.35 : 0), 2.2, dt);

    // float and sway: slow, small
    float.position.y = 0.07 * Math.sin(t * 0.55) * calm + 0.1 * lift;
    float.rotation.z = 0.022 * Math.sin(t * 0.4) * calm;
    float.rotation.x = 0.012 * Math.cos(t * 0.33) * calm;
    const h = float.position.y;
    shadow.scale.setScalar(1 - h * 0.6);
    (shadow.material as THREE.MeshBasicMaterial).opacity = 1 - h * 1.2;

    // leaves breathe; on the watering they fan up a little. Never below their resting pitch.
    for (const L of leaves) {
      const sway = 0.035 * Math.sin(t * 1.1 + L.phase) * calm;
      L.pivot.rotation.x = -(L.pitch + 0.06 * lift + Math.max(0, sway));
      L.pivot.rotation.y = L.yaw + 0.03 * Math.sin(t * 0.7 + L.phase) * calm;
      L.pivot.rotation.z = L.roll;
    }
    plant.scale.setScalar(1 + 0.035 * lift);

    // the bud
    const breath = 0.5 + 0.5 * Math.sin(t * 1.4);
    budMat.emissiveIntensity = 0.8 + 0.5 * glow + 1.4 * lift + 0.15 * breath;
    shellMat.opacity = 0.3 + 0.15 * glow + 0.1 * breath;
    (halo.material as THREE.SpriteMaterial).opacity = 0.7 + 0.2 * glow + 0.1 * lift + 0.08 * breath;
    halo.scale.setScalar(0.85 + 0.35 * glow + 0.6 * lift + 0.05 * breath);
    budLight.intensity = 0.5 + 0.6 * glow + 1.6 * lift;
    bud.scale.set(1 + 0.08 * lift, 1.18 * (1 + 0.08 * lift), 1 + 0.08 * lift);
    for (const M of motes) {
      const on = !M.extra || glow > 0.5 || lift > 0;
      M.s.visible = on;
      if (!on) continue;
      const a = t * M.sp * (1 + 0.6 * glow) * calm + M.ph;
      const r = M.r * (1 + 0.5 * lift);
      M.s.position.set(Math.cos(a) * r, Math.sin(a * 1.3) * 0.12 + Math.sin(a) * r * Math.sin(M.tilt) + 0.05, Math.sin(a) * r * Math.cos(M.tilt));
    }

    // the can: rests with a little bob; while pouring it leans in and tips toward the plant
    pourT = damp(pourT, pouring ? 1 : 0, pouring ? 6 : 3.5, dt);
    can.position.lerpVectors(REST, POUR, pourT);
    can.position.y += 0.05 * Math.sin(t * 1.1 + 1) * calm * (1 - pourT);
    tilt = damp(tilt, pouring ? 0.72 : -0.1, pouring ? 5 : 3.5, dt);
    canBody.rotation.z = tilt + 0.03 * Math.sin(t * 0.8) * calm * (1 - pourT);

    // water: drops from the rose once the can has tipped enough
    const flow = Math.max(0, Math.min(1, (tilt - 0.35) / 0.3));
    if (pouring && flow > 0) {
      spawn += dt * 140 * flow;
      roseFace.getWorldPosition(roseW);
      group.worldToLocal(roseW);
      dirW.set(-0.5, -0.2, 0).normalize();
      while (spawn >= 1) {
        spawn -= 1;
        const d = dp.find(x => !x.alive);
        if (!d) break;
        d.alive = true;
        d.p.copy(roseW).add(tmp.set((Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.1));
        d.v.copy(dirW).multiplyScalar(0.45 + Math.random() * 0.2).add(tmp.set((Math.random() - 0.5) * 0.18, 0, (Math.random() - 0.5) * 0.18));
        d.s = 0.8 + Math.random() * 0.5;
      }
    } else spawn = 0;
    const floor = 0.66 + float.position.y;
    for (let i = 0; i < N; i++) {
      const d = dp[i];
      if (d.alive) {
        d.v.y -= 5.5 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < floor) d.alive = false;
      }
      if (!d.alive) { m4.makeScale(0, 0, 0); drops.setMatrixAt(i, m4); continue; }
      q.setFromUnitVectors(up, tmp.copy(d.v).normalize());
      const stretch = 1 + Math.min(2, d.v.length() * 0.6);
      m4.compose(d.p, q, sc.set(d.s, d.s * stretch, d.s));
      drops.setMatrixAt(i, m4);
    }
    drops.instanceMatrix.needsUpdate = true;

    // the sparkle burst rising from the soil
    for (const B of burst) {
      if (pulse <= 0) { B.s.visible = false; continue; }
      const k = 1 - pulse;
      B.s.visible = true;
      const r = B.r * (0.4 + k * 1.1);
      B.s.position.set(Math.cos(B.a + k * 1.2) * r, 0.7 + B.y + k * 1.1, Math.sin(B.a + k * 1.2) * r);
      const s = 0.09 * Math.sin(Math.PI * Math.min(1, k * 1.3)) + 0.001;
      B.s.scale.setScalar(s);
    }
  }

  return {
    group,
    update,
    setPouring(on) { pouring = on; },
    celebrate() {
      pulse = 1;
      for (const B of burst) { B.a = Math.random() * 6.28; B.r = 0.25 + Math.random() * 0.35; B.y = Math.random() * 0.4; }
    },
    setWatered(w) { watered = w; },
    hitTargets: [plantHit, canHit],
    dispose() {
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}

/** Camera framing the rig was composed for; Home may use it or its own. */
export const gardenFrame = { fov: 26, target: new THREE.Vector3(0.12, 1.02, 0), distance: 11.0, elevation: 0.16 };
