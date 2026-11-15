import type * as THREE from 'three';

export interface TomatoModel {
  group: THREE.Group;
  dispose(): void;
}

export function createTomato(seed?: number): TomatoModel;
