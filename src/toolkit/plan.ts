// Private, unmonitored local content. The v2 document stores prose and contacts in their actual order.
// v1 remains readable (and untouched on disk), so an existing person's writing is never replaced by the demo example.
export interface SafetyContact {
  id: string;
  name: string;
  phone: string;
}

export interface PlanTextBlock {
  type: 'text';
  id: string;
  text: string;
}

export interface PlanContactBlock {
  type: 'contact';
  id: string;
  contact: SafetyContact;
}

export type PlanBlock = PlanTextBlock | PlanContactBlock;

export interface SafetyPlanDocument {
  v: 2;
  blocks: PlanBlock[];
  updated: number | null;
}

/** Derived compatibility shape used by Reflect. */
export interface SafetyPlan {
  v: 1;
  sections: string[];
  contacts: SafetyContact[];
  updated: number | null;
}

export const SAFETY_PLAN_KEY = 'garden.safetyPlan.v2';
export const LEGACY_SAFETY_PLAN_KEY = 'garden.safetyPlan.v1';
const MAX_BLOCKS = 80;
const MAX_TEXT_PER_BLOCK = 1200;
const MAX_TEXT_TOTAL = 12000;
const MAX_CONTACTS = 20;

const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/\r\n?/g, '\n').replace(/\0/g, '').slice(0, max) : '';
const cleanId = (value: unknown) => clean(value, 100).replace(/[^a-zA-Z0-9_-]/g, '');

export function newContact(): SafetyContact {
  const id = globalThis.crypto?.randomUUID?.() ?? `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, name: '', phone: '' };
}

function newText(text = ''): PlanTextBlock {
  const id = globalThis.crypto?.randomUUID?.() ?? `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return { type: 'text', id, text };
}

export function exampleSafetyPlan(): SafetyPlanDocument {
  const contact = { id: 'example-aino', name: 'Aino', phone: '+358 40 123 4567' };
  const lines = [
    'Evening plan: shower, tea, and something familiar on TV.',
    'Take a ten-minute walk around the block. Put on my yellow jumper.',
    'Quiet place: Kallio library reading room, open until 20:00.',
  ];
  return {
    v: 2,
    blocks: [
      ...lines.map((text, i) => ({ type: 'text' as const, id: `example-line-${i + 1}`, text })),
      { type: 'contact', id: contact.id, contact },
      { type: 'text', id: 'example-line-4', text: 'I can ask Aino for a chat or a walk.' },
      { type: 'text', id: 'example-line-5', text: 'Remember: water nearby, something to eat, one thing at a time.' },
    ],
    updated: null,
  };
}

function normaliseBlocks(value: unknown): PlanBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: PlanBlock[] = [];
  const seen = new Set<string>();
  let contacts = 0, characters = 0;
  const uniqueId = (candidate: unknown, fallback: string) => {
    let id = cleanId(candidate) || fallback;
    while (seen.has(id)) id = `${fallback}-${blocks.length + 1}`;
    seen.add(id);
    return id;
  };
  for (const [i, raw] of value.slice(0, MAX_BLOCKS).entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const block = raw as Record<string, unknown>;
    if (block.type === 'text') {
      const room = Math.max(0, MAX_TEXT_TOTAL - characters);
      const text = clean(block.text, Math.min(MAX_TEXT_PER_BLOCK, room));
      characters += text.length;
      blocks.push({ type: 'text', id: uniqueId(block.id, `line-${i + 1}`), text });
    } else if (block.type === 'contact' && contacts < MAX_CONTACTS) {
      const source = block.contact;
      if (!source || typeof source !== 'object') continue;
      const rawContact = source as Record<string, unknown>;
      const id = uniqueId(block.id || rawContact.id, `person-${i + 1}`);
      const contact = {
        id,
        name: clean(rawContact.name, 80),
        phone: clean(rawContact.phone, 40),
      };
      blocks.push({ type: 'contact', id, contact });
      contacts++;
    }
  }
  return blocks;
}

