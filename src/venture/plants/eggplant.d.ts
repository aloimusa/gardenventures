import type * as THREE from 'three';

export interface EggplantModel {
  group: THREE.Group;
  dispose(): void;
}

export function createEggplant(seed?: number): EggplantModel;
