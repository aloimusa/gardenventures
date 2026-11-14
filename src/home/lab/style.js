// Shared look: palette, materials, seeded random. Every model pulls from here so the garden reads as one set.
import * as THREE from 'three';

export const palette = {
  soil: 0x4a3328, soilDark: 0x33231b, moss: 0x5f9a62, mossDark: 0x3f7a4a,
  leaf: 0x6fcf8a, leafDeep: 0x3f9a5e, leafPale: 0xb6f0c4,
  stem: 0x4f8f5c,
  bulb: 0xc9b3ff, bulbCore: 0xfff2c8, mote: 0xfff6d2,
  can: 0x7f9ba3, canDark: 0x5c7079, water: 0x8fd3ff,
  bark: 0x6b4a33, barkDark: 0x4e3524,
  canopyA: 0x5fb36d, canopyB: 0x4a9a5c, canopyC: 0x8fcf6a,
  apple: 0xe8433a, appleShine: 0xff8a7a, appleStem: 0x5a3b26,
  // plant candidates
  discYellow: 0xf2c53d, straw: 0xb59a5a, wood: 0x6e5240, root: 0x9fb39a,
  cosmosPink: 0xf08ab0, cosmosWhite: 0xfff3f6, cosmosMagenta: 0xd9478a,
  orchidWhite: 0xfbf4ff, orchidLilac: 0xd9b8f0, orchidLip: 0xc23d7d,
  camellia: 0xe0526a, camelliaInner: 0xf2a2b0, glossy: 0x2f7a46,
};

// Flat-shaded, matte, slightly lifted shadows: a soft low-poly look rather than a glossy one.
export function matte(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0, flatShading: true, ...opts,
  });
}

export function glow(color, emissive, intensity = 1) {
  return new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: intensity, roughness: 0.6, flatShading: true,
  });
}

// mulberry32: a tiny seeded PRNG so a model is the same shape on every load.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Frame-rate independent ease toward a target: k is roughly "fraction per second".
export const damp = (cur, target, k, dt) => lerp(cur, target, 1 - Math.exp(-k * dt));

export function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast; mesh.receiveShadow = receive; return mesh;
}
