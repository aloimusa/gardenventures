// An open, gently gnarled apple tree with broad, lobed fruit and individual leaves.
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
  return new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, flatShading: true, ...options });
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
  const rows = 10, columns = 4, positions = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const outline = Math.max(0.003, Math.pow(Math.sin(Math.PI * Math.pow(u, 0.91)), 0.72));
    for (let j = 0; j <= columns; j++) {
      const side = j / columns * 2 - 1;
      const edge = i > 1 && i < rows - 1 && i % 2 === 0 ? 0.95 : 1;
      positions.push(side * 0.19 * outline * edge,
        Math.sin(Math.PI * u) * 0.07 - u * u * 0.08 + Math.abs(side) * 0.025 * outline, u);
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
    [0, 0], [0.34, 0], [0.405, 0.035], [0.445, 0.23], [0.50, 0.30],
    [0.505, 0.335], [0.465, 0.35], [0.425, 0.31], [0, 0.31],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  addMesh(parent, new THREE.LatheGeometry(profile, 28), materials.pot);
  addMesh(parent, new THREE.CylinderGeometry(0.43, 0.43, 0.025, 28), materials.soil, V(0, 0.314, 0));
  const lip = addMesh(parent, new THREE.TorusGeometry(0.485, 0.024, 6, 28), materials.rim, V(0, 0.333, 0));
  lip.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const band = addMesh(parent, new THREE.TorusGeometry(0.426 + i * 0.006, 0.004, 4, 28), materials.band, V(0, 0.10 + i * 0.032, 0));
    band.rotation.x = Math.PI / 2;
  }
}

