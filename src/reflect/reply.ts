// One same-origin request per non-empty new entry. The provider key and provider URL stay on the server.
// TEST HOOK: localStorage 'garden.test.reply' = 'slow' | 'fail' | 'flagged'.
export type ReplyMood = 0 | 1 | 2 | 3;
export type ReplySource = 'service' | 'fallback' | 'local';
export interface ReplyPrompt { id: string; text: string; kind: 'photo' | 'write' }
export interface EarlierCard { id: string; date: string; text: string }
export interface Entry {
  id: string;
  text: string;
  mood: ReplyMood;
  prompt: ReplyPrompt;
  /** Newest last; only the last five are sent. */
  history: EarlierCard[];
  /** Optional request hint. It is never forwarded to inference and no photo bytes are accepted. */
  hasPhoto?: boolean;
}
export interface Reply { reply: string; linkId: string | null; flagged: boolean; source: ReplySource }

// Temporary source compatibility for the previous caller; the server accepts only the complete Entry contract above.
interface LegacyEntry { text: string; hasPhoto: boolean; mood: number | null }

export const FALLBACK = 'It is down on the card now.';
export const REPLY_TIMEOUT_MS = 12000; // several visitors at once queue behind one model

const BLOCKED_TOKENS = ['should', 'try', 'proud', 'great', 'sorry', 'remember', 'why'];
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u20E3/u;
const ACUTE_PATTERNS = [
  /\bi (?:want|wanna) (?:to )?die\b/i,
  /\bwanting to die\b/i,
  /\bi wish (?:i )?(?:was|were) dead\b/i,
  /\b(?:kill|killing) myself\b/i,
  /\bend(?:ing)? my life\b/i,
  /\bi (?:do not|don't) want (?:to live|to be alive)\b/i,
  /\b(?:self harm|self harming|hurt myself|hurting myself|harm myself|harming myself|cut myself|cutting myself)\b/i,
  /\b(?:cannot|can't|could not|couldn't|unable to|not able to|not being able to) go on\b/i,
  /\b(?:suicide|suicidal)\b/i,
  /\bhaluan kuolla\b/i,
  /\ben halua elää\b/i,
  /\ben jaksa jatkaa\b/i,
  /\bvahingoitan itseäni\b/i,
];

const emptyResult = (): Reply => ({ reply: '', linkId: null, flagged: false, source: 'local' });
const fallbackResult = (): Reply => ({ reply: FALLBACK, linkId: null, flagged: false, source: 'fallback' });
const flaggedResult = (): Reply => ({ reply: FALLBACK, linkId: null, flagged: true, source: 'local' });

/** Same conservative local list as the server. This is not a clinical or emergency assessment. */
export function hasAcuteLanguage(text: string): boolean {
  const normalised = text.normalize('NFKC').toLocaleLowerCase().replace(/[’‘]/g, '\'').replace(/[-‐‑‒–—]/g, ' ');
  return ACUTE_PATTERNS.some(pattern => pattern.test(normalised));
}

/** Client-side display gate as defence in depth; the backend enforces the same rules before responding. */
export function isDisplayableReply(reply: string, inputText = ''): boolean {
  const text = reply.trim();
  const words = text.match(WORD_PATTERN) || [];
  if (!text || reply.length > 240 || words.length > 18) return false;
  if ((text.match(/[.!?？！]/g) || []).length !== 1 || !text.endsWith('.')) return false;
  if (/[?!？！]/.test(text) || EMOJI_PATTERN.test(text) || /^\s*you\s+wrote\b/i.test(text) || /\bI\b/.test(text)) return false;
  if (BLOCKED_TOKENS.some(token => new RegExp(`\\b${token}\\b`, 'i').test(text))) return false;
  const canonical = (value: string) => (value.normalize('NFKC').toLocaleLowerCase().match(WORD_PATTERN) || []).join(' ');
  return !canonical(text) || canonical(text) !== canonical(inputText);
}

function requestBody(entry: Entry): string {
  if (typeof entry.id !== 'string' || !Number.isInteger(entry.mood) || entry.mood < 0 || entry.mood > 3
    || !entry.prompt || !Array.isArray(entry.history)) {
    throw new Error('incomplete reply entry');
  }
  return JSON.stringify({
    id: entry.id,
    text: entry.text,
    mood: entry.mood,
    prompt: { id: entry.prompt.id, text: entry.prompt.text, kind: entry.prompt.kind },
    history: entry.history.slice(-5).map(card => ({ id: card.id, date: card.date, text: card.text })),
    ...(typeof entry.hasPhoto === 'boolean' ? { hasPhoto: entry.hasPhoto } : {}),
  });
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('reply timed out')); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancelled); resolve(); }, ms);
    const cancelled = () => { clearTimeout(timer); reject(new Error('reply timed out')); };
    signal.addEventListener('abort', cancelled, { once: true });
  });
}

async function service(entry: Entry, signal: AbortSignal): Promise<Reply> {
  const hook = localStorage.getItem('garden.test.reply');
  if (hook === 'fail') throw new Error('reply: forced failure');
  if (hook === 'flagged' || hook === 'slow') {
    await abortableDelay(hook === 'slow' ? 30_000 : 900, signal);
    return hook === 'flagged' ? flaggedResult() : fallbackResult();
  }

  const response = await fetch('/api/reflect-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody(entry),
    signal,
  });
  if (!response.ok) throw new Error('reply service unavailable');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid reply');
  const result = value as Record<string, unknown>;
  // API responses are camelCase; snake_case is tolerated only as an interop convenience for link_id/flag.
  const link = result.linkId !== undefined ? result.linkId : result.link_id;
  const flag = result.flagged !== undefined ? result.flagged : result.flag;
  if (typeof result.reply !== 'string' || (link !== null && typeof link !== 'string') || typeof flag !== 'boolean'
    || !['service', 'fallback', 'local'].includes(String(result.source))) {
    throw new Error('invalid reply');
  }
  if (flag || hasAcuteLanguage(entry.text)) {
    return { ...flaggedResult(), source: result.source as ReplySource };
  }
  const historicalIds = new Set(entry.history.slice(-5).map(card => card.id));
  const linkId = typeof link === 'string' && historicalIds.has(link) ? link : null;
  const reply = result.reply.replace(/\s+/g, ' ').trim();
  if (!isDisplayableReply(reply, entry.text)) throw new Error('invalid reply');
  return { reply, linkId, flagged: false, source: result.source as ReplySource };
}

/** Always resolves within REPLY_TIMEOUT_MS. Blank/photo-only cards never trigger a request and return an empty reply. */
export function reply(entry: Entry | LegacyEntry): Promise<Reply> {
  if (!entry.text.trim()) return Promise.resolve(emptyResult());
  if (hasAcuteLanguage(entry.text)) return Promise.resolve(flaggedResult());

  const complete = 'id' in entry && 'prompt' in entry && 'history' in entry;
  if (!complete) return Promise.resolve(fallbackResult());

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<Reply>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(fallbackResult()); }, REPLY_TIMEOUT_MS);
  });
  return Promise.race([
    service(entry, controller.signal).catch(() => fallbackResult()),
    expired,
  ]).finally(() => clearTimeout(timer));
}
