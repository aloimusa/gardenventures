// A low strawberry mound with trifoliate leaves, hanging seeded fruit and a creeping runner.
// Everything is owned by the returned group; there is no interaction or animation state.
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
    roughness: 0.82,
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

function addTube(parent, points, startRadius, endRadius, material, segments = 8, sides = 6) {
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
  return addMesh(parent, geometry, material);
}

function leafGeometry(length, halfWidth, serrated = false) {
  const rows = 10;
  const columns = 4;
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.94))), 0.62);
    const tooth = serrated && row > 0 && row < rows ? (row % 2 ? 0.84 : 1.04) : 1;
    const width = Math.max(0.0004, halfWidth * envelope * (0.9 + u * 0.16) * tooth);
    for (let column = 0; column <= columns; column++) {
      const across = column / columns * 2 - 1;
      const ridge = Math.abs(across) * halfWidth * 0.17;
      const arch = Math.sin(Math.PI * u) * length * 0.055 - u * u * length * 0.09;
      positions.push(across * width, ridge + arch, u * length);
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

function addLeaf(parent, material, at, yaw, pitch, roll, length, width, serrated = true) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  pivot.rotation.order = 'YXZ';
  pivot.rotation.set(pitch, yaw, roll);
  addMesh(pivot, leafGeometry(length, width, serrated), material);
  parent.add(pivot);
  return pivot;
}

function addGround(parent, random) {
  const phase = random() * TAU;
  const geometry = new THREE.CylinderGeometry(0.7, 0.73, 0.075, 26, 1, false);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const ripple = 1 + Math.sin(angle * 5 + phase) * 0.025 + Math.sin(angle * 9 - phase) * 0.012;
    positions.setX(i, x * ripple);
    positions.setZ(i, z * ripple);
  }
  geometry.computeVertexNormals();
  const earth = makeMaterial(0x62503b);
  const moss = makeMaterial(0x718c51);
  addMesh(parent, geometry, [earth, moss, earth], V(0, -0.0375, 0));
}

function calyxGeometry(radius) {
  const positions = [0, radius * 0.13, 0];
  const indices = [];
  const radii = [0.34, 0.67, 1.12, 0.66];
  const heights = [0.08, 0.015, -0.15, -0.015];
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const angle = i / steps * TAU;
    const part = i % 4;
    const r = radius * radii[part];
    positions.push(Math.cos(angle) * r, radius * heights[part], Math.sin(angle) * r);
  }
  for (let i = 0; i < steps; i++) {
    const current = i + 1;
    const next = (i + 1) % steps + 1;
    indices.push(0, next, current);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const BERRY_PROFILE = [
  [0.018, -1.45], [0.25, -1.34], [0.52, -1.12], [0.78, -0.83],
  [0.95, -0.49], [1, -0.18], [0.91, 0.055], [0.64, 0.19], [0.22, 0.23], [0, 0.21],
];

function profileAt(y) {
  for (let i = 0; i < BERRY_PROFILE.length - 1; i++) {
    const a = BERRY_PROFILE[i];
    const b = BERRY_PROFILE[i + 1];
    if (y >= a[1] && y <= b[1]) {
      const t = (y - a[1]) / (b[1] - a[1]);
      return { radius: a[0] + (b[0] - a[0]) * t, slope: (b[0] - a[0]) / (b[1] - a[1]) };
    }
  }
  return { radius: 0.01, slope: 0 };
}

function berrySurface(y, angle, radius, lean, phase) {
  const { radius: profileRadius, slope } = profileAt(y);
  const along = (y + 1.45) / 1.68;
  const lobing = 1 + Math.cos(angle * 3 + phase) * 0.018 * Math.sin(along * Math.PI);
  const radial = profileRadius * radius * lobing;
  const point = V(
    Math.cos(angle) * radial + lean * (1 - along) * (1 - along),
    y * radius,
    Math.sin(angle) * radial,
  );
  const normal = V(Math.cos(angle), -slope * 0.72, Math.sin(angle)).normalize();
  return { point, normal };
}

function makeBerry(radius, phase, materials) {
  const fruit = new THREE.Group();
  const lean = radius * Math.sin(phase * 2.7) * 0.08;
  const points = BERRY_PROFILE.map(([r, y]) => new THREE.Vector2(r * radius, y * radius));
  const geometry = new THREE.LatheGeometry(points, 18);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i) / radius;
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const along = (y + 1.45) / 1.68;
    const lobing = 1 + Math.cos(angle * 3 + phase) * 0.018 * Math.sin(along * Math.PI);
    positions.setXYZ(
      i,
      x * lobing + lean * (1 - along) * (1 - along),
      y * radius,
      z * lobing,
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  addMesh(fruit, geometry, materials.red);
  addMesh(fruit, calyxGeometry(radius), materials.calyx, V(0, radius * 0.11, 0));

  const rows = [
    { y: -1.15, count: 4 }, { y: -0.87, count: 5 }, { y: -0.58, count: 6 },
    { y: -0.29, count: 6 }, { y: -0.015, count: 5 },
  ];
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  const dimples = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), materials.dimple, count);
  const seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), materials.seed, count);
  const transform = new THREE.Object3D();
  const forward = V(0, 0, 1);
  let index = 0;
  for (let row = 0; row < rows.length; row++) {
    const { y, count: rowCount } = rows[row];
    for (let column = 0; column < rowCount; column++) {
      const angle = column / rowCount * TAU + row * 1.17 + phase * 0.09;
      const { point, normal } = berrySurface(y, angle, radius, lean, phase);
      transform.position.copy(point).addScaledVector(normal, -radius * 0.003);
      transform.quaternion.setFromUnitVectors(forward, normal);
      transform.scale.set(radius * 0.052, radius * 0.088, radius * 0.018);
      transform.updateMatrix();
      dimples.setMatrixAt(index, transform.matrix);
      transform.position.copy(point).addScaledVector(normal, radius * 0.008);
      transform.scale.set(radius * 0.024, radius * 0.051, radius * 0.013);
      transform.updateMatrix();
      seeds.setMatrixAt(index, transform.matrix);
      index++;
    }
  }
  dimples.instanceMatrix.needsUpdate = true;
  seeds.instanceMatrix.needsUpdate = true;
  fruit.add(dimples, seeds);
  return fruit;
}

