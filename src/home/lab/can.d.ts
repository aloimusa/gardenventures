// Types for the lab snapshot can.js (ours; sync-lab never overwrites .d.ts files).
import type * as THREE from 'three';
export function createWateringCan(): {
  group: THREE.Group; dropRoot: THREE.Group;
  update(dt: number, t: number, o: { pouring: boolean; aim: THREE.Vector3; splashY: number; onSplash?: (p: THREE.Vector3) => void }): void;
};