function parseV2(raw: unknown): SafetyPlanDocument | null {
  if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>).v !== 2
    || !Array.isArray((raw as Record<string, unknown>).blocks)) return null;
  const value = raw as Record<string, unknown>;
  return { v: 2, blocks: normaliseBlocks(value.blocks), updated: typeof value.updated === 'number' && Number.isFinite(value.updated) ? value.updated : null };
}

function migrateV1(raw: unknown): SafetyPlanDocument | null {
  if (!raw || typeof raw !== 'object' || (raw as Record<string, unknown>).v !== 1) return null;
  const value = raw as Record<string, unknown>;
  const legacyBlocks: unknown[] = [];
  if (Array.isArray(value.sections)) value.sections.slice(0, 4).forEach((text, i) => {
    legacyBlocks.push({ type: 'text', id: `legacy-line-${i + 1}`, text });
  });
  if (Array.isArray(value.contacts)) value.contacts.slice(0, MAX_CONTACTS).forEach((contact, i) => {
    if (!contact || typeof contact !== 'object') return;
    const c = contact as Record<string, unknown>;
    legacyBlocks.push({ type: 'contact', id: cleanId(c.id) || `legacy-person-${i + 1}`,
      contact: { name: clean(c.name, 80), phone: clean(c.phone, 40) } });
  });
  return {
    v: 2,
    blocks: normaliseBlocks(legacyBlocks),
    updated: typeof value.updated === 'number' && Number.isFinite(value.updated) ? value.updated : null,
  };
}

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function decode(raw: string | null): unknown {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function loadDocument(): { plan: SafetyPlanDocument; genuinelyNew: boolean } {
  const v2Raw = stored(SAFETY_PLAN_KEY), v1Raw = stored(LEGACY_SAFETY_PLAN_KEY);
  const current = parseV2(decode(v2Raw));
  if (current) return { plan: current, genuinelyNew: false };
  const legacy = migrateV1(decode(v1Raw));
  if (legacy) return { plan: legacy, genuinelyNew: false };
  // Malformed existing storage is not considered fresh: show a safe in-memory example, but do not replace it
  // until the person actually edits the plan.
  return { plan: exampleSafetyPlan(), genuinelyNew: v2Raw === null && v1Raw === null };
}

/** Read without writing. A missing plan uses the same concrete example as the Toolkit. */
export function readSafetyPlanDocument(): SafetyPlanDocument {
  return loadDocument().plan;
}

/** Seed only a genuinely new/reset demo. A valid empty v1/v2 plan deliberately stays empty. */
export function ensureSafetyPlanDocument(): SafetyPlanDocument {
  const { plan, genuinelyNew } = loadDocument();
  if (genuinelyNew) {
    try { localStorage.setItem(SAFETY_PLAN_KEY, JSON.stringify(plan)); } catch { /* private mode / full storage */ }
  }
  return plan;
}

export function saveSafetyPlanDocument(plan: SafetyPlanDocument): SafetyPlanDocument {
  const saved: SafetyPlanDocument = { v: 2, blocks: normaliseBlocks(plan.blocks), updated: Date.now() };
  localStorage.setItem(SAFETY_PLAN_KEY, JSON.stringify(saved));
  return saved;
}

/** Compatibility writer for any older caller. New UI code saves the interleaved document directly. */
export function saveSafetyPlan(plan: SafetyPlan): void {
  saveSafetyPlanDocument(migrateV1(plan)!);
}

export function readSafetyPlan(): SafetyPlan {
  const plan = readSafetyPlanDocument();
  return {
    v: 1,
    // Split multiline legacy/input blocks as well: Reflect gets the first actual non-empty line.
    sections: plan.blocks.flatMap(block => block.type === 'text' ? block.text.split('\n') : []),
    contacts: plan.blocks.flatMap(block => block.type === 'contact' ? [{ ...block.contact }] : []),
    updated: plan.updated,
  };
}

export function emptySafetyPlan(): SafetyPlan {
  return { v: 1, sections: ['', '', '', ''], contacts: [], updated: null };
}

export function callablePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 20) return '';
  return `${phone.trim().startsWith('+') ? '+' : ''}${digits}`;
}
