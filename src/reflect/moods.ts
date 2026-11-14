// Moods: 0 Bad, 1 Not great, 2 Okay, 3 Good; null = none. The card colour and the face's mouth always agree, so
// colour is never the only cue.
export type Mood = 0 | 1 | 2 | 3 | null;

export const MOOD_NAME = ['Bad', 'Not great', 'Okay', 'Good'] as const;
export const MOOD_COLOUR = ['#aebfd9', '#d3dcea', '#f6e7cf', '#f2c88f'] as const;
export const NO_MOOD_COLOUR = '#e6e9e6';
export const NO_MOOD_RULE = '#cfd6d2';

export const moodName = (m: Mood) => (m === null ? 'No mood' : MOOD_NAME[m]);
export const moodColour = (m: Mood) => (m === null ? NO_MOOD_COLOUR : MOOD_COLOUR[m]);
export const nextMood = (m: Mood): Mood => (m === null ? 0 : ((m + 1) % 4) as Mood);

const svg = (body: string, size = 26) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const MOUTH = [
  '<path d="M8.4 16.6c1.1-1.5 2.3-2.2 3.6-2.2s2.5.7 3.6 2.2"/>',   // Bad: a clear frown
  '<path d="M8.8 16c1-.7 2.1-1 3.2-1s2.2.3 3.2 1"/>',              // Not great: a slight frown
  '<path d="M8.8 15.4h6.4"/>',                                       // Okay: level
  '<path d="M8.4 14.4c1.1 1.6 2.3 2.4 3.6 2.4s2.5-.8 3.6-2.4"/>',  // Good: a smile
];
/** a face whose mouth shows the mood; no mood = no mouth */
export function faceSvg(m: Mood, size = 26): string {
  return svg('<circle cx="12" cy="12" r="8.6"/><path d="M9.2 9.9v.2"/><path d="M14.8 9.9v.2"/>' +
    (m === null ? '' : MOUTH[m]), size);
}

export const CAMERA_SVG = svg('<path d="M4.5 8.5A1.5 1.5 0 0 1 6 7h2.2l1.4-2h4.8l1.4 2H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z"/>' +
  '<circle cx="12" cy="12.8" r="3.3"/>', 24);
