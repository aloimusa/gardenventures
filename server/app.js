import { createServer } from 'node:http';

const DEFAULT_UPSTREAM_URL = 'https://inference.verda.com/v1/chat/completions';
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_ENTRY_LENGTH = 220;
const MAX_PROMPT_LENGTH = 240;
const MAX_TOTAL_TEXT_LENGTH = 1600;
const MAX_HISTORY = 5;
const MAX_ID_LENGTH = 80;
const MAX_UPSTREAM_BYTES = 64 * 1024;
const MAX_REPLY_LENGTH = 240;
const UPSTREAM_TIMEOUT_MS = 10000; // total budget, including the single output-gate retry

export const FALLBACK_TEXT = 'It is down on the card now.';
export const SYSTEM_PROMPT = `You write the back of a card in a private journal. Reply with one sentence, at most 18 words. Give a warm, positive reflection: say, in your own words, what was good in it or what it took, built on one concrete thing the person did, saw or felt. Address the person as 'you'. Never just restate or paraphrase their sentence, and do not start with 'You wrote'. Do not advise, rate, diagnose or ask a question; keep the warmth plain, not gushing. For a heavy or sad entry, acknowledge it gently and name what the person still managed, without cheering. No 'I', no name, no exclamation marks, no emoji. If an earlier card mentions the same person, place or activity, set link_id to it; otherwise null. Set flag true if the entry mentions wanting to die, self-harm, or not being able to go on.
Return only compact JSON in this exact shape: {"reply":"one sentence","link_id":null,"flag":false}.
Input JSON contains the current id, text, mood (0 Bad, 1 Not great, 2 Okay, 3 Good), prompt, and up to five earlier cards in history. Only link to an exact historical id.
Use only details explicitly stated in the current entry. Earlier-card details may be used only for the card selected by link_id. Never invent weather, environmental details, physical sensations, visuals, sounds, people, activities, locations, food or drink characteristics, or timeline.
A photo prompt or hasPhoto indicates only that a local photo exists; you cannot see its contents. Never claim to see or describe a photo. If the text is too short for a richer paraphrase, compactly acknowledge its chosen detail without adding anything.
Do not introduce "today", "the day", causes, quantities, or other context that is absent, especially for one-word or vague entries. State the named detail or feeling without extrapolating its meaning.`;

const FALLBACK = Object.freeze({ reply: FALLBACK_TEXT, linkId: null, flagged: false, source: 'fallback' });
const LOCAL_FLAGGED = Object.freeze({ reply: FALLBACK_TEXT, linkId: null, flagged: true, source: 'local' });
const BLOCKED_TOKENS = ['should', 'try', 'proud', 'great', 'sorry', 'remember', 'why'];
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u20E3/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

// Keep this conservative list in step with src/reflect/reply.ts. It deliberately does not match "dead" alone.
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

class RequestError extends Error {}
class ModelOutputError extends Error {}

const words = text => text.match(WORD_PATTERN) || [];
const canonical = text => words(text.normalize('NFKC').toLocaleLowerCase()).join(' ');

/** A conservative local signal, not a clinical or emergency assessment. */
export function hasAcuteLanguage(text) {
  const normalised = text.normalize('NFKC').toLocaleLowerCase().replace(/[’‘]/g, '\'').replace(/[-‐‑‒–—]/g, ' ');
  return ACUTE_PATTERNS.some(pattern => pattern.test(normalised));
}

/** Return machine-readable reasons; an empty list means the reply may be displayed. */
export function replyGateFailures(reply, inputText = '') {
  if (typeof reply !== 'string') return ['type'];
  const failures = [];
  const trimmed = reply.trim();
  if (!trimmed || reply.length > MAX_REPLY_LENGTH) failures.push('length');
  const sentences = trimmed.match(/[.!?？！]/g) || [];
  if (sentences.length !== 1 || !trimmed.endsWith('.')) failures.push('sentence');
  if (words(trimmed).length > 18) failures.push('words');
  if (/[?!？！]/.test(trimmed)) failures.push('question-or-exclamation');
  if (EMOJI_PATTERN.test(trimmed)) failures.push('emoji');
  for (const token of BLOCKED_TOKENS) {
    if (new RegExp(`\\b${token}\\b`, 'i').test(trimmed)) failures.push(`token:${token}`);
  }
  if (/^\s*you\s+wrote\b/i.test(trimmed)) failures.push('intro');
  if (/\bI\b/.test(trimmed)) failures.push('first-person');
  if (canonical(trimmed) && canonical(trimmed) === canonical(inputText)) failures.push('repeat');
  return [...new Set(failures)];
}

