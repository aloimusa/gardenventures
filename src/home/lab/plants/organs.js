// Organ builders shared by the plant candidates: tapered stems, leaves, petals and whole flowers.
// Everything is built along +Z (or +Y for stems) with the pivot at its base, so a parent can pitch and sway it.
import * as THREE from 'three';
import { palette, matte, lerp, clamp } from '../style.js';

// ---------- growth helpers ----------
export const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// 0 before `born`, eases to 1 over `dur` days
export const grow = (age, born, dur) => smooth((age - born) / dur);
// life of an organ: returns { g: growth 0..1, w: wither 0..1 (1 = gone) }
export function life(age, born, growDur, span, witherDur) {
  return { g: grow(age, born, growDur), w: span == null ? 0 : smooth((age - born - span) / witherDur) };
}

// ---------- geometry cache ----------
const cache = new Map();
function cached(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }

function bladeShape(len, wid, kind) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  if (kind === 'lance') {          // narrow, widest near the base
    s.bezierCurveTo(wid, len * 0.12, wid * 0.55, len * 0.6, 0, len);
    s.bezierCurveTo(-wid * 0.55, len * 0.6, -wid, len * 0.12, 0, 0);
  } else if (kind === 'strap') {   // long, parallel sides, round tip
    s.lineTo(wid * 0.75, len * 0.05); s.lineTo(wid, len * 0.5); s.bezierCurveTo(wid, len * 0.9, wid * 0.5, len, 0, len);
    s.bezierCurveTo(-wid * 0.5, len, -wid, len * 0.9, -wid, len * 0.5); s.lineTo(-wid * 0.75, len * 0.05); s.lineTo(0, 0);
  } else if (kind === 'petal') {   // widest past the middle, soft tip
    s.bezierCurveTo(wid * 0.5, len * 0.3, wid, len * 0.75, 0, len);
    s.bezierCurveTo(-wid, len * 0.75, -wid * 0.5, len * 0.3, 0, 0);
  } else if (kind === 'ray') {     // daisy ray floret: slim, notched tip
    s.bezierCurveTo(wid * 0.8, len * 0.3, wid * 0.9, len * 0.85, wid * 0.3, len);
    s.lineTo(0, len * 0.93); s.lineTo(-wid * 0.3, len);
    s.bezierCurveTo(-wid * 0.9, len * 0.85, -wid * 0.8, len * 0.3, 0, 0);
  } else {                         // oval
    s.bezierCurveTo(wid * 0.95, len * 0.2, wid * 0.9, len * 0.7, 0, len);
    s.bezierCurveTo(-wid * 0.9, len * 0.7, -wid * 0.95, len * 0.2, 0, 0);
  }
  return s;
}

// A blade (leaf or petal) lying along +Z, pivot at the base. Slightly cupped so light breaks across it.
export function bladeGeo(len, wid, kind = 'oval', thick = 0.012) {
  len = Math.max(0.01, len); wid = Math.max(0.004, wid);     // a newborn organ has size ~0; never divide by it
  return cached(`b:${kind}:${len.toFixed(3)}:${wid.toFixed(3)}:${thick}`, () => {
    const g = new THREE.ExtrudeGeometry(bladeShape(len, wid, kind), { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 1, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    // cup: lift the edges a touch, bend the tip down (strap leaves arch a lot more)
    const bend = kind === 'strap' ? 0.22 : 0.08;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, p.getY(i) + (x / wid) ** 2 * wid * 0.25 - (z / len) ** 2 * len * bend);
    }
    g.computeVertexNormals();
    return g;
  });
}

