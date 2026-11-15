// A compact vase-shaped pear tree with individual cupped leaves and curved-neck fruit.
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
    roughness: 0.84,
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
  const mesh = addMesh(parent, geometry, material);
  return { curve, mesh };
}

// Broad ovate blades have a raised midrib fold, rounded shoulders and a fine pointed tip.
function leafGeometry(length, halfWidth, asymmetry) {
  const rows = 9;
  const columns = 4;
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.88))), 0.59);
    const shoulder = 1.08 - u * 0.24 + Math.sin(u * Math.PI * 2) * 0.055;
    for (let column = 0; column <= columns; column++) {
      const across = column / columns * 2 - 1;
      const sideFullness = 1 + Math.sign(across) * asymmetry * Math.sin(Math.PI * u);
      const width = Math.max(0.0004, halfWidth * envelope * shoulder * sideFullness);
      const cup = Math.abs(across) ** 1.5 * halfWidth * 0.22;
      const arch = Math.sin(Math.PI * u) * length * 0.06 - u * u * length * 0.105;
      const softTwist = across * Math.sin(u * Math.PI) * asymmetry * length * 0.07;
      positions.push(across * width, cup + arch + softTwist, u * length);
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

function addLeaf(parent, material, at, yaw, pitch, roll, length, width, asymmetry) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  pivot.rotation.order = 'YXZ';
  pivot.rotation.set(pitch, yaw, roll);
  addMesh(pivot, leafGeometry(length, width, asymmetry), material);
  parent.add(pivot);
}

function addGround(parent, random) {
  const phase = random() * TAU;
  const geometry = new THREE.CylinderGeometry(0.72, 0.75, 0.08, 27, 1, false);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const ripple = 1 + Math.sin(angle * 5 + phase) * 0.022 + Math.sin(angle * 8 - phase) * 0.014;
    positions.setX(i, x * ripple);
    positions.setZ(i, z * ripple);
  }
  geometry.computeVertexNormals();
  const earth = makeMaterial(0x66513c);
  const moss = makeMaterial(0x788d57);
  addMesh(parent, geometry, [earth, moss, earth], V(0, -0.04, 0));
}