export function isDisplayableReply(reply, inputText = '') {
  return replyGateFailures(reply, inputText).length === 0;
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

function sendJson(res, status, value, headers = {}) {
  if (res.destroyed || res.headersSent || res.writableEnded) return;
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

async function readJson(req) {
  const contentType = req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new RequestError('Expected JSON');

  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    req.resume();
    throw new RequestError('Request too large');
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      tooLarge = true;
      chunks.length = 0;
    } else if (!tooLarge) {
      chunks.push(chunk);
    }
  }
  if (tooLarge || size === 0) throw new RequestError('Invalid request size');

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError('Malformed JSON');
  }
}

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every(key => Object.hasOwn(value, key)) && keys.every(key => allowed.has(key));
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH && ID_PATTERN.test(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateEntry(value) {
  if (!exactKeys(value, ['id', 'text', 'mood', 'prompt', 'history'], ['hasPhoto'])) {
    throw new RequestError('Invalid entry fields');
  }
  if (!validId(value.id)) throw new RequestError('Invalid id');
  if (typeof value.text !== 'string' || value.text.length > MAX_ENTRY_LENGTH || !value.text.trim()) {
    throw new RequestError('Invalid text');
  }
  if (!Number.isInteger(value.mood) || value.mood < 0 || value.mood > 3) throw new RequestError('Invalid mood');
  if (Object.hasOwn(value, 'hasPhoto') && typeof value.hasPhoto !== 'boolean') {
    throw new RequestError('Invalid photo field');
  }

  const prompt = value.prompt;
  if (!exactKeys(prompt, ['id', 'text', 'kind']) || !validId(prompt.id)
    || typeof prompt.text !== 'string' || !prompt.text.trim() || prompt.text.length > MAX_PROMPT_LENGTH
    || !['photo', 'write'].includes(prompt.kind)) {
    throw new RequestError('Invalid prompt');
  }

  if (!Array.isArray(value.history) || value.history.length > MAX_HISTORY) throw new RequestError('Invalid history');
  const ids = new Set([value.id]);
  let totalText = value.text.length + prompt.text.length;
  const history = value.history.map(card => {
    if (!exactKeys(card, ['id', 'date', 'text']) || !validId(card.id) || !validDate(card.date)
      || typeof card.text !== 'string' || card.text.length > MAX_ENTRY_LENGTH || ids.has(card.id)) {
      throw new RequestError('Invalid history card');
    }
    ids.add(card.id);
    totalText += card.text.length;
    return { id: card.id, date: card.date, text: card.text };
  });
  if (totalText > MAX_TOTAL_TEXT_LENGTH) throw new RequestError('Too much text');

  return {
    id: value.id,
    text: value.text,
    mood: value.mood,
    prompt: { id: prompt.id, text: prompt.text, kind: prompt.kind },
    history,
  };
}

function parseModelReply(content, historicalIds) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_UPSTREAM_BYTES) {
    throw new ModelOutputError('Invalid model content');
  }
  const trimmed = content.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const firstBrace = unfenced.indexOf('{');
  const lastBrace = unfenced.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) throw new ModelOutputError('Missing model JSON');

  let value;
  try {
    value = JSON.parse(unfenced);
  } catch {
    try {
      value = JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
    } catch {
      throw new ModelOutputError('Malformed model JSON');
    }
  }
  if (!exactKeys(value, ['reply', 'link_id', 'flag'])) throw new ModelOutputError('Invalid model schema');
  if (typeof value.reply !== 'string' || (value.link_id !== null && typeof value.link_id !== 'string')
    || typeof value.flag !== 'boolean') {
    throw new ModelOutputError('Invalid model types');
  }
  const reply = value.reply.replace(/\s+/g, ' ').trim();
  if (!reply || reply.length > MAX_REPLY_LENGTH) throw new ModelOutputError('Invalid reply length');
  // Unknown and current-card links are ignored rather than allowed to point outside the supplied history.
  const linkId = value.link_id !== null && historicalIds.has(value.link_id) ? value.link_id : null;
  return { reply, linkId, flagged: value.flag };
}

