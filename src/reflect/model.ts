// The card drawer is derived from the append-only event log. Replies and links are recorded once, so editing a
// card cannot rewrite what it originally said back. Photos remain separate, on-device blobs referenced by id.
import { eventDate, log, readLog, localDate } from '../state';
import type { Mood } from './moods';

export interface Card {
  id: string;
  text: string;
  /** Missing on genuinely historical cards. The UI keeps the neutral, explicitly unrecorded appearance. */
  mood: Mood;
  prompt: string | null;
  photo: string | null;
  seed: boolean;
  created: number;
  createdOffset?: number;
  /** null means no stored reply (and, for a text card just added, possibly one in flight). */
  reply: string | null;
  replySource: string | null;
  linkId: string | null;
  flagged: boolean;
}

export function cards(): Card[] {
  const out: Card[] = [];
  const by = new Map<string, Card>();
  for (const e of readLog()) {
    const p = (e.payload || {}) as any;
    if (e.type === 'card_created') {
      if (typeof p.id !== 'string' || !p.id) continue;
      const c: Card = {
        id: p.id, text: typeof p.text === 'string' ? p.text : '', mood: p.mood ?? null,
        prompt: typeof p.prompt === 'string' ? p.prompt : null, photo: p.photo || null, seed: !!p.seed,
        created: e.t, createdOffset: e.d, reply: null, replySource: null, linkId: null, flagged: false,
      };
      by.set(c.id, c); out.push(c);
      continue;
    }
    if (e.type === 'card_deleted') {
      const c = by.get(p.id);
      if (c) out.splice(out.indexOf(c), 1);
      by.delete(p.id);
      continue;
    }
    const c = by.get(p.id);
    if (!c) continue;
    if (e.type === 'card_photo_attached') c.photo = p.photo;
    else if (e.type === 'card_text_edited') c.text = typeof p.to === 'string' ? p.to : '';
    else if (e.type === 'card_mood_changed') c.mood = p.to ?? null;
    else if (e.type === 'card_reply_received' && c.reply === null) {
      c.reply = typeof p.reply === 'string' ? p.reply : '';
      c.replySource = typeof p.source === 'string' ? p.source : null;
      c.linkId = typeof p.linkId === 'string' ? p.linkId : null;
      c.flagged = !!p.flagged;
    }
  }
  return out;
}

export const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** A card the person added today (seed cards do not count). This is not a prompt-completion marker. */
export function addedToday(): boolean {
  const today = localDate();
  return cards().some(c => !c.seed && eventDate(c.created, c.createdOffset) === today);
}

export const SEED_PHOTO = 'seed:river';

/** Three demo cards, oldest first. Their moods and replies are explicit; old records without prompts stay that way. */
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