function blossomEndGeometry(radius) {
  const positions = [0, -radius * 1.345, 0];
  const indices = [];
  const steps = 15;
  for (let i = 0; i < steps; i++) {
    const angle = i / steps * TAU;
    const r = radius * (i % 3 === 0 ? 0.2 : 0.09);
    positions.push(Math.cos(angle) * r, -radius * 1.36, Math.sin(angle) * r);
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

function makePear(radius, bodyMaterial, woodMaterial, calyxMaterial, random) {
  const fruit = new THREE.Group();
  const neckBend = radius * (0.15 + random() * 0.1) * (random() > 0.5 ? 1 : -1);
  const plump = 0.94 + random() * 0.13;
  const profile = [
    [0, -1.345], [0.18, -1.36], [0.5, -1.27], [0.82, -1.05],
    [1, -0.78], [1.04, -0.48], [0.96, -0.17], [0.78, 0.12],
    [0.56, 0.38], [0.42, 0.67], [0.34, 0.97], [0.31, 1.18],
    [0.25, 1.32], [0.1, 1.35], [0, 1.265],
  ].map(([r, y]) => new THREE.Vector2(r * radius, y * radius));
  const geometry = new THREE.LatheGeometry(profile, 18);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const neckT = THREE.MathUtils.smoothstep(y / radius, -0.05, 1.32);
    const lowerFullness = 1 + (plump - 1) * (1 - neckT);
    const uneven = 1 + Math.cos(angle * 3 + 0.4) * 0.018 * (1 - neckT);
    positions.setXYZ(i,
      x * lowerFullness * uneven + neckBend * neckT * neckT,
      y,
      z * lowerFullness * uneven,
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  addMesh(fruit, geometry, bodyMaterial);
  addMesh(fruit, blossomEndGeometry(radius), calyxMaterial);

  const stemStart = V(neckBend, radius * 1.285, 0);
  const stemShoulder = V(neckBend + radius * 0.09, radius * 1.62, radius * 0.018);
  const attachment = V(neckBend + radius * 0.28, radius * 1.94, radius * 0.045);
  addTube(fruit, [stemStart, stemShoulder, attachment], radius * 0.085, radius * 0.05, woodMaterial, 5, 5);
  return { fruit, attachment };
}

export function createPear(seed = 7) {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  group.name = 'venture-pear';
  addGround(group, random);

  const bark = makeMaterial(0x725640);
  const barkLight = makeMaterial(0x896a4c);
  const calyx = makeMaterial(0x67523a, { side: THREE.DoubleSide, roughness: 0.95 });
  const leafMaterials = [
    makeMaterial(0x4e7543, { side: THREE.DoubleSide }),
    makeMaterial(0x67894b, { side: THREE.DoubleSide }),
    makeMaterial(0x7d9d55, { side: THREE.DoubleSide }),
    makeMaterial(0x8ca65f, { side: THREE.DoubleSide }),
  ];
  const fruitMaterials = [
    makeMaterial(0xb9bd51, { roughness: 0.72 }),
    makeMaterial(0xc8b654, { roughness: 0.74 }),
    makeMaterial(0xa6b64d, { roughness: 0.76 }),
  ];

  const leanX = (random() - 0.5) * 0.1;
  const leanZ = (random() - 0.5) * 0.075;
  const trunkPoints = [
    V(0, 0.005, 0), V(0.025, 0.43, -0.012), V(-0.025, 0.88, 0.02),
    V(leanX * 0.55, 1.3, leanZ * 0.55), V(leanX, 1.72, leanZ),
  ];
  const trunk = addTube(group, trunkPoints, 0.105, 0.027, bark, 15, 8);

  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * TAU + 0.2;
    addTube(group, [V(0, 0.12, 0), V(Math.cos(angle) * 0.13, 0.035, Math.sin(angle) * 0.13),
      V(Math.cos(angle) * 0.27, 0.012, Math.sin(angle) * 0.27)], 0.041, 0.008, bark, 5, 6);
  }

  const fruitingBranches = [];
  const scaffoldCount = 6;
  const offset = random() * 0.35;
  for (let i = 0; i < scaffoldCount; i++) {
    const angle = i / scaffoldCount * TAU + offset + (random() - 0.5) * 0.22;
    const startY = 0.55 + i * 0.065 + random() * 0.06;
    const start = trunk.curve.getPoint(startY / 1.72);
    start.y = startY;
    const reach = 0.43 + random() * 0.16;
    const height = 1.55 + (i % 3) * 0.12 + random() * 0.12;
    const end = V(Math.cos(angle) * reach + leanX * 0.35, height, Math.sin(angle) * reach + leanZ * 0.35);
    const elbow = start.clone().lerp(end, 0.44);
    elbow.y = startY + (height - startY) * 0.57;
    elbow.x += Math.cos(angle + Math.PI / 2) * (random() - 0.5) * 0.08;
    elbow.z += Math.sin(angle + Math.PI / 2) * (random() - 0.5) * 0.08;
    const branch = addTube(group, [start, elbow, end], 0.043 - i * 0.002, 0.009, i % 2 ? barkLight : bark, 10, 7);
    fruitingBranches.push({ curve: branch.curve, angle });

    for (let leafIndex = 0; leafIndex < 6; leafIndex++) {
      const t = 0.48 + leafIndex * 0.095;
      const at = branch.curve.getPoint(Math.min(0.96, t));
      const alternating = leafIndex % 2 ? 1 : -1;
      const yaw = angle + alternating * (0.68 + random() * 0.48);
      const length = 0.235 + random() * 0.075;
      addLeaf(group, leafMaterials[(i + leafIndex) % leafMaterials.length], at, yaw,
        -0.39 + random() * 0.52, alternating * (0.08 + random() * 0.18), length,
        length * (0.31 + random() * 0.055), (random() - 0.5) * 0.26);
    }

    for (let shootIndex = 0; shootIndex < 2; shootIndex++) {
      const t = 0.54 + shootIndex * 0.19;
      const shootStart = branch.curve.getPoint(t);
      const side = shootIndex ? 1 : -1;
      const shootAngle = angle + side * (0.7 + random() * 0.35);
      const length = 0.15 + random() * 0.095;
      const shootEnd = shootStart.clone().add(V(Math.cos(shootAngle) * length,
        0.22 + random() * 0.1, Math.sin(shootAngle) * length));
      const bend = shootStart.clone().lerp(shootEnd, 0.55).add(V(0, 0.035, 0));
      const shoot = addTube(group, [shootStart, bend, shootEnd], 0.012, 0.003, barkLight, 6, 5);
      for (let leafIndex = 0; leafIndex < 3; leafIndex++) {
        const at = shoot.curve.getPoint(0.28 + leafIndex * 0.29);
        const yaw = shootAngle + (leafIndex % 2 ? 1 : -1) * (0.8 + random() * 0.35);
        const leafLength = 0.225 + random() * 0.075;
        addLeaf(group, leafMaterials[(i + shootIndex + leafIndex + 1) % leafMaterials.length], at, yaw,
          -0.38 + random() * 0.55, (random() - 0.5) * 0.35, leafLength,
          leafLength * (0.32 + random() * 0.045), (random() - 0.5) * 0.28);
      }
    }
  }

  // A narrow leader closes the vase silhouette without a spherical foliage blob.
  const leaderStart = trunk.curve.getPoint(0.73);
  const leaderMid = V(leanX * 0.85 - 0.025, 1.82, leanZ * 0.85 + 0.018);
  const leaderEnd = V(leanX * 0.9, 2.08 + random() * 0.07, leanZ * 0.9);
  const leader = addTube(group, [leaderStart, leaderMid, leaderEnd], 0.028, 0.005, bark, 8, 6);
  for (let i = 0; i < 6; i++) {
    const at = leader.curve.getPoint(0.24 + i * 0.135);
    const yaw = i * GOLDEN_ANGLE + offset;
    const length = 0.22 + random() * 0.065;
    addLeaf(group, leafMaterials[(i + 2) % leafMaterials.length], at, yaw,
      -0.42 + random() * 0.37, (random() - 0.5) * 0.22, length, length * 0.34,
      (random() - 0.5) * 0.2);
  }

  // One modest pear per scaffold; the open crown leaves each curved neck readable.
  for (let i = 0; i < fruitingBranches.length; i++) {
    const branch = fruitingBranches[i];
    const anchor = branch.curve.getPoint(0.5 + (i % 2) * 0.15 + random() * 0.045);
    const radius = 0.116 + random() * 0.018;
    const outward = V(Math.cos(branch.angle), 0, Math.sin(branch.angle));
    const centre = anchor.clone().addScaledVector(outward, 0.065).add(V(0, -0.2 - random() * 0.035, 0));
    const { fruit, attachment: localAttachment } = makePear(radius, fruitMaterials[i % 3], bark, calyx, random);
    fruit.position.copy(centre);
    fruit.rotation.order = 'YXZ';
    fruit.rotation.set((random() - 0.5) * 0.14, random() * TAU, (random() - 0.5) * 0.18);
    group.add(fruit);
    fruit.updateMatrix();
    const attachment = localAttachment.clone().applyMatrix4(fruit.matrix);
    const bend = anchor.clone().lerp(attachment, 0.5).add(V(0, 0.025, 0));
    addTube(group, [anchor, bend, attachment], 0.008, 0.0045, barkLight, 5, 5);
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
