// The card stack is derived from the event log, never stored on its own. Events (all append-only):
//   card_created         {id, text, mood, photo?, seed?}
//   card_photo_attached  {id, photo}
//   card_text_edited     {id, from, to}           the original text stays in the log
//   card_mood_changed    {id, from, to}
//   card_reply_received  {id, reply, flagged, source}   only the FIRST one counts: a reply never changes
import { log, readLog, localDate } from '../state';
import type { Mood } from './moods';

export interface Card {
  id: string; text: string; mood: Mood; photo: string | null; seed: boolean; created: number;
  reply: string | null; flagged: boolean;
}

export function cards(): Card[] {
  const out: Card[] = [];
  const by = new Map<string, Card>();
  for (const e of readLog()) {
    const p = (e.payload || {}) as any;
    if (e.type === 'card_created') {
      const c: Card = { id: p.id, text: p.text || '', mood: p.mood ?? null, photo: p.photo || null, seed: !!p.seed,
        created: e.t, reply: null, flagged: false };
      by.set(c.id, c); out.push(c);
      continue;
    }
    const c = by.get(p.id);
    if (!c) continue;
    if (e.type === 'card_photo_attached') c.photo = p.photo;
    else if (e.type === 'card_text_edited') c.text = p.to ?? '';
    else if (e.type === 'card_mood_changed') c.mood = p.to ?? null;
    else if (e.type === 'card_reply_received' && c.reply === null) { c.reply = p.reply; c.flagged = !!p.flagged; }
  }
  return out;
}

export const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** a card the person added today (seed cards do not count) */
export function addedToday(): boolean {
  const today = localDate();
  return cards().some(c => !c.seed && localDate(new Date(c.created)) === today);
}

export const SEED_PHOTO = 'seed:river';

/** the three demo cards, written into the log once, oldest first */
export function seedOnce(): void {
  if (readLog().some(e => e.type === 'reflect_seeded')) return;
  const seeds: [string, string, Mood, string | null, string, boolean][] = [
    ['seed-1', 'Slept badly, but I made it out for the walk anyway.', 1, null, 'You went out even though the night was rough.', false],
    ['seed-2', 'Everything feels pointless tonight.', 0, null, 'That is a heavy thing to carry, and you wrote it down.', true],
    ['seed-3', 'Walked the long way home. The river had ice on the edges.', 3, SEED_PHOTO, 'You took the long way and noticed the ice.', false],
  ];
  for (const [id, text, mood, photo, reply, flagged] of seeds) {
    log('card_created', { id, text, mood, seed: true, ...(photo ? { photo } : {}) });
    if (photo) log('card_photo_attached', { id, photo, seed: true });
    log('card_reply_received', { id, reply, flagged, source: 'seed', seed: true });
  }
  log('reflect_seeded', { cards: seeds.length });
}

// Placeholders until the plan maker exists (Toolkit). Clearly fake on purpose.
export const PLAN_STUB = {
  firstLine: 'When the evening gets heavy, I put my shoes on and step outside for ten minutes.',
  person: 'Aino',
};
