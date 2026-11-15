// Moods: 0 Bad, 1 Not great, 2 Okay, 3 Good; null = none. The card colour and the face's mouth always agree, so
// colour is never the only cue.
export type Mood = 0 | 1 | 2 | 3 | null;

export const MOOD_NAME = ['Bad', 'Not great', 'Okay', 'Good'] as const;
export const MOOD_COLOUR = ['#aebfd9', '#d3dcea', '#f6e7cf', '#f2c88f'] as const;
export const NO_MOOD_COLOUR = '#e6e9e6';
export const NO_MOOD_RULE = '#cfd6d2';

// null is reserved for historical log records: neutral grey and explicit wording, never an invented mood.
export const moodName = (m: Mood) => (m === null ? 'No mood recorded' : MOOD_NAME[m]);
export const moodColour = (m: Mood) => (m === null ? NO_MOOD_COLOUR : MOOD_COLOUR[m]);
export const nextMood = (m: Mood): Mood => (m === null ? 0 : ((m + 1) % 4) as Mood);

// The prototype's face (Amit's primitives page): 32-unit box, r 13, stroke 2, short vertical eyes.
const MOUTH = ['M11 22.5q5-5 10 0', 'M11 21.5q5-2 10 0', 'M11 20q5 2.5 10 0', 'M10.5 19.5q5.5 6 11 0'];
/** a face whose mouth shows the mood; no mood = no mouth */
export function faceSvg(m: Mood, size = 26): string {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="13"/><path d="M11.5 13v1M20.5 13v1"/>` +
    (m === null ? '' : `<path d="${MOUTH[m]}"/>`) + '</svg>';
}

export const CAMERA_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
