// Repeatable backend/browser-client checks. Providers are mocked and .env.local is never read.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import {
  createReflectServer,
  FALLBACK_TEXT,
  SYSTEM_PROMPT,
  hasAcuteLanguage,
  replyGateFailures,
} from '../server/app.js';

let passed = 0;

async function withServer(options, run) {
  const server = createReflectServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function request(base, path = '/api/reflect-reply', options = {}) {
  const response = await fetch(base + path, options);
  const body = await response.text();
  return { response, body, json: body ? JSON.parse(body) : null };
}

function post(body, headers = { 'Content-Type': 'application/json' }) {
  return { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) };
}

function providerResponse(content, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const modelJson = (reply = 'A quiet pause followed lunch beside the river.', linkId = null, flag = false) =>
  JSON.stringify({ reply, link_id: linkId, flag });

async function check(name, run) {
  await run();
  passed++;
  console.log(`ok  ${name}`);
}

const prompt = { id: 'write-river', text: 'What did you notice outside today?', kind: 'write' };
const history = [
  { id: 'old-river', date: '2026-11-12', text: 'Walked beside the river with Mara.' },
  { id: 'old-cup', date: '2026-11-13', text: 'A red cup warmed my hands.' },
];
const validEntry = {
  id: 'current-card', text: 'Sat beside the river after lunch.', mood: 2, prompt, history, hasPhoto: true,
};
const providerEntry = {
  id: validEntry.id, text: validEntry.text, mood: validEntry.mood, prompt, history,
};
const serviceEnv = { VERDA_API_KEY: 'test-credential', VERDA_MODEL: 'test-model' };
const fallback = { reply: FALLBACK_TEXT, linkId: null, flagged: false, source: 'fallback' };
const success = { reply: 'A quiet pause followed lunch beside the river.', linkId: null, flagged: false, source: 'service' };

await check('health, security headers, and protocol errors', async () => {
  await withServer({ env: {} }, async base => {
    const health = await request(base, '/api/health');
    assert.equal(health.response.status, 200);
    assert.deepEqual(health.json, { ok: true });
    assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.response.headers.get('cache-control'), 'no-store');
    assert.equal(health.response.headers.get('access-control-allow-origin'), null);
    assert.equal((await request(base, '/not-found')).response.status, 404);

    const method = await request(base, '/api/reflect-reply');
    assert.equal(method.response.status, 405);
    assert.equal(method.response.headers.get('allow'), 'POST');
    assert.equal((await request(base, '/api/reflect-reply', post('{'))).response.status, 400);
    assert.equal((await request(base, '/api/reflect-reply', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}',
    })).response.status, 400);
  });
});

await check('strict current entry, prompt, history, sizes, and unrelated-field rejection', async () => {
  await withServer({ env: {} }, async base => {
    const invalid = [
      null,
      [],
      { ...validEntry, id: undefined },
      { ...validEntry, id: 'bad id with spaces' },
      { ...validEntry, mood: null },
      { ...validEntry, mood: 4 },
      { ...validEntry, hasPhoto: 'no' },
      { ...validEntry, text: 42 },
      { ...validEntry, text: '' },
      { ...validEntry, text: ' \n\t ' },
      { ...validEntry, text: 'x'.repeat(221) },
      { ...validEntry, safetyPlan: 'not accepted' },
      { ...validEntry, contacts: [] },
      { ...validEntry, photo: 'data:image/jpeg;base64,AA==' },
      { ...validEntry, prompt: { ...prompt, extra: 'not accepted' } },
      { ...validEntry, prompt: { ...prompt, kind: 'other' } },
      { ...validEntry, prompt: { ...prompt, text: ' ' } },
      { ...validEntry, history: Array.from({ length: 6 }, (_, i) => ({ id: `old-${i}`, date: '2026-11-01', text: 'Old.' })) },
      { ...validEntry, history: [{ ...history[0], mood: 1 }] },
      { ...validEntry, history: [{ ...history[0], date: '2026-02-30' }] },
      { ...validEntry, history: [{ ...history[0], id: validEntry.id }] },
      { ...validEntry, history: [history[0], history[0]] },
    ];
    for (const value of invalid) {
      const result = await request(base, '/api/reflect-reply', post(value));
      assert.equal(result.response.status, 400, JSON.stringify(value));
    }
    const large = await request(base, '/api/reflect-reply', post({ ...validEntry, text: 'x'.repeat(17 * 1024) }));
    assert.equal(large.response.status, 400);
  });
});

