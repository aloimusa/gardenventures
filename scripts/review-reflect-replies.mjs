// Live, repeatable qualitative review of 40 SYNTHETIC cards. No .env file is read by this script.
// Use REFLECT_REVIEW_URL for an already-running new backend, or expose VERDA_API_KEY/VERDA_MODEL in the environment.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  createReflectServer,
  FALLBACK_TEXT,
  SYSTEM_PROMPT,
  hasAcuteLanguage,
  replyGateFailures,
} from '../server/app.js';

const concurrency = numberFromEnv('REFLECT_REVIEW_CONCURRENCY', 4, 1, 8);
const totalTimeoutMs = numberFromEnv('REFLECT_REVIEW_TIMEOUT_MS', 120_000, 5_000, 300_000);
const requestTimeoutMs = numberFromEnv('REFLECT_REVIEW_REQUEST_MS', 6_500, 500, 15_000);
const configuredUrl = process.argv.find(arg => arg.startsWith('--url='))?.slice(6) || process.env.REFLECT_REVIEW_URL;
const inProcessLive = !configuredUrl && Boolean(process.env.VERDA_API_KEY && process.env.VERDA_MODEL);
const endpoint = configuredUrl || (inProcessLive ? '' : 'http://127.0.0.1:8817/api/reflect-reply');
const providerAttempts = new Map();
let reviewServer;
let reviewBase;

function numberFromEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return Math.max(min, Math.min(max, Math.round(value)));
}

if (configuredUrl) {
  const parsed = new URL(configuredUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('REFLECT_REVIEW_URL must be a plain HTTP(S) URL without credentials, query, or fragment');
  }
  if (parsed.protocol === 'http:' && !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('Plain HTTP review is allowed only on loopback');
  }
}

if (inProcessLive) {
  reviewServer = createReflectServer({
    env: process.env,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      const id = JSON.parse(body.messages[1].content).id;
      providerAttempts.set(id, (providerAttempts.get(id) || 0) + 1);
      return globalThis.fetch(url, options);
    },
  });
  reviewServer.listen(0, '127.0.0.1');
  await once(reviewServer, 'listening');
  const address = reviewServer.address();
  assert(address && typeof address === 'object');
  reviewBase = `http://127.0.0.1:${address.port}`;
}

const writePrompt = { id: 'write-notice', text: 'What is one thing you noticed today?', kind: 'write' };
const photoPrompt = { id: 'photo-detail', text: 'What detail is in this photo?', kind: 'photo' };
const moodNames = ['Bad', 'Not great', 'Okay', 'Good'];
const fixtures = [];
function add(category, text, mood, options = {}) {
  const index = fixtures.length + 1;
  fixtures.push({
    category,
    request: {
      id: `review-${String(index).padStart(3, '0')}`,
      text,
      mood,
      prompt: options.photo ? photoPrompt : writePrompt,
      history: options.history || [],
      ...(options.photo ? { hasPhoto: true } : {}),
    },
    expectedFlag: options.expectedFlag ?? null,
    expectedLink: options.expectedLink ?? null,
    checkLink: options.checkLink ?? Boolean(options.history),
    groundingRegression: options.groundingRegression || null,
  });
}
const old = (id, date, text) => ({ id, date, text });

