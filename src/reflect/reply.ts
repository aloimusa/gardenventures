// The reply service, behind one function. Tonight it is a stub that returns a fixed placeholder; the real rules are
// Amit's to review and come separately. Whatever happens, the caller gets one sentence back: on a slow or failed
// service it is the fixed line "I have this."
//
// TEST HOOK (scripts/check.mjs only): localStorage 'garden.test.reply' = 'slow' | 'fail' | 'flagged'.
export interface Entry { text: string; hasPhoto: boolean; mood: number | null }
export interface Reply { reply: string; flagged: boolean }

export const FALLBACK = 'I have this.';
export const PLACEHOLDER = 'Thank you for putting this into words.';
const TIMEOUT_MS = 5000;

async function service(entry: Entry): Promise<Reply> {
  void entry;
  const hook = localStorage.getItem('garden.test.reply');
  if (hook === 'fail') throw new Error('stub: forced failure');
  await new Promise(r => setTimeout(r, hook === 'slow' ? 30_000 : 900));
  return { reply: PLACEHOLDER, flagged: hook === 'flagged' };
}

/** always resolves, at the latest after TIMEOUT_MS */
export function reply(entry: Entry): Promise<Reply & { source: 'service' | 'fallback' }> {
  const fallback = { reply: FALLBACK, flagged: false, source: 'fallback' as const };
  return Promise.race([
    service(entry).then(r => ({ ...r, source: 'service' as const }), () => fallback),
    new Promise<typeof fallback>(r => setTimeout(() => r(fallback), TIMEOUT_MS)),
  ]);
}
