// The Home plant: an imaginary, special plant. A curved stem, a spiral of leaves that droop when thirsty
// and lift when watered, a soft-glowing bulb at the top, three motes drifting around it.
// API: { group, update(dt, t), water(amount), setWatered(), get hydration, top (Vector3, where drops land) }
import * as THREE from 'three';
import { palette, matte, glow, seeded, lerp, clamp, damp, shadowed } from './style.js';

const LEAVES = 7;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function leafShape(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid * 0.9, len * 0.25, wid * 0.85, len * 0.7, 0, len);
  s.bezierCurveTo(-wid * 0.85, len * 0.7, -wid * 0.9, len * 0.25, 0, 0);
  return s;
}

export function createHomePlant() {
  const group = new THREE.Group();
  const rnd = seeded(7);

  // --- ground: a dark soil mound inside a moss ring ---
  const moss = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.12, 24), matte(palette.moss)), false, true);
  moss.position.y = -0.06; group.add(moss);
  const soil = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), matte(palette.soil)), true, true);
  soil.scale.y = 0.35; group.add(soil);

  // --- stem: a tube along a gentle S ---
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 0.35, 0.02),
    new THREE.Vector3(-0.04, 0.75, -0.03), new THREE.Vector3(0.03, 1.15, 0.02),
  ]);
  const stem = shadowed(new THREE.Mesh(new THREE.TubeGeometry(path, 24, 0.045, 7, false), matte(palette.stem)));
  group.add(stem);

  // --- leaves: a spiral up the stem; each pivots at its base so it can droop and lift ---
  const leafMats = [matte(palette.leaf), matte(palette.leafDeep), matte(palette.leafPale)];
  const leaves = [];
  for (let i = 0; i < LEAVES; i++) {
    const f = i / (LEAVES - 1);                  // 0 at the bottom, 1 at the top
    const len = lerp(0.5, 0.3, f), wid = lerp(0.19, 0.11, f);
    const geo = new THREE.ExtrudeGeometry(leafShape(len, wid), { depth: 0.018, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);                   // leaf lies along +Z, pivot at origin
    const mesh = shadowed(new THREE.Mesh(geo, leafMats[i % 3]));
    const pivot = new THREE.Group();
    const at = path.getPointAt(lerp(0.22, 0.92, f));
    pivot.position.copy(at);
    pivot.rotation.y = i * GOLDEN + rnd() * 0.3;
    pivot.add(mesh);
    pivot.userData = { base: pivot.rotation.y, phase: rnd() * Math.PI * 2, f };
    group.add(pivot);
    leaves.push(pivot);
  }

  // --- bulb: the glowing heart; a core, a translucent shell and a point light ---
  const topPt = path.getPointAt(1);
  const bulb = new THREE.Group();
  bulb.position.copy(topPt).add(new THREE.Vector3(0, 0.18, 0));
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 1), glow(palette.bulb, palette.bulb, 0.9));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1),
    new THREE.MeshStandardMaterial({ color: palette.bulb, emissive: palette.bulb, emissiveIntensity: 0.6, transparent: true, opacity: 0.22, roughness: 1, depthWrite: false, flatShading: true }));
  const light = new THREE.PointLight(palette.bulb, 2.5, 3.5, 2);
  // a soft additive halo: the cheap stand-in for bloom
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(201,179,255,0.45)'); grd.addColorStop(1, 'rgba(201,179,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: palette.bulb, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(1.4);
  bulb.add(core, shell, light, halo);
  group.add(bulb);

  // --- motes: three small lights that circle the bulb on tilted orbits ---
  const motes = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glow(palette.mote, palette.mote, 2));
    m.userData = { r: 0.42 + i * 0.08, tilt: (rnd() - 0.5) * 1.2, phase: i * 2.1, speed: 0.6 + i * 0.15 };
    bulb.add(m); motes.push(m);
  }

  // --- ripple: a ring on the ground that expands and fades when water lands ---
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 40),
    new THREE.MeshBasicMaterial({ color: palette.water, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ripple.rotation.x = -Math.PI / 2; ripple.position.y = 0.005; group.add(ripple);
  let rippleT = 1;

  // --- state ---
  let hydration = 0.3;     // 0 thirsty .. 1 watered. Drives droop, glow and mote speed.
  let pulse = 0;           // short brightening after a watering completes
  const droopOf = h => lerp(1.05, 0.12, h);  // pitch of leaves: hanging when thirsty, held out flat when watered

  function update(dt, t) {
    hydration = clamp(hydration - dt * 0.004, 0, 1);   // slow thirst
    pulse = Math.max(0, pulse - dt * 0.8);
    const h = hydration + pulse * 0.6;

    // gentle whole-plant sway
    group.rotation.z = Math.sin(t * 0.7) * 0.015;
    group.rotation.x = Math.cos(t * 0.5) * 0.01;

    const droop = droopOf(hydration);
    for (const p of leaves) {
      const { base, phase, f } = p.userData;
      const target = droop + (1 - f) * 0.15;                    // lower leaves hang a touch more
      const sway = Math.sin(t * 1.3 + phase) * 0.03 * (0.5 + h);
      p.rotation.x = damp(p.rotation.x, target, 2.5, dt) + sway;  // pivot around the leaf base
      p.rotation.y = base + Math.cos(t * 0.9 + phase) * 0.02;
    }

    // bulb breathes; brighter when hydrated
    const breath = 0.5 + 0.5 * Math.sin(t * 1.6);
    core.material.emissiveIntensity = lerp(0.5, 1.6, h) + breath * 0.25;
    shell.material.opacity = lerp(0.12, 0.3, h) + breath * 0.05;
    light.intensity = lerp(0.8, 3.2, h) + breath * 0.3;
    halo.material.opacity = lerp(0.3, 0.6, h) + breath * 0.08;
    halo.scale.setScalar(lerp(1.0, 1.35, h) + breath * 0.06);
    const s = 1 + breath * 0.03 + pulse * 0.08;
    bulb.scale.setScalar(s);

    for (const m of motes) {
      const { r, tilt, phase, speed } = m.userData;
      const a = t * speed * lerp(0.4, 1.2, h) + phase;
      m.position.set(Math.cos(a) * r, Math.sin(a * 1.7) * 0.12 + Math.sin(a) * r * Math.sin(tilt), Math.sin(a) * r * Math.cos(tilt));
    }

    if (rippleT < 1) {
      rippleT = Math.min(1, rippleT + dt * 1.2);
      ripple.scale.setScalar(lerp(0.6, 2.0, rippleT));
      ripple.material.opacity = (1 - rippleT) * 0.5;
    }
  }

  // a single drop landed: small nudge
  function water(amount = 0.01) { hydration = clamp(hydration + amount, 0, 1); }
  // the hold completed: the plant is watered for the day
  function setWatered() { hydration = 1; pulse = 1; rippleT = 0; }

  return {
    group, update, water, setWatered,
    get hydration() { return hydration; },
    top: bulb.position.clone(),           // where the watering can aims
    splashY: topPt.y - 0.15,              // drops below this height are "on the leaves"
  };
}
