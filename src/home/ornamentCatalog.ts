import * as THREE from 'three';

export type OrnamentId =
  | 'moon-moth'
  | 'golden-watering-token'
  | 'tiny-pot-bow'
  | 'acorn-cap'
  | 'felt-bee'
  | 'paper-crane'
  | 'glass-leaf'
  | 'pinecone-crown'
  | 'moon-button'
  | 'clover-charm'
  | 'tiny-star'
  | 'snail-friend';

export interface OrnamentInstance {
  group: THREE.Group;
  dispose(): void;
}

export interface CatalogOrnament {
  readonly id: OrnamentId;
  readonly name: string;
  /** Inline 48 × 48 illustration; it has no external assets or IDs that could collide in a list. */
  readonly icon: string;
  create(): OrnamentInstance;
}

type Vec3 = [number, number, number];
type Disposable = { dispose(): void };

interface Kit {
  group: THREE.Group;
  mat(color: number, options?: Partial<THREE.MeshStandardMaterialParameters>): THREE.MeshStandardMaterial;
  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position?: Vec3, scale?: Vec3, rotation?: Vec3): THREE.Mesh;
  sphere(material: THREE.Material, position: Vec3, scale: Vec3, rotation?: Vec3): THREE.Mesh;
  block(material: THREE.Material, position: Vec3, scale: Vec3, rotation?: Vec3): THREE.Mesh;
  rod(a: Vec3, b: Vec3, radius: number, material: THREE.Material, sides?: number): THREE.Mesh;
}

/**
 * Positions use Home's existing pot/orchid rig coordinates. The local (unpositioned) design is
 * also useful for reward and catalogue previews. Nothing is shared between two create() calls.
 */
function makeOrnament(id: OrnamentId, position: Vec3, rotation: Vec3, attachment: string,
  build: (kit: Kit) => void): OrnamentInstance {
  const group = new THREE.Group();
  group.name = `home-ornament-${id}`;
  group.userData.ornament = id;
  group.userData.attachment = attachment;
  group.position.set(...position);
  group.rotation.set(...rotation);

  const resources = new Set<Disposable>();
  const keep = <T extends Disposable>(resource: T): T => (resources.add(resource), resource);
  const unitSphere = keep(new THREE.SphereGeometry(1, 10, 6));
  const unitCube = keep(new THREE.BoxGeometry(1, 1, 1));

  const mesh: Kit['mesh'] = (geometry, material, at = [0, 0, 0], scale = [1, 1, 1], angles = [0, 0, 0]) => {
    keep(geometry);
    const item = new THREE.Mesh(geometry, material);
    item.position.set(...at);
    item.scale.set(...scale);
    item.rotation.set(...angles);
    item.userData.ornament = id;
    group.add(item);
    return item;
  };
  const kit: Kit = {
    group,
    mat(color, options = {}) {
      return keep(new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, flatShading: true, ...options, color }));
    },
    mesh,
    sphere(material, at, scale, angles = [0, 0, 0]) { return mesh(unitSphere, material, at, scale, angles); },
    block(material, at, scale, angles = [0, 0, 0]) { return mesh(unitCube, material, at, scale, angles); },
    rod(a, b, radius, material, sides = 6) {
      const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
      const direction = end.clone().sub(start);
      const item = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), sides), material);
      item.position.copy(start).add(end).multiplyScalar(0.5);
      item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      return item;
    },
  };
  build(kit);
  let meshes = 0;
  group.traverse(item => { if ((item as THREE.Mesh).isMesh) meshes++; });
  group.userData.meshCount = meshes;
  group.updateMatrixWorld(true);

  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      resources.clear();
      group.removeFromParent();
    },
  };
}

function triangleGeometry(vertices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function starGeometry(outer: number, inner: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  for (let point = 0; point < 10; point++) {
    const angle = Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 ? inner : outer;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.005, bevelThickness: 0.004,
    curveSegments: 1,
  });
}

