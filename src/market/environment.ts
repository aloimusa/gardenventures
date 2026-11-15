import * as THREE from 'three';

/** World-space bounds measured from the completed, untransformed environment at update(0). */
export const MARKET_ENVIRONMENT_BOUNDS = {
  min: [-7.8, -0.24, -15.8],
  max: [7.8, 6.76, 4.2],
} as const;

/**
 * Framing suggestions in the environment's local coordinates. All cameras look towards -Z.
 * For a narrow orthographic portal, use height = max(verticalSize, minHorizontalSize / aspect).
 */
export const MARKET_ENVIRONMENT_CAMERAS = {
  portal: {
    type: 'orthographic',
    position: [8.2, 7.4, 15.4],
    target: [0, 2.65, -5.25],
    verticalSize: 12.2,
    minHorizontalSize: 15.8,
    near: 0.1,
    far: 90,
  },
  fullscreen: {
    type: 'perspective',
    position: [8.4, 7.1, 13.8],
    target: [0, 2.1, -4.25],
    fov: 39,
    near: 0.1,
    far: 100,
  },
  mobile: {
    type: 'perspective',
    position: [10.4, 8.6, 18.8],
    target: [0, 2.25, -4.25],
    fov: 42,
    near: 0.1,
    far: 110,
  },
} as const;

export interface MarketEnvironment {
  group: THREE.Group;
  cathedral?: THREE.Group;
  stalls: THREE.Group;
  /** Animates cloth only. Time is in seconds; no clocks or DOM APIs are touched internally. */
  update?: (time: number) => void;
  dispose: () => void;
}

type Vec3 = [number, number, number];

interface InstanceSpec {
  position: Vec3;
  scale: Vec3;
  rotation?: Vec3;
  color?: number;
}

const C = {
  // Quiet Nordic mineral palette: petrol/slate, lichen and cool chalk. Natural wood and fruit stay recognizable.
  cream: 0xdce6e7,
  warmWhite: 0xecf2f3,
  limestone: 0xb9c7c9,
  grout: 0x87999f,
  sage: 0x708f91,
  sageLight: 0xa9c0bd,
  sageDark: 0x365663,
  dome: 0x304f63,
  pink: 0x91a6bd,
  pinkLight: 0xb8c4d3,
  wood: 0x967c5e,
  woodLight: 0xb39c7d,
  woodDark: 0x594b40,
  glass: 0x506f7b,
  gold: 0x91a4ad,
  soil: 0x64584e,
  leaf: 0x658776,
  apple: 0xb96e70,
  orange: 0xd0a069,
  pear: 0xa7b58a,
  banana: 0xd8c484,
} as const;

function hash(index: number, salt = 0): number {
  let n = Math.imul((index + 1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 17, 0xc2b2ae35);
  n ^= n >>> 16;
  n = Math.imul(n, 0x7feb352d);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

function trianglesGeometry(triangles: Vec3[], colors?: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(), 3));
  if (colors) {
    const values: number[] = [];
    for (let i = 0; i < triangles.length / 3; i++) {
      const color = new THREE.Color(colors[i]);
      for (let vertex = 0; vertex < 3; vertex++) values.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(values, 3));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A triangular prism with its ridge along Z, used for roofs and the cathedral pediment. */
function gableGeometry(): THREE.BufferGeometry {
  const a: Vec3 = [-0.5, 0, 0.5], b: Vec3 = [0.5, 0, 0.5], c: Vec3 = [0, 1, 0.5];
  const d: Vec3 = [-0.5, 0, -0.5], e: Vec3 = [0.5, 0, -0.5], f: Vec3 = [0, 1, -0.5];
  return trianglesGeometry([
    a, b, c, e, d, f,
    d, a, c, d, c, f,
    b, e, f, b, f, c,
    a, d, e, a, e, b,
  ]);
}

/** Twelve-triangle tapered cobble: broad at the grout, subtly inset on its sunlit face. */
function cobbleGeometry(): THREE.BufferGeometry {
  const triangles: Vec3[] = [];
  const bottom: Vec3[] = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]];
  const top: Vec3[] = [[-0.45, 0.5, -0.42], [0.45, 0.5, -0.42], [0.45, 0.5, 0.42], [-0.45, 0.5, 0.42]];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => triangles.push(a, b, c, a, c, d);
  quad(top[0], top[3], top[2], top[1]);
  quad(bottom[0], bottom[1], bottom[2], bottom[3]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(bottom[i], top[i], top[j], bottom[j]);
  }
  return trianglesGeometry(triangles);
}

function pearGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.025, -0.52), new THREE.Vector2(0.23, -0.47),
    new THREE.Vector2(0.34, -0.26), new THREE.Vector2(0.32, -0.05),
    new THREE.Vector2(0.23, 0.16), new THREE.Vector2(0.135, 0.35),
    new THREE.Vector2(0.12, 0.46), new THREE.Vector2(0.045, 0.52),
  ];
  return new THREE.LatheGeometry(profile, 9);
}

