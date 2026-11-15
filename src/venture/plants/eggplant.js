// A soft, branching aubergine herb with broad leaves, lavender stars and curved fruit.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function material(color, roughness = 0.82, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
}

function mesh(parent, geometry, mat, at = V()) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.copy(at);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function stem(parent, points, r0, r1, mat, steps = 10, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, steps, 1, radial, false);
  const p = geometry.attributes.position;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, centre = curve.getPointAt(t);
    const radius = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const index = i * (radial + 1) + j;
      p.setXYZ(index,
        centre.x + (p.getX(index) - centre.x) * radius,
        centre.y + (p.getY(index) - centre.y) * radius,
        centre.z + (p.getZ(index) - centre.z) * radius);
    }
  }
  geometry.computeVertexNormals();
  return mesh(parent, geometry, mat);
}

function aubergineLeafGeometry() {
  const rows = 12, columns = 4;
  const positions = [], colors = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.82))), 0.64);
    const softTeeth = i % 2 ? 0.96 : 1.025;
    for (let j = 0; j <= columns; j++) {
      const across = j / columns * 2 - 1;
      const halfWidth = 0.37 * envelope * softTeeth * (1 - 0.1 * u) * (across < 0 ? 1.04 : 0.98) + 0.001;
      const arch = Math.sin(Math.PI * u);
      const z = arch * (0.045 + (1 - Math.abs(across)) * 0.095) - u * u * 0.2;
      positions.push(across * halfWidth, u, z);
      const shade = 0.7 + (1 - Math.abs(across)) * 0.3;
      colors.push(shade, shade, shade);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
    const a = i * (columns + 1) + j, b = a + columns + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function leafMatrix(at, direction, length, roll) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
  return new THREE.Matrix4().compose(at, q, V(length, length, length));
}