await check('provider receives only the projected current card and five historical text cards', async () => {
  let calls = 0;
  await withServer({
    env: serviceEnv,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://inference.verda.com/v1/chat/completions');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer test-credential');
      const payload = JSON.parse(options.body);
      assert.equal(payload.model, 'test-model');
      assert.equal(payload.stream, false);
      assert.deepEqual(payload.response_format, { type: 'json_object' });
      assert.equal(payload.messages.length, 2);
      assert(payload.messages[0].content.startsWith('You write the back of a card in a private journal.'));
      assert.equal(payload.messages[0].content, SYSTEM_PROMPT);
      const forwardedEntry = JSON.parse(payload.messages[1].content);
      assert.deepEqual(forwardedEntry, providerEntry);
      assert.equal(Object.hasOwn(forwardedEntry, 'hasPhoto'), false);
      assert.equal('photo' in payload, false);
      return providerResponse(modelJson());
    },
  }, async base => {
    const result = await request(base, '/api/reflect-reply', post(validEntry));
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, success);
    assert.equal(result.body.includes('\n'), false);
    assert.deepEqual(Object.keys(result.json).sort(), ['flagged', 'linkId', 'reply', 'source']);
  });
  assert.equal(calls, 1);
});

await check('fenced JSON and snake/camel mapping are parsed robustly', async () => {
  await withServer({
    env: serviceEnv,
    fetchImpl: async () => providerResponse(`\`\`\`json\n${modelJson('A red cup warmed both hands at the table.', 'old-cup')}\n\`\`\``),
  }, async base => {
    const result = await request(base, '/api/reflect-reply', post(validEntry));
    assert.deepEqual(result.json, {
      reply: 'A red cup warmed both hands at the table.', linkId: 'old-cup', flagged: false, source: 'service',
    });
  });
});

await check('link ids are exact-history-only; current and unknown links become null', async () => {
  for (const attempted of ['current-card', 'unknown-card', 'OLD-RIVER']) {
    await withServer({ env: serviceEnv, fetchImpl: async () => providerResponse(modelJson(undefined, attempted)) }, async base => {
      const result = await request(base, '/api/reflect-reply', post(validEntry));
      assert.equal(result.json.reply, success.reply);
      assert.equal(result.json.linkId, null);
      assert.equal(result.json.source, 'service');
    });
  }
});

await check('output gate rejects every display, retry, and prompt-integrity rule', async () => {
  const invalidReplies = [
    'A quiet pause. Another sentence followed.',
    'A quiet pause beside the river',
    'A quiet pause beside the river?',
    'A quiet pause beside the river!',
    'A quiet pause beside the river. 🌧️',
    'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen.',
    'You wrote about a quiet pause beside the river.',
    validEntry.text,
    'I noticed a quiet pause beside the river.',
    ...['should', 'try', 'proud', 'great', 'sorry', 'remember', 'why'].map(token => `A ${token} pause followed lunch beside the river.`),
  ];
  for (const invalid of invalidReplies) {
    let calls = 0;
    await withServer({ env: serviceEnv, fetchImpl: async () => { calls++; return providerResponse(modelJson(invalid)); } }, async base => {
      assert.notDeepEqual(replyGateFailures(invalid, validEntry.text), [], invalid);
      const result = await request(base, '/api/reflect-reply', post(validEntry));
      assert.deepEqual(result.json, fallback, invalid);
    });
    assert.equal(calls, 2, `one retry only for: ${invalid}`);
  }
  assert.deepEqual(replyGateFailures(success.reply, validEntry.text), []);
  assert.deepEqual(replyGateFailures('A tried recipe warmed the kitchen.', validEntry.text), []);
});

await check('a gate failure retries once and accepts a valid second response', async () => {
  let calls = 0;
  await withServer({
    env: serviceEnv,
    fetchImpl: async () => providerResponse(calls++ === 0 ? modelJson('Is this a question?') : modelJson()),
  }, async base => {
    const result = await request(base, '/api/reflect-reply', post(validEntry));
    assert.deepEqual(result.json, success);
  });
  assert.equal(calls, 2);
});