function providerPayload(entry, model, effort) {
  return {
    ...(effort ? { reasoning_effort: effort } : {}),
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      // This explicit projection is the provider privacy boundary: no hasPhoto, bytes, events, plan, or contacts.
      { role: 'user', content: JSON.stringify(entry) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 100,
    stream: false,
  };
}

async function serviceReply(entry, { env, fetchImpl, timeoutMs }) {
  if (hasAcuteLanguage(entry.text)) return LOCAL_FLAGGED;
  // REFLECT_UPSTREAM_URL / REFLECT_MODEL point the same OpenAI-style call at another provider (the demo uses a
  // local model on the server, which needs no key). Without them the Verda settings apply as before.
  const upstream = env.REFLECT_UPSTREAM_URL || DEFAULT_UPSTREAM_URL;
  const key = env.REFLECT_API_KEY || env.VERDA_API_KEY || (env.REFLECT_UPSTREAM_URL ? 'local' : '');
  const model = env.REFLECT_MODEL || env.VERDA_MODEL;
  if (!key || !model) return FALLBACK;

  const controller = new AbortController();
  let timer;
  const expired = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(FALLBACK);
    }, timeoutMs);
    timer.unref?.();
  });

  const run = async () => {
    const historicalIds = new Set(entry.history.map(card => card.id));
    for (let attempt = 0; attempt < 2; attempt++) {
      if (controller.signal.aborted) return FALLBACK;
      let raw;
      try {
        const response = await fetchImpl(upstream, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(providerPayload(entry, model, env.REFLECT_REASONING_EFFORT)),
          signal: controller.signal,
        });
        if (!response.ok) return FALLBACK;
        raw = await response.text();
      } catch {
        return FALLBACK;
      }

      let result;
      try {
        if (Buffer.byteLength(raw) > MAX_UPSTREAM_BYTES) throw new ModelOutputError('Upstream response too large');
        const payload = JSON.parse(raw);
        result = parseModelReply(payload?.choices?.[0]?.message?.content, historicalIds);
      } catch {
        if (attempt === 0) continue; // malformed/model-schema output gets the same single retry as a gate failure
        return FALLBACK;
      }

      // A model flag is only an exploratory signal. Never return the generated sentence with a flagged result.
      if (result.flagged) return { reply: FALLBACK_TEXT, linkId: null, flagged: true, source: 'service' };
      const failures = replyGateFailures(result.reply, entry.text);
      if (failures.length && attempt === 0) continue;
      if (failures.length || hasAcuteLanguage(entry.text)) return FALLBACK;
      return { ...result, source: 'service' };
    }
    return FALLBACK;
  };

  try {
    return await Promise.race([run(), expired]);
  } catch {
    return FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}

export function createReflectServer({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
} = {}) {
  const server = createServer(async (req, res) => {
    setSecurityHeaders(res);

    let path;
    try {
      path = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      sendJson(res, 400, { error: 'Bad request.' });
      return;
    }

    if (path === '/api/health') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (path !== '/api/reflect-reply') {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      return;
    }

    let entry;
    try {
      entry = validateEntry(await readJson(req));
    } catch {
      sendJson(res, 400, { error: 'Bad request.' });
      return;
    }

    const result = await serviceReply(entry, { env, fetchImpl, timeoutMs });
    sendJson(res, 200, result);
  });

  server.requestTimeout = Math.max(1000, timeoutMs + 2000);
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  return server;
}