// A tapered tube along a curve. radius r0 at the start, r1 at the end.
export function taperedTube(curve, r0, r1, segs = 16, radial = 7) {
  const pts = curve.getPoints(segs);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const r = lerp(r0, r1, i / segs), N = frames.normals[i], B = frames.binormals[i], P = pts[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, cx = Math.cos(a), sx = Math.sin(a);
      pos.push(P.x + r * (cx * N.x + sx * B.x), P.y + r * (cx * N.y + sx * B.y), P.z + r * (cx * N.z + sx * B.z));
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// A stem from a list of points (world of its parent), radius tapering. Returns the mesh and the curve.
export function stem(points, r0, r1, material, segs = 16) {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(taperedTube(curve, r0, r1, segs), material);
  m.castShadow = true;
  return { mesh: m, curve };
}

// ---------- flowers ----------
// Daisy / cosmos: a ring of ray florets around a disc. `open` 0 = closed bud, 1 = fully open.
export function daisy({ rays = 8, rayLen = 0.22, rayWid = 0.07, color, disc = palette.discYellow, open = 1, size = 1 }) {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.SphereGeometry(rayLen * 0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), matte(disc));
  d.scale.y = 0.45; d.castShadow = true; g.add(d);
  const mat = matte(color, { side: THREE.DoubleSide });
  const geo = bladeGeo(rayLen, rayWid, 'ray', 0.008);
  for (let i = 0; i < rays; i++) {
    const p = new THREE.Group();
    p.rotation.y = (i / rays) * Math.PI * 2;
    p.rotation.x = lerp(-1.35, 0.12, open);        // closed: petals point straight up; open: flat with a soft droop
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
    p.add(m); g.add(p);
  }
  const calyx = new THREE.Mesh(new THREE.ConeGeometry(rayLen * 0.3, rayLen * 0.5, 8), matte(palette.leafDeep));
  calyx.position.y = -rayLen * 0.22; g.add(calyx);
  g.scale.setScalar(size);
  return g;
}

// Cup flower (camellia / rose-like): two or three rows of broad petals, inner rows more closed.
export function cup({ petals = 6, rows = 2, petalLen = 0.16, petalWid = 0.09, color, inner, open = 1, size = 1 }) {
  const g = new THREE.Group();
  const mat = matte(color, { side: THREE.DoubleSide });
  const matIn = matte(inner ?? color, { side: THREE.DoubleSide });
  for (let r = 0; r < rows; r++) {
    const n = petals - r, len = petalLen * (1 - r * 0.22), wid = petalWid * (1 - r * 0.15);
    const geo = bladeGeo(len, wid, 'petal', 0.008);
    for (let i = 0; i < n; i++) {
      const p = new THREE.Group();
      p.rotation.y = (i / n) * Math.PI * 2 + r * 0.5;
      p.rotation.x = lerp(-1.4, -0.35 - r * 0.35, open);
      p.position.y = r * 0.015;
      const m = new THREE.Mesh(geo, r === rows - 1 ? matIn : mat); m.castShadow = true;
      p.add(m); g.add(p);
    }
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(petalWid * 0.45, 8, 6), matte(palette.discYellow));
  core.position.y = 0.02; g.add(core);
  const calyx = new THREE.Mesh(new THREE.ConeGeometry(petalWid * 0.8, petalLen * 0.5, 6), matte(palette.leafDeep));
  calyx.position.y = -petalLen * 0.2; g.add(calyx);
  g.scale.setScalar(size);
  return g;
}

// Moth-orchid flower: two broad lateral petals, three narrower sepals behind, a small lip in front. Faces +Z.
export function orchid({ color, lip, size = 1, open = 1, glow = 0 }) {
  const g = new THREE.Group();
  const face = new THREE.Group();
  face.rotation.x = -Math.PI / 2 + lerp(0.2, 0, open);   // blades built along +Z; tip the face toward the viewer
  const sep = matte(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: glow, roughness: 0.7 });
  const pet = matte(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: glow * 1.3, roughness: 0.65 });
  const sepGeo = bladeGeo(0.11, 0.035, 'lance', 0.006), petGeo = bladeGeo(0.1, 0.06, 'oval', 0.006);
  for (const a of [Math.PI / 2, Math.PI / 2 + 2.2, Math.PI / 2 - 2.2]) {    // sepals: top, lower left, lower right
    const p = new THREE.Group(); p.rotation.y = a; p.rotation.x = lerp(-1.2, 0.05, open);
    p.add(new THREE.Mesh(sepGeo, sep)); face.add(p);
  }
  for (const a of [0.15, Math.PI - 0.15]) {                                 // petals: left and right, broad
    const p = new THREE.Group(); p.rotation.y = a; p.rotation.x = lerp(-1.2, 0.0, open); p.position.y = 0.004;
    p.add(new THREE.Mesh(petGeo, pet)); face.add(p);
  }
  const lipM = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), matte(lip, { emissive: lip, emissiveIntensity: glow * 1.6 }));
  lipM.scale.set(1, 0.7, 1.4); lipM.position.set(0, 0.012, -0.03); face.add(lipM);
  const col = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), matte(palette.discYellow, { emissive: palette.discYellow, emissiveIntensity: glow * 2 }));
  col.position.y = 0.012; face.add(col);
  g.add(face);
  g.scale.setScalar(size * lerp(0.35, 1, open));
  return g;
}

// A bud: a small closed teardrop in calyx green, used before a flower opens.
export function bud(size, color = palette.leafDeep) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), matte(color));
  m.scale.set(0.8, 1.2, 0.8); m.castShadow = true;
  return m;
}

// Soft dark-soil mound with a moss skirt, the same for every candidate so only the plant differs.
export function ground(radius = 0.9) {
  const g = new THREE.Group();
  const moss = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, 0.1, 24), matte(palette.moss));
  moss.position.y = -0.05; moss.receiveShadow = true;
  const soil = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.52, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), matte(palette.soil));
  soil.scale.y = 0.3; soil.receiveShadow = true; soil.castShadow = true;
  g.add(moss, soil);
  return g;
}

// Leaf colour for a mood (1..4) and wither (0..1): mood shifts the green a touch, wither goes to straw.
const _c = new THREE.Color(), _hsl = {};
export function leafColor(base, mood = 3, wither = 0) {
  _c.set(base).getHSL(_hsl);
  const m = (mood - 2.5) / 1.5;                       // -1 .. 1
  _c.setHSL(_hsl.h - 0.012 * (1 - m) * 0.5, clamp(_hsl.s + 0.05 * m, 0, 1), clamp(_hsl.l + 0.015 * m, 0, 1));
  if (wither > 0) _c.lerp(new THREE.Color(palette.straw), smooth(wither));
  return _c.getHex();
}
