import { ORNAMENTS, type OrnamentId } from '../home/ornamentCatalog';

/** Small owned-list icon; Market and Home worlds themselves are live Three.js geometry, never SVG illustrations. */
export function ornamentIconSVG(id: OrnamentId): string {
  return ORNAMENTS.find(item => item.id === id)?.icon ?? ORNAMENTS[0].icon;
}