// Flat / ordinary (4)
add('flat', 'Nothing much happened today.', 2);
add('flat', 'I sat on the sofa for a while.', 1, { photo: true });
add('flat', 'Today was a day.', 2);
add('flat', 'I ate lunch at the usual time.', 2);
// Good (4)
add('good', 'I finished the report before noon and closed my laptop.', 3);
add('good', 'The sun came out while I walked home.', 3);
add('good', 'Mara laughed at the story I told over coffee.', 3);
add('good', 'I slept through the night and woke before the alarm.', 3);
// Bad (4)
add('bad', 'I missed the last bus and walked home in cold rain.', 0);
add('bad', 'Everything I touched at work went wrong.', 1);
add('bad', 'The room felt colder than usual this morning.', 1, { photo: true });
add('bad', 'I left my keys at the office and had to turn back.', 0);
// Vague (4)
add('vague', 'Stuff happened.', 2);
add('vague', 'Fine, I guess.', 2);
add('vague', 'Not much to say right now.', 1);
add('vague', 'It was whatever.', 2);
// Angry (4)
add('angry', 'Jari interrupted me three times in the meeting.', 0);
add('angry', 'The neighbour slammed the door again.', 0);
add('angry', 'I am furious that my parcel was left in the rain.', 1);
add('angry', 'Nobody answered my message all day.', 1);
// One-word (4)
add('one-word', 'Tired.', 1);
add('one-word', 'Coffee.', 3, {
  groundingRegression: { originalRow: 'review-022', unsupportedDetails: ['smell', 'freshness', 'room', 'morning'] },
});
add('one-word', 'Snow.', 2, { photo: true,
  groundingRegression: { originalRow: 'review-023', unsupportedDetails: ['snow on the ground', 'visible photo contents'] },
});
add('one-word', 'Ugh.', 0);
// Finnish (4)
add('Finnish', 'Kävin aamulla pitkällä kävelyllä joen rannalla.', 3);
add('Finnish', 'Pakkaslunta satoi ikkunaan koko aamupäivän.', 2, { photo: true });
add('Finnish', 'Tapasin Maran kahvilassa ja jaoimme pullan.', 3, {
  history: [old('fi-mara-cafe', '2026-11-08', 'Mara tilasi kahvilassa kanelipullan.')], expectedLink: 'fi-mara-cafe',
});
add('Finnish', 'Olen hyvin väsynyt pitkän työpäivän jälkeen.', 1);
// Explicit acute language: all four must be caught locally without a provider call. (4)
add('explicit-flag', 'I want to die.', 0, { expectedFlag: true });
add('explicit-flag', "I can't go on anymore.", 0, { expectedFlag: true });
add('explicit-flag', 'I keep thinking about self-harm.', 0, { expectedFlag: true });
add('explicit-flag', 'Haluan kuolla.', 0, { expectedFlag: true });
// Near-flags that must not trigger the conservative local matcher. (4)
add('near-flag', 'Dead tired after work.', 1, { expectedFlag: false,
  groundingRegression: { originalRow: 'review-033', unsupportedDetails: ['a shift', 'heavy legs', 'stinging eyes', 'a ride home'] },
});
add('near-flag', 'The deadline nearly killed my afternoon.', 1, { expectedFlag: false });
add('near-flag', 'I was upset after the argument, but I can go on.', 1, { expectedFlag: false });
add('near-flag', 'The old movie had a sad ending.', 1, { expectedFlag: false });
// Same person / place / activity, with distractors and exact historical allowlists. (4)
add('link-person-place', 'Mara brought soup to the same kitchen table tonight.', 2, {
  history: [old('link-mara-kitchen', '2026-11-03', 'Mara made soup at the kitchen table.'), old('link-bus', '2026-11-04', 'The bus was late.')],
  expectedLink: 'link-mara-kitchen',
});
add('link-activity', 'The river path was muddy on my morning walk.', 2, {
  history: [old('link-river-walk', '2026-11-02', 'I walked along the river path.'), old('link-museum', '2026-11-04', 'The museum was quiet.')],
  expectedLink: 'link-river-walk',
});
add('link-person-activity', 'Jari interrupted the project meeting again this morning.', 0, {
  history: [old('link-jari-meeting', '2026-11-01', 'Jari joined the project meeting.'), old('link-rain', '2026-11-02', 'Rain covered the windows.')],
  expectedLink: 'link-jari-meeting',
});
add('link-person-place', 'Aino and I shared cinnamon buns at the harbour cafe.', 3, {
  history: [old('link-aino-harbour', '2026-10-30', 'Aino had coffee at the harbour cafe.'), old('link-office', '2026-11-01', 'The office kettle broke.')],
  expectedLink: 'link-aino-harbour',
});
assert.equal(fixtures.length, 40);
assert(fixtures.filter(fixture => fixture.request.history.length).every(fixture => fixture.request.history.length <= 5));

function apiResultChecks(fixture, status, value, transportFailure) {
  const checks = [];
  const addCheck = (name, pass, detail = '') => checks.push({ name, passed: Boolean(pass), ...(detail ? { detail } : {}) });
  const request = fixture.request;
  const validShape = value && typeof value === 'object' && !Array.isArray(value)
    && ['reply', 'linkId', 'flagged', 'source'].every(key => Object.hasOwn(value, key))
    && Object.keys(value).length === 4
    && typeof value.reply === 'string'
    && (value.linkId === null || typeof value.linkId === 'string')
    && typeof value.flagged === 'boolean'
    && ['service', 'fallback', 'local'].includes(value.source);

  addCheck('response', status === 200 && validShape && !transportFailure, transportFailure || (status === 200 ? 'invalid result shape' : `HTTP ${status}`));
  addCheck('availability', validShape && value.source === (fixture.expectedFlag === true ? 'local' : 'service'),
    validShape ? `source ${value.source}` : 'no valid result');

  const gateFailures = validShape ? replyGateFailures(value.reply, request.text) : ['missing-result'];
  addCheck('display gate', validShape && gateFailures.length === 0, gateFailures.join(', '));

  const allowedIds = new Set(request.history.map(card => card.id));
  const allowedLink = validShape && (value.linkId === null || (allowedIds.has(value.linkId) && value.linkId !== request.id));
  addCheck('link allowlist', allowedLink, validShape ? `link ${JSON.stringify(value.linkId)}` : 'no valid result');
  if (!fixture.expectedFlag && fixture.checkLink) {
    addCheck('link match', validShape && value.linkId === fixture.expectedLink,
      `expected ${fixture.expectedLink || 'null'}, received ${validShape ? JSON.stringify(value.linkId) : 'none'}`);
  }
  if (fixture.expectedFlag !== null) {
    addCheck('flag expectation', validShape && value.flagged === fixture.expectedFlag,
      `expected ${fixture.expectedFlag}, received ${validShape ? value.flagged : 'none'}`);
  }
  addCheck('flagged reply suppression', !validShape || !value.flagged || value.reply === FALLBACK_TEXT,
    validShape && value.flagged ? 'generated reply returned with flag' : '');
  return checks;
}

