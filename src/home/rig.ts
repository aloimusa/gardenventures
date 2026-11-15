import type * as THREE from 'three';
import type { OrnamentId } from '../market/model';

export type RigPoint = [number, number, number];

export interface RigSnapshot {
  age: number;
  targetAge: number;
  growing: boolean;
  canVisible: boolean;
  canScale: number;
  canPosition: RigPoint;
  canOrigin: RigPoint;
  arcPosition: RigPoint;
  spoutPosition: RigPoint;
  handlePosition: RigPoint;
  waterTarget: RigPoint;
  outletDirection: RigPoint;
  outletAimDot: number;
  canUp: number;
  bodyUpDirection: RigPoint;
  lastDropOrigin: RigPoint | null;
  flowing: boolean;
  drops: number;
  ornament: OrnamentId | null;
  ornamentMeshes: number;
}

/**
 * The handoff between Home's logic and whatever draws the plant. Home owns the renderer, camera, hold logic and
 * texts; a rig owns everything visible: plant, pot, can, water, its own lights and ground shadow.
 * Origin at the pot base, +y up, the camera looks down -z. The orchid is the only live rig.
 */
export interface PlantRig {
  group: THREE.Group;                       // plant + pot + can (+ lights, shadow), origin at the pot base
  update(dt: number, t: number): void;      // idle float/sway, growth and pour animation; dt and t in seconds
  setHolding(on: boolean, origin?: THREE.Vector3): void; // the can exists only during a hold
  moveHold(horizontal: number): void;       // 0..1 across Home, mapped onto the can's arc
  setPouring(on: boolean): void;            // actual water flow; Home gates it separately from the can
  celebrate(): void;                        // animate the successful watering's one-day growth preview
  setWatered(watered: boolean): void;       // steady state for a day already watered
  setOrnament(id: OrnamentId | null): void;    // one owned Market decoration, visibly attached to the pot/plant
  refresh(): void;                          // advance calendar-driven geometry after midnight or a skipped day
  snapshot(): RigSnapshot;                  // deterministic visual/interaction state for focused checks
  hitTargets: THREE.Object3D[];             // geometry used to frame the scene; Home's whole stage starts a hold
  dispose(): void;
}
