// The watering can: hovers beside the plant; while the hold is down it drifts over the plant, tips, and pours.
// Drops are a small pool of spheres with gravity; each one that falls past `splashY` calls onSplash.
// API: { group, update(dt, t, { pouring, aim: Vector3, splashY, onSplash }) }
import * as THREE from 'three';
import { palette, matte, lerp, damp } from './style.js?v=e7aa2335';

const DROPS = 48;

export function createWateringCan() {
  const group = new THREE.Group();        // world position = the handle; everything hangs from it
  const body = new THREE.Group();
  group.add(body);

  const metal = matte(palette.can, { roughness: 0.6, metalness: 0.15 });
  const dark = matte(palette.canDark, { roughness: 0.6, metalness: 0.15 });

  // body hangs below the handle, so tipping around the group origin reads as a hand tipping the can
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.34, 14), metal);
  tub.position.y = -0.36; tub.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 20), dark);
  rim.rotation.x = Math.PI / 2; rim.position.y = -0.19;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 20, Math.PI), dark);
  handle.position.y = -0.19;
  // spout: out of the tub's side, curving up and over
  const spoutPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.18, -0.46, 0), new THREE.Vector3(0.4, -0.38, 0),
    new THREE.Vector3(0.56, -0.26, 0), new THREE.Vector3(0.64, -0.22, 0),
  ]);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutPath, 12, 0.035, 8, false), metal);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.045, 0.07, 12), dark);
  rose.position.copy(spoutPath.getPointAt(1)); rose.rotation.z = -1.1;
  body.add(tub, rim, handle, spout, rose);
  const spoutTip = new THREE.Object3D();
  spoutTip.position.copy(spoutPath.getPointAt(1)).add(new THREE.Vector3(0.04, -0.02, 0));
  body.add(spoutTip);

  // drop pool
  const dropGeo = new THREE.SphereGeometry(0.028, 7, 5);
  const dropMat = new THREE.MeshStandardMaterial({ color: palette.water, emissive: palette.water, emissiveIntensity: 0.35, transparent: true, opacity: 0.85, roughness: 0.3 });
  const drops = [];
  for (let i = 0; i < DROPS; i++) {
    const d = new THREE.Mesh(dropGeo, dropMat);
    d.visible = false; d.userData.v = new THREE.Vector3();
    group.parent; drops.push(d);
  }
  const dropRoot = new THREE.Group();     // drops live in world space, not under the tilting can
  dropRoot.add(...drops);

  let tilt = 0, spawnAcc = 0;
  const restPos = new THREE.Vector3(0.78, 1.9, 0.3);    // idle: beside and above the plant, inside a portrait frame
  const tipWorld = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function update(dt, t, { pouring, aim, splashY, onSplash }) {
    // position: idle bob at rest, or over the plant while pouring
    // pouring: handle up and to the left of the bulb so the tipped spout ends above it and drops fall through the leaves
    // at rest the can waits above the frame, out of sight; it only comes down while the hold is on
    const target = pouring ? tmp.set(aim.x - 0.55, aim.y + 0.45, aim.z + 0.4) : tmp.set(aim.x + 0.6, aim.y + 4.5, aim.z + 0.3);
    group.position.x = damp(group.position.x, target.x, 5, dt);
    group.position.y = damp(group.position.y, target.y + (pouring ? 0 : Math.sin(t * 1.4) * 0.05), 5, dt);
    group.position.z = damp(group.position.z, target.z, 5, dt);
    tilt = damp(tilt, pouring ? -0.95 : 0.08, pouring ? 6 : 4, dt);
    body.rotation.z = tilt;
    group.rotation.y = -0.35;

    // spawn drops once the can has tipped enough
    const flow = Math.max(0, (-tilt - 0.45) / 0.5);     // 0..1
    if (pouring && flow > 0) {
      spawnAcc += dt * 26 * flow;
      spoutTip.getWorldPosition(tipWorld);
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const d = drops.find(x => !x.visible);
        if (!d) break;
        d.visible = true;
        d.position.copy(tipWorld);
        d.userData.v.set(-0.35 + (Math.random() - 0.5) * 0.3, -0.4 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3);
        d.scale.setScalar(0.8 + Math.random() * 0.5);
      }
    } else spawnAcc = 0;

    for (const d of drops) {
      if (!d.visible) continue;
      d.userData.v.y -= 7 * dt;
      d.position.addScaledVector(d.userData.v, dt);
      if (d.position.y < splashY) { d.visible = false; onSplash?.(d.position); }
    }
  }

  group.position.copy(restPos);
  group.scale.setScalar(0.85);
  return { group, dropRoot, update };
}
