// Shared, code-only organ builders for the mature Venture plants.
// Leaves grow along +Z from their base; fruit hangs along -Y. No growth or day state lives here.
import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const TAU = Math.PI * 2;

// Local copies of the lab's visual primitives only: Venture has no dependency on Home's living plant.
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.78, metalness: 0, flatShading: true, ...options,
  });
}

export function mesh(parent, geometry, mat, position, scale) {
  const m = new THREE.Mesh(geometry, mat);
  if (position) m.position.copy(position);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function branch(parent, points, r0, r1, mat, segments = 12) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [], indices = [], radial = 7;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, p = curve.getPointAt(u), r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * TAU;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      positions.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const m = mesh(parent, geo, mat);
  return { mesh: m, curve };
}

/** A removable moss-and-soil display patch, separate from the harvestable body. */
export function ground(radius = 0.8) {
  const g = new THREE.Group();
  mesh(g, new THREE.CylinderGeometry(radius, radius * 1.06, 0.09, 28), material(0x69985d), V(0, -0.045, 0));
  const soil = mesh(g, new THREE.SphereGeometry(radius * 0.54, 20, 10, 0, TAU, 0, Math.PI / 2), material(0x50392c));
  soil.scale.y = 0.27;
  return g;
}

export function blob(parent, mat, position, scale, detail = 1) {
  return mesh(parent, new THREE.IcosahedronGeometry(1, detail), mat, position, scale);
}

/** A softly folded, low-poly leaf, along +Z with its attachment at the origin. */
export function leafGeometry(length, width, kind = 'oval') {
  const rows = 10, cols = 4, positions = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    let outline = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.88)), kind === 'lance' ? 1.1 : 0.68);
    outline *= kind === 'lance' ? 1 - 0.4 * u : 1;
    if (kind === 'serrated') outline *= i % 2 ? 0.82 : 1.05;
    const w = Math.max(0.001, width * outline);
    for (let j = 0; j <= cols; j++) {
      const v = j / cols * 2 - 1;
      const fold = Math.abs(v) * width * 0.16;
      const arch = Math.sin(Math.PI * u) * length * 0.07 - u * u * length * 0.12;
      positions.push(v * w, fold + arch, u * length);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function leaf(parent, mat, { at = V(), yaw = 0, pitch = 0, roll = 0, length = 0.3, width = 0.1, kind = 'oval' } = {}) {
  const pivot = new THREE.Group();
  pivot.position.copy(at);
  pivot.rotation.order = 'YXZ';
  pivot.rotation.set(-pitch, yaw, roll);
  leafMesh(pivot, mat, length, width, kind);
  parent.add(pivot);
  return pivot;
}

export function leafMesh(parent, mat, length, width, kind = 'oval') {
  return mesh(parent, leafGeometry(length, width, kind), mat);
}

/** A five-point calyx that sits horizontally on top of a fruit. */
export function calyx(parent, mat, y, radius, leaves = 5) {
  const g = new THREE.Group();
  g.position.y = y;
  for (let i = 0; i < leaves; i++) {
    const p = new THREE.Group();
    p.rotation.y = i / leaves * TAU;
    p.rotation.x = 0.12;
    leafMesh(p, mat, radius, radius * 0.2, 'lance');
    g.add(p);
  }
  parent.add(g);
  return g;
}

export function fruitBody(radius, color, options = {}) {
  const mat = material(color, { roughness: 0.48 });
  const g = new THREE.Group();
  const body = mesh(g, new THREE.SphereGeometry(radius, 16, 12), mat);
  body.scale.set(options.width ?? 1, options.height ?? 1, options.depth ?? 1);
  return { group: g, body, material: mat };
}

export function apple(color = 0xd94a43, radius = 0.14) {
  const { group: g, body } = fruitBody(radius, color, { height: 0.91 });
  const wood = material(0x61432b);
  branch(g, [V(0, radius * 0.74, 0), V(0.012, radius * 1.23, 0), V(0.025, radius * 1.48, 0.006)], radius * 0.1, radius * 0.065, wood, 5);
  const green = material(0x4d8b4e, { side: THREE.DoubleSide });
  leaf(g, green, { at: V(0.02, radius * 1.25, 0), yaw: 1.1, pitch: 0.2, length: radius * 0.95, width: radius * 0.3, kind: 'lance' });
  return g;
}

export function orange(radius = 0.145) {
  const { group: g } = fruitBody(radius, 0xef8e2f, { height: 0.96 });
  const green = material(0x527e3e);
  calyx(g, green, radius * 0.88, radius * 0.42);
  mesh(g, new THREE.CylinderGeometry(radius * 0.09, radius * 0.12, radius * 0.3, 7), green, V(0, radius * 1.07, 0));
  return g;
}

export function tomato(color = 0xdf4a3f, radius = 0.14) {
  const { group: g, body } = fruitBody(radius, color, { height: 0.84, width: 1.07 });
  // Subtle lobes, rather than a perfectly spherical red ball.
  const p = body.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + Math.cos(a * 6) * 0.035;
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  body.geometry.computeVertexNormals();
  calyx(g, material(0x397342, { side: THREE.DoubleSide }), radius * 0.77, radius * 0.92, 6);
  return g;
}

export function blueberry(radius = 0.072) {
  const { group: g } = fruitBody(radius, 0x5266a5, { height: 0.9 });
  const crown = material(0x35456f);
  const ring = mesh(g, new THREE.TorusGeometry(radius * 0.25, radius * 0.095, 5, 10), crown, V(0, radius * 0.86, 0));
  ring.rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    const tip = mesh(g, new THREE.ConeGeometry(radius * 0.1, radius * 0.22, 4), crown,
      V(Math.cos(a) * radius * 0.24, radius * 0.89, Math.sin(a) * radius * 0.24));
    tip.rotation.z = Math.cos(a) * 0.45;
    tip.rotation.x = Math.sin(a) * 0.45;
  }
  return g;
}