await check('malformed JSON and invalid provider schemas retry at most once, then fall back', async () => {
  const invalidResponses = [
    async () => providerResponse('not JSON'),
    async () => providerResponse('{"reply":"Missing fields"}'),
    async () => providerResponse(JSON.stringify({ reply: 'Old schema.', flagged: false })),
    async () => providerResponse(JSON.stringify({ reply: 'Extra.', link_id: null, flag: false, extra: true })),
    async () => providerResponse(JSON.stringify({ reply: 42, link_id: null, flag: false })),
    async () => providerResponse(JSON.stringify({ reply: 'Missing link.', flag: false })),
    async () => providerResponse(JSON.stringify({ reply: 'x'.repeat(241), link_id: null, flag: false })),
    async () => new Response('{"choices":[]}', { status: 200 }),
    async () => new Response('not provider JSON', { status: 200 }),
  ];
  for (const fetchImpl of invalidResponses) {
    let calls = 0;
    await withServer({ env: serviceEnv, fetchImpl: async (...args) => { calls++; return fetchImpl(...args); } }, async base => {
      const result = await request(base, '/api/reflect-reply', post(validEntry));
      assert.equal(result.response.status, 200);
      assert.deepEqual(result.json, fallback);
    });
    assert.equal(calls, 2);
  }
});

await check('provider HTTP/network failures and missing configuration use the bounded fixed fallback', async () => {
  for (const fetchImpl of [
    async () => new Response('unavailable', { status: 503 }),
    async () => { throw new Error('offline'); },
  ]) {
    let calls = 0;
    await withServer({ env: serviceEnv, fetchImpl: async () => { calls++; return fetchImpl(); } }, async base => {
      const result = await request(base, '/api/reflect-reply', post(validEntry));
      assert.deepEqual(result.json, fallback);
    });
    assert.equal(calls, 1);
  }
  let calls = 0;
  await withServer({ env: {}, fetchImpl: async () => { calls++; } }, async base => {
    assert.deepEqual((await request(base, '/api/reflect-reply', post(validEntry))).json, fallback);
  });
  assert.equal(calls, 0);
});

await check('conservative acute keywords skip inference; near phrases do not flag', async () => {
  let calls = 0;
  await withServer({
    env: serviceEnv,
    fetchImpl: async () => { calls++; return providerResponse(modelJson('The long shift ended with a quiet meal.')); },
  }, async base => {
    const acute = [
      'I want to die.',
      'I wish I were dead.',
      'I cannot go on.',
      'I can’t go on.',
      'Not being able to go on feels constant.',
      'I keep thinking about self-harm.',
      'Haluan kuolla.',
    ];
    for (const text of acute) {
      assert.equal(hasAcuteLanguage(text), true, text);
      const result = await request(base, '/api/reflect-reply', post({ ...validEntry, text }));
      assert.deepEqual(result.json, { reply: FALLBACK_TEXT, linkId: null, flagged: true, source: 'local' });
    }
    assert.equal(calls, 0);
    for (const text of ['Dead tired after the long shift.', 'The deadline is tomorrow.', 'I nearly said I could go on.']) {
      assert.equal(hasAcuteLanguage(text), false, text);
      const result = await request(base, '/api/reflect-reply', post({ ...validEntry, text }));
      assert.equal(result.json.flagged, false, text);
      assert.equal(result.json.source, 'service');
    }
  });
  assert.equal(calls, 3);
});

await check('model flag ORs the safety result and never returns its generated sentence', async () => {
  let calls = 0;
  await withServer({
    env: serviceEnv,
    fetchImpl: async () => { calls++; return providerResponse(modelJson('I am here for you!', 'old-river', true)); },
  }, async base => {
    const result = await request(base, '/api/reflect-reply', post(validEntry));
    assert.deepEqual(result.json, { reply: FALLBACK_TEXT, linkId: null, flagged: true, source: 'service' });
  });
  assert.equal(calls, 1);
});

await check('two-attempt provider work shares one timeout, even if fetch ignores abort', async () => {
  let calls = 0;
  await withServer({
    env: serviceEnv,
    timeoutMs: 40,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return providerResponse(modelJson('Two sentences. Are invalid.'));
      return new Promise(() => {});
    },
  }, async base => {
    const started = Date.now();
    const result = await request(base, '/api/reflect-reply', post(validEntry));
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, fallback);
    assert(Date.now() - started < 500, `${Date.now() - started} ms`);
  });
  assert.equal(calls, 2);
});

// Compile the real browser module without adding a runtime dependency or reading application configuration.
const replySource = await readFile(new URL('../src/reflect/reply.ts', import.meta.url), 'utf8');
const browserJs = stripTypeScriptTypes(replySource, { mode: 'strip' });
const browser = await import(`data:text/javascript;base64,${Buffer.from(browserJs).toString('base64')}`);
const browserEntry = {
  ...validEntry,
  text: 'The rain tapped the kitchen window.',
  history: Array.from({ length: 7 }, (_, i) => ({ id: `browser-${i}`, date: `2026-11-${String(i + 1).padStart(2, '0')}`, text: `Card ${i}.` })),
  contacts: [{ name: 'private-contact' }],
  safetyPlan: 'private-plan',
  photoBytes: 'private-photo-bytes',
};
const originalFetch = globalThis.fetch;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
};

