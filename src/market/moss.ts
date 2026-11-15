import * as THREE from 'three';

export type MossExpression = 'calm' | 'hello' | 'delighted';

export interface Moss {
  group: THREE.Group;
  head: THREE.Group;
  paws: readonly [THREE.Group, THREE.Group];
  /** Absolute time in seconds. */
  update(time: number): void;
  /** Optional dialogue poses; no audio or speech assets are involved. */
  setExpression(expression: MossExpression): void;
  dispose(): void;
}

type Vec3 = [number, number, number];
type Disposable = { dispose(): void };

/**
 * Moss is an original little hazel-marten seed trader. Every geometry and material is owned by
 * this instance: live and preview characters can therefore be disposed independently.
 * Local axes: +Y is up, the face looks along +Z, and the soles rest at y = 0.
 */
export function createMoss(): Moss {
  const group = new THREE.Group();
  group.name = 'moss';
  group.userData.character = 'Moss';

  const resources = new Set<Disposable>();
  const keep = <T extends Disposable>(resource: T): T => (resources.add(resource), resource);
  const material = (color: number, roughness = 0.88) => keep(new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0, flatShading: true,
  }));

  const fur = material(0xb98256);
  const furLight = material(0xd3a171);
  const cream = material(0xf0d7ac);
  const dark = material(0x493a32, 0.76);
  const blush = material(0xc77f70);
  const sage = material(0x597d68);
  const sageLight = material(0xa9c3a2);
  const shirt = material(0xe8dfc3);
  const ochre = material(0xc5a052);
  const berry = material(0xb96760);
  const glint = material(0xfff7df, 0.65);

  const sphere = keep(new THREE.SphereGeometry(1, 12, 8));
  const cube = keep(new THREE.BoxGeometry(1, 1, 1));

  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material,
    position: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
    keep(geometry);
    const item = new THREE.Mesh(geometry, mat);
    item.position.set(...position);
    item.scale.set(...scale);
    item.rotation.set(...rotation);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }

  function ellipsoid(parent: THREE.Object3D, mat: THREE.Material, position: Vec3, scale: Vec3,
    rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
    return mesh(parent, sphere, mat, position, scale, rotation);
  }

  function block(parent: THREE.Object3D, mat: THREE.Material, position: Vec3, scale: Vec3,
    rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
    return mesh(parent, cube, mat, position, scale, rotation);
  }

  function rod(parent: THREE.Object3D, a: Vec3, b: Vec3, radius: number, mat: THREE.Material,
    sides = 6): THREE.Mesh {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const item = mesh(parent, new THREE.CylinderGeometry(radius, radius, direction.length(), sides), mat);
    item.position.copy(start).add(end).multiplyScalar(0.5);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return item;
  }

  // Feet and very short legs stay planted; only the rounded upper body idles.
  for (const side of [-1, 1]) {
    ellipsoid(group, fur, [side * 0.105, 0.18, 0], [0.088, 0.13, 0.085]);
    ellipsoid(group, furLight, [side * 0.11, 0.07, 0.055], [0.11, 0.07, 0.145]);
    for (const toe of [-1, 1]) {
      ellipsoid(group, dark, [side * 0.11 + toe * 0.027, 0.075, 0.196], [0.009, 0.012, 0.006]);
    }
  }

  const body = new THREE.Group();
  body.name = 'moss-idle-rig';
  group.add(body);
  ellipsoid(body, fur, [0, 0.42, 0], [0.31, 0.32, 0.245]);

  // A curled tail peeks around the left silhouette, rather than being hidden inside the body.
  const tail = new THREE.Group();
  tail.position.set(-0.18, 0.30, -0.17);
  body.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.14, -0.08, -0.02),
    new THREE.Vector3(-0.30, -0.04, 0.015), new THREE.Vector3(-0.32, 0.11, 0.06),
    new THREE.Vector3(-0.22, 0.16, 0.07),
  ]);
  mesh(tail, new THREE.TubeGeometry(tailCurve, 12, 0.052, 6, false), fur);
  ellipsoid(tail, furLight, [-0.22, 0.16, 0.07], [0.061, 0.067, 0.058]);

  function makeArm(side: number): { root: THREE.Group; paw: THREE.Group } {
    const root = new THREE.Group();
    root.position.set(side * 0.275, 0.565, 0.01);
    root.rotation.z = side * 0.12;
    body.add(root);
    ellipsoid(root, shirt, [side * 0.008, -0.092, 0], [0.078, 0.135, 0.075]);
    const paw = new THREE.Group();
    paw.name = side < 0 ? 'moss-left-paw' : 'moss-right-paw';
    paw.position.set(side * 0.018, -0.218, 0.06);
    root.add(paw);
    ellipsoid(paw, furLight, [0, 0, 0], [0.084, 0.071, 0.066]);
    ellipsoid(paw, cream, [0, -0.005, 0.056], [0.043, 0.033, 0.009]);
    return { root, paw };
  }
  const leftArm = makeArm(-1), rightArm = makeArm(1);

  // A stiff, extruded apron has a real front, a pocket, straps, buttons and a stitched hem.
  const apron = new THREE.Group();
  apron.name = 'moss-apron';
  apron.position.set(0, 0.605, 0.229);
  body.add(apron);
  const apronShape = new THREE.Shape();
  apronShape.moveTo(-0.115, 0);
  apronShape.lineTo(0.115, 0);
  apronShape.lineTo(0.135, -0.12);
  apronShape.lineTo(0.22, -0.36);
  apronShape.lineTo(-0.22, -0.36);
  apronShape.lineTo(-0.135, -0.12);
  apronShape.closePath();
  mesh(apron, new THREE.ExtrudeGeometry(apronShape, {
    depth: 0.018, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.007, bevelThickness: 0.005,
    curveSegments: 1,
  }), sage);
  for (const side of [-1, 1]) {
    block(body, sage, [side * 0.112, 0.558, 0.222], [0.042, 0.17, 0.016], [0, 0, side * -0.12]);
    const button = mesh(apron, new THREE.CylinderGeometry(0.016, 0.016, 0.009, 8), ochre,
      [side * 0.094, -0.036, 0.034]);
    button.rotation.x = Math.PI / 2;
  }
  block(apron, sageLight, [0, -0.205, 0.032], [0.135, 0.075, 0.014]);
  rod(apron, [-0.053, -0.167, 0.043], [0.053, -0.167, 0.043], 0.0035, cream, 4);
  rod(apron, [-0.155, -0.329, 0.031], [0.155, -0.329, 0.031], 0.003, sageLight, 4);

  const scarf = mesh(body, new THREE.TorusGeometry(0.19, 0.023, 5, 16), berry, [0, 0.635, 0]);
  scarf.rotation.x = Math.PI / 2;
  ellipsoid(body, berry, [0, 0.608, 0.215], [0.047, 0.038, 0.031]);
  mesh(body, new THREE.ConeGeometry(0.036, 0.125, 4), berry,
    [-0.029, 0.548, 0.226], [0.75, 1, 0.35], [0, 0, Math.PI - 0.20]);
  mesh(body, new THREE.ConeGeometry(0.032, 0.105, 4), berry,
    [0.031, 0.558, 0.224], [0.75, 1, 0.35], [0, 0, Math.PI + 0.20]);

  const head = new THREE.Group();
  head.name = 'moss-head';
  head.position.set(0, 0.75, 0.018);
  body.add(head);
  ellipsoid(head, fur, [0, 0, 0], [0.282, 0.245, 0.228]);

  // Asymmetric, softly tilted ears distinguish the silhouette from a round-eared mascot.
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.218, 0.135, -0.025);
    ear.rotation.z = side * -0.46;
    head.add(ear);
    ellipsoid(ear, fur, [side * 0.013, 0.025, 0], [0.098, side < 0 ? 0.15 : 0.14, 0.053]);
    ellipsoid(ear, furLight, [side * 0.016, 0.032, 0.047], [0.057, side < 0 ? 0.098 : 0.088, 0.016]);
    ears.push(ear);
  }

  ellipsoid(head, cream, [0, -0.062, 0.204], [0.151, 0.101, 0.076]);
  mesh(head, new THREE.DodecahedronGeometry(0.043, 0), dark,
    [0, -0.027, 0.279], [1.08, 0.75, 0.64]);

  const eyes: THREE.Mesh[] = [], highlights: THREE.Mesh[] = [], brows: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    eyes.push(ellipsoid(head, dark, [side * 0.102, 0.034, 0.221], [0.022, 0.028, 0.013]));
    highlights.push(ellipsoid(head, glint, [side * 0.102 - 0.005, 0.042, 0.234], [0.005, 0.006, 0.003]));
    brows.push(block(head, dark, [side * 0.103, 0.084, 0.214], [0.038, 0.007, 0.007],
      [0, 0, side * -0.10]));
    ellipsoid(head, blush, [side * 0.159, -0.052, 0.192], [0.035, 0.021, 0.009]);
  }

  const smile = new THREE.Group();
  smile.name = 'moss-smile';
  head.add(smile);
  rod(smile, [0, -0.052, 0.276], [0, -0.074, 0.276], 0.004, dark, 5);
  for (const side of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, -0.074, 0.276), new THREE.Vector3(side * 0.023, -0.101, 0.278),
      new THREE.Vector3(side * 0.046, -0.081, 0.262),
    );
    mesh(smile, new THREE.TubeGeometry(curve, 5, 0.004, 4, false), dark);
  }

  // A soft ochre gardening cap, with a brim and a tiny sage leaf tucked into its side.
  ellipsoid(head, ochre, [0, 0.193, -0.022], [0.236, 0.079, 0.192]);
  ellipsoid(head, ochre, [0, 0.159, 0.142], [0.247, 0.023, 0.108], [0.08, 0, 0]);
  ellipsoid(head, berry, [0, 0.247, 0.025], [0.018, 0.012, 0.018]);
  ellipsoid(head, sage, [0.05, 0.256, -0.016], [0.054, 0.014, 0.025], [0.1, 0.25, 0.40]);

  group.scale.setScalar(0.93);
  group.userData.meshCount = (() => {
    let count = 0;
    group.traverse(item => { if ((item as THREE.Mesh).isMesh) count++; });
    return count;
  })();

  let expression: MossExpression = 'calm';
  let disposed = false;

  function update(time: number): void {
    if (disposed || !Number.isFinite(time)) return;
    const t = time;
    body.position.y = Math.sin(t * 1.65) * 0.005;
    head.rotation.z = Math.sin(t * 0.72) * 0.021 + (expression === 'hello' ? -0.035 : 0);
    head.rotation.x = Math.sin(t * 0.91) * 0.012 + (expression === 'delighted' ? -0.025 : 0);
    ears[0]!.rotation.z = 0.46 + Math.sin(t * 1.16) * 0.032;
    ears[1]!.rotation.z = -0.43 + Math.sin(t * 1.16 + 0.8) * 0.042;
    tail.rotation.z = Math.sin(t * 1.08) * 0.035;
    apron.rotation.x = Math.sin(t * 1.65 + 0.5) * 0.009;

    const cycle = ((t + 0.4) % 4.6 + 4.6) % 4.6;
    const blink = cycle > 4.35 ? Math.max(0.12, Math.abs(Math.cos((cycle - 4.35) / 0.25 * Math.PI))) : 1;
    const eyePose = expression === 'delighted' ? 0.38 : 1;
    for (const eye of eyes) eye.scale.y = 0.028 * blink * eyePose;
    for (const highlight of highlights) highlight.visible = blink * eyePose > 0.55;
    smile.scale.set(expression === 'delighted' ? 1.16 : 1, expression === 'delighted' ? 1.28 : 1, 1);
    brows[0]!.rotation.z = expression === 'delighted' ? -0.22 : 0.10;
    brows[1]!.rotation.z = expression === 'delighted' ? 0.22 : -0.10;

    leftArm.root.rotation.z = expression === 'delighted' ? -0.53 : -0.12 + Math.sin(t * 1.65) * 0.018;
    rightArm.root.rotation.z = expression === 'hello' ? 2.28 + Math.sin(t * 4.1) * 0.12
      : expression === 'delighted' ? 0.53 : 0.12 - Math.sin(t * 1.65) * 0.018;
  }

  update(0);
  return {
    group,
    head,
    paws: [leftArm.paw, rightArm.paw],
    update,
    setExpression(next) { if (!disposed) { expression = next; update(0); } },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      resources.clear();
      group.removeFromParent();
    },
  };
}