function createMoonMoth(): OrnamentInstance {
  return makeOrnament('moon-moth', [-0.37, 0.78, 0.39], [-0.12, -0.16, 0.12], 'front orchid leaf', k => {
    const cream = k.mat(0xeee1b7), edge = k.mat(0x8d8166), body = k.mat(0x9c8761);
    for (const side of [-1, 1]) {
      k.sphere(cream, [side * 0.083, 0.025, 0], [0.105, 0.135, 0.018], [0, side * 0.10, side * -0.48]);
      k.sphere(cream, [side * 0.060, -0.075, 0.001], [0.072, 0.085, 0.017], [0, 0, side * 0.35]);
      k.sphere(edge, [side * 0.112, 0.026, 0.020], [0.023, 0.034, 0.005], [0, 0, side * -0.40]);
    }
    k.mesh(new THREE.CapsuleGeometry(0.021, 0.085, 3, 8), body, [0, -0.018, 0.025]);
    for (const side of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(side * 0.010, 0.045, 0.025), new THREE.Vector3(side * 0.052, 0.142, 0.025),
        new THREE.Vector3(side * 0.083, 0.112, 0.025),
      );
      k.mesh(new THREE.TubeGeometry(curve, 6, 0.0045, 4, false), body);
    }
  });
}

function createGoldenToken(): OrnamentInstance {
  return makeOrnament('golden-watering-token', [0.02, 0.34, 0.425], [-0.08, 0, 0], 'front clay pot', k => {
    const gold = k.mat(0xd8a83e, { roughness: 0.35, metalness: 0.5 });
    const light = k.mat(0xf4d879, { roughness: 0.42, metalness: 0.25 });
    const coin = k.mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.026, 20), gold);
    coin.rotation.x = Math.PI / 2;
    k.mesh(new THREE.TorusGeometry(0.097, 0.006, 5, 24), light, [0, 0, 0.018]);
    k.mesh(new THREE.TorusGeometry(0.020, 0.005, 5, 12), gold, [0, 0.134, 0]);
    // A raised watering can, complete with handle, spout and one falling drop.
    k.block(light, [-0.015, -0.012, 0.026], [0.065, 0.047, 0.014]);
    k.rod([0.016, 0.001, 0.030], [0.064, 0.038, 0.030], 0.0075, light, 5);
    k.mesh(new THREE.TorusGeometry(0.026, 0.005, 4, 12, Math.PI * 1.35), light,
      [-0.047, -0.004, 0.027], [1, 1, 1], [0, 0, 0.50]);
    k.sphere(light, [0.074, 0.052, 0.030], [0.009, 0.014, 0.006], [0, 0, -0.35]);
  });
}

function createPotBow(): OrnamentInstance {
  return makeOrnament('tiny-pot-bow', [0.29, 0.59, 0.37], [-0.12, 0.12, -0.18], 'right pot rim', k => {
    const berry = k.mat(0xc66f80), light = k.mat(0xe29aa0), knot = k.mat(0xa9566d);
    k.sphere(berry, [-0.074, 0.012, 0], [0.094, 0.060, 0.024], [0, 0, 0.42]);
    k.sphere(berry, [0.074, 0.012, 0], [0.094, 0.060, 0.024], [0, 0, -0.42]);
    k.sphere(knot, [0, 0, 0.024], [0.047, 0.042, 0.027]);
    k.mesh(new THREE.ConeGeometry(0.047, 0.16, 4), light,
      [-0.036, -0.091, 0], [0.8, 1, 0.25], [0, 0, -0.24]);
    k.mesh(new THREE.ConeGeometry(0.047, 0.16, 4), light,
      [0.038, -0.091, 0], [0.8, 1, 0.25], [0, 0, 0.24]);
  });
}

function createAcornCap(): OrnamentInstance {
  return makeOrnament('acorn-cap', [-0.36, 0.62, 0.34], [-0.10, -0.12, 0.15], 'left pot rim hook', k => {
    const nut = k.mat(0xc38d52), cap = k.mat(0x795a3e), stem = k.mat(0x5f6946), leaf = k.mat(0x7f9b68);
    k.sphere(nut, [0, -0.018, 0], [0.064, 0.089, 0.052]);
    k.mesh(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), cap,
      [0, 0.035, 0], [0.079, 0.050, 0.063]);
    k.rod([0, 0.073, 0], [0.014, 0.12, 0], 0.008, stem, 5);
    k.mesh(new THREE.TorusGeometry(0.018, 0.0045, 4, 10), stem, [0.015, 0.137, 0]);
    k.sphere(leaf, [0.047, 0.088, -0.002], [0.034, 0.013, 0.008], [0, 0, -0.55]);
  });
}

