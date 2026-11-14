// Adapter: the model agent's Home plant (lab snapshot, see SOURCE.json) behind our PlantRig interface.
// Its plant droops as hydration decays; the spec says the plant can never wilt, so hydration is pinned at full
// on every frame. Its can waits far above the frame between pours; here the aim is shifted so it rests in view,
// above and to the right. Its materials are made for a dark page, so it gets our light set for the light gradient.
import * as THREE from 'three';
import type { PlantRig } from '../rig';
import { createHomePlant } from './plant.js';
import { createWateringCan } from './can.js';

export function createLabRig(): PlantRig {
  const group = new THREE.Group();
  group.add(new THREE.HemisphereLight(0xeaf6f1, 0xf0e3c8, 1.5));
  const key = new THREE.DirectionalLight(0xfff0dc, 1.8);
  key.position.set(-2.5, 5, 4);
  group.add(key);
  const plant = createHomePlant();
  const can = createWateringCan();
  group.add(plant.group, can.group, can.dropRoot);
  let pouring = false;
  const aim = new THREE.Vector3();
  const REST = new THREE.Vector3(0.85, 2.1, 0.3);            // where the can should rest, in view
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const plantHit = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.9, 10), hitMat);
  plantHit.position.y = 0.8;
  const canHit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), hitMat);
  canHit.position.copy(REST).add(new THREE.Vector3(0.2, -0.35, 0));
  group.add(plantHit, canHit);
  return {
    group,
    update(dt, t) {
      plant.water(1);                                          // pinned: never thirsty, never drooping
      plant.update(dt, t);
      if (pouring) aim.copy(plant.group.position).add(plant.top);
      else aim.copy(REST).sub(new THREE.Vector3(0.6, 4.5, 0.3)); // can.js rests at aim + (0.6, 4.5, 0.3)
      can.update(dt, t, { pouring, aim, splashY: plant.splashY, onSplash: () => {} });
    },
    setPouring(on) { pouring = on; },
    celebrate() { plant.setWatered(); },
    setWatered() { /* the lab plant has no separate steady state beyond full hydration */ },
    hitTargets: [plantHit, canHit],
    dispose() { group.removeFromParent(); hitMat.dispose(); },
  };
}
