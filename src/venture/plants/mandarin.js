// A compact, open-crowned mandarin with folded citrus leaves and dimpled fruit.
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

function material(color, roughness = 0.8, extra = {}) {
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

/** Tapered, slightly irregular woody sweep rather than a stack of cylinders. */
function limb(parent, points, r0, r1, mat, steps = 12) {
  const curve = new THREE.CatmullRomCurve3(points);
  const radial = 7;
  const geometry = new THREE.TubeGeometry(curve, steps, 1, radial, false);
  const p = geometry.attributes.position;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const centre = curve.getPointAt(t);
    const radius = (r0 + (r1 - r0) * t) * (1 + Math.sin(t * 19) * 0.035);
    for (let j = 0; j <= radial; j++) {
      const index = i * (radial + 1) + j;
      const x = p.getX(index), y = p.getY(index), z = p.getZ(index);
      p.setXYZ(index,
        centre.x + (x - centre.x) * radius,
        centre.y + (y - centre.y) * radius,
        centre.z + (z - centre.z) * radius);
    }
  }
  geometry.computeVertexNormals();
  return mesh(parent, geometry, mat);
}

/** Leaf grows along local +Y; its raised centre and curled tip catch soft light. */
function citrusLeafGeometry() {
  const rows = 10, columns = 4;
  const positions = [], colors = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.9))), 0.62);
    const halfWidth = 0.285 * envelope * (1 - 0.24 * u) + 0.001;
    for (let j = 0; j <= columns; j++) {
      const across = j / columns * 2 - 1;
      const arch = Math.sin(Math.PI * u);
      const z = arch * (0.052 + (1 - Math.abs(across)) * 0.07) - u * u * 0.13;
      positions.push(across * halfWidth + Math.sin(u * 5) * 0.012 * arch, u, z);
      const shade = 0.73 + (1 - Math.abs(across)) * 0.27;
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

function citrusGeometry() {
  const rings = 14, sides = 28;
  const positions = [], indices = [];
  for (let i = 0; i <= rings; i++) {
    const theta = i / rings * Math.PI;
    const s = Math.sin(theta), c = Math.cos(theta);
    const topDimple = 0.105 * Math.exp(-Math.pow(theta / 0.3, 2));
    const bottomDimple = 0.026 * Math.exp(-Math.pow((Math.PI - theta) / 0.26, 2));
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * TAU;
      const lobes = 1 + Math.cos(angle * 9 + 0.35) * 0.012 * s * s;
      const r = s * lobes;
      positions.push(Math.cos(angle) * r, c * 0.775 - topDimple + bottomDimple, Math.sin(angle) * r);
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

function citrusCrownGeometry() {
  const positions = [], indices = [];
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * TAU;
    const radial = V(Math.cos(angle), 0, Math.sin(angle));
    const side = V(-Math.sin(angle), 0, Math.cos(angle));
    const offset = positions.length / 3;
    const points = [
      radial.clone().multiplyScalar(0.07).add(V(0, 0.695, 0)),
      radial.clone().multiplyScalar(0.25).addScaledVector(side, 0.085).add(V(0, 0.71, 0)),
      radial.clone().multiplyScalar(0.44).add(V(0, 0.665, 0)),
      radial.clone().multiplyScalar(0.25).addScaledVector(side, -0.085).add(V(0, 0.71, 0)),
    ];
    for (const p of points) positions.push(p.x, p.y, p.z);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
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

export function createMandarin(seed = 7) {
  const rnd = random(seed);
  const group = new THREE.Group();
  group.name = 'venture-mandarin';

  const bark = material(0x77503a, 0.93, { flatShading: true });
  const twig = material(0x866044, 0.9, { flatShading: true });
  const foliage = material(0xffffff, 0.58, { side: THREE.DoubleSide, vertexColors: true });
  const fruitMat = material(0xef8420, 0.62);
  const calyxMat = material(0x526c35, 0.8, { side: THREE.DoubleSide, flatShading: true });
  const navelMat = material(0x9b5d27, 0.94);

  // Low moss/soil cushion: the root collar itself remains at y=0.
  const ground = mesh(group, new THREE.SphereGeometry(0.72, 24, 10), material(0x66835a, 0.96, { flatShading: true }), V(0, -0.035, 0));
  ground.scale.set(1, 0.095, 0.91);
  const soil = mesh(group, new THREE.SphereGeometry(0.43, 18, 8), material(0x554134, 1, { flatShading: true }), V(0, -0.002, 0));
  soil.scale.set(1, 0.105, 0.88);

  limb(group, [V(0, -0.01, 0), V(-0.035, 0.35, 0.015), V(0.035, 0.77, -0.02), V(-0.025, 1.25, 0.015)], 0.105, 0.04, bark, 19);
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * TAU + 0.28;
    limb(group, [V(Math.cos(angle) * 0.035, 0.16, Math.sin(angle) * 0.035),
      V(Math.cos(angle) * 0.22, 0.035, Math.sin(angle) * 0.2),
      V(Math.cos(angle) * 0.42, 0.005, Math.sin(angle) * 0.37)], 0.052, 0.008, bark, 7);
  }

  const clusters = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.399963 + 0.18 + (rnd() - 0.5) * 0.22;
    const reach = 0.48 + rnd() * 0.17;
    const start = V(0, 0.61 + i * 0.073, 0);
    const tip = V(Math.cos(angle) * reach, 1.28 + (i % 3) * 0.135 + rnd() * 0.1, Math.sin(angle) * reach);
    const elbow = start.clone().lerp(tip, 0.54).add(V(0, 0.12, 0));
    limb(group, [start, elbow, tip], 0.049 - i * 0.0025, 0.013, bark, 13);
    clusters.push(tip);
    for (const side of [-1, 1]) {
      const a = angle + side * (0.62 + rnd() * 0.35);
      const end = tip.clone().add(V(Math.cos(a) * (0.15 + rnd() * 0.1), 0.08 + rnd() * 0.16, Math.sin(a) * (0.15 + rnd() * 0.1)));
      limb(group, [tip.clone().add(V(0, -0.055, 0)), tip.clone().lerp(end, 0.55).add(V(0, 0.055, 0)), end], 0.017, 0.0045, twig, 7);
      clusters.push(end);
    }
  }
  const crown = V(-0.03, 1.9, -0.02);
  limb(group, [V(-0.02, 1.05, 0), V(0.04, 1.47, 0.025), crown], 0.035, 0.006, bark, 10);
  clusters.push(crown);

  const leafMatrices = [], leafColors = [];
  const palette = [0x3d7044, 0x4b814b, 0x598e51, 0x679957, 0x46794a];
  for (let c = 0; c < clusters.length; c++) {
    const centre = clusters[c];
    const count = c === clusters.length - 1 ? 11 : 9;
    for (let j = 0; j < count; j++) {
      const angle = j * 2.399963 + c * 1.31 + (rnd() - 0.5) * 0.5;
      const direction = V(Math.cos(angle), -0.12 + rnd() * 0.65, Math.sin(angle)).normalize();
      const at = centre.clone().add(V((rnd() - 0.5) * 0.11, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.11));
      leafMatrices.push(leafMatrix(at, direction, 0.225 + rnd() * 0.09, (rnd() - 0.5) * 1.1));
      leafColors.push(new THREE.Color(palette[Math.floor(rnd() * palette.length)]));
    }
  }
  const leaves = new THREE.InstancedMesh(citrusLeafGeometry(), foliage, leafMatrices.length);
  leafMatrices.forEach((matrix, i) => { leaves.setMatrixAt(i, matrix); leaves.setColorAt(i, leafColors[i]); });
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  leaves.castShadow = leaves.receiveShadow = true;
  group.add(leaves);

  const fruitGeometry = citrusGeometry();
  const crownGeometry = citrusCrownGeometry();
  const buttonGeometry = new THREE.CylinderGeometry(0.115, 0.15, 0.055, 8);
  const fruitCount = 8;
  for (let i = 0; i < fruitCount; i++) {
    const anchor = clusters[(i * 2 + 1) % (clusters.length - 1)];
    const radial = V(anchor.x, 0, anchor.z).normalize();
    const position = anchor.clone().addScaledVector(radial, 0.055).add(V(0, -0.22 - rnd() * 0.1, anchor.z > 0 ? 0.09 : 0));
    const radius = 0.145 + rnd() * 0.025;
    const fruit = new THREE.Group();
    fruit.position.copy(position);
    fruit.rotation.y = rnd() * TAU;
    fruit.scale.setScalar(radius);
    mesh(fruit, fruitGeometry, fruitMat);
    mesh(fruit, crownGeometry, calyxMat);
    mesh(fruit, buttonGeometry, navelMat, V(0, 0.701, 0));
    group.add(fruit);
    limb(group, [anchor.clone().add(V(0, 0.025, 0)),
      anchor.clone().lerp(position, 0.55).add(V(0, 0.09, 0)),
      position.clone().add(V(0, radius * 0.82, 0))], 0.009, 0.005, twig, 5);
  }

  return finish(group);
}
