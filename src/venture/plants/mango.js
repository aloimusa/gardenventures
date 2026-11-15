// A tall, slender mango tree with lanceolate foliage and asymmetric hanging fruit.
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
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...options });
}

function addMesh(parent, geometry, material, position) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.copy(position);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function taperedCurve(parent, points, startRadius, endRadius, material, segments = 12, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, point = curve.getPointAt(u);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, u);
    for (let j = 0; j <= radial; j++) {
      const angle = j / radial * TAU;
      const normal = frames.normals[i].clone().multiplyScalar(Math.cos(angle))
        .addScaledVector(frames.binormals[i], Math.sin(angle));
      positions.push(point.x + normal.x * radius, point.y + normal.y * radius, point.z + normal.z * radius);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  addMesh(parent, geometry, material);
  return curve;
}

function leafGeometry() {
  const rows = 12, columns = 4, positions = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const outline = Math.max(0.002, Math.pow(Math.sin(Math.PI * Math.pow(u, 0.82)), 0.82) * (1 - 0.36 * u));
    for (let j = 0; j <= columns; j++) {
      const side = j / columns * 2 - 1;
      positions.push(side * 0.115 * outline,
        Math.sin(Math.PI * u) * 0.055 - u * u * 0.12 + Math.abs(side) * 0.022 * outline, u);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
    const a = i * (columns + 1) + j, b = a + columns + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function planter(parent, materials) {
  const profile = [
    [0, 0], [0.32, 0], [0.37, 0.035], [0.39, 0.25], [0.45, 0.34],
    [0.46, 0.375], [0.42, 0.39], [0.38, 0.35], [0, 0.35],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  addMesh(parent, new THREE.LatheGeometry(profile, 28), materials.pot);
  addMesh(parent, new THREE.CylinderGeometry(0.385, 0.385, 0.026, 28), materials.soil, V(0, 0.354, 0));
  const rim = addMesh(parent, new THREE.TorusGeometry(0.438, 0.022, 6, 28), materials.rim, V(0, 0.375, 0));
  rim.rotation.x = Math.PI / 2;
  const foot = addMesh(parent, new THREE.TorusGeometry(0.343, 0.009, 4, 28), materials.band, V(0, 0.047, 0));
  foot.rotation.x = Math.PI / 2;
}

// The lower half narrows and bends into a small beak; one cheek ripens amber first.
function mangoGeometry(radius, rnd) {
  const vertical = 1.30;
  const control = [
    [0, -1.21], [0.25, -1.16], [0.53, -0.94], [0.79, -0.60],
    [0.95, -0.17], [1.00, 0.27], [0.91, 0.67], [0.66, 0.98],
    [0.30, 1.16], [0, 1.20],
  ].map(([x, y]) => new THREE.Vector2(x * radius, y * radius * vertical));
  const profile = new THREE.SplineCurve(control).getPoints(28);
  const geometry = new THREE.LatheGeometry(profile, 26);
  const positions = geometry.attributes.position;
  const colours = [];
  const green = new THREE.Color(rnd() > 0.35 ? 0x7f983d : 0x94a341);
  const yellow = new THREE.Color(0xe3b640);
  const amber = new THREE.Color(0xdd8733);
  const blushDirection = rnd() * TAU;
  const bend = rnd() > 0.5 ? 1 : -1;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const down = THREE.MathUtils.clamp(1 - (y / (radius * vertical) + 1.25) / 2.45, 0, 1);
    const offset = bend * radius * 0.42 * down * down;
    const oval = 1 + Math.cos(angle) * 0.035;
    positions.setXYZ(i, x * oval + offset, y, z * 0.83);
    const sun = (Math.cos(angle - blushDirection) + 1) * 0.5;
    const ripeness = THREE.MathUtils.clamp(0.10 + sun * 0.65 + down * 0.15, 0, 1);
    const colour = green.clone().lerp(yellow, ripeness);
    colour.lerp(amber, Math.max(0, sun - 0.70) * 0.60);
    colours.push(colour.r, colour.g, colour.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function mangoFruit(parent, anchor, radius, rnd, materials) {
  const fruit = new THREE.Group();
  const hang = 0.30 + rnd() * 0.09;
  fruit.position.copy(anchor).add(V((rnd() - 0.5) * 0.045, -hang, 0.025));
  fruit.rotation.order = 'YXZ';
  fruit.rotation.set((rnd() - 0.5) * 0.13, rnd() * TAU, (rnd() - 0.5) * 0.32);
  parent.add(fruit);
  addMesh(fruit, mangoGeometry(radius, rnd), materials.fruit);
  const top = radius * 1.30 * 1.17;
  taperedCurve(fruit, [V(0, top - radius * 0.08, 0), V(radius * 0.045, top + radius * 0.18, 0), V(radius * 0.02, top + radius * 0.34, 0)],
    radius * 0.055, radius * 0.035, materials.stem, 5, 6);
  const stemTip = V(radius * 0.02, top + radius * 0.34, 0).applyEuler(fruit.rotation).add(fruit.position);
  taperedCurve(parent, [anchor, anchor.clone().lerp(stemTip, 0.45).add(V(-0.014, 0.015, 0)), stemTip],
    0.0075, 0.0045, materials.stem, 7, 6);
}

export function createMango(seed = 7) {
  const rnd = randomFrom(seed);
  const group = new THREE.Group(), tree = new THREE.Group();
  group.name = 'venture-mango-botanical';
  group.add(tree);
  const materials = {
    pot: mat(0x738779), rim: mat(0x98a795), band: mat(0x566b5c), soil: mat(0x46392c),
    bark: mat(0x6c5842), barkLight: mat(0x8a7354), twig: mat(0x6f6145), stem: mat(0x647043),
    leaf: [0x294f3b, 0x3e6b43, 0x64844a, 0x8d8150].map(color => mat(color, { side: THREE.DoubleSide, roughness: 0.80 })),
    fruit: mat(0xffffff, { vertexColors: true, roughness: 0.90, flatShading: false }),
  };
  planter(group, materials);

  const lean = (rnd() - 0.5) * 0.075;
  const trunkPoints = [V(0, 0.36, 0), V(-0.025, 0.82, 0.015), V(0.035 + lean, 1.31, -0.015), V(lean, 1.78, 0.025), V(lean * 0.4, 2.25, 0)];
  const trunk = new THREE.CatmullRomCurve3(trunkPoints, false, 'centripetal');
  taperedCurve(tree, trunkPoints, 0.095, 0.014, materials.bark, 26, 8);
  for (let i = 0; i < 4; i++) {
    const angle = i / 4 * TAU + 0.4;
    taperedCurve(tree, [V(0, 0.42, 0), V(Math.sin(angle) * 0.16, 0.36, Math.cos(angle) * 0.16), V(Math.sin(angle) * 0.29, 0.357, Math.cos(angle) * 0.29)],
      0.035, 0.006, materials.bark, 7, 6);
  }

  const leafBatches = materials.leaf.map(() => []);
  const fruitAnchors = [];
  const dummy = new THREE.Object3D();
  const addLeaf = (at, yaw, pitch, roll, length, colourIndex) => {
    dummy.position.copy(at);
    dummy.rotation.order = 'YXZ';
    dummy.rotation.set(pitch, yaw, roll);
    dummy.scale.set(length * (0.90 + rnd() * 0.16), length, length);
    dummy.updateMatrix();
    leafBatches[((colourIndex % leafBatches.length) + leafBatches.length) % leafBatches.length].push(dummy.matrix.clone());
  };
  const phase = rnd() * 0.65;
  for (let i = 0; i < 9; i++) {
    const angle = phase + i * 2.399963 + (rnd() - 0.5) * 0.23;
    const direction = V(Math.sin(angle), 0, Math.cos(angle));
    const reach = (0.56 - i * 0.018) + (rnd() - 0.5) * 0.11;
    const height = 1.18 + i * 0.105 + rnd() * 0.08;
    const start = trunk.getPointAt(0.25 + i * 0.065);
    const elbow = direction.clone().multiplyScalar(reach * 0.48);
    elbow.y = height - 0.18;
    const tip = direction.clone().multiplyScalar(reach).add(V(lean * 0.3, height, 0));
    const scaffold = new THREE.CatmullRomCurve3([start, elbow, tip], false, 'centripetal');
    taperedCurve(tree, [start, elbow, tip], 0.038 - i * 0.0022, 0.008,
      i % 2 ? materials.barkLight : materials.bark, 14, 7);

    for (let j = 0; j < 4; j++) {
      const root = scaffold.getPointAt(0.38 + j * 0.17);
      const twigAngle = angle + (j % 2 ? 0.72 : -0.67) + (rnd() - 0.5) * 0.25;
      const twigDirection = V(Math.sin(twigAngle), 0, Math.cos(twigAngle));
      const twigTip = root.clone().addScaledVector(twigDirection, 0.19 + rnd() * 0.075);
      twigTip.y += 0.15 + rnd() * 0.13;
      const middle = root.clone().lerp(twigTip, 0.5).add(V(0, 0.035, 0));
      const twig = new THREE.CatmullRomCurve3([root, middle, twigTip], false, 'centripetal');
      taperedCurve(tree, [root, middle, twigTip], 0.0125, 0.0028, materials.twig, 8, 5);
      for (let k = 0; k < 6; k++) {
        const at = twig.getPointAt(0.12 + k * 0.17);
        const side = k % 2 ? 1 : -1;
        const young = i > 6 && k > 3;
        addLeaf(at, twigAngle + side * (0.54 + rnd() * 0.40), -0.18 + rnd() * 0.48,
          (rnd() - 0.5) * 0.6, 0.29 + rnd() * 0.10, young ? 3 : i + j + k);
      }
      addLeaf(twigTip, twigAngle, -0.32, (rnd() - 0.5) * 0.4, 0.32 + rnd() * 0.06, i > 6 ? 3 : i + j);
      if (j === 1 && i < 8) fruitAnchors.push(twig.getPointAt(0.62));
    }
  }

  // Upright new growth carries a restrained copper flush above the deep green crown.
  for (let i = 0; i < 4; i++) {
    const angle = phase + i * 1.65;
    const root = trunk.getPointAt(0.82 + i * 0.035);
    const tip = root.clone().add(V(Math.sin(angle) * (0.17 + i * 0.022), 0.27 + rnd() * 0.10, Math.cos(angle) * (0.17 + i * 0.022)));
    taperedCurve(tree, [root, root.clone().lerp(tip, 0.52).add(V(0.02, 0.02, 0)), tip], 0.015, 0.0028, materials.twig, 8, 5);
    for (let j = 0; j < 7; j++) {
      const at = root.clone().lerp(tip, 0.18 + j * 0.125);
      addLeaf(at, angle + j * 2.4, -0.48 + rnd() * 0.28, (rnd() - 0.5) * 0.35,
        0.27 + rnd() * 0.08, j > 3 ? 3 : i + j);
    }
  }

  const sharedLeafGeometry = leafGeometry();
  leafBatches.forEach((matrices, index) => {
    const leaves = new THREE.InstancedMesh(sharedLeafGeometry, materials.leaf[index], matrices.length);
    matrices.forEach((matrix, i) => leaves.setMatrixAt(i, matrix));
    leaves.instanceMatrix.needsUpdate = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    leaves.computeBoundingSphere();
    tree.add(leaves);
  });

  fruitAnchors.forEach((anchor, i) => mangoFruit(tree, anchor, 0.116 + rnd() * 0.015 + (i % 3 === 0 ? 0.007 : 0), rnd, materials));

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