function createFeltBee(): OrnamentInstance {
  return makeOrnament('felt-bee', [-0.28, 0.90, 0.35], [-0.08, -0.12, -0.15], 'orchid leaf clip', k => {
    const gold = k.mat(0xe0b852), dark = k.mat(0x554538), wing = k.mat(0xf2e6c9), clip = k.mat(0x8b8060);
    k.sphere(gold, [0, -0.015, 0], [0.057, 0.085, 0.044]);
    k.sphere(dark, [0, 0.071, 0.005], [0.043, 0.040, 0.036]);
    k.block(dark, [0, -0.035, 0.042], [0.082, 0.012, 0.008]);
    k.block(dark, [0, -0.005, 0.044], [0.095, 0.012, 0.008]);
    for (const side of [-1, 1]) {
      k.sphere(wing, [side * 0.049, 0.008, -0.007], [0.037, 0.061, 0.012], [0, 0, side * -0.55]);
      k.sphere(dark, [side * 0.015, 0.078, 0.039], [0.0055, 0.0065, 0.004]);
    }
    k.mesh(new THREE.ConeGeometry(0.021, 0.043, 5), dark, [0, -0.108, 0], [1, 1, 1], [0, 0, Math.PI]);
    k.mesh(new THREE.TorusGeometry(0.020, 0.004, 4, 10, Math.PI), clip, [0, -0.134, -0.005]);
  });
}

function createPaperCrane(): OrnamentInstance {
  return makeOrnament('paper-crane', [-0.34, 1.00, 0.18], [0, -0.12, -0.06], 'upper plant-stake thread', k => {
    const paper = k.mat(0xf3e7c9, { side: THREE.DoubleSide });
    const fold = k.mat(0xd88e7d, { side: THREE.DoubleSide });
    const thread = k.mat(0x9c8865);
    k.mesh(triangleGeometry([
      0, 0, 0, -0.17, 0.14, -0.005, -0.09, -0.03, 0.012,
    ]), paper);
    k.mesh(triangleGeometry([
      0, 0, 0, 0.16, 0.11, 0, 0.075, -0.035, 0.012,
    ]), fold);
    k.mesh(new THREE.OctahedronGeometry(0.055, 0), paper, [0, -0.018, 0], [1.15, 0.70, 0.65]);
    k.mesh(triangleGeometry([
      -0.03, -0.010, 0, -0.14, 0.045, 0, -0.055, -0.050, 0.012,
      0.025, 0.000, 0.018, 0.065, 0.115, 0.012, 0.092, 0.110, 0.008,
      0.025, 0.000, 0.018, 0.092, 0.110, 0.008, 0.045, -0.035, 0.012,
    ]), paper);
    k.mesh(new THREE.ConeGeometry(0.022, 0.055, 3), fold,
      [0.105, 0.111, 0.010], [1, 1, 0.55], [0, 0, -Math.PI / 2]);
    k.rod([0, 0.005, -0.006], [0, 0.195, -0.006], 0.0025, thread, 4);
    k.mesh(new THREE.TorusGeometry(0.014, 0.003, 4, 10), thread, [0, 0.207, -0.006]);
  });
}

