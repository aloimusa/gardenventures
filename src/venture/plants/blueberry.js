// An airy blueberry shrub: fine reddish wood, small oval leaves and loose fruit trusses.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.399963229728653;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    metalness: 0,
    flatShading: true,
    ...options,
  });
}

function addMesh(parent, geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addTube(parent, points, startRadius, endRadius, material, segments = 7, sides = 5) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, segments, 1, sides, false);
  const positions = geometry.attributes.position;
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const centre = curve.getPointAt(t);
    const radius = startRadius + (endRadius - startRadius) * t;
    for (let column = 0; column <= sides; column++) {
      const index = row * (sides + 1) + column;
      positions.setXYZ(
        index,
        centre.x + (positions.getX(index) - centre.x) * radius,
        centre.y + (positions.getY(index) - centre.y) * radius,
        centre.z + (positions.getZ(index) - centre.z) * radius,
      );
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = addMesh(parent, geometry, material);
  return { curve, mesh };
}

function leafGeometry(length, halfWidth) {
  const rows = 7;
  const columns = 4;
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.72) * (1.08 - u * 0.22);
    const width = Math.max(0.0003, halfWidth * envelope);
    for (let column = 0; column <= columns; column++) {
      const across = column / columns * 2 - 1;
      const fold = Math.abs(across) * halfWidth * 0.12;
      const curl = Math.sin(Math.PI * u) * length * 0.04 - u * u * length * 0.075;
      positions.push(across * width, fold + curl, u * length);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addLeaf(parent, material, at, yaw, pitch, roll, length, width) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  pivot.rotation.order = 'YXZ';
  pivot.rotation.set(pitch, yaw, roll);
  addMesh(pivot, leafGeometry(length, width), material);
  parent.add(pivot);
}

function addGround(parent, random) {
  const phase = random() * TAU;
  const geometry = new THREE.CylinderGeometry(0.66, 0.69, 0.075, 25, 1, false);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const ripple = 1 + Math.sin(angle * 6 + phase) * 0.025 + Math.cos(angle * 9 - phase) * 0.012;
    positions.setX(i, x * ripple);
    positions.setZ(i, z * ripple);
  }
  geometry.computeVertexNormals();
  const earth = makeMaterial(0x62513f);
  const moss = makeMaterial(0x75875b);
  addMesh(parent, geometry, [earth, moss, earth], V(0, -0.0375, 0));
}

