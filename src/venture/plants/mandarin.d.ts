import type * as THREE from 'three';

export interface MandarinModel {
  group: THREE.Group;
  dispose(): void;
}

export function createMandarin(seed?: number): MandarinModel;