function createGlassLeaf(): OrnamentInstance {
  return makeOrnament('glass-leaf', [0.38, 0.67, 0.29], [-0.10, 0.18, -0.16], 'right pot-rim loop', k => {
    const glass = k.mat(0x82bfa4, {
      roughness: 0.24, metalness: 0.08, transparent: true, opacity: 0.76,
      emissive: 0x284c3e, emissiveIntensity: 0.12, side: THREE.DoubleSide, depthWrite: true,
    });
    const brass = k.mat(0xc5a15c, { roughness: 0.45, metalness: 0.35 });
    // Six triangular facets rise to a central ridge: this is a leaf, not a translucent ball.
    const points: Vec3[] = [
      [0, 0.145, 0], [-0.075, 0.060, 0], [-0.09, -0.015, 0],
      [0, -0.13, 0], [0.09, -0.015, 0], [0.075, 0.060, 0], [0, 0.005, 0.03],
    ];
    const triangles: number[] = [];
    for (let index = 0; index < 6; index++) {
      triangles.push(...points[index]!, ...points[(index + 1) % 6]!, ...points[6]!);
    }
    k.mesh(triangleGeometry(triangles), glass);
    k.rod([0, -0.13, 0.025], [0, 0.12, 0.025], 0.004, brass, 5);
    k.rod([0, -0.015, 0.034], [-0.060, 0.045, 0.016], 0.0025, brass, 4);
    k.rod([0, -0.015, 0.034], [0.060, 0.045, 0.016], 0.0025, brass, 4);
    k.mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10), brass, [0, 0.164, 0]);
  });
}

function createPineconeCrown(): OrnamentInstance {
  return makeOrnament('pinecone-crown', [-0.22, 0.40, 0.425], [-0.08, -0.08, 0.12], 'left front pot hook', k => {
    const core = k.mat(0x72543b), scales = k.mat(0xa77849), tips = k.mat(0xc29258), leaf = k.mat(0x688061);
    k.sphere(core, [0, -0.015, 0], [0.057, 0.094, 0.044]);
    const scaleGeometry = new THREE.DodecahedronGeometry(0.034, 0);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        k.mesh(scaleGeometry, (row + column) % 2 ? scales : tips,
          [(column - 1) * (row === 1 ? 0.039 : 0.033), 0.037 - row * 0.050, 0.038],
          [1, 0.67, 0.40], [0, 0, (column - 1) * 0.20 + (row % 2 ? 0.10 : -0.10)]);
      }
    }
    for (const side of [-1, 1]) {
      k.sphere(leaf, [side * 0.032, 0.080, 0], [0.040, 0.013, 0.009], [0, 0, side * -0.55]);
    }
    k.mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10), core, [0, 0.119, 0]);
  });
}

function createMoonButton(): OrnamentInstance {
  return makeOrnament('moon-button', [0.14, 0.44, 0.43], [-0.08, 0.06, -0.10], 'front clay-pot button', k => {
    const lavender = k.mat(0xaaa1bd), cream = k.mat(0xf1dfb3), hole = k.mat(0x6e667b), thread = k.mat(0xc77f70);
    const disk = k.mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.025, 18), lavender);
    disk.rotation.x = Math.PI / 2;
    k.mesh(new THREE.TorusGeometry(0.088, 0.0055, 5, 20), cream, [0, 0, 0.018]);
    const crescent = new THREE.Shape();
    const start = Math.PI * 0.35, end = Math.PI * 1.65, radius = 0.061;
    crescent.absarc(0, 0, radius, start, end, false);
    crescent.quadraticCurveTo(0.015, 0, Math.cos(start) * radius, Math.sin(start) * radius);
    k.mesh(new THREE.ShapeGeometry(crescent, 12), cream, [-0.018, 0, 0.019]);
    for (const side of [-1, 1]) {
      const eyelet = k.mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.005, 8), hole, [0.049, side * 0.022, 0.023]);
      eyelet.rotation.x = Math.PI / 2;
    }
    k.rod([0.044, -0.024, 0.029], [0.054, 0.024, 0.029], 0.003, thread, 4);
    k.mesh(new THREE.TorusGeometry(0.015, 0.004, 4, 10), thread, [0, 0.123, 0]);
  });
}

function createCloverCharm(): OrnamentInstance {
  return makeOrnament('clover-charm', [0.30, 0.80, 0.33], [-0.10, 0.12, 0.10], 'plant-stake clip', k => {
    const green = k.mat(0x729568), light = k.mat(0x98b27b), stem = k.mat(0x667b50), brass = k.mat(0xc5a15c);
    const leaves: Array<[number, number, number]> = [
      [-0.038, 0.050, -0.62], [0.038, 0.050, 0.62], [-0.052, -0.008, 0.72], [0.052, -0.008, -0.72],
    ];
    leaves.forEach(([x, y, angle], index) => {
      k.sphere(index % 2 ? light : green, [x, y, 0], [0.037, 0.052, 0.017], [0, 0, angle]);
    });
    k.sphere(light, [0, 0.015, 0.012], [0.017, 0.017, 0.012]);
    k.rod([0, -0.005, -0.002], [0.025, -0.130, 0], 0.0055, stem, 5);
    k.mesh(new THREE.TorusGeometry(0.019, 0.004, 4, 10, Math.PI * 1.65), brass, [0.027, -0.145, 0]);
  });
}

