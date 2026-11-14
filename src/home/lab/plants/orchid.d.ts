// Types for the lab snapshot plants/orchid.js (ours; sync-lab never writes .d.ts files).
import type * as THREE from 'three';
export const name: string;
export function create(seed?: number): {
  group: THREE.Group; body: THREE.Group; name: string; LOOP_START: number; LOOP: number;
  set(o: { age: number; mood: number }): void;
  update(dt: number, t: number, o?: { perk?: number; mood?: number }): void;
  attachPoints(): { kind: string; object: THREE.Object3D; local: THREE.Vector3 }[];
};