try {
  await check('browser client suppresses blank/photo-only and obvious acute requests offline', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); };
    assert.deepEqual(await browser.reply({ ...browserEntry, text: ' \n ', hasPhoto: true }), {
      reply: '', linkId: null, flagged: false, source: 'local',
    });
    assert.deepEqual(await browser.reply({ ...browserEntry, text: 'I want to die.' }), {
      reply: FALLBACK_TEXT, linkId: null, flagged: true, source: 'local',
    });
    assert.equal(calls, 0);
    assert.equal(browser.hasAcuteLanguage('dead tired'), false);
    assert.equal(browser.hasAcuteLanguage('I can’t go on'), true);
  });

  await check('browser request whitelist caps history and never forwards photos or unrelated state', async () => {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, '/api/reflect-reply');
      const body = JSON.parse(options.body);
      assert.deepEqual(Object.keys(body).sort(), ['hasPhoto', 'hidden', 'history', 'id', 'mood', 'prompt', 'text'].filter(key => key !== 'hidden'));
      assert.deepEqual(body.history.map(card => card.id), ['browser-2', 'browser-3', 'browser-4', 'browser-5', 'browser-6']);
      assert(body.history.every(card => Object.keys(card).sort().join(',') === 'date,id,text'));
      assert.equal(options.body.includes('private-contact'), false);
      assert.equal(options.body.includes('private-plan'), false);
      assert.equal(options.body.includes('private-photo-bytes'), false);
      assert.equal(options.body.includes('photoBytes'), false);
      return new Response(JSON.stringify({ ...success, linkId: 'browser-6' }), { headers: { 'Content-Type': 'application/json' } });
    };
    const result = await browser.reply(browserEntry);
    assert.deepEqual(result, { ...success, linkId: 'browser-6' });
    assert.equal(calls, 1);
  });

  await check('browser result mapping, link allowlist, output gate, and invalid JSON stay defensive', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      reply: 'A red cup warmed both hands at the table.', link_id: 'current-card', flag: false, source: 'service',
    }), { headers: { 'Content-Type': 'application/json' } });
    assert.deepEqual(await browser.reply(browserEntry), {
      reply: 'A red cup warmed both hands at the table.', linkId: null, flagged: false, source: 'service',
    });

    globalThis.fetch = async () => new Response(JSON.stringify({ ...success, reply: 'Two sentences. Not allowed.' }), {
      headers: { 'Content-Type': 'application/json' },
    });
    assert.deepEqual(await browser.reply(browserEntry), fallback);

    globalThis.fetch = async () => new Response('{', { headers: { 'Content-Type': 'application/json' } });
    assert.deepEqual(await browser.reply(browserEntry), fallback);

    globalThis.fetch = async () => new Response(JSON.stringify({ ...success, flagged: true, reply: 'I should reassure.' }), {
      headers: { 'Content-Type': 'application/json' },
    });
    assert.deepEqual(await browser.reply(browserEntry), { ...fallback, flagged: true, source: 'service' });
  });

  await check('browser fail and flagged test hooks are deterministic without inference', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); };
    store.set('garden.test.reply', 'fail');
    assert.deepEqual(await browser.reply(browserEntry), fallback);
    store.set('garden.test.reply', 'flagged');
    assert.deepEqual(await browser.reply(browserEntry), { ...fallback, flagged: true, source: 'local' });
    assert.equal(calls, 0);
    store.delete('garden.test.reply');
  });

  await check('browser slow hook and overall timeout return the fixed offline fallback', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); };
    store.set('garden.test.reply', 'slow');
    const started = Date.now();
    assert.deepEqual(await browser.reply(browserEntry), fallback);
    const elapsed = Date.now() - started;
    assert(elapsed >= browser.REPLY_TIMEOUT_MS - 100 && elapsed < browser.REPLY_TIMEOUT_MS + 1000, `${elapsed} ms`);
    assert.equal(calls, 0);
    store.delete('garden.test.reply');
  });
} finally {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else delete globalThis.localStorage;
}

console.log(`\n${passed} backend/browser hygiene groups passed`);