function addBlossom(parent, at, size, yaw, materials) {
  addTube(parent, [V(at.x * 0.25, 0.12, at.z * 0.25), V(at.x * 0.7, at.y * 0.78, at.z * 0.7), at],
    0.008, 0.004, materials.stem, 7, 5);
  const flower = new THREE.Group();
  flower.position.copy(at);
  flower.rotation.y = yaw;
  flower.rotation.x = 0.08;
  for (let i = 0; i < 5; i++) {
    addLeaf(flower, materials.petal, V(), i / 5 * TAU, 0.05, 0, size, size * 0.36, false);
  }
  const centre = addMesh(flower, new THREE.SphereGeometry(size * 0.22, 8, 5), materials.pollen, V(0, 0.014, 0));
  centre.scale.y = 0.52;
  parent.add(flower);
}

export function createStrawberry(seed = 7) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  group.name = 'venture-strawberry';
  addGround(group, random);

  const materials = {
    stem: makeMaterial(0x557b42),
    calyx: makeMaterial(0x397443, { side: THREE.DoubleSide }),
    red: makeMaterial(0xd94345, { roughness: 0.66 }),
    dimple: makeMaterial(0xa82f37, { roughness: 0.9 }),
    seed: makeMaterial(0xe7bd72, { roughness: 0.78 }),
    petal: makeMaterial(0xfff8e9, { side: THREE.DoubleSide, roughness: 0.9 }),
    pollen: makeMaterial(0xe7b94f),
  };
  const leaves = [
    makeMaterial(0x397443, { side: THREE.DoubleSide }),
    makeMaterial(0x518b4b, { side: THREE.DoubleSide }),
    makeMaterial(0x649c56, { side: THREE.DoubleSide }),
  ];

  const crown = addMesh(group, new THREE.SphereGeometry(0.075, 8, 5), materials.stem, V(0, 0.065, 0));
  crown.scale.set(1.15, 0.65, 1.05);

  // Separate arched petioles keep the three-leaflet structure legible at small sizes.
  for (let i = 0; i < 8; i++) {
    const angle = i * GOLDEN_ANGLE + 0.18 + (random() - 0.5) * 0.22;
    const distance = 0.19 + random() * 0.28;
    const at = V(Math.cos(angle) * distance, 0.29 + random() * 0.22, Math.sin(angle) * distance);
    const elbow = V(at.x * 0.42, at.y * 0.66 + 0.06, at.z * 0.42);
    addTube(group, [V(0, 0.07, 0), elbow, at], 0.011, 0.0045, materials.stem, 8, 5);
    for (let leaflet = -1; leaflet <= 1; leaflet++) {
      const length = (leaflet === 0 ? 0.32 : 0.275) + random() * 0.055;
      addLeaf(
        group,
        leaves[(i + leaflet + 3) % leaves.length],
        at,
        angle + leaflet * (0.79 + random() * 0.12),
        -0.2 + random() * 0.28 + Math.abs(leaflet) * 0.045,
        leaflet * (0.07 + random() * 0.07),
        length,
        length * (0.34 + random() * 0.045),
      );
    }
  }

  // Fruit hangs below the leaf canopy rather than sitting on top as decorative targets.
  for (let i = 0; i < 7; i++) {
    const angle = i * GOLDEN_ANGLE + 0.62 + (random() - 0.5) * 0.3;
    const distance = 0.4 + random() * 0.18;
    const radius = 0.105 + random() * 0.024;
    const at = V(Math.cos(angle) * distance, 0.27 + random() * 0.16, Math.sin(angle) * distance);
    const end = at.clone().add(V(0, radius * 0.22, 0));
    addTube(group, [V(0, 0.16, 0), V(at.x * 0.55, at.y + 0.18, at.z * 0.55), end],
      0.008, 0.0038, materials.stem, 8, 5);
    const fruit = makeBerry(radius, random() * TAU + seed * 0.013, materials);
    fruit.position.copy(at);
    fruit.rotation.set((random() - 0.5) * 0.18, random() * TAU, (random() - 0.5) * 0.24);
    group.add(fruit);
  }

  addBlossom(group, V(0.2, 0.5 + random() * 0.04, -0.29), 0.095, random() * TAU, materials);
  addBlossom(group, V(-0.27, 0.44 + random() * 0.05, 0.24), 0.087, random() * TAU, materials);

  // One grounded stolon and a small daughter rosette make the growth habit unmistakable.
  const runnerAngle = 3.75 + (random() - 0.5) * 0.4;
  const runnerEnd = V(Math.cos(runnerAngle) * 0.77, 0.035, Math.sin(runnerAngle) * 0.77);
  addTube(group, [V(0, 0.075, 0), V(runnerEnd.x * 0.5, 0.07, runnerEnd.z * 0.5), runnerEnd],
    0.007, 0.003, materials.stem, 9, 5);
  for (let i = -1; i <= 1; i++) {
    addLeaf(group, leaves[(i + 4) % 3], runnerEnd, runnerAngle + i * 0.9, -0.34, i * 0.1,
      0.16 + random() * 0.035, 0.058);
  }

  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set();
      const ownedMaterials = new Set();
      group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) {
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) ownedMaterials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      group.removeFromParent();
    },
  };
}