/** A tapered, gently curved yellow crescent; endpoints are narrow rather than a torus segment. */
function bananaGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  const segments = 10, radial = 5;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (t - 0.5) * 0.4;
    const y = Math.sin(t * Math.PI) * 0.13;
    const radius = 0.013 + Math.sin(t * Math.PI) * 0.026;
    const tangent = new THREE.Vector2(0.4, Math.cos(t * Math.PI) * Math.PI * 0.13).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    for (let j = 0; j <= radial; j++) {
      const angle = j / radial * Math.PI * 2;
      positions.push(x + normal.x * Math.cos(angle) * radius,
        y + normal.y * Math.cos(angle) * radius, Math.sin(angle) * radius);
      if (i < segments && j < radial) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function stripedCanopyGeometry(width: number, stripes: number, ridgeY: number, eaveY: number,
  ridgeZ: number, frontZ: number, backZ: number, valance: number): THREE.BufferGeometry {
  const vertices: Vec3[] = [], colors: number[] = [];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: number) => {
    vertices.push(a, b, c, a, c, d);
    colors.push(color, color);
  };
  for (let i = 0; i < stripes; i++) {
    const x0 = -width / 2 + width * i / stripes;
    const x1 = -width / 2 + width * (i + 1) / stripes;
    const color = i % 2 ? C.cream : C.sage;
    quad([x0, ridgeY, ridgeZ], [x1, ridgeY, ridgeZ], [x1, eaveY, frontZ], [x0, eaveY, frontZ], color);
    quad([x1, ridgeY, ridgeZ], [x0, ridgeY, ridgeZ], [x0, eaveY, backZ], [x1, eaveY, backZ], color);
    for (let segment = 0; segment < 4; segment++) {
      const u0 = segment / 4, u1 = (segment + 1) / 4;
      const a = x0 + (x1 - x0) * u0, b = x0 + (x1 - x0) * u1;
      const y0 = eaveY - valance + Math.sin(u0 * Math.PI) * -0.055;
      const y1 = eaveY - valance + Math.sin(u1 * Math.PI) * -0.055;
      quad([a, eaveY, frontZ + 0.006], [b, eaveY, frontZ + 0.006], [b, y1, frontZ + 0.006], [a, y0, frontZ + 0.006], color);
    }
  }
  return trianglesGeometry(vertices, colors);
}

function stripedPanelGeometry(width: number, stripes: number, topY: number, bottomY: number, z: number,
  first: number, second: number): THREE.BufferGeometry {
  const vertices: Vec3[] = [], colors: number[] = [];
  for (let i = 0; i < stripes; i++) {
    const x0 = -width / 2 + width * i / stripes, x1 = -width / 2 + width * (i + 1) / stripes;
    const inset = i % 2 ? 0.018 : -0.012;
    vertices.push([x0, topY, z], [x1, topY, z], [x1, bottomY + inset, z + 0.025],
      [x0, topY, z], [x1, bottomY + inset, z + 0.025], [x0, bottomY + inset, z + 0.025]);
    colors.push(i % 2 ? first : second, i % 2 ? first : second);
  }
  return trianglesGeometry(vertices, colors);
}

