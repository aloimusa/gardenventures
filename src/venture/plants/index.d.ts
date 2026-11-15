import type * as THREE from 'three';

export type VenturePlantId = 'banana' | 'strawberry' | 'apple' | 'mandarin' | 'mango' | 'blueberry' | 'pear' | 'tomato' | 'eggplant';

/** The standalone packs intentionally expose scenery only. Inputs and rewards never depend on fruit meshes. */
export interface VenturePlantModel {
  group: THREE.Group;
  dispose(): void;
}

export interface VenturePlantDefinition {
  id: VenturePlantId;
  name: string;
  category: 'tree' | 'plant';
  create(seed?: number): VenturePlantModel;
}

export const VENTURE_PLANTS: readonly VenturePlantDefinition[];
export function createPlant(id: VenturePlantId, seed?: number): VenturePlantModel;

export function createBanana(seed?: number): VenturePlantModel;
export function createStrawberry(seed?: number): VenturePlantModel;
export function createApple(seed?: number): VenturePlantModel;
export function createMandarin(seed?: number): VenturePlantModel;
export function createMango(seed?: number): VenturePlantModel;
export function createBlueberry(seed?: number): VenturePlantModel;
export function createPear(seed?: number): VenturePlantModel;
export function createTomato(seed?: number): VenturePlantModel;
export function createEggplant(seed?: number): VenturePlantModel;