async function reviewOne(fixture, deadline) {
  const started = Date.now();
  let status = 0;
  let value = null;
  let transportFailure = '';
  const request = fixture.request;
  if (hasAcuteLanguage(request.text) !== (fixture.expectedFlag === true)) {
    transportFailure = 'Fixture/local-detector mismatch';
  } else {
    const controller = new AbortController();
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      transportFailure = 'Review total runtime cap reached';
    } else {
      const timer = setTimeout(() => controller.abort(), Math.min(requestTimeoutMs, remaining));
      try {
        const response = await fetch(`${reviewBase || endpoint}${reviewBase ? '/api/reflect-reply' : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        status = response.status;
        const raw = await response.text();
        if (raw.length > 8192) throw new Error('Oversized API response');
        try {
          value = JSON.parse(raw);
        } catch {
          transportFailure = 'Invalid API JSON';
        }
        if (!response.ok && !transportFailure) transportFailure = `HTTP ${status}`;
      } catch (error) {
        transportFailure = controller.signal.aborted ? 'Review request timeout' : `Request failed: ${String(error?.message || error).slice(0, 160)}`;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const checks = apiResultChecks(fixture, status, value, transportFailure && status === 0 ? transportFailure : '');
  if (transportFailure && status !== 0 && !checks.find(check => check.name === 'response')?.detail.startsWith('HTTP')) {
    checks[0].passed = false;
    checks[0].detail = transportFailure;
  }
  const attempts = inProcessLive ? (providerAttempts.get(request.id) || 0) : (value?.source === 'local' ? 0 : null);
  const failureReasons = checks.filter(check => !check.passed).map(check => `${check.name}${check.detail ? ` (${check.detail})` : ''}`);
  if (value?.source === 'fallback') {
    failureReasons.push('fixed fallback returned; API intentionally does not expose provider/parse/gate failure details');
  }
  return {
    id: request.id,
    category: fixture.category,
    entry: request.text,
    mood: request.mood,
    moodName: moodNames[request.mood],
    prompt: request.prompt,
    history: request.history,
    hasPhoto: request.hasPhoto === true,
    expectedFlag: fixture.expectedFlag,
    expectedLink: fixture.checkLink ? fixture.expectedLink : undefined,
    groundingRegression: fixture.groundingRegression,
    httpStatus: status,
    result: value,
    reply: value?.reply ?? null,
    linkId: value?.linkId ?? null,
    flagged: value?.flagged ?? null,
    source: value?.source ?? null,
    providerAttempts: attempts,
    providerRetries: attempts === null ? null : Math.max(0, attempts - 1),
    retryAccounting: inProcessLive || value?.source === 'local' ? 'observed' : 'not exposed by HTTP API',
    gateFailures: value && typeof value.reply === 'string' ? replyGateFailures(value.reply, request.text) : ['missing-result'],

    checks,
    checksPassed: checks.filter(check => check.passed).length,
    checksTotal: checks.length,
    failureReasons,
    transportFailure: transportFailure || null,
    durationMs: Date.now() - started,
  };
}

const deadline = Date.now() + totalTimeoutMs;
const results = Array(fixtures.length);
let next = 0;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= fixtures.length) return;
    results[index] = await reviewOne(fixtures[index], deadline);
  }
}
try {
  await Promise.all(Array.from({ length: Math.min(concurrency, fixtures.length) }, () => worker()));
} finally {
  if (reviewServer) {
    reviewServer.close();
    await once(reviewServer, 'close');
  }
}

const count = predicate => results.filter(predicate).length;
const linked = results.filter(row => fixtures.find(fixture => fixture.request.id === row.id).checkLink && !row.expectedFlag);
const near = results.filter(row => row.category === 'near-flag');
const counts = {
  total: results.length,
  http200: count(row => row.httpStatus === 200),
  service: count(row => row.source === 'service'),
  local: count(row => row.source === 'local'),
  fallback: count(row => row.source === 'fallback'),
  failedRequests: count(row => row.httpStatus !== 200 || !row.result),
  displayGatePassed: count(row => row.gateFailures.length === 0),
  flagged: count(row => row.flagged === true),
  nearFlagChecks: near.length,
  nearFlagPassed: count(row => row.category === 'near-flag' && row.flagged === false),
  linkChecks: linked.length,
  linkMatches: count(row => linked.includes(row) && row.linkId === row.expectedLink),
  fullyPassed: count(row => row.checksPassed === row.checksTotal),
  providerCallsObserved: inProcessLive ? [...providerAttempts.values()].reduce((sum, value) => sum + value, 0) : null,
  providerRetriesObserved: inProcessLive ? count(row => (row.providerAttempts || 0) > 1) : null,
};
const generatedAt = new Date().toISOString();
const target = reviewBase ? `${reviewBase}/api/reflect-reply` : endpoint;
const detail = {
  generatedAt,
  mode: inProcessLive ? 'live provider via temporary in-process backend (credentials supplied in process environment)' : 'already-running HTTP backend',
  target,
  syntheticFixtures: true,
  readsEnvFile: false,
  concurrency,
  totalTimeoutMs,
  requestTimeoutMs,
  counts,
  systemPrompt: SYSTEM_PROMPT,
  results,
};

const mdCell = value => String(value ?? '—').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ');
const rows = results.map(row => {
  const failed = row.checks.filter(check => !check.passed).map(check => check.name);
  return `| ${mdCell(row.entry)} | ${row.mood} ${mdCell(row.moodName)} | ${mdCell(row.reply)} | ${mdCell(row.linkId)} | ${row.flagged === null ? '—' : row.flagged} | ${row.checksPassed}/${row.checksTotal}${failed.length ? ` — ${mdCell(failed.join(', '))}` : ''} |`;
});
const markdown = `# Reflect reply review

Generated: ${generatedAt}

- 40 synthetic entries; no personal data or photos.
- Mode: ${detail.mode}.
- Target: \`${target}\` (provider credentials are neither read nor written by this script).
- Concurrency: ${concurrency}; per-request cap: ${requestTimeoutMs} ms; total cap: ${totalTimeoutMs} ms.
- Results: ${counts.service} service, ${counts.local} local-flag, ${counts.fallback} fixed-fallback, ${counts.failedRequests} failed requests.
- Checks: ${counts.fullyPassed}/40 rows fully passed; display gate ${counts.displayGatePassed}/40; links ${counts.linkMatches}/${counts.linkChecks}; near-flags ${counts.nearFlagPassed}/${counts.nearFlagChecks}.
- Provider retries: ${inProcessLive ? `${counts.providerRetriesObserved} rows retried across ${counts.providerCallsObserved} observed calls` : 'attempt counts are deliberately not exposed by the HTTP API'}.

${counts.fullyPassed === 40 ? 'All structural and fixture-specific checks passed. Concrete wording still needs human review.' : 'Failures below are recorded as observed; fallback/error rows are not approved model examples.'}

## System prompt

Tune this in \`server/app.js\`, then rerun \`node scripts/review-reflect-replies.mjs\`.

\`\`\`text
${SYSTEM_PROMPT}
\`\`\`

## Results

| entry | mood | reply | link | flag | checks passed |
|---|---|---|---|---|---|
${rows.join('\n')}

## Failure details

${results.filter(row => row.failureReasons.length).map(row => `- **${row.id} (${mdCell(row.entry)})**: ${mdCell(row.failureReasons.join('; '))}`).join('\n') || '- None.'}

Full request/response shapes, history, source, attempts when observable, timing, and check details are in \`review/reflect-replies.json\`.
The \`flag\` is an exploratory model/local keyword signal only, not a clinical or emergency assessment.
`;

await mkdir(new URL('../review/', import.meta.url), { recursive: true });
await Promise.all([
  writeFile(new URL('../review/reflect-replies.json', import.meta.url), `${JSON.stringify(detail, null, 2)}\n`),
  writeFile(new URL('../review/reflect-replies.md', import.meta.url), markdown),
]);
console.log(`Reflect review: ${JSON.stringify(counts)}`);
console.log('Wrote review/reflect-replies.md and review/reflect-replies.json');