/** Swept tapered skin: the centreline bends and the blossom end narrows to a point. */
function aubergineGeometry(length, bend) {
  const rings = 17, sides = 22;
  const positions = [], indices = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const radius = Math.pow(Math.max(0, 1 - u), 0.43) * (0.76 + Math.sin(Math.PI * u) * 0.26 - u * 0.12) + 0.0005;
    const cx = bend * Math.pow(u, 1.65), cz = Math.sin(Math.PI * u) * 0.085;
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * TAU;
      const softRib = 1 + Math.cos(angle * 5 + u * 1.2) * 0.012;
      positions.push(cx + Math.cos(angle) * radius * softRib, -u * length, cz + Math.sin(angle) * radius * softRib * 0.91);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function calyxGeometry() {
  const positions = [], indices = [];
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * TAU + 0.25;
    const radial = V(Math.cos(angle), 0, Math.sin(angle));
    const side = V(-Math.sin(angle), 0, Math.cos(angle));
    const offset = positions.length / 3;
    for (let row = 0; row <= 4; row++) {
      const u = row / 4;
      const distance = 0.2 + Math.sin(u * Math.PI / 2) * 0.64;
      const width = Math.sin(Math.PI * Math.pow(u, 0.8)) * 0.145 + 0.002;
      for (const across of [-1, 0, 1]) {
        const p = radial.clone().multiplyScalar(distance).addScaledVector(side, across * width);
        p.y = -0.035 - u * 0.69 + (across === 0 ? Math.sin(Math.PI * u) * 0.035 : 0);
        p.z *= 0.91;
        positions.push(p.x, p.y, p.z);
      }
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
      const a = offset + row * 3 + col, b = a + 3;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Five cupped petals face local +Z; all petals share one draw call per flower. */
function flowerGeometry() {
  const positions = [], indices = [];
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal / 5 * TAU - Math.PI / 2;
    const radial = V(Math.cos(angle), Math.sin(angle), 0);
    const side = V(-Math.sin(angle), Math.cos(angle), 0);
    const offset = positions.length / 3;
    for (let row = 0; row <= 5; row++) {
      const u = row / 5;
      const width = Math.pow(Math.sin(Math.PI * u), 0.72) * 0.065 + 0.001;
      for (const across of [-1, 0, 1]) {
        const p = radial.clone().multiplyScalar(0.018 + u * 0.135).addScaledVector(side, across * width);
        p.z = -u * u * 0.045 + (across === 0 ? Math.sin(Math.PI * u) * 0.025 : 0);
        positions.push(p.x, p.y, p.z);
      }
    }
    for (let row = 0; row < 5; row++) for (let col = 0; col < 2; col++) {
      const a = offset + row * 3 + col, b = a + 3;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function finish(group) {
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set(), materials = new Set();
      group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const mat of materials) mat.dispose();
      group.removeFromParent();
    },
  };
}

export function createEggplant(seed = 7) {
  const rnd = random(seed);
  const group = new THREE.Group();
  group.name = 'venture-eggplant-redesign';

  const stalkMat = material(0x56794a, 0.9, { flatShading: true });
  const nodeMat = material(0x657052, 0.88, { flatShading: true });
  const leafMat = material(0xffffff, 0.9, { side: THREE.DoubleSide, vertexColors: true, flatShading: true });
  const calyxMat = material(0x506e43, 0.82, { side: THREE.DoubleSide, flatShading: true });
  const purpleMats = [0x50335f, 0x5d386c, 0x493052].map(color => material(color, 0.38));
  const petalMat = material(0xa58aba, 0.77, { side: THREE.DoubleSide, flatShading: true });
  const pollenMat = material(0xe0b84f, 0.72, { flatShading: true });
  const scarMat = material(0x927c71, 0.91);

  const ground = mesh(group, new THREE.SphereGeometry(0.7, 22, 9), material(0x6b805b, 0.97, { flatShading: true }), V(0, -0.035, 0));
  ground.scale.set(1, 0.09, 0.92);
  const earth = mesh(group, new THREE.SphereGeometry(0.43, 17, 8), material(0x554036, 1, { flatShading: true }), V(0, -0.003, 0));
  earth.scale.set(1, 0.095, 0.9);

  stem(group, [V(0, 0, 0), V(0.035, 0.36, 0.015), V(-0.035, 0.74, -0.015),
    V(0.035, 1.1, 0.015), V(-0.02, 1.47, -0.02)], 0.034, 0.008, stalkMat, 23);
  for (const y of [0.25, 0.51, 0.77, 1.02]) {
    const node = mesh(group, new THREE.SphereGeometry(0.046, 8, 5), nodeMat, V(0, y, 0));
    node.scale.set(1, 0.5, 1);
  }

  const arms = [
    { y: 0.29, angle: 0.22, reach: 0.47, rise: 0.17 },
    { y: 0.48, angle: 2.62, reach: 0.53, rise: 0.19 },
    { y: 0.68, angle: 4.18, reach: 0.54, rise: 0.19 },
    { y: 0.87, angle: 1.36, reach: 0.47, rise: 0.2 },
    { y: 1.05, angle: 5.37, reach: 0.43, rise: 0.18 },
    { y: 1.21, angle: 3.28, reach: 0.34, rise: 0.21 },
  ].map(arm => ({ ...arm, angle: arm.angle + (rnd() - 0.5) * 0.24, reach: arm.reach + (rnd() - 0.5) * 0.07 }));

  const leafMatrices = [], leafColors = [];
  const palette = [0x466f45, 0x517c4b, 0x5a8750, 0x638e55, 0x3f6841];
  function leaf(at, direction, length, phase) {
    leafMatrices.push(leafMatrix(at, direction, length, (rnd() - 0.5) * 0.85));
    leafColors.push(new THREE.Color(palette[phase % palette.length]));
  }

  arms.forEach((arm, i) => {
    const start = V(i % 2 ? 0.02 : -0.015, arm.y, 0);
    const direction = V(Math.sin(arm.angle), 0, Math.cos(arm.angle));
    const end = start.clone().addScaledVector(direction, arm.reach).add(V(0, arm.rise, 0));
    const elbow = start.clone().lerp(end, 0.55).add(V(0, 0.095, 0));
    stem(group, [start, elbow, end], 0.017 - i * 0.0013, 0.0035, stalkMat, 11);
    const side = V(direction.z, 0, -direction.x);
    leaf(start.clone().lerp(end, 0.47), direction.clone().multiplyScalar(0.45).addScaledVector(side, i % 2 ? 0.7 : -0.7).add(V(0, 0.28, 0)),
      0.43 + rnd() * 0.13, i);
    leaf(end, direction.clone().add(V(0, 0.08 + rnd() * 0.18, 0)), 0.45 + rnd() * 0.13, i + 2);
    arm.start = start;
    arm.end = end;
    arm.direction = direction;
  });
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.399963 + 0.55;
    leaf(V(0, 1.04 + i * 0.09, 0), V(Math.cos(angle), 0.27, Math.sin(angle)), 0.4 - i * 0.025 + rnd() * 0.06, i + 1);
  }
  const leaves = new THREE.InstancedMesh(aubergineLeafGeometry(), leafMat, leafMatrices.length);
  leafMatrices.forEach((matrix, i) => { leaves.setMatrixAt(i, matrix); leaves.setColorAt(i, leafColors[i]); });
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  leaves.castShadow = leaves.receiveShadow = true;
  group.add(leaves);

  const sepals = calyxGeometry();
  const calyxCap = new THREE.SphereGeometry(0.79, 14, 7);
  const blossomScar = new THREE.SphereGeometry(0.09, 7, 4);
  for (let i = 0; i < 5; i++) {
    const arm = arms[i];
    const radius = (i === 0 ? 0.105 : 0.112) + rnd() * 0.018;
    const length = 3.65 + rnd() * 0.65;
    const bend = (i % 2 ? -1 : 1) * (0.72 + rnd() * 0.38);
    const position = arm.end.clone().addScaledVector(arm.direction, 0.035).add(V(0, -0.16 - rnd() * 0.06, 0));
    // Keep low-hanging fruit above its soil cushion even for extreme seeds.
    position.y = Math.max(position.y, radius * length + 0.055);
    // Bias the curve into profile at the app's shallow three-quarter viewing angle.
    const yaw = -0.55 + (rnd() - 0.5) * 1.5;
    const fruit = new THREE.Group();
    fruit.position.copy(position);
    fruit.rotation.y = yaw;
    fruit.scale.setScalar(radius);
    mesh(fruit, aubergineGeometry(length, bend), purpleMats[i % purpleMats.length]);
    mesh(fruit, sepals, calyxMat);
    const cap = mesh(fruit, calyxCap, calyxMat, V(0, -0.065, 0));
    cap.scale.set(1, 0.36, 0.91);
    stem(fruit, [V(0, -0.005, 0), V(0.015, 0.25, 0.01), V(0.03, 0.48, 0)], 0.075, 0.045, calyxMat, 5, 6);
    const scar = mesh(fruit, blossomScar, scarMat, V(bend, -length, 0));
    scar.scale.set(1, 0.28, 0.85);
    group.add(fruit);
    const attachment = V(0.03, 0.48, 0).multiplyScalar(radius).applyAxisAngle(UP, yaw).add(position);
    stem(group, [arm.end, arm.end.clone().lerp(attachment, 0.5).add(V(0, 0.045, 0)), attachment], 0.009, 0.004, stalkMat, 6, 5);
  }

  const petals = flowerGeometry();
  const pollen = new THREE.CylinderGeometry(0.027, 0.038, 0.055, 5);
  for (const [index, armIndex] of [1, 3, 4, 5].entries()) {
    const arm = arms[armIndex];
    const flowerSide = V(arm.direction.z, 0, -arm.direction.x);
    const position = arm.end.clone().addScaledVector(arm.direction, 0.055)
      .addScaledVector(flowerSide, index % 2 ? -0.15 : 0.15).add(V(0, 0.005 - index * 0.012, 0.035));
    const flower = new THREE.Group();
    flower.position.copy(position);
    flower.rotation.set(-0.16 + rnd() * 0.3, (rnd() - 0.5) * 0.75, rnd() * TAU);
    const scale = 0.86 + rnd() * 0.18;
    flower.scale.setScalar(scale);
    mesh(flower, petals, petalMat);
    const centre = mesh(flower, pollen, pollenMat, V(0, 0, 0.026));
    centre.rotation.x = Math.PI / 2;
    group.add(flower);
    stem(group, [arm.end, arm.end.clone().lerp(position, 0.55).add(V(0, 0.025, 0)), position], 0.006, 0.003, stalkMat, 5, 5);
  }

  return finish(group);
}
