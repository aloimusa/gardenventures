// Types for the lab snapshot plant.js (ours; sync-lab never overwrites .d.ts files).
import type * as THREE from 'three';
export function createHomePlant(): {
  group: THREE.Group; update(dt: number, t: number): void; water(amount?: number): void; setWatered(): void;
  readonly hydration: number; top: THREE.Vector3; splashY: number;
};
