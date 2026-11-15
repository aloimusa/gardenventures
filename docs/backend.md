# Reflect reply backend

The development backend is a dependency-free Node server on `127.0.0.1:8817`.

```sh
npm run server
npm run dev
```

`npm run server` loads `.env.local` without printing it. The file must provide `VERDA_API_KEY` and `VERDA_MODEL`; it is gitignored and must remain owner-only. Vite proxies same-origin `/api` requests to the backend. No provider URL or credential is exposed through Vite or the browser. The review and test scripts below do not read that file.

## Browser contract

`src/reflect/reply.ts` exports `reply(entry)`, `FALLBACK`, `hasAcuteLanguage()` and `isDisplayableReply()`.

```ts
interface Entry {
  id: string;
  text: string;
  mood: 0 | 1 | 2 | 3;       // Bad, Not great, Okay, Good; never null for new cards
  prompt: { id: string; text: string; kind: 'photo' | 'write' };
  history: { id: string; date: string; text: string }[]; // earlier cards, newest last
  hasPhoto?: boolean;       // optional compatibility hint only
}

interface Reply {
  reply: string;
  linkId: string | null;
  flagged: boolean;
  source: 'service' | 'fallback' | 'local';
}
```

The caller should pass only the latest five earlier text cards. The browser defensively projects and caps the array to its last five, rather than forwarding an event array or whole card objects. It also whitelists the current fields instead of serializing the input object.

The client and server use the same conservative acute-language list. An obvious local match skips the network and returns `{ reply: FALLBACK, linkId: null, flagged: true, source: 'local' }`. This also works offline. `flagged` is an exploratory model/keyword signal, **not** an emergency assessment or a clinical score. The UI substitutes its support text for every flagged result; a model-generated sentence is never returned with a flag.

A blank or whitespace-only entry never calls fetch, including a photo-only card. The client guard returns `{ reply: '', linkId: null, flagged: false, source: 'local' }`, so the drawer can show the prompt alone. No description is inferred from a photo. For non-empty text, unavailability, an invalid response, offline operation, or timeout resolves to exactly:

```text
It is down on the card now.
```

The deterministic browser test hook remains `localStorage['garden.test.reply'] = 'fail' | 'slow' | 'flagged'`. Normal production requests use only same-origin `/api/reflect-reply`, never a provider URL.

## HTTP API

- `GET /api/health` returns `{ "ok": true }`.
- `POST /api/reflect-reply` requires `Content-Type: application/json` and exactly the current `id`, `text`, `mood`, `prompt`, and `history` fields. `hasPhoto` is the only optional field. Unknown fields are rejected.
- Current text is non-blank and at most 220 characters. Prompt text is non-blank and at most 240 characters. IDs are bounded safe strings; dates are valid `YYYY-MM-DD` dates. History contains at most five distinct earlier `{ id, date, text }` objects, each with at most 220 characters. Current, prompt, and history text total at most 1,600 characters. The request body is limited to 16 KiB.
- Malformed/oversized requests, blank text, `null` moods, extra history/photo/event/contact/plan fields, and wrong schemas return 400. Wrong methods return 405. Errors never echo entry text.
- Every successful API result has camelCase `{ reply, linkId, flagged, source }`. The provider's exact JSON `{ reply, link_id, flag }` is mapped to this shape; `link_id → linkId` and `flag → flagged`. The browser tolerates those two snake_case keys only as an interop convenience and still returns the standardized camelCase result.

`hasPhoto` is accepted only for compatibility with the client boundary and is discarded before inference. The provider receives one explicitly constructed JSON object containing only current `id`, `text`, `mood`, `prompt`, and at most five historical `id`, `date`, `text` values. Photo bytes, event history, contacts, plans, credentials, and unrelated fields are never forwarded. Entry contents and credentials are not logged.

## Generation, gate, and fallback

The system prompt is in `server/app.js` next to the provider request. It asks for one concrete sentence of at most 18 words and an optional exact historical link. A reply is gated before the API returns it:

- exactly one sentence, ending in one full stop;
- at most 18 Unicode-aware words and 240 characters;
- no question/exclamation mark, emoji, standalone first-person `I`, or leading `You wrote`;
- no whole-word, case-insensitive `should`, `try`, `proud`, `great`, `sorry`, `remember`, or `why`;
- not a normalized repeat of the input sentence.

Fenced JSON is accepted, but missing/extra/wrongly typed provider fields are not. A model link is kept only when it exactly matches one of the supplied historical IDs; current/unknown IDs become `null`. Model flagging suppresses the generated sentence even if that sentence would fail the display gate.

Malformed model output or a display-gate failure retries the provider once. Both attempts share a four-second total upstream budget; there are never more than two calls. Provider HTTP/network failures do not add a retry. The browser has a five-second overall cap and its own display/link checks as defence in depth. Invalid output, an exhausted retry, missing configuration, timeout, and unavailability return HTTP 200 with:

```json
{"reply":"It is down on the card now.","linkId":null,"flagged":false,"source":"fallback"}
```

## Checks and qualitative review

Run isolated protocol, privacy, history, schema, allowlist, output-gate, one-retry, timeout, keyword/near-keyword, invalid-JSON, and real compiled-browser-client checks with:

```sh
npm run check:backend
```

The review harness generates 40 synthetic entries across flat/good/bad/vague/angry/one-word/Finnish text, acute phrases, near-flags, varied moods/prompts, and same-person/place/activity history. It writes a readable Markdown table and complete JSON details, including source, observed retry information when available, and honest failure reasons:

```sh
node scripts/review-reflect-replies.mjs
# review/reflect-replies.md
# review/reflect-replies.json
```

By default it sends the synthetic fixtures to the already-running development backend at `http://127.0.0.1:8817`; it does not restart or reconfigure that process. Point `REFLECT_REVIEW_URL` at another already-running new API endpoint when needed. If `VERDA_API_KEY` and `VERDA_MODEL` are already present in the shell environment and no review URL is set, it instead runs a temporary loopback server against real configured inference. It never loads `.env.local` itself and never prints keys.

Defaults are concurrency 4, a 6.5-second per-request cap, and a 120-second total cap. `REFLECT_REVIEW_CONCURRENCY`, `REFLECT_REVIEW_REQUEST_MS`, and `REFLECT_REVIEW_TIMEOUT_MS` can tune those bounds. Re-running overwrites the two generated artifacts. The prompt is copied into both artifacts to make wording review and prompt tuning straightforward. Fallback and failed HTTP rows are reported as failures, not presented as acceptable model examples.

## Live route

The existing public Caddy route forwards `/api/*` to `127.0.0.1:8816`. Starting or restarting that application instance is a release operation, not part of these checks or the review harness. The static deploy command does not manage its environment or provider credentials.
