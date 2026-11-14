import type * as THREE from 'three';

/**
 * The handoff between Home's logic and whatever draws the plant. Home owns the renderer, camera, hold logic and
 * texts; a rig owns everything visible: plant, pot, can, water, its own lights and ground shadow.
 * Origin at the pot base, +y up, the camera looks down -z. Pick the live rig in ONE line of ./index.ts.
 */
export interface PlantRig {
  group: THREE.Group;                       // plant + pot + can (+ lights, shadow), origin at the pot base
  update(dt: number, t: number): void;      // idle float/sway, pour animation; dt and t in seconds
  setPouring(on: boolean): void;            // can tips, water falls while true
  celebrate(): void;                        // the visible response when today's watering completes
  setWatered(watered: boolean): void;       // steady state for a day already watered
  hitTargets: THREE.Object3D[];             // what counts as "on the plant or can" (generous)
  dispose(): void;
}