export function createMarketEnvironment(): MarketEnvironment {
  const group = new THREE.Group();
  group.name = 'market-environment';
  const stalls = new THREE.Group();
  stalls.name = 'market-stalls';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const lights: THREE.Light[] = [];
  const animatedFlags: { positions: THREE.Float32BufferAttribute; bases: number[]; phases: number[] }[] = [];
  let disposed = false;

  const geometry = <T extends THREE.BufferGeometry>(value: T): T => {
    geometries.add(value);
    return value;
  };
  const material = (color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...options });
    materials.add(value);
    return value;
  };

  const mat = {
    ground: material(C.grout),
    cobble: material(0xffffff),
    cream: material(C.cream),
    white: material(C.warmWhite),
    limestone: material(C.limestone),
    sage: material(C.sage),
    sageLight: material(C.sageLight),
    sageDark: material(C.sageDark),
    dome: material(C.dome, { roughness: 0.76, flatShading: true }),
    wood: material(C.wood),
    woodLight: material(C.woodLight),
    woodDark: material(C.woodDark),
    glass: material(C.glass, { roughness: 0.48 }),
    gold: material(C.gold, { roughness: 0.58, metalness: 0.12 }),
    soil: material(C.soil),
    instances: material(0xffffff, { flatShading: true }),
    cloth: material(0xffffff, { side: THREE.DoubleSide, vertexColors: true, roughness: 0.98 }),
    fruit: material(0xffffff, { flatShading: true, roughness: 0.82 }),
  };

  const boxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
  const fineCylinderGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 20));
  const potGeometry = geometry(new THREE.CylinderGeometry(1, 0.74, 1, 12, 1, true));
  const soilGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
  const sphereGeometry = geometry(new THREE.SphereGeometry(1, 9, 6));
  const roundGeometry = geometry(new THREE.IcosahedronGeometry(1, 1));
  const domeGeometry = geometry(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  const ringGeometry = geometry(new THREE.TorusGeometry(1, 0.065, 5, 18));
  const wheelGeometry = geometry(new THREE.TorusGeometry(0.28, 0.045, 6, 16));
  const handleGeometry = geometry(new THREE.TorusGeometry(1, 0.055, 5, 16, Math.PI));
  const roofGeometry = geometry(gableGeometry());
  const cobblesGeometry = geometry(cobbleGeometry());
  const pearsGeometry = geometry(pearGeometry());
  const bananasGeometry = geometry(bananaGeometry());

  function mesh(parent: THREE.Object3D, name: string, geo: THREE.BufferGeometry, materialValue: THREE.Material,
    position: Vec3, scale: Vec3 = [1, 1, 1], rotation: Vec3 = [0, 0, 0], shadows = true): THREE.Mesh {
    const value = new THREE.Mesh(geo, materialValue);
    value.name = name;
    value.position.set(...position);
    value.scale.set(...scale);
    value.rotation.set(...rotation);
    value.castShadow = shadows;
    value.receiveShadow = shadows;
    parent.add(value);
    return value;
  }

  function box(parent: THREE.Object3D, name: string, materialValue: THREE.Material,
    position: Vec3, size: Vec3, rotation: Vec3 = [0, 0, 0], shadows = true): THREE.Mesh {
    return mesh(parent, name, boxGeometry, materialValue, position, size, rotation, shadows);
  }

  const dummy = new THREE.Object3D();
  const instanceColor = new THREE.Color();
  function instances(parent: THREE.Object3D, name: string, geo: THREE.BufferGeometry, materialValue: THREE.Material,
    specs: InstanceSpec[], castShadow = true, receiveShadow = true): THREE.InstancedMesh {
    const value = new THREE.InstancedMesh(geo, materialValue, specs.length);
    value.name = name;
    value.castShadow = castShadow;
    value.receiveShadow = receiveShadow;
    specs.forEach((spec, index) => {
      dummy.position.set(...spec.position);
      dummy.scale.set(...spec.scale);
      dummy.rotation.set(...(spec.rotation ?? [0, 0, 0]));
      dummy.updateMatrix();
      value.setMatrixAt(index, dummy.matrix);
      if (spec.color !== undefined) value.setColorAt(index, instanceColor.setHex(spec.color));
    });
    value.instanceMatrix.needsUpdate = true;
    if (value.instanceColor) value.instanceColor.needsUpdate = true;
    value.computeBoundingBox();
    value.computeBoundingSphere();
    parent.add(value);
    return value;
  }

  function addPlaza(): void {
    const plaza = new THREE.Group();
    plaza.name = 'patterned-senate-square-plaza';
    group.add(plaza);
    box(plaza, 'solid-plaza-foundation', mat.ground, [0, -0.12, -5.8], [15.6, 0.24, 20], undefined, false);

    const cobbles: InstanceSpec[] = [];
    const cobbleColors = [0xb9c7ca, 0xc5d0d1, 0xaebec2, 0xd0d9d9, 0xb4c3c6, 0xa6b7bd];
    let index = 0;
    for (let row = 0; row < 55; row++) {
      const z = 3.82 - row * 0.34;
      for (let column = 0; column < 31; column++) {
        const x = -7.28 + column * 0.48 + (row % 2) * 0.24;
        if (x > 7.35) continue;
        const onPromenade = Math.abs(x) < 2.15;
        const onCrossBand = Math.abs(z + 2.6) < 0.2 || Math.abs(z - 2.55) < 0.2;
        const border = Math.abs(x) > 6.85;
        const noise = hash(index, 3);
        let color = cobbleColors[Math.floor(noise * cobbleColors.length)];
        if (onPromenade) color = noise > 0.48 ? 0xd8e0e0 : 0xc7d3d4;
        if (onCrossBand || border) color = noise > 0.5 ? 0x8ba3a4 : 0x9dafb1;
        cobbles.push({ position: [x, 0.022 + hash(index, 8) * 0.008, z],
          scale: [0.448, 0.066 + hash(index, 4) * 0.012, 0.306], color });
        index++;
      }
    }
    instances(plaza, 'individual-low-poly-cobbles', cobblesGeometry, mat.cobble, cobbles, false, true);

    const medallion = mesh(plaza, 'sage-inlay-around-market', geometry(new THREE.RingGeometry(2.16, 2.25, 48)), mat.sage,
      [0, 0.075, 0.9], [1, 1, 1], [-Math.PI / 2, 0, 0], false);
    medallion.receiveShadow = true;
    mesh(plaza, 'foreground-mosaic', geometry(new THREE.CircleGeometry(0.57, 16)), mat.sageLight,
      [0, 0.077, 3.05], [1, 1, 1], [-Math.PI / 2, 0, 0], false);
    mesh(plaza, 'foreground-mosaic-center', geometry(new THREE.RingGeometry(0.30, 0.38, 16)), mat.cream,
      [0, 0.081, 3.05], [1, 1, 1], [-Math.PI / 2, 0, 0], false);

    const bollards: InstanceSpec[] = [], caps: InstanceSpec[] = [], plinths: InstanceSpec[] = [];
    for (const [x, z] of [[-3.35, 2.65], [3.35, 2.65], [-3.75, -2.45], [3.75, -2.45], [-4.15, 0.05], [4.15, 0.05]]) {
      plinths.push({ position: [x, 0.10, z], scale: [0.28, 0.16, 0.28] });
      bollards.push({ position: [x, 0.34, z], scale: [0.075, 0.46, 0.075] });
      caps.push({ position: [x, 0.585, z], scale: [0.095, 0.065, 0.095] });
    }
    instances(plaza, 'bollard-plinths', boxGeometry, mat.limestone, plinths);
    instances(plaza, 'low-sage-bollards', cylinderGeometry, mat.sageDark, bollards);
    instances(plaza, 'bollard-caps', cylinderGeometry, mat.gold, caps);

    const planterPositions: [number, number][] = [[-4.65, 1.75], [4.65, 1.75], [-4.45, -3.2], [4.45, -3.2]];
    const pots: InstanceSpec[] = [], rims: InstanceSpec[] = [], soil: InstanceSpec[] = [], greenery: InstanceSpec[] = [], flowers: InstanceSpec[] = [];
    planterPositions.forEach(([x, z], planter) => {
      pots.push({ position: [x, 0.30, z], scale: [0.42, 0.48, 0.42] });
      rims.push({ position: [x, 0.54, z], scale: [0.43, 0.43, 0.43], rotation: [Math.PI / 2, 0, 0] });
      soil.push({ position: [x, 0.515, z], scale: [0.36, 0.035, 0.36] });
      greenery.push({ position: [x, 0.77, z], scale: [0.40, 0.42, 0.38], color: planter % 2 ? C.sage : C.leaf });
      greenery.push({ position: [x - 0.25, 0.70, z + 0.04], scale: [0.25, 0.28, 0.25], color: C.sageDark });
      greenery.push({ position: [x + 0.24, 0.72, z - 0.07], scale: [0.27, 0.31, 0.26], color: C.sageLight });
      for (let flower = 0; flower < 5; flower++) {
        const angle = flower / 5 * Math.PI * 2 + planter;
        flowers.push({ position: [x + Math.cos(angle) * 0.29, 0.91 + hash(flower, planter) * 0.13, z + Math.sin(angle) * 0.25],
          scale: [0.055, 0.045, 0.055], color: flower % 2 ? C.pinkLight : C.cream });
      }
    });
    instances(plaza, 'terracotta-planters', potGeometry, mat.wood, pots);
    instances(plaza, 'planter-rims', ringGeometry, mat.woodLight, rims);
    instances(plaza, 'planter-soil', soilGeometry, mat.soil, soil);
    instances(plaza, 'sage-planter-foliage', roundGeometry, mat.instances, greenery);
    instances(plaza, 'small-cream-and-pink-flowers', roundGeometry, mat.instances, flowers);
  }

  function addTown(): void {
    const town = new THREE.Group();
    town.name = 'shaded-pastel-townhouses';
    group.add(town);
    const bodies: InstanceSpec[] = [], roofs: InstanceSpec[] = [], cornices: InstanceSpec[] = [], bases: InstanceSpec[] = [];
    const windows: InstanceSpec[] = [], panes: InstanceSpec[] = [], mullions: InstanceSpec[] = [], doors: InstanceSpec[] = [], chimneys: InstanceSpec[] = [];
    const buildings = [
      { x: -5.55, z: -6.35, w: 2.4, d: 2.45, h: 3.2, color: C.pinkLight, roof: C.sageDark },
      { x: -5.95, z: -9.25, w: 2.8, d: 2.4, h: 4.1, color: C.cream, roof: C.pink },
      { x: -4.95, z: -12.25, w: 2.2, d: 2.45, h: 3.45, color: C.sageLight, roof: C.sageDark },
      { x: 5.55, z: -6.20, w: 2.3, d: 2.45, h: 3.5, color: C.sageLight, roof: C.wood },
      { x: 5.90, z: -9.05, w: 2.6, d: 2.4, h: 4.25, color: C.pinkLight, roof: C.sageDark },
      { x: 5.05, z: -12.10, w: 2.3, d: 2.45, h: 3.55, color: C.cream, roof: C.pink },
    ];
    buildings.forEach((building, buildingIndex) => {
      const { x, z, w, d, h } = building;
      bodies.push({ position: [x, h / 2 + 0.05, z], scale: [w, h, d], color: building.color });
      roofs.push({ position: [x, h + 0.08, z], scale: [w + 0.25, 0.78, d + 0.30], color: building.roof });
      cornices.push({ position: [x, h - 0.05, z], scale: [w + 0.13, 0.13, d + 0.10] });
      bases.push({ position: [x, 0.17, z], scale: [w + 0.08, 0.22, d + 0.06] });
      chimneys.push({ position: [x + w * 0.27, h + 0.75, z - d * 0.2], scale: [0.26, 0.64, 0.29] });
      const front = z + d / 2 + 0.045;
      const columns = w > 2.5 ? 3 : 2;
      const floors = Math.max(2, Math.floor((h - 0.35) / 0.95));
      for (let floor = 0; floor < floors; floor++) {
        for (let column = 0; column < columns; column++) {
          const wx = x + (column - (columns - 1) / 2) * (w / (columns + 0.45));
          const wy = 1.28 + floor * 0.91;
          if (wy + 0.38 > h - 0.22) continue;
          windows.push({ position: [wx, wy, front], scale: [0.48, 0.67, 0.06] });
          panes.push({ position: [wx, wy, front + 0.038], scale: [0.35, 0.54, 0.045] });
          mullions.push({ position: [wx, wy, front + 0.069], scale: [0.026, 0.55, 0.026] });
          mullions.push({ position: [wx, wy, front + 0.069], scale: [0.36, 0.026, 0.026] });
        }
      }
      doors.push({ position: [x, 0.65, front + 0.025], scale: [0.53, 1.12, 0.075], color: buildingIndex % 2 ? C.sageDark : C.woodDark });
    });
    instances(town, 'six-pastel-townhouse-bodies', boxGeometry, mat.instances, bodies);
    instances(town, 'six-townhouse-gabled-roofs', roofGeometry, mat.instances, roofs);
    instances(town, 'townhouse-cornices', boxGeometry, mat.cream, cornices, false, true);
    instances(town, 'townhouse-bases', boxGeometry, mat.limestone, bases, false, true);
    instances(town, 'cream-window-surrounds', boxGeometry, mat.cream, windows, false, true);
    instances(town, 'sage-window-panes', boxGeometry, mat.glass, panes, false, true);
    instances(town, 'window-mullions', boxGeometry, mat.cream, mullions, false, true);
    instances(town, 'townhouse-doors', boxGeometry, mat.instances, doors, false, true);
    instances(town, 'chimneys', boxGeometry, mat.limestone, chimneys);
  }

  function addCathedral(): THREE.Group {
    const cathedral = new THREE.Group();
    cathedral.name = 'helsinki-cathedral-easter-egg';
    cathedral.userData.optional = true;
    cathedral.position.set(0, 0.065, -12.1);
    group.add(cathedral);

    const steps: InstanceSpec[] = [];
    for (let step = 0; step < 6; step++) {
      const height = 0.14 * (step + 1);
      steps.push({ position: [0, height / 2, 0.25 + step * 0.12],
        scale: [6.8 - step * 0.16, height, 4.9 - step * 0.36] });
    }
    instances(cathedral, 'six-broad-cathedral-steps', boxGeometry, mat.limestone, steps);
    box(cathedral, 'cathedral-white-body', mat.white, [0, 2.15, -0.40], [5.2, 2.68, 3.2]);
    mesh(cathedral, 'cathedral-green-roof', roofGeometry, mat.dome, [0, 3.49, -0.48], [5.35, 0.82, 3.35]);

    const columns: InstanceSpec[] = [], capitals: InstanceSpec[] = [];
    for (let column = 0; column < 6; column++) {
      const x = (column - 2.5) * 0.82;
      columns.push({ position: [x, 2.02, 1.22], scale: [0.14, 2.26, 0.14] });
      capitals.push({ position: [x, 0.91, 1.22], scale: [0.38, 0.13, 0.38] });
      capitals.push({ position: [x, 3.15, 1.22], scale: [0.38, 0.14, 0.38] });
    }
    instances(cathedral, 'six-neoclassical-columns', fineCylinderGeometry, mat.white, columns);
    instances(cathedral, 'column-capitals-and-feet', boxGeometry, mat.white, capitals);
    box(cathedral, 'portico-entablature', mat.white, [0, 3.27, 1.15], [5.35, 0.20, 0.62]);
    mesh(cathedral, 'white-triangular-pediment', roofGeometry, mat.white, [0, 3.37, 1.16], [5.65, 0.91, 0.52]);
    box(cathedral, 'cathedral-main-door', mat.sageDark, [0, 1.64, 1.225], [0.86, 1.58, 0.07]);
    mesh(cathedral, 'pediment-medallion', geometry(new THREE.TorusGeometry(0.17, 0.027, 6, 18)), mat.gold,
      [0, 3.67, 1.435], [1, 1, 1]);

    const towerBases: InstanceSpec[] = [], towerDrums: InstanceSpec[] = [], towerDomes: InstanceSpec[] = [], towerFinials: InstanceSpec[] = [];
    for (const x of [-2.42, 2.42]) for (const z of [-1.48, 1.02]) {
      towerBases.push({ position: [x, 2.32, z], scale: [0.82, 2.55, 0.82] });
      towerDrums.push({ position: [x, 3.83, z], scale: [0.44, 0.52, 0.44] });
      towerDomes.push({ position: [x, 4.09, z], scale: [0.51, 0.62, 0.51] });
      towerFinials.push({ position: [x, 4.78, z], scale: [0.045, 0.30, 0.045] });
    }
    instances(cathedral, 'four-corner-towers', boxGeometry, mat.white, towerBases);
    instances(cathedral, 'four-tower-drums', fineCylinderGeometry, mat.white, towerDrums);
    instances(cathedral, 'four-small-green-domes', domeGeometry, mat.dome, towerDomes);
    instances(cathedral, 'four-tower-finials', boxGeometry, mat.gold, towerFinials);

    mesh(cathedral, 'central-dome-drum', fineCylinderGeometry, mat.white, [0, 4.43, -0.56], [0.98, 0.68, 0.98]);
    mesh(cathedral, 'central-green-dome', domeGeometry, mat.dome, [0, 4.77, -0.56], [1.11, 0.96, 1.11]);
    mesh(cathedral, 'central-dome-ring', ringGeometry, mat.sageDark, [0, 4.775, -0.56], [1.08, 1.08, 1.08], [Math.PI / 2, 0, 0]);
    mesh(cathedral, 'cupola', fineCylinderGeometry, mat.white, [0, 5.80, -0.56], [0.19, 0.33, 0.19]);
    mesh(cathedral, 'cupola-green-cap', domeGeometry, mat.dome, [0, 5.965, -0.56], [0.27, 0.25, 0.27]);
    // The vertical ends at local y 6.695 (+ 0.065 world offset), establishing the exported 6.76 bound.
    box(cathedral, 'cathedral-cross-vertical', mat.gold, [0, 6.32, -0.56], [0.065, 0.75, 0.065]);
    box(cathedral, 'cathedral-cross-arm', mat.gold, [0, 6.41, -0.56], [0.46, 0.065, 0.065]);
    return cathedral;
  }

  interface FruitBatch {
    apples: InstanceSpec[];
    stems: InstanceSpec[];
    leaves: InstanceSpec[];
    oranges: InstanceSpec[];
    pears: InstanceSpec[];
    bananas: InstanceSpec[];
  }

  function fruitBatch(): FruitBatch {
    return { apples: [], stems: [], leaves: [], oranges: [], pears: [], bananas: [] };
  }

  function apple(batch: FruitBatch, x: number, y: number, z: number, size = 0.135, color: number = C.apple): void {
    batch.apples.push({ position: [x, y, z], scale: [size, size * 0.92, size], color });
    batch.stems.push({ position: [x, y + size * 0.99, z], scale: [0.014, 0.075, 0.014], rotation: [0, 0, 0.16] });
    batch.leaves.push({ position: [x + size * 0.34, y + size * 1.10, z], scale: [0.058, 0.015, 0.031],
      rotation: [0.18, 0.35, 0.40], color: C.leaf });
  }

  function orange(batch: FruitBatch, x: number, y: number, z: number, size = 0.135): void {
    batch.oranges.push({ position: [x, y, z], scale: [size, size, size], color: C.orange });
    batch.leaves.push({ position: [x + 0.02, y + size * 0.97, z], scale: [0.042, 0.012, 0.023],
      rotation: [0, 0.4, 0.24], color: C.sageDark });
  }

  function pear(batch: FruitBatch, x: number, y: number, z: number, angle = 0): void {
    batch.pears.push({ position: [x, y, z], scale: [0.41, 0.43, 0.41], rotation: [0, angle, 0], color: C.pear });
    batch.stems.push({ position: [x, y + 0.242, z], scale: [0.014, 0.075, 0.014], rotation: [0, 0, -0.14] });
  }

  function banana(batch: FruitBatch, x: number, y: number, z: number, angle: number): void {
    batch.bananas.push({ position: [x, y, z], scale: [1, 1, 1], rotation: [-0.35, angle, 0.08], color: C.banana });
  }

  function drawFruit(parent: THREE.Object3D, batch: FruitBatch): void {
    instances(parent, 'recognizable-apples', sphereGeometry, mat.fruit, batch.apples);
    instances(parent, 'fruit-stems', cylinderGeometry, mat.woodDark, batch.stems, false, true);
    instances(parent, 'little-fruit-leaves', sphereGeometry, mat.instances, batch.leaves, false, true);
    instances(parent, 'faceted-oranges', roundGeometry, mat.fruit, batch.oranges);
    instances(parent, 'pear-shaped-pears', pearsGeometry, mat.fruit, batch.pears);
    instances(parent, 'curved-bananas', bananasGeometry, mat.fruit, batch.bananas);
  }

  function crateSpecs(specs: InstanceSpec[], x: number, baseY: number, z: number, width: number, depth: number): void {
    specs.push({ position: [x, baseY + 0.03, z], scale: [width, 0.06, depth] });
    for (const side of [-1, 1]) {
      for (const y of [0.12, 0.25]) {
        specs.push({ position: [x, baseY + y, z + side * depth / 2], scale: [width, 0.07, 0.045] });
        specs.push({ position: [x + side * width / 2, baseY + y, z], scale: [0.045, 0.07, depth] });
      }
      for (const other of [-1, 1]) {
        specs.push({ position: [x + side * width / 2, baseY + 0.18, z + other * depth / 2], scale: [0.055, 0.36, 0.055] });
      }
    }
  }

  function addMainCart(): THREE.Group {
    const cart = new THREE.Group();
    cart.name = 'market-produce-cart';
    cart.position.set(0, 0.065, 0.9);
    stalls.add(cart);
    box(cart, 'cart-deck', mat.woodDark, [0, 0.73, 0], [2.95, 0.16, 1.36]);
    const cartBoards: InstanceSpec[] = [];
    for (const side of [-1, 1]) for (const y of [0.86, 1.02, 1.18]) {
      cartBoards.push({ position: [0, y, side * 0.65], scale: [2.9, 0.115, 0.07] });
    }
    for (const x of [-1.41, 1.41]) for (const z of [-0.64, 0.64]) {
      cartBoards.push({ position: [x, 1.02, z], scale: [0.08, 0.63, 0.08] });
    }
    instances(cart, 'cart-wooden-slats', boxGeometry, mat.wood, cartBoards);
    instances(cart, 'two-cart-handles', boxGeometry, mat.woodDark, [-1.19, 1.19].map((x): InstanceSpec => ({
      position: [x, 0.76, 1.27], scale: [0.065, 0.075, 1.38], rotation: [-0.10, 0, 0],
    })));

    const wheelSpecs: InstanceSpec[] = [], hubs: InstanceSpec[] = [], spokes: InstanceSpec[] = [];
    for (const x of [-1.05, 1.05]) for (const z of [-0.70, 0.72]) {
      wheelSpecs.push({ position: [x, 0.37, z], scale: [1, 1, 1] });
      hubs.push({ position: [x, 0.37, z + Math.sign(z) * 0.025], scale: [0.07, 0.12, 0.07], rotation: [Math.PI / 2, 0, 0] });
      for (let spoke = 0; spoke < 3; spoke++) {
        spokes.push({ position: [x, 0.37, z], scale: [0.027, 0.49, 0.026], rotation: [0, 0, spoke / 3 * Math.PI] });
      }
    }
    instances(cart, 'four-wooden-cart-wheels', wheelGeometry, mat.woodDark, wheelSpecs);
    instances(cart, 'cart-wheel-hubs', cylinderGeometry, mat.gold, hubs);
    instances(cart, 'cart-wheel-spokes', boxGeometry, mat.woodLight, spokes);

    const crateBoards: InstanceSpec[] = [];
    for (const x of [-0.94, 0, 0.94]) crateSpecs(crateBoards, x, 0.84, 0, 0.80, 0.82);
    instances(cart, 'three-open-wooden-produce-crates', boxGeometry, mat.woodLight, crateBoards);
    const fruit = fruitBatch();
    apple(fruit, -1.13, 1.19, 0.16);
    apple(fruit, -0.82, 1.18, 0.18, 0.14, 0xd27965);
    apple(fruit, -1.02, 1.28, -0.10, 0.14);
    apple(fruit, -0.72, 1.24, -0.13, 0.125);
    orange(fruit, -0.20, 1.20, 0.16);
    orange(fruit, 0.10, 1.20, 0.18);
    orange(fruit, 0.26, 1.19, -0.03);
    orange(fruit, -0.08, 1.31, -0.09, 0.14);
    pear(fruit, 0.73, 1.26, 0.13, -0.3);
    pear(fruit, 1.08, 1.25, 0.14, 0.5);
    pear(fruit, 0.91, 1.28, -0.13, 0.2);
    banana(fruit, 1.01, 1.15, -0.28, 0.25);
    banana(fruit, 0.85, 1.18, -0.23, -0.18);
    drawFruit(cart, fruit);

    const awningSupports: InstanceSpec[] = [];
    for (const x of [-1.50, 1.50]) for (const z of [-0.60, 0.66]) {
      awningSupports.push({ position: [x, 1.56, z], scale: [0.035, 1.91, 0.035] });
    }
    instances(cart, 'four-awning-supports', cylinderGeometry, mat.woodDark, awningSupports);
    mesh(cart, 'cream-sage-striped-awning', geometry(stripedCanopyGeometry(3.28, 11, 2.77, 2.40, 0, 0.99, -0.92, 0.20)),
      mat.cloth, [0, 0, 0]);
    mesh(cart, 'pink-cream-striped-tablecloth', geometry(stripedPanelGeometry(2.77, 9, 1.255, 0.83, 0.703, C.pinkLight, C.cream)),
      mat.cloth, [0, 0, 0]);
    return cart;
  }

  function addSideStallAndBaskets(): void {
    const side = new THREE.Group();
    side.name = 'small-stripy-side-stall';
    side.position.set(-2.65, 0.065, -1.25);
    stalls.add(side);
    box(side, 'side-stall-table', mat.wood, [0, 0.84, 0], [1.55, 0.13, 0.84]);
    const legs: InstanceSpec[] = [], posts: InstanceSpec[] = [], crates: InstanceSpec[] = [];
    for (const x of [-0.64, 0.64]) for (const z of [-0.30, 0.30]) {
      legs.push({ position: [x, 0.43, z], scale: [0.075, 0.82, 0.075] });
      posts.push({ position: [x * 1.13, 1.40, z], scale: [0.027, 1.63, 0.027] });
    }
    instances(side, 'side-stall-legs', boxGeometry, mat.woodDark, legs);
    instances(side, 'side-awning-posts', cylinderGeometry, mat.woodDark, posts);
    crateSpecs(crates, -0.36, 0.90, 0, 0.63, 0.61);
    crateSpecs(crates, 0.36, 0.90, 0, 0.63, 0.61);
    instances(side, 'side-stall-crates', boxGeometry, mat.woodLight, crates);
    mesh(side, 'small-striped-awning', geometry(stripedCanopyGeometry(1.90, 7, 2.35, 2.12, 0, 0.61, -0.55, 0.16)),
      mat.cloth, [0, 0, 0]);
    const sideFruit = fruitBatch();
    pear(sideFruit, -0.48, 1.24, 0.09, 0.4);
    pear(sideFruit, -0.20, 1.24, 0.06, -0.2);
    apple(sideFruit, 0.22, 1.20, 0.09, 0.12);
    apple(sideFruit, 0.48, 1.20, 0.03, 0.13);
    orange(sideFruit, 0.38, 1.25, -0.15, 0.12);
    drawFruit(side, sideFruit);

    const basketSpecs: InstanceSpec[] = [], basketRims: InstanceSpec[] = [], basketHandles: InstanceSpec[] = [];
    const basketPositions: Vec3[] = [[2.25, 0.24, 1.65], [2.62, 0.24, 0.90], [-2.20, 0.24, 1.55]];
    basketPositions.forEach((position) => {
      basketSpecs.push({ position, scale: [0.34, 0.34, 0.34] });
      basketRims.push({ position: [position[0], position[1] + 0.17, position[2]], scale: [0.35, 0.35, 0.35], rotation: [Math.PI / 2, 0, 0] });
      basketHandles.push({ position: [position[0], position[1] + 0.17, position[2]], scale: [0.34, 0.34, 0.34] });
    });
    instances(stalls, 'three-wicker-produce-baskets', potGeometry, mat.wood, basketSpecs);
    instances(stalls, 'woven-basket-rims', ringGeometry, mat.woodLight, basketRims);
    instances(stalls, 'arched-basket-handles', handleGeometry, mat.woodLight, basketHandles);
    const groundFruit = fruitBatch();
    apple(groundFruit, 2.12, 0.48, 1.67, 0.13);
    apple(groundFruit, 2.35, 0.48, 1.64, 0.13, 0xd27c65);
    apple(groundFruit, 2.23, 0.59, 1.55, 0.12);
    orange(groundFruit, 2.49, 0.48, 0.91, 0.13);
    orange(groundFruit, 2.71, 0.48, 0.88, 0.13);
    orange(groundFruit, 2.61, 0.59, 0.79, 0.12);
    banana(groundFruit, -2.29, 0.46, 1.55, 0.25);
    banana(groundFruit, -2.13, 0.50, 1.52, -0.25);
    banana(groundFruit, -2.19, 0.54, 1.62, 0.45);
    drawFruit(stalls, groundFruit);

    const groundCrates: InstanceSpec[] = [];
    crateSpecs(groundCrates, 2.48, 0.065, -0.25, 0.83, 0.70);
    crateSpecs(groundCrates, -3.04, 0.065, 0.18, 0.72, 0.64);
    instances(stalls, 'spare-market-crates', boxGeometry, mat.woodLight, groundCrates);
    const traderAnchor = new THREE.Object3D();
    traderAnchor.name = 'market-trader-anchor';
    traderAnchor.position.set(2.15, 0.065, 0.35);
    stalls.add(traderAnchor);
  }

  function addBunting(): void {
    const festive = new THREE.Group();
    festive.name = 'gentle-linen-bunting';
    group.add(festive);
    const left = new THREE.Vector3(-4.15, 3.28, -4.15), right = new THREE.Vector3(4.15, 3.28, -4.15);
    const middle = new THREE.Vector3(0, 2.91, -4.15);
    const curve = new THREE.CatmullRomCurve3([left, middle, right]);
    mesh(festive, 'bunting-cord', geometry(new THREE.TubeGeometry(curve, 30, 0.012, 4, false)), mat.woodDark, [0, 0, 0], undefined, undefined, false);
    const flagVertices: Vec3[] = [], flagColors: number[] = [], bases: number[] = [], phases: number[] = [];
    const count = 13;
    for (let flag = 0; flag < count; flag++) {
      const t0 = 0.06 + flag * 0.88 / count;
      const t1 = t0 + 0.044;
      const a = curve.getPoint(t0), b = curve.getPoint(t1);
      const bottom = a.clone().lerp(b, 0.5);
      bottom.y -= 0.34;
      const colors = [C.sage, C.pinkLight, C.cream, C.sageLight];
      flagVertices.push(a.toArray(), b.toArray(), bottom.toArray());
      flagColors.push(colors[flag % colors.length]);
      bases.push(bottom.x, bottom.y, bottom.z);
      phases.push(flag * 0.73);
    }
    const flags = geometry(trianglesGeometry(flagVertices, flagColors));
    const position = flags.getAttribute('position') as THREE.Float32BufferAttribute;
    position.setUsage(THREE.DynamicDrawUsage);
    mesh(festive, 'thirteen-cloth-pennants', flags, mat.cloth, [0, 0, 0], undefined, undefined, false);
    animatedFlags.push({ positions: position, bases, phases });
    instances(festive, 'bunting-posts', cylinderGeometry, mat.woodDark, [-4.15, 4.15].map((x): InstanceSpec => ({
      position: [x, 1.67, -4.15], scale: [0.04, 3.24, 0.04],
    })));
    instances(festive, 'bunting-post-finials', sphereGeometry, mat.gold, [-4.15, 4.15].map((x): InstanceSpec => ({
      position: [x, 3.33, -4.15], scale: [0.075, 0.075, 0.075],
    })));
  }

  addPlaza();
  addTown();
  const cathedral = addCathedral();
  group.add(stalls);
  addMainCart();
  addSideStallAndBaskets();
  addBunting();

  const hemisphere = new THREE.HemisphereLight(0xe0edf3, 0x71898b, 1.65);
  hemisphere.name = 'market-soft-sky';
  group.add(hemisphere);
  lights.push(hemisphere);
  const sun = new THREE.DirectionalLight(0xffe4c2, 2.55);
  sun.name = 'market-warm-key';
  sun.position.set(-7, 12, 8);
  sun.target.position.set(0, 0, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.025;
  group.add(sun, sun.target);
  lights.push(sun);
  const fill = new THREE.DirectionalLight(0xdde8dc, 0.48);
  fill.name = 'market-sage-fill';
  fill.position.set(7, 5, 2);
  group.add(fill);
  lights.push(fill);

  group.userData.bounds = MARKET_ENVIRONMENT_BOUNDS;
  group.userData.cameras = MARKET_ENVIRONMENT_CAMERAS;
  group.userData.traderAnchor = 'market-trader-anchor';
  group.updateMatrixWorld(true);

  function update(time: number): void {
    if (disposed) return;
    const t = Number.isFinite(time) ? time : 0;
    for (const flag of animatedFlags) {
      for (let index = 0; index < flag.phases.length; index++) {
        const offset = index * 9 + 6;
        flag.positions.array[offset] = flag.bases[index * 3];
        flag.positions.array[offset + 1] = flag.bases[index * 3 + 1] + Math.cos(t * 1.15 + flag.phases[index]) * 0.018;
        flag.positions.array[offset + 2] = flag.bases[index * 3 + 2] + Math.sin(t * 1.35 + flag.phases[index]) * 0.075;
      }
      flag.positions.needsUpdate = true;
    }
  }

  update(0);
  return {
    group,
    cathedral,
    stalls,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      for (const light of lights) light.dispose();
      for (const value of geometries) value.dispose();
      for (const value of materials) value.dispose();
      group.clear();
      animatedFlags.length = 0;
    },
  };
}