// A filled five-sepal crown with a recessed centre, all in one inexpensive mesh.
function crownGeometry(radius) {
  const positions = [0, -radius * 0.652, 0];
  const indices = [];
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const angle = i / steps * TAU;
    const part = i % 4;
    const r = radius * [0.14, 0.21, 0.32, 0.2][part];
    const y = -radius * [0.65, 0.69, 0.72, 0.68][part];
    positions.push(Math.cos(angle) * r, y, Math.sin(angle) * r);
  }
  for (let i = 0; i < steps; i++) {
    const current = i + 1;
    const next = (i + 1) % steps + 1;
    indices.push(0, current, next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeBlueberry(radius, bodyMaterial, crownMaterial, direction) {
  const fruit = new THREE.Group();
  const profile = [
    [0, -0.64], [0.34, -0.675], [0.72, -0.57], [0.94, -0.34],
    [1, -0.04], [0.94, 0.29], [0.72, 0.56], [0.35, 0.685], [0, 0.635],
  ].map(([r, y]) => new THREE.Vector2(r * radius, y * radius));
  const geometry = new THREE.LatheGeometry(profile, 14);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const subtleLobes = 1 + Math.cos(angle * 5) * 0.014;
    positions.setX(i, x * subtleLobes);
    positions.setZ(i, z * subtleLobes);
  }
  geometry.computeVertexNormals();
  addMesh(fruit, geometry, bodyMaterial);
  addMesh(fruit, crownGeometry(radius), crownMaterial);
  fruit.quaternion.setFromUnitVectors(V(0, -1, 0), direction.clone().normalize());
  return fruit;
}

export function createBlueberry(seed = 7) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  group.name = 'venture-blueberry';
  addGround(group, random);

  const bark = makeMaterial(0x705343);
  const youngWood = makeMaterial(0x7b7250);
  const pedicelMaterial = makeMaterial(0x66754e);
  const crownMaterial = makeMaterial(0x29395f, { side: THREE.DoubleSide, roughness: 0.95 });
  const leafMaterials = [
    makeMaterial(0x537b55, { side: THREE.DoubleSide }),
    makeMaterial(0x688b60, { side: THREE.DoubleSide }),
    makeMaterial(0x7b9868, { side: THREE.DoubleSide }),
  ];
  const fruitMaterials = [
    makeMaterial(0x526a9d, { roughness: 0.88 }),
    makeMaterial(0x6077aa, { roughness: 0.9 }),
    makeMaterial(0x465e91, { roughness: 0.86 }),
  ];

  const twigs = [];
  const mainStems = 5 + (random() > 0.52 ? 1 : 0);
  const rotationOffset = (random() - 0.5) * 0.42;

  for (let i = 0; i < mainStems; i++) {
    const angle = i / mainStems * TAU + rotationOffset + (random() - 0.5) * 0.3;
    const reach = 0.31 + random() * 0.18;
    const height = 1.02 + random() * 0.28;
    const base = V(Math.cos(angle) * 0.045, 0.015, Math.sin(angle) * 0.045);
    const elbow = V(Math.cos(angle + 0.12) * reach * 0.34, height * 0.39, Math.sin(angle + 0.12) * reach * 0.34);
    const shoulder = V(Math.cos(angle - 0.08) * reach * 0.72, height * 0.74, Math.sin(angle - 0.08) * reach * 0.72);
    const tip = V(Math.cos(angle) * reach, height, Math.sin(angle) * reach);
    const stem = addTube(group, [base, elbow, shoulder, tip], 0.025, 0.005, bark, 11, 6);

    for (let branchIndex = 0; branchIndex < 3; branchIndex++) {
      const t = 0.39 + branchIndex * 0.19 + random() * 0.035;
      const start = stem.curve.getPoint(t);
      const side = branchIndex % 2 ? 1 : -1;
      const branchAngle = angle + side * (0.88 + random() * 0.55);
      const length = 0.21 + random() * 0.15;
      const end = start.clone().add(V(
        Math.cos(branchAngle) * length,
        0.15 + random() * 0.14,
        Math.sin(branchAngle) * length,
      ));
      const bend = start.clone().lerp(end, 0.54).add(V(0, 0.055, 0));
      const twig = addTube(group, [start, bend, end], 0.0085, 0.0023, youngWood, 7, 5);
      twigs.push({ curve: twig.curve, angle: branchAngle, height: end.y });

      for (let leafIndex = 0; leafIndex < 4; leafIndex++) {
        const leafT = 0.25 + leafIndex * 0.215;
        const at = twig.curve.getPoint(leafT);
        const alternating = leafIndex % 2 ? 1 : -1;
        const yaw = branchAngle + alternating * (0.77 + random() * 0.42);
        const length = 0.155 + random() * 0.06;
        addLeaf(group, leafMaterials[(i + branchIndex + leafIndex) % 3], at, yaw,
          -0.25 + random() * 0.46, (random() - 0.5) * 0.32, length, length * (0.29 + random() * 0.055));
      }
    }

    for (let leafIndex = 0; leafIndex < 3; leafIndex++) {
      const at = stem.curve.getPoint(0.76 + leafIndex * 0.1);
      const yaw = angle + leafIndex * GOLDEN_ANGLE;
      const length = 0.17 + random() * 0.045;
      addLeaf(group, leafMaterials[(i + leafIndex + 1) % 3], at, yaw,
        -0.34 + random() * 0.35, (random() - 0.5) * 0.26, length, length * 0.32);
    }
  }

  // Several small, unevenly spaced trusses, rather than a grid of identical berries.
  const clusterCount = Math.min(8, twigs.length);
  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const twigIndex = Math.floor((cluster + 0.35) * twigs.length / clusterCount) % twigs.length;
    const twig = twigs[twigIndex];
    const anchor = twig.curve.getPoint(0.67 + random() * 0.25);
    const berries = 3 + (random() > 0.48 ? 1 : 0);
    for (let berryIndex = 0; berryIndex < berries; berryIndex++) {
      const angle = twig.angle + berryIndex * GOLDEN_ANGLE + random() * 0.28;
      const spread = berryIndex === 0 ? 0.018 : 0.055 + random() * 0.035;
      const radius = 0.055 + random() * 0.013;
      const centre = anchor.clone().add(V(
        Math.cos(angle) * spread,
        -0.045 - berryIndex * 0.018 - random() * 0.045,
        Math.sin(angle) * spread,
      ));
      const crownDirection = V(Math.cos(angle) * 0.78, -0.58 - random() * 0.2, Math.sin(angle) * 0.78);
      const fruit = makeBlueberry(radius, fruitMaterials[(cluster + berryIndex) % 3], crownMaterial, crownDirection);
      fruit.position.copy(centre);
      group.add(fruit);
      fruit.updateMatrix();
      const attachment = V(0, radius * 0.66, 0).applyMatrix4(fruit.matrix);
      const bend = anchor.clone().lerp(attachment, 0.55).add(V(0, 0.025, 0));
      addTube(group, [anchor, bend, attachment], 0.0028, 0.0015, pedicelMaterial, 4, 4);
    }
  }

  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set();
      const materials = new Set();
      group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) {
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.removeFromParent();
    },
  };
}
