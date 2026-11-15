// A fruiting banana palm with arching paddle leaves and three hands of curved bananas.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function randomFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.84, metalness: 0, flatShading: true, ...options,
  });
}

function addMesh(parent, geometry, material, position) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.copy(position);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

// Parallel-transported rings keep every stem and fruit gently tapered rather than tubular.
function taperedCurve(parent, points, startRadius, endRadius, material, segments = 14, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const point = curve.getPointAt(u);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, u);
    for (let j = 0; j <= radial; j++) {
      const angle = j / radial * TAU;
      const normal = frames.normals[i].clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(frames.binormals[i], Math.sin(angle));
      positions.push(point.x + normal.x * radius, point.y + normal.y * radius, point.z + normal.z * radius);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const object = addMesh(parent, geometry, material);
  return { object, curve };
}

// A banana blade is a folded, arched sheet. Occasional missing outer cells form wind tears.
function bladeGeometry(length, halfWidth, droop, rnd, tears = true) {
  const rows = 20, columns = 6, positions = [], indices = [];
  const leftTear = new Set(), rightTear = new Set();
  if (tears) {
    for (let i = 0; i < 3; i++) {
      const row = 6 + Math.floor(rnd() * 11);
      (rnd() > 0.5 ? leftTear : rightTear).add(row);
    }
  }
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const outline = Math.max(0.006, Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.48) * (1 - 0.18 * u));
    for (let j = 0; j <= columns; j++) {
      const side = j / columns * 2 - 1;
      const narrowing = (j === 0 && leftTear.has(i)) || (j === columns && rightTear.has(i)) ? 0.76 : 1;
      const x = side * halfWidth * outline * narrowing;
      const centre = Math.sin(Math.PI * u) * length * 0.105 - u * u * droop;
      const fold = Math.abs(side) * halfWidth * 0.14 + Math.sin(u * Math.PI * 3) * Math.abs(side) * 0.009;
      positions.push(x, centre + fold, u * length);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      if ((j === 0 && leftTear.has(i)) || (j === columns - 1 && rightTear.has(i))) continue;
      const a = i * (columns + 1) + j, b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function planter(parent, materials) {
  const profile = [
    [0, 0], [0.37, 0], [0.43, 0.035], [0.49, 0.245], [0.51, 0.275],
    [0.49, 0.30], [0.445, 0.30], [0.43, 0.255], [0, 0.255],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  addMesh(parent, new THREE.LatheGeometry(profile, 28), materials.pot);
  addMesh(parent, new THREE.CylinderGeometry(0.435, 0.435, 0.025, 28), materials.soil, V(0, 0.257, 0));
  const rim = addMesh(parent, new THREE.TorusGeometry(0.483, 0.025, 6, 28), materials.rim, V(0, 0.282, 0));
  rim.rotation.x = Math.PI / 2;
  // Two fine incised bands give the base a hand-thrown, non-industrial finish.
  for (const [radius, y] of [[0.445, 0.075], [0.473, 0.205]]) {
    const band = addMesh(parent, new THREE.TorusGeometry(radius, 0.006, 4, 28), materials.band, V(0, y, 0));
    band.rotation.x = Math.PI / 2;
  }
}

function bananaHand(parent, at, count, rotation, scale, rnd, materials) {
  const hand = new THREE.Group();
  hand.position.copy(at);
  hand.rotation.y = rotation;
  parent.add(hand);
  const fruitCurve = [V(0, 0, 0), V(0.08, -0.045, 0), V(0.185, -0.13, 0), V(0.245, -0.245, 0), V(0.21, -0.325, 0)];
  for (let i = 0; i < count; i++) {
    const finger = new THREE.Group();
    const angle = i / count * TAU + (rnd() - 0.5) * 0.13;
    finger.rotation.y = angle;
    finger.rotation.z = (rnd() - 0.5) * 0.10;
    const s = scale * (0.91 + rnd() * 0.16);
    finger.scale.setScalar(s);
    finger.position.set(Math.sin(angle) * 0.025, (rnd() - 0.5) * 0.025, Math.cos(angle) * 0.025);
    hand.add(finger);
    const ripe = rnd() > 0.19;
    const { curve } = taperedCurve(finger, fruitCurve, 0.034, 0.019,
      ripe ? materials.banana[((i + Math.floor(rotation * 10)) % materials.banana.length + materials.banana.length) % materials.banana.length] : materials.young, 13, 8);
    const tip = curve.getPointAt(1);
    const cap = addMesh(finger, new THREE.SphereGeometry(0.012, 7, 5), materials.tip, tip);
    cap.scale.set(0.75, 1.15, 0.75);
    taperedCurve(finger, [V(0, 0.022, 0), V(0, -0.005, 0), V(0.027, -0.045, 0)],
      0.018, 0.026, materials.pedicel, 4, 6);
  }
}

export function createBanana(seed = 7) {
  const rnd = randomFrom(seed);
  const group = new THREE.Group();
  group.name = 'venture-banana-botanical';
  const plant = new THREE.Group();
  group.add(plant);

  const materials = {
    pot: mat(0xb87656), rim: mat(0xd29470), band: mat(0x925b44), soil: mat(0x493a2b),
    stem: mat(0x8fa64f), sheath: mat(0xaabc62), rib: mat(0x667f3c), dry: mat(0x9a8150, { side: THREE.DoubleSide }),
    leaf: [0x3f7f43, 0x559449, 0x70a653, 0x88b65b].map(color => mat(color, { side: THREE.DoubleSide, roughness: 0.79 })),
    vein: mat(0x9aba62), petiole: mat(0x789849),
    banana: [0xf0c84c, 0xf6d45b, 0xe7b93c].map(color => mat(color, { roughness: 0.88 })),
    young: mat(0xbdc457), tip: mat(0x75613a), pedicel: mat(0x7c913e), bract: mat(0x744157),
  };
  planter(group, materials);

  // Banana "trunks" are layered pseudostems, with long seams rather than woody bark.
  const stem = addMesh(plant, new THREE.CylinderGeometry(0.066, 0.125, 1.30, 11), materials.stem, V(0, 0.92, 0));
  stem.rotation.z = -0.018;
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * TAU + 0.2;
    const offset = V(Math.sin(angle), 0, Math.cos(angle));
    taperedCurve(plant, [
      offset.clone().multiplyScalar(0.116).setY(0.29),
      offset.clone().multiplyScalar(0.105).setY(0.63),
      offset.clone().multiplyScalar(0.082).setY(1.12),
      offset.clone().multiplyScalar(0.067).setY(1.53),
    ], 0.012, 0.004, i % 2 ? materials.sheath : materials.rib, 12, 5);
  }

  const phase = 0.12 + (rnd() - 0.5) * 0.70;
  for (let i = 0; i < 9; i++) {
    const outer = i < 4;
    const spear = i === 8;
    const yaw = phase + i * 2.399963 + (rnd() - 0.5) * 0.26;
    const direction = V(Math.sin(yaw), 0, Math.cos(yaw));
    const base = V((rnd() - 0.5) * 0.035, outer ? 1.01 + i * 0.115 : 1.39 + (i - 4) * 0.047, (rnd() - 0.5) * 0.035);
    const petioleLength = spear ? 0.06 : outer ? 0.18 + rnd() * 0.075 : 0.13 + rnd() * 0.07;
    const bladeAt = base.clone().addScaledVector(direction, petioleLength);
    bladeAt.y += outer ? 0.08 : 0.14;
    taperedCurve(plant, [base, base.clone().addScaledVector(direction, petioleLength * 0.48).add(V(0, 0.105, 0)), bladeAt],
      0.022, 0.009, materials.petiole, 9, 6);

    const pivot = new THREE.Group();
    pivot.position.copy(bladeAt);
    pivot.rotation.order = 'YXZ';
    const pitch = spear ? -1.08 : outer ? 0.52 + rnd() * 0.25 : -0.02 - rnd() * 0.38;
    pivot.rotation.set(pitch, yaw, (rnd() - 0.5) * (outer ? 0.34 : 0.84));
    plant.add(pivot);
    const length = spear ? 0.73 : outer ? 0.86 + rnd() * 0.09 : 0.80 + rnd() * 0.10;
    const halfWidth = spear ? 0.072 : outer ? 0.235 + rnd() * 0.035 : 0.19 + rnd() * 0.035;
    const droop = spear ? 0.025 : outer ? 0.16 + rnd() * 0.10 : 0.09 + rnd() * 0.06;
    addMesh(pivot, bladeGeometry(length, halfWidth, droop, rnd, !spear), materials.leaf[(i + Math.floor(phase) + materials.leaf.length) % materials.leaf.length]);
    taperedCurve(pivot, [V(0, 0.006, 0), V(0, length * 0.105 + 0.008, length * 0.5), V(0, -droop + 0.006, length)],
      spear ? 0.008 : 0.011, 0.0025, materials.vein, 15, 5);
  }

  // One papery old sheath curls away at the foot of the fresh green fan.
  const dryLeaf = new THREE.Group();
  dryLeaf.position.set(-0.03, 0.35, 0.02);
  dryLeaf.rotation.set(0.58, phase + 1.2, -0.15);
  plant.add(dryLeaf);
  addMesh(dryLeaf, bladeGeometry(0.43, 0.095, 0.08, rnd, false), materials.dry);

  const rachisPoints = [V(0, 1.49, 0.035), V(0.055, 1.42, 0.28), V(0.08, 1.12, 0.39), V(0.085, 0.72, 0.405)];
  const { curve: rachis } = taperedCurve(plant, rachisPoints, 0.037, 0.018, materials.pedicel, 20, 8);
  [0.36, 0.59, 0.81].forEach((u, i) => {
    bananaHand(plant, rachis.getPointAt(u), i === 2 ? 4 : 5, phase + i * 0.72, 0.99 - i * 0.055, rnd, materials);
  });
  const bractProfile = [[0, -0.17], [0.035, -0.135], [0.075, -0.045], [0.074, 0.045], [0.036, 0.105], [0, 0.115]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const bract = addMesh(plant, new THREE.LatheGeometry(bractProfile, 12), materials.bract, rachis.getPointAt(1).add(V(0, -0.035, 0)));
  bract.rotation.z = -0.16;

  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set(), ownedMaterials = new Set();
      group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) ownedMaterials.add(material);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      group.removeFromParent();
    },
  };
}
