// An irregular staked tomato vine with lobed compound foliage and star-crowned fruit.
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
    const radius = (r0 + (r1 - r0) * t) * (1 + Math.sin(t * 23) * 0.025);
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

/** Deep, uneven lobes distinguish tomato leaflets from generic oval foliage. */
function tomatoLeafGeometry() {
  const rows = 16, columns = 4;
  const positions = [], colors = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.91))), 0.72);
    const lobe = [0.68, 1.02, 1.13, 0.78][i % 4];
    for (let j = 0; j <= columns; j++) {
      const across = j / columns * 2 - 1;
      const asymmetry = across < 0 ? 0.92 + Math.sin(u * 17) * 0.08 : 1;
      const halfWidth = 0.355 * envelope * lobe * (1 - 0.2 * u) * asymmetry + 0.001;
      const arch = Math.sin(Math.PI * u);
      const z = arch * (0.035 + (1 - Math.abs(across)) * 0.09) - u * u * 0.19;
      positions.push(across * halfWidth, u, z);
      const shade = 0.68 + 0.32 * (1 - Math.abs(across));
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

function localLeafMatrix(at, direction, length, roll) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
  return new THREE.Matrix4().compose(at, q, V(length, length, length));
}

function tomatoGeometry() {
  const rings = 14, sides = 30;
  const positions = [], indices = [];
  for (let i = 0; i <= rings; i++) {
    const theta = i / rings * Math.PI;
    const s = Math.sin(theta), c = Math.cos(theta);
    const topDimple = 0.09 * Math.exp(-Math.pow(theta / 0.31, 2));
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * TAU;
      const shoulder = 0.7 + 0.3 * Math.max(0, c);
      const ribs = 1 + Math.cos(angle * 6) * 0.052 * s * shoulder;
      const r = s * ribs * (1 + 0.045 * c);
      positions.push(Math.cos(angle) * r, c * 0.79 - topDimple, Math.sin(angle) * r);
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

/** Six narrow, folded sepals in one small geometry, not a flat texture star. */
function sepalGeometry() {
  const positions = [], indices = [];
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * TAU + 0.16;
    const radial = V(Math.cos(angle), 0, Math.sin(angle));
    const side = V(-Math.sin(angle), 0, Math.cos(angle));
    const offset = positions.length / 3;
    for (let row = 0; row <= 4; row++) {
      const u = row / 4;
      const distance = 0.06 + u * 1.02;
      const width = Math.sin(Math.PI * Math.pow(u, 0.8)) * 0.115 + 0.002;
      const centre = radial.clone().multiplyScalar(distance);
      centre.y = 0.705 + Math.sin(Math.PI * u) * 0.055 - u * u * 0.18;
      for (const across of [-1, 0, 1]) {
        const p = centre.clone().addScaledVector(side, across * width);
        p.y += across === 0 ? 0.025 * Math.sin(Math.PI * u) : 0;
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

export function createTomato(seed = 7) {
  const rnd = random(seed);
  const group = new THREE.Group();
  group.name = 'venture-tomato-redesign';

  const vineMat = material(0x527c45, 0.9, { flatShading: true });
  const youngStemMat = material(0x6a914f, 0.88, { flatShading: true });
  const leafMat = material(0xffffff, 0.86, { side: THREE.DoubleSide, vertexColors: true, flatShading: true });
  const sepalMat = material(0x3f713c, 0.81, { side: THREE.DoubleSide, flatShading: true });
  const bambooMat = material(0xa78a58, 0.91, { flatShading: true });
  const twineMat = material(0xb6a77d, 1);
  const tomatoMats = [0xd84435, 0xe1513b, 0xc93b32, 0xe35b40].map(color => material(color, 0.62));

  const ground = mesh(group, new THREE.SphereGeometry(0.68, 22, 9), material(0x71835a, 0.98, { flatShading: true }), V(0, -0.035, 0));
  ground.scale.set(1.05, 0.09, 0.9);
  const earth = mesh(group, new THREE.SphereGeometry(0.42, 16, 8), material(0x584235, 1, { flatShading: true }), V(0, -0.003, 0));
  earth.scale.set(1, 0.09, 0.88);

  // The support is deliberately quiet and sits behind the loose, zig-zagging vine.
  stem(group, [V(0.16, -0.02, -0.18), V(0.135, 1.03, -0.17), V(0.095, 2.06, -0.16)], 0.024, 0.018, bambooMat, 13);
  stem(group, [V(0, 0, 0), V(-0.055, 0.37, 0.025), V(0.055, 0.77, -0.015),
    V(-0.075, 1.17, 0.025), V(0.045, 1.57, -0.035), V(-0.015, 1.9, -0.015),
    V(0.08, 2.015, 0.035)], 0.037, 0.006, vineMat, 28);
  for (const y of [0.69, 1.26]) {
    const tie = mesh(group, new THREE.TorusGeometry(0.105, 0.008, 4, 20), twineMat, V(0.07, y, -0.07));
    tie.rotation.x = Math.PI / 2;
    tie.scale.set(1.1, 0.72, 1);
  }

  const leafMatrices = [], leafColors = [];
  const palette = [0x3e7742, 0x4a8448, 0x57904e, 0x639b56, 0x477f46];
  function addLeaf(matrix, colorIndex) {
    leafMatrices.push(matrix);
    leafColors.push(new THREE.Color(palette[colorIndex % palette.length]));
  }
  function compound(at, yaw, pitch, scale, phase) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, (rnd() - 0.5) * 0.15, 'YXZ'));
    const base = new THREE.Matrix4().compose(at, q, V(scale, scale, scale));
    const point = p => p.clone().applyMatrix4(base);
    stem(group, [point(V()), point(V(0.015, 0.018, 0.18)), point(V(-0.018, -0.035, 0.43))],
      0.007 * scale, 0.002 * scale, youngStemMat, 8, 5);
    const nodes = [
      { z: 0.075, left: 0.235, right: 0.17 },
      { z: 0.175, left: 0.145, right: 0.22 },
      { z: 0.285, left: 0.17, right: 0.125 },
    ];
    nodes.forEach((node, index) => {
      for (const side of [-1, 1]) {
        const length = side < 0 ? node.left : node.right;
        const local = localLeafMatrix(V(side * 0.003, 0, node.z + (side > 0 ? 0.018 : 0)),
          V(side * (0.88 + index * 0.08), 0.04 - index * 0.08, 0.38 + index * 0.16), length, side * 0.18);
        addLeaf(base.clone().multiply(local), phase + index + (side > 0 ? 1 : 0));
      }
    });
    addLeaf(base.clone().multiply(localLeafMatrix(V(-0.012, -0.025, 0.34), V(0.08, -0.11, 1), 0.245, 0)), phase + 2);
    // Tiny intercalary leaflets make the silhouette botanical instead of fern-regular.
    for (const [z, side] of [[0.13, 1], [0.235, -1]]) {
      addLeaf(base.clone().multiply(localLeafMatrix(V(0, -0.005, z), V(side, -0.12, 0.3), 0.075, side * 0.3)), phase + 1);
    }
  }

  const arms = [
    { y: 0.45, angle: 0.28, reach: 0.55, rise: 0.23 },
    { y: 0.72, angle: 2.55, reach: 0.62, rise: 0.21 },
    { y: 0.98, angle: 4.22, reach: 0.54, rise: 0.27 },
    { y: 1.23, angle: 1.25, reach: 0.48, rise: 0.25 },
    { y: 1.47, angle: 3.52, reach: 0.39, rise: 0.27 },
  ].map(arm => ({ ...arm, angle: arm.angle + (rnd() - 0.5) * 0.22, reach: arm.reach + (rnd() - 0.5) * 0.08 }));

  arms.forEach((arm, i) => {
    const start = V(i % 2 ? 0.025 : -0.025, arm.y, 0);
    const direction = V(Math.sin(arm.angle), 0, Math.cos(arm.angle));
    const end = start.clone().addScaledVector(direction, arm.reach).add(V(0, arm.rise, 0));
    const elbow = start.clone().lerp(end, 0.52).add(V(0, 0.11, 0));
    stem(group, [start, elbow, end], 0.021 - i * 0.0018, 0.004, vineMat, 12);
    compound(start.clone().lerp(end, 0.48).add(V(0, 0.045, 0)), arm.angle - 0.9, 0.16, 0.82 + rnd() * 0.13, i);
    compound(end, arm.angle + 0.24, -0.03 + rnd() * 0.3, 0.82 + rnd() * 0.17, i + 2);
    arm.start = start;
    arm.end = end;
    arm.direction = direction;
  });
  compound(V(-0.02, 0.88, 0.01), 0.62, 0.34, 0.74, 3);
  compound(V(0.015, 1.37, -0.01), 4.6, 0.3, 0.68, 1);
  for (let i = 0; i < 3; i++) compound(V(0.015, 1.55 + i * 0.15, 0), i * 2.28 + 0.4, 0.28, 0.65 - i * 0.07, i + 1);

  const leaves = new THREE.InstancedMesh(tomatoLeafGeometry(), leafMat, leafMatrices.length);
  leafMatrices.forEach((matrix, i) => { leaves.setMatrixAt(i, matrix); leaves.setColorAt(i, leafColors[i]); });
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  leaves.castShadow = leaves.receiveShadow = true;
  group.add(leaves);

  const fruitGeometry = tomatoGeometry();
  const stars = sepalGeometry();
  for (let i = 0; i < 4; i++) {
    const arm = arms[i];
    const anchor = arm.start.clone().lerp(arm.end, 0.72).add(V(0, 0.07, 0));
    const side = V(arm.direction.z, 0, -arm.direction.x);
    for (const sign of [-1, 1]) {
      const index = i * 2 + (sign > 0 ? 1 : 0);
      const radius = 0.137 + rnd() * 0.031 + (i === 0 ? 0.012 : 0);
      const position = anchor.clone().addScaledVector(side, sign * (0.12 + rnd() * 0.035))
        .addScaledVector(arm.direction, 0.065 + rnd() * 0.045)
        .add(V(0, -0.2 - radius * 0.65 - rnd() * 0.035, 0));
      const fruit = new THREE.Group();
      fruit.position.copy(position);
      fruit.rotation.y = rnd() * TAU;
      fruit.scale.set(radius * (0.97 + rnd() * 0.07), radius, radius);
      mesh(fruit, fruitGeometry, tomatoMats[index % tomatoMats.length]);
      mesh(fruit, stars, sepalMat);
      group.add(fruit);
      const attachment = position.clone().add(V(0, radius * 0.83, 0));
      stem(group, [anchor, anchor.clone().lerp(attachment, 0.58).add(V(0, 0.045, 0)), attachment],
        0.007, 0.0035, youngStemMat, 6, 5);
    }
  }

  return finish(group);
}