export function strawberry(radius = 0.12, seed = 1) {
  const rnd = random(seed), g = new THREE.Group();
  const profile = [
    [0.01, -1.35], [0.38, -1.12], [0.73, -0.72], [0.94, -0.25], [0.91, 0.13], [0.64, 0.34], [0.05, 0.39],
  ].map(([x, y]) => new THREE.Vector2(x * radius, y * radius));
  mesh(g, new THREE.LatheGeometry(profile, 16), material(0xe6484e, { roughness: 0.5 }));
  calyx(g, material(0x438149, { side: THREE.DoubleSide }), radius * 0.32, radius * 1.05, 5);
  branch(g, [V(0, radius * 0.38, 0), V(0.01, radius * 0.88, 0)], radius * 0.08, radius * 0.055, material(0x54824a), 4);

  // One instanced mesh of tiny seeds per berry: all seeds move with the picked fruit.
  const count = 24, seedGeo = new THREE.SphereGeometry(radius * 0.055, 5, 4);
  const seeds = new THREE.InstancedMesh(seedGeo, material(0xffd27a, { roughness: 0.72 }), count);
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count, y = -1.17 + t * 1.36, a = i * 2.399963 + rnd() * 0.2;
    const r = radius * Math.pow(Math.sin(t * Math.PI * 0.82), 0.72) * 0.91;
    o.position.set(Math.cos(a) * r, y * radius, Math.sin(a) * r);
    o.scale.set(0.65, 1.35, 0.65);
    o.rotation.set(rnd(), a, rnd());
    o.updateMatrix(); seeds.setMatrixAt(i, o.matrix);
  }
  seeds.castShadow = true;
  g.add(seeds);
  return g;
}

export function pickable(list, id, kind, object, radius, centre = V()) {
  object.name = id;
  object.userData.pickable = true;
  object.userData.kind = kind;
  list.push({ id, kind, object, radius, local: object.position.clone(), centre: centre.clone() });
  return object;
}

/** Common model API. Venture is deliberately static so time never changes target coordinates. */
export function finishModel(name, group, body, pickables) {
  let harvested = new Set();
  return {
    group, body, name, pickables,
    attachPoints: () => pickables.map(p => ({ kind: p.kind, object: p.object, local: p.local.clone() })),
    setHarvested(id, value = true) {
      const p = pickables.find(x => x.id === id);
      if (!p) return false;
      value ? harvested.add(id) : harvested.delete(id);
      p.object.visible = !value;
      return true;
    },
    resetHarvest() {
      harvested = new Set();
      for (const p of pickables) p.object.visible = true;
    },
    update(_dt, _t) {
      // No idle motion: a plant's picking scene is identical for the entire round.
    },
    dispose() {
      const geometries = new Set(), materials = new Set();
      group.traverse(o => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.removeFromParent();
    },
  };
}
