export type WinddownCategory = 'static' | 'nature';

export interface SoundDef {
  id: string;
  name: string;
  category: WinddownCategory;
  file: string;
  note: string;
  shape: 'bubbles' | 'drop' | 'oval';
}

export const SOUNDS: SoundDef[] = [
  { id: 'canton', name: 'White Noise and Heartbeat', category: 'static',
    file: 'audio/canton-white-noise-and-heartbeat.mp3', note: 'canton · Abitti', shape: 'bubbles' },
  { id: 'soft-static', name: 'Soft static', category: 'static',
    file: 'audio/soft-static-generated.mp3', note: 'Synthesized preview', shape: 'bubbles' },
  { id: 'rain', name: 'Rain', category: 'nature',
    file: 'audio/rain-generated.mp3', note: 'Synthesized placeholder', shape: 'drop' },
  { id: 'stream', name: 'Stream', category: 'nature',
    file: 'audio/stream-generated.mp3', note: 'Synthesized placeholder', shape: 'oval' },
];

export interface WinddownState {
  v: 2;
  category: WinddownCategory;
  sound: string;
  completedOn: string | null;
}

const STORAGE_KEY = 'garden.winddown';

export function loadWinddown(): WinddownState {
  const fallback: WinddownState = { v: 2, category: 'static', sound: 'canton', completedOn: null };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const oldSound = stored?.v === 1 ? stored.settings?.active?.[0] : null;
    const candidate = stored?.v === 2 ? stored.sound : oldSound;
    const sound = SOUNDS.find(item => item.id === candidate) || SOUNDS[0];
    const category = stored?.v === 2 && stored.category === 'nature' ? 'nature'
      : stored?.v === 1 && stored.settings?.category === 'nature' ? 'nature' : sound.category;
    return { v: 2, category, sound: sound.id,
      completedOn: typeof stored?.completedOn === 'string' ? stored.completedOn : null };
  } catch {
    return fallback;
  }
}

export function saveWinddown(state: WinddownState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Playback works without storage. */ }
}
