import * as THREE from 'three';
import type { PlantRig } from './rig';

// A placeholder plant from primitives, so Home works before the real rig lands. Not grey, never droops.

const C = {
  pot: '#d8936f', potRim: '#e7a982', soil: '#6b4e3d', stem: '#4f9a63', leaf: '#62b57a', leaf2: '#7fc98f',
  bud: '#e8c9f2', budGlow: '#c79be0', can: '#8fb6cf', canDark: '#6f9ab6', water: '#9fd3ea',
};

const soft = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(40,70,55,0.42)'); r.addColorStop(1, 'rgba(40,70,55,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createPlaceholderRig(): PlantRig {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  group.add(new THREE.HemisphereLight('#f4fff9', '#efe2bf', 1.6));
  const sun = new THREE.DirectionalLight('#fff6e8', 1.5); sun.position.set(2, 4, 3); group.add(sun);

  // ground shadow, stays on the ground while the plant floats
  const shadowMat = keep(new THREE.MeshBasicMaterial({ map: keep(shadowTexture()), transparent: true, depthWrite: false }));
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.4, 1.4)), shadowMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.32; group.add(shadow);

  const plant = new THREE.Group(); group.add(plant);
  const pot = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.36, 0.27, 0.5, 40)), keep(soft(C.pot)));
  pot.position.y = 0.25; plant.add(pot);
  const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(0.36, 0.045, 12, 40)), keep(soft(C.potRim)));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.5; plant.add(rim);
  const soil = new THREE.Mesh(keep(new THREE.CircleGeometry(0.34, 32)), keep(soft(C.soil, { roughness: 1 })));
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.47; plant.add(soil);

  const crown = new THREE.Group(); crown.position.y = 0.47; plant.add(crown);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.4, 0),
    new THREE.Vector3(-0.04, 0.8, 0.02), new THREE.Vector3(0.02, 1.1, 0)]);
  crown.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 24, 0.028, 8)), keep(soft(C.stem))));
  const leafGeo = keep(new THREE.SphereGeometry(0.5, 20, 12));
  const leafMats = [keep(soft(C.leaf)), keep(soft(C.leaf2))];
  const leaves: THREE.Mesh[] = [];
  [[0.3, 0.6, 0.0, 0.26], [0.55, -0.7, 2.3, 0.3], [0.78, 0.65, 4.4, 0.24], [0.95, -0.55, 1.2, 0.2]].forEach(([y, side, yaw, s], k) => {
    const p = curve.getPointAt(y / 1.1);
    const leaf = new THREE.Mesh(leafGeo, leafMats[k % 2]);
    leaf.scale.set(s, s * 0.16, s * 0.48);
    const holder = new THREE.Group(); holder.position.copy(p); holder.rotation.y = yaw;
    leaf.position.x = side > 0 ? s * 0.5 : -s * 0.5; leaf.rotation.z = side > 0 ? 0.35 : -0.35;
    holder.add(leaf); crown.add(holder); leaves.push(leaf);
  });
  const budMat = keep(soft(C.bud, { emissive: C.budGlow, emissiveIntensity: 0.35, roughness: 0.6 }));
  const bud = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 24, 16)), budMat);
  bud.position.copy(curve.getPointAt(1)); bud.position.y += 0.06; crown.add(bud);

  // the can: above and to the right, spout toward the plant (-x); it tips about its own centre
  const can = new THREE.Group(); can.position.set(0.95, 1.55, 0.1); group.add(can);
  const canMat = keep(soft(C.can, { roughness: 0.7 })), canDark = keep(soft(C.canDark, { roughness: 0.7 }));
  const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.22, 0.34, 32)), canMat); can.add(body);
  const spout = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.045, 0.42, 12)), canDark);
  spout.position.set(-0.3, 0.06, 0); spout.rotation.z = 1.05; can.add(spout);
  const handle = new THREE.Mesh(keep(new THREE.TorusGeometry(0.13, 0.025, 8, 24, Math.PI)), canDark);
  handle.position.set(0.17, 0.05, 0); handle.rotation.z = -Math.PI / 2; can.add(handle);
  const tip = new THREE.Object3D(); tip.position.set(-0.48, 0.17, 0); can.add(tip);

  // water drops, instanced, only while pouring
  const N = 36;
  const drops = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.022, 8, 6)),
    keep(new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.2, transparent: true, opacity: 0.85 })), N);
  drops.frustumCulled = false; group.add(drops);
  const dropP = Array.from({ length: N }, () => new THREE.Vector3(0, -99, 0));
  const dropV = Array.from({ length: N }, () => new THREE.Vector3());
  const m = new THREE.Matrix4(), tipW = new THREE.Vector3();
  let next = 0, emitAcc = 0;

  let pouring = false, tilt = 0, glow = 0, lift = 0, watered = false;

  return {
    group,
    hitTargets: [pot, crown, can],
    setPouring(on) { pouring = on; },
    celebrate() { glow = 1; lift = 1; },
    setWatered(w) { watered = w; },
    update(dt, t) {
      const float = Math.sin(t * 0.7) * 0.045;
      plant.position.y = float + lift * 0.08;
      plant.rotation.z = Math.sin(t * 0.45) * 0.025;
      crown.rotation.z = Math.sin(t * 0.9 + 1) * 0.03;
      leaves.forEach((l, k) => { l.rotation.x = Math.sin(t * 1.1 + k) * 0.06; });
      shadow.scale.setScalar(1 - float * 0.8);
      shadowMat.opacity = 0.9 - float * 2;
      lift = Math.max(0, lift - dt * 0.9);
      glow = Math.max(0, glow - dt * 0.6);
      budMat.emissiveIntensity = (watered ? 0.55 : 0.35) + glow * 0.9 + Math.sin(t * 1.6) * 0.06;
      tilt += ((pouring ? 1 : 0) - tilt) * Math.min(1, dt * 7);
      can.position.y = 1.55 + Math.sin(t * 0.7 + 1.4) * 0.035 - tilt * 0.12;
      can.position.x = 0.95 - tilt * 0.22;
      can.rotation.z = tilt * 0.75;
      // drops
      can.updateMatrixWorld(); tip.getWorldPosition(tipW); group.worldToLocal(tipW);
      if (pouring && tilt > 0.55) {
        emitAcc += dt * 70;
        while (emitAcc > 1) {
          emitAcc -= 1; const k = next++ % N;
          dropP[k].copy(tipW).add(new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03));
          dropV[k].set(-0.35 + Math.random() * 0.1, -0.2, 0);
        }
      }
      for (let k = 0; k < N; k++) {
        const p = dropP[k];
        if (p.y > -50) {
          dropV[k].y -= 4.5 * dt; p.addScaledVector(dropV[k], dt);
          if (p.y < 0.5 + plant.position.y) p.y = -99;
        }
        m.makeTranslation(p.x, p.y, p.z); drops.setMatrixAt(k, m);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
    dispose() { disposables.forEach(d => d.dispose()); },
  };
}