function createTinyStar(): OrnamentInstance {
  return makeOrnament('tiny-star', [0.34, 0.58, 0.35], [-0.10, 0.10, 0.12], 'right pot-rim loop', k => {
    const gold = k.mat(0xe2b95a, { roughness: 0.52, metalness: 0.15 }), dark = k.mat(0x695238), loop = k.mat(0xb68c4c);
    k.mesh(starGeometry(0.105, 0.048, 0.024), gold, [0, 0.010, 0]);
    k.sphere(dark, [-0.024, 0.018, 0.033], [0.0055, 0.007, 0.004]);
    k.sphere(dark, [0.024, 0.018, 0.033], [0.0055, 0.007, 0.004]);
    k.rod([0, 0.111, 0.010], [0, 0.128, 0.010], 0.004, loop, 5);
    k.mesh(new THREE.TorusGeometry(0.017, 0.004, 4, 10), loop, [0, 0.143, 0.010]);
  });
}

function createSnailFriend(): OrnamentInstance {
  return makeOrnament('snail-friend', [-0.28, 0.735, 0.35], [-0.08, -0.08, 0.02], 'left pot-rim leaf seat', k => {
    const body = k.mat(0xd4bd8b), shell = k.mat(0xc78862), spiral = k.mat(0x8b6049);
    const leaf = k.mat(0x7e9a70), dark = k.mat(0x493f35);
    k.sphere(leaf, [0, -0.065, 0], [0.130, 0.025, 0.045], [0, 0, 0.02]);
    k.sphere(body, [0.005, -0.025, 0.015], [0.120, 0.028, 0.035]);
    k.sphere(shell, [-0.020, 0.027, 0.008], [0.069, 0.069, 0.032]);
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 22; index++) {
      const t = index / 22, angle = t * Math.PI * 4.2, radius = 0.004 + t * 0.043;
      points.push(new THREE.Vector3(-0.020 + Math.cos(angle) * radius, 0.027 + Math.sin(angle) * radius, 0.042));
    }
    k.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 22, 0.004, 4, false), spiral);
    k.sphere(body, [0.095, -0.008, 0.017], [0.036, 0.038, 0.031]);
    for (const side of [-1, 1]) {
      const x = 0.095 + side * 0.014;
      k.rod([x, 0.010, 0.023], [x + side * 0.005, 0.046, 0.034], 0.0035, body, 5);
      k.sphere(dark, [x + side * 0.005, 0.048, 0.038], [0.006, 0.007, 0.005]);
    }
  });
}

