import * as THREE from 'three';
import { ORNAMENTS, type OrnamentId } from './ornamentCatalog';

export interface HomeOrnament {
  group: THREE.Group;
  meshes: number;
  dispose(): void;
}

/** The catalog owns each original design; this adapter keeps the rig's small, stable decoration interface. */
export function createHomeOrnament(id: OrnamentId): HomeOrnament {
  const design = ORNAMENTS.find(item => item.id === id) ?? ORNAMENTS[0];
  const instance = design.create();
  let meshes = 0;
  instance.group.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes++; });
  return {
    group: instance.group,
    meshes,
    dispose: () => instance.dispose(),
  };
}