// Top shoulders are five-lobed, and the lathe profile dips into a real stem well.
function appleGeometry(radius, variant, rnd) {
  const control = [
    [0, -0.78], [0.28, -0.85], [0.62, -0.79], [0.86, -0.61],
    [0.99, -0.32], [1.02, 0], [0.98, 0.30], [0.82, 0.52],
    [0.60, 0.59], [0.40, 0.54], [0.16, 0.46], [0, 0.48],
  ].map(([x, y]) => new THREE.Vector2(x * radius, y * radius));
  const profile = new THREE.SplineCurve(control).getPoints(30);
  const geometry = new THREE.LatheGeometry(profile, 28);
  const positions = geometry.attributes.position;
  const colors = [];
  const palettes = [
    [0xb93e35, 0xde5b43, 0xeb7952],
    [0xc44939, 0xdf6448, 0xdd8052],
    [0xc24b3a, 0xd96743, 0xd5a04c],
  ];
  const palette = palettes[variant % palettes.length].map(color => new THREE.Color(color));
  const blushDirection = rnd() * TAU;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const shoulder = THREE.MathUtils.smoothstep(y / radius, -0.4, 0.56);
    const lobe = 1 + Math.cos(angle * 5 + 0.35) * 0.032 * shoulder;
    positions.setXYZ(i, x * lobe, y + Math.cos(angle * 5) * radius * 0.007 * shoulder, z * lobe);
    const blush = (Math.cos(angle - blushDirection) + 1) * 0.5;
    const colour = palette[0].clone().lerp(palette[1], 0.34 + blush * 0.46);
    if (variant === 2) colour.lerp(palette[2], Math.max(0, 0.44 - blush) * 0.65);
    coloursPush(colors, colour);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function coloursPush(target, colour) {
  target.push(colour.r, colour.g, colour.b);
}

function appleFruit(parent, at, radius, variant, rnd, materials) {
  const fruit = new THREE.Group();
  fruit.position.copy(at);
  fruit.rotation.set((rnd() - 0.5) * 0.18, rnd() * TAU, (rnd() - 0.5) * 0.26);
  parent.add(fruit);
  addMesh(fruit, appleGeometry(radius, variant, rnd), materials.fruit);
  taperedCurve(fruit, [V(0, radius * 0.44, 0), V(radius * 0.06, radius * 0.74, 0), V(radius * 0.19, radius * 1.03, radius * 0.025)],
    radius * 0.065, radius * 0.038, materials.stem, 6, 6);
  const smallLeaf = new THREE.Group();
  smallLeaf.position.set(radius * 0.09, radius * 0.77, 0);
  smallLeaf.rotation.order = 'YXZ';
  smallLeaf.rotation.set(-0.28, 0.75 + rnd() * 1.4, -0.18);
  smallLeaf.scale.setScalar(radius * 0.92);
  fruit.add(smallLeaf);
  addMesh(smallLeaf, leafGeometry(), materials.leaf[1]);
  fruit.updateMatrix();
  const stemTip = V(radius * 0.19, radius * 1.03, radius * 0.025).applyEuler(fruit.rotation).add(at);
  return stemTip;
}

export function createApple(seed = 7) {
  const rnd = randomFrom(seed);
  const group = new THREE.Group(), tree = new THREE.Group();
  group.name = 'venture-apple-botanical';
  group.add(tree);
  const materials = {
    pot: mat(0xa66e50), rim: mat(0xc28a67), band: mat(0x83543f), soil: mat(0x47372a),
    bark: mat(0x6c4b36), barkLight: mat(0x8b6548), twig: mat(0x71513a), stem: mat(0x58442c),
    leaf: [0x315f3d, 0x4b7f45, 0x6e9a50, 0x8cab58].map(color => mat(color, { side: THREE.DoubleSide, roughness: 0.82 })),
    fruit: mat(0xffffff, { vertexColors: true, roughness: 0.91, flatShading: false }),
  };
  planter(group, materials);

  const lean = (rnd() - 0.5) * 0.10;
  taperedCurve(tree, [V(0, 0.32, 0), V(-0.055, 0.70, 0.025), V(0.035 + lean, 1.09, -0.025), V(lean, 1.55, 0.015), V(lean * 0.5, 1.86, -0.025)],
    0.125, 0.023, materials.bark, 24, 9);
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * TAU + 0.25;
    taperedCurve(tree, [V(0, 0.37, 0), V(Math.sin(angle) * 0.20, 0.33, Math.cos(angle) * 0.20), V(Math.sin(angle) * 0.34, 0.321, Math.cos(angle) * 0.34)],
      0.048, 0.009, materials.bark, 8, 7);
  }

  const leafBatches = materials.leaf.map(() => []);
  const fruitAnchors = [];
  const dummy = new THREE.Object3D();
  const addLeaf = (at, yaw, pitch, roll, length, colourIndex) => {
    dummy.position.copy(at);
    dummy.rotation.order = 'YXZ';
    dummy.rotation.set(pitch, yaw, roll);
    dummy.scale.set(length * (0.93 + rnd() * 0.18), length, length);
    dummy.updateMatrix();
    leafBatches[colourIndex % leafBatches.length].push(dummy.matrix.clone());
  };
  const phase = rnd() * 0.45;
  for (let i = 0; i < 8; i++) {
    const angle = phase + i / 8 * TAU + (rnd() - 0.5) * 0.20;
    const direction = V(Math.sin(angle), 0, Math.cos(angle));
    const reach = 0.61 + rnd() * 0.19 + (i % 3 === 0 ? 0.07 : 0);
    const height = 1.32 + (i % 4) * 0.13 + rnd() * 0.10;
    const start = V(lean * 0.5, 0.70 + i * 0.085, 0);
    const elbow = direction.clone().multiplyScalar(reach * 0.43).add(V(lean, height - 0.24, 0));
    const tip = direction.clone().multiplyScalar(reach).add(V(lean * 0.4, height, 0));
    const scaffold = new THREE.CatmullRomCurve3([start, elbow, tip], false, 'centripetal');
    taperedCurve(tree, [start, elbow, tip], 0.055 - i * 0.0025, 0.012,
      i % 2 ? materials.barkLight : materials.bark, 16, 8);

    for (let j = 0; j < 4; j++) {
      const u = 0.43 + j * 0.16;
      const root = scaffold.getPointAt(Math.min(0.95, u));
      const twigAngle = angle + (j % 2 ? 0.68 : -0.72) + (rnd() - 0.5) * 0.30;
      const twigDirection = V(Math.sin(twigAngle), 0, Math.cos(twigAngle));
      const twigTip = root.clone().addScaledVector(twigDirection, 0.24 + rnd() * 0.10);
      twigTip.y += 0.13 + rnd() * 0.16;
      const middle = root.clone().lerp(twigTip, 0.52).add(V(0, 0.045, 0));
      const twig = new THREE.CatmullRomCurve3([root, middle, twigTip], false, 'centripetal');
      taperedCurve(tree, [root, middle, twigTip], 0.016, 0.0038, materials.twig, 8, 6);
      for (let k = 0; k < 6; k++) {
        const at = twig.getPointAt(0.15 + k * 0.16);
        const side = k % 2 ? 1 : -1;
        addLeaf(at, twigAngle + side * (0.68 + rnd() * 0.40), -0.20 + rnd() * 0.48,
          (rnd() - 0.5) * 0.65, 0.245 + rnd() * 0.095, i + j + k + Math.floor(rnd() * 2));
      }
      addLeaf(twigTip, twigAngle, -0.26, (rnd() - 0.5) * 0.4, 0.28 + rnd() * 0.05, i + j + 1);
      if (j === 1 || (j === 3 && (i === 1 || i === 5))) fruitAnchors.push(twig.getPointAt(0.68));
    }
  }

  // A few upright crown sprays prevent a clipped, flat-topped silhouette.
  for (let i = 0; i < 3; i++) {
    const angle = phase + i * 2.0;
    const root = V(lean * 0.5, 1.55 + i * 0.07, 0);
    const tip = root.clone().add(V(Math.sin(angle) * 0.27, 0.29 + rnd() * 0.10, Math.cos(angle) * 0.27));
    taperedCurve(tree, [root, root.clone().lerp(tip, 0.55).add(V(0.035, 0, 0)), tip], 0.022, 0.004, materials.twig, 9, 6);
    for (let j = 0; j < 8; j++) {
      const at = root.clone().lerp(tip, 0.18 + j * 0.11);
      addLeaf(at, angle + j * 2.4, -0.38 + rnd() * 0.35, (rnd() - 0.5) * 0.45, 0.25 + rnd() * 0.07, i + j);
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

  fruitAnchors.forEach((anchor, i) => {
    const radius = 0.137 + rnd() * 0.022;
    const at = anchor.clone().add(V((rnd() - 0.5) * 0.045, -0.245 - rnd() * 0.055, 0.025));
    const stemTip = appleFruit(tree, at, radius, i % 3, rnd, materials);
    taperedCurve(tree, [anchor, anchor.clone().lerp(stemTip, 0.52).add(V(0.014, 0.016, 0)), stemTip],
      0.007, 0.004, materials.stem, 5, 5);
  });

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
