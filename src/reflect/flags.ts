// Deliberately narrow, local phrases. This is not an assessment: it is a conservative backstop for the same
// supportive resources shown for a flagged service result. In particular, ordinary uses of "dead" do not match.
export function hasSafetyPhrase(text: string): boolean {
  const value = ` ${text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ')} `;
  return [
    /\bi (?:want|wanna|wish) (?:to )?(?:die|be dead)\b/,
    /\b(?:kill myself|self[- ]?harm|hurt myself|end my life|end it all)\b/,
    /\b(?:i )?(?:cannot|can't|cant) go on\b/,
    /\b(?:i )?(?:don't|do not|dont) want to (?:live|be alive)\b/,
    /\bno (?:reason|point) (?:to|in) living\b/,
  ].some(pattern => pattern.test(value));
}

export const SAFETY_REPLY = 'That sounds very heavy. You do not have to hold it alone.';
export const EMPTY_PLAN_RESOURCES = 'MIELI Kriisipuhelin 09 2525 0111 · Päivystysapu 116 117 · 112';
