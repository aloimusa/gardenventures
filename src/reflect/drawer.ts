import { eventDate } from '../state';
import type { Card } from './model';

export const MAX_RECEDING = 6;

export function cardDate(card: Card): string {
  return eventDate(card.created, card.createdOffset);
}

export function stripDate(card: Card): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    .format(new Date(`${cardDate(card)}T12:00:00`));
}

export function linkWeekday(card: Card): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
    .format(new Date(`${cardDate(card)}T12:00:00`));
}

export function firstWords(text: string, photo: boolean): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return photo ? 'Photo card' : 'Blank card';
  const words = clean.split(' ');
  const short = words.slice(0, 5).join(' ');
  return words.length > 5 ? `${short}…` : short;
}

/** Older indices visible behind the current card. Newer cards return when moving forward again. */
export function recedingIndices(current: number, length: number): number[] {
  const first = Math.max(0, current - MAX_RECEDING);
  return Array.from({ length: Math.max(0, current - first) }, (_, i) => first + i);
}

/** Used by pointer gestures and tests; a release always resolves to exactly one card. */
export function snapIndex(current: number, deltaY: number, length: number, threshold = 64): number {
  if (deltaY >= threshold && current > 0) return current - 1;
  if (deltaY <= -threshold && current < length - 1) return current + 1;
  return current;
}
