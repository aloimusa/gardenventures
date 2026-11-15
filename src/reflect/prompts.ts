// A small, fixed invitation deck. The local (including demo-offset) date and the persisted shuffle count select
// a prompt; a prompt is never a task and completing or ignoring it is not tracked.
export type PromptKind = 'photo' | 'write';
export interface DailyPrompt { id: string; kind: PromptKind; text: string }

export const PHOTO_PROMPTS = [
  'Take a picture of something blue.',
  'Take a picture of something green.',
  'Take a picture of something round.',
  'Take a picture of something older than you.',
  'Take a picture of the light where you are right now.',
  'Take a picture of what you see from the nearest window.',
  'Take a picture of something you used today.',
  'Take a picture of something soft.',
  'Take a picture of the smallest thing on the table.',
  'Take a picture of something that is yours.',
  'Take a picture of something growing.',
  'Take a picture of your cup.',
] as const;

export const WRITE_PROMPTS = [
  'One thing you ate today.',
  'Something you heard today.',
  'Where did you sit the longest?',
  'Something you moved or carried.',
  'One thing that took effort.',
  'Who did you see or hear from?',
  'Something you finished, however small.',
  'What is the weather doing?',
  'One thing you put off.',
  'Something you looked at for a while.',
  'The last thing that made a sound near you.',
  'One thing you would do again tomorrow.',
] as const;

const slug = (text: string, kind: PromptKind, index: number) =>
  `${kind}-${index + 1}-${text.replace(/^Take a picture of |^One thing |^Something /, '').replace(/[^a-z]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;

/** The deck order is part of the contract: do not shuffle the source arrays. */
export const PROMPTS: readonly DailyPrompt[] = [
  ...PHOTO_PROMPTS.map((text, i) => ({ id: slug(text, 'photo', i), kind: 'photo' as const, text })),
  ...WRITE_PROMPTS.map((text, i) => ({ id: slug(text, 'write', i), kind: 'write' as const, text })),
];

const BY_ID = new Map(PROMPTS.map(prompt => [prompt.id, prompt]));
export const MAX_SHUFFLES = 3;

/** FNV-1a, stable across browsers and launches. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function promptForDate(date: string, shuffles = 0): DailyPrompt {
  const base = hash(date) % PROMPTS.length;
  // Five is coprime with 24, so all four daily choices are different without storing a history of views.
  const count = Math.max(0, Math.min(MAX_SHUFFLES, Math.trunc(shuffles) || 0));
  return PROMPTS[(base + count * 5) % PROMPTS.length]!;
}

export function promptById(id: string | null | undefined): DailyPrompt | null {
  return id ? BY_ID.get(id) ?? null : null;
}