const svg = (content: string): string => `<svg viewBox="0 0 48 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;

const moonMothIcon = svg('<path d="M23 25Q5 5 6 26q2 13 17 3M25 25Q43 5 42 26q-2 13-17 3" fill="#eee1b7" stroke="#8d8166" stroke-width="1.5"/><ellipse cx="24" cy="28" rx="3" ry="10" fill="#9c8761"/><path d="M23 18q-6-9-10-5m12 5q6-9 10-5" fill="none" stroke="#8d8166" stroke-width="1.4"/><ellipse cx="13" cy="22" rx="3" ry="4" fill="#8d8166"/><ellipse cx="35" cy="22" rx="3" ry="4" fill="#8d8166"/>');
const goldenTokenIcon = svg('<circle cx="24" cy="25" r="17" fill="#d8a83e" stroke="#91702d" stroke-width="2"/><circle cx="24" cy="25" r="13" fill="none" stroke="#f4d879" stroke-width="1.5"/><path d="M18 23h11v9H18zM29 25l6-5m-17 5a5 5 0 0 1 0-6" fill="none" stroke="#fff0a8" stroke-width="2" stroke-linejoin="round"/><path d="m36 17 2 4-4-1z" fill="#fff0a8"/><circle cx="24" cy="7" r="3" fill="none" stroke="#91702d" stroke-width="2"/>');
const potBowIcon = svg('<path d="M23 23Q6 7 6 22q0 12 17 5M25 23Q42 7 42 22q0 12-17 5" fill="#c97883" stroke="#874e5e" stroke-width="1.5"/><path d="m21 27-7 16 10-5 3-11m-2 0 7 16-10-5" fill="#dd9397" stroke="#874e5e" stroke-width="1.5"/><circle cx="24" cy="25" r="6" fill="#b96575" stroke="#874e5e" stroke-width="1.5"/>');
const acornIcon = svg('<path d="M25 13q1-7 6-8m-5 7q7-7 12-2-5 7-12 2" fill="#7f9b68" stroke="#5f6946" stroke-width="1.5"/><path d="M14 23q10-10 20 0l-2 6H16z" fill="#795a3e"/><path d="M17 27q-1 14 8 15 9-2 7-15z" fill="#c38d52" stroke="#795a3e" stroke-width="1.5"/><path d="m18 20 13 9m-9-12 12 8m-16-1 13 8" stroke="#a7835d" stroke-width="1"/>');
const beeIcon = svg('<ellipse cx="24" cy="27" rx="10" ry="14" fill="#e0b852" stroke="#554538" stroke-width="1.5"/><path d="M15 24h18m-18 7h18" stroke="#554538" stroke-width="4"/><ellipse cx="14" cy="19" rx="7" ry="10" transform="rotate(-35 14 19)" fill="#f2e6c9" stroke="#aa9c7f"/><ellipse cx="34" cy="19" rx="7" ry="10" transform="rotate(35 34 19)" fill="#f2e6c9" stroke="#aa9c7f"/><circle cx="24" cy="12" r="7" fill="#554538"/><circle cx="21" cy="11" r="1" fill="#fff7df"/><circle cx="27" cy="11" r="1" fill="#fff7df"/><path d="m24 41 3 5" stroke="#554538" stroke-width="2"/>');
const craneIcon = svg('<path d="m23 25-17 4L18 12z" fill="#f3e7c9" stroke="#aa9475" stroke-width="1.2"/><path d="m23 25 18-11-9 18z" fill="#d88e7d" stroke="#aa7468" stroke-width="1.2"/><path d="m23 25 8-17 6-1-5 5-5 17z" fill="#f3e7c9" stroke="#aa9475" stroke-width="1.2"/><path d="m36 7 8 3-8 2z" fill="#d88e7d"/><path d="m23 25-9 14 13-8" fill="#ead9b9" stroke="#aa9475" stroke-width="1.2"/>');
const glassLeafIcon = svg('<path d="M24 5Q5 17 13 37l11 7 11-7Q43 17 24 5Z" fill="#82bfa4" fill-opacity=".8" stroke="#527e68" stroke-width="1.5"/><path d="M24 5v39M24 24 13 16m11 8 11-8M24 33l-9-5m9 5 9-5" fill="none" stroke="#e2c77d" stroke-width="1.5"/><path d="m24 5-11 32 11 7 11-7z" fill="#b6dec9" fill-opacity=".35"/>');
const pineconeIcon = svg('<path d="M24 8q-13 9-11 23 2 12 11 14 9-2 11-14 2-14-11-23Z" fill="#72543b"/><path d="m24 10-6 8 6 5 6-5zm-9 10 7 6-6 6-5-6zm18 0-7 6 6 6 5-6zM24 25l-7 6 7 7 7-7z" fill="#a77849" stroke="#c29258" stroke-width="1"/><path d="m21 10-6-4m12 4 7-5" stroke="#688061" stroke-width="3" stroke-linecap="round"/>');
const moonButtonIcon = svg('<circle cx="24" cy="25" r="18" fill="#aaa1bd" stroke="#6e667b" stroke-width="1.5"/><circle cx="24" cy="25" r="14" fill="none" stroke="#f1dfb3" stroke-width="1.5"/><path d="M25 12a13 13 0 1 0 0 26Q14 25 25 12Z" fill="#f1dfb3"/><circle cx="31" cy="21" r="2" fill="#6e667b"/><circle cx="31" cy="29" r="2" fill="#6e667b"/><path d="m30 20 2 10" stroke="#c77f70" stroke-width="1.5"/>');
const cloverIcon = svg('<path d="M24 24Q3 22 8 10q7-8 16 14Zm0 0Q45 22 40 10q-7-8-16 14Zm0 0Q3 26 8 38q7 8 16-14Zm0 0q21 2 16 14-7 8-16-14Z" fill="#83a474" stroke="#587653" stroke-width="1.4"/><path d="m24 24 6 20" stroke="#667b50" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="3" fill="#b2c891"/>');
const tinyStarIcon = svg('<path d="m24 4 6 13 14 2-10 10 3 14-13-7-13 7 3-14L4 19l14-2z" fill="#e2b95a" stroke="#a77c39" stroke-width="1.5" stroke-linejoin="round"/><circle cx="20" cy="24" r="1.4" fill="#695238"/><circle cx="28" cy="24" r="1.4" fill="#695238"/><path d="m21 29 3 2 3-2" fill="none" stroke="#695238" stroke-width="1.4" stroke-linecap="round"/><path d="m17 16 7-12 4 8" fill="#f4d879" fill-opacity=".55"/>');
const snailIcon = svg('<path d="M5 38q19-9 38 0-20 9-38 0" fill="#7e9a70"/><path d="M10 34q6-7 25-2l7 5H10" fill="#d4bd8b" stroke="#8b7b57" stroke-width="1.2"/><circle cx="23" cy="22" r="13" fill="#c78862" stroke="#8b6049" stroke-width="1.5"/><path d="M24 22q0-6 6-3 5 7-2 10-10 2-12-7-1-11 10-12" fill="none" stroke="#8b6049" stroke-width="2" stroke-linecap="round"/><path d="m34 32 3-12m-8 12-1-10" stroke="#d4bd8b" stroke-width="2"/><circle cx="37" cy="19" r="2" fill="#493f35"/><circle cx="28" cy="21" r="2" fill="#493f35"/>');

/** Twelve original rewards. The first three preserve the requested release ordering and IDs. */
export const ORNAMENTS = [
  { id: 'moon-moth', name: 'Moon moth', icon: moonMothIcon, create: createMoonMoth },
  { id: 'golden-watering-token', name: 'Golden watering token', icon: goldenTokenIcon, create: createGoldenToken },
  { id: 'tiny-pot-bow', name: 'Tiny pot bow', icon: potBowIcon, create: createPotBow },
  { id: 'acorn-cap', name: 'Acorn cap', icon: acornIcon, create: createAcornCap },
  { id: 'felt-bee', name: 'Felt bee', icon: beeIcon, create: createFeltBee },
  { id: 'paper-crane', name: 'Paper crane', icon: craneIcon, create: createPaperCrane },
  { id: 'glass-leaf', name: 'Glass leaf', icon: glassLeafIcon, create: createGlassLeaf },
  { id: 'pinecone-crown', name: 'Pinecone crown', icon: pineconeIcon, create: createPineconeCrown },
  { id: 'moon-button', name: 'Moon button', icon: moonButtonIcon, create: createMoonButton },
  { id: 'clover-charm', name: 'Clover charm', icon: cloverIcon, create: createCloverCharm },
  { id: 'tiny-star', name: 'Tiny star', icon: tinyStarIcon, create: createTinyStar },
  { id: 'snail-friend', name: 'Snail friend', icon: snailIcon, create: createSnailFriend },
] as const satisfies readonly CatalogOrnament[];

/** Wrap both positive and negative indices; non-finite input safely selects the first reward. */
export function ornamentForIndex(index: number): (typeof ORNAMENTS)[number] {
  const wrapped = Number.isFinite(index) ? ((Math.trunc(index) % ORNAMENTS.length) + ORNAMENTS.length) % ORNAMENTS.length : 0;
  return ORNAMENTS[wrapped]!;
}
