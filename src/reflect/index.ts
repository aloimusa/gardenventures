// Reflect is a small filing drawer: the current card lies open above the writer and older cards recede in dated
// strips. All content is local-first; only nonblank text entries ask the same-origin reply service for a response.
import './reflect.css';
import { log, localDate } from '../state';
import { cards, newId, addedToday, seedOnce, type Card } from './model';
import { callablePhone, readSafetyPlan } from '../toolkit/plan';
import { type Mood, moodName, moodColour, nextMood, faceSvg, CAMERA_SVG } from './moods';
import { putPhoto, photoUrl, toJpeg } from './photos';
import { reply, FALLBACK, type Entry as ReplyEntry, type Reply as ReplyResult } from './reply';
import { MAX_SHUFFLES, promptById, promptForDate, type DailyPrompt } from './prompts';
import { EMPTY_PLAN_RESOURCES, SAFETY_REPLY, hasSafetyPhrase } from './flags';
import { cardDate, firstWords, linkWeekday, recedingIndices, snapIndex, stripDate } from './drawer';

const MAX_CHARS = 220;
const MAX_BREAKS = 4;
const HOLD_MS = 500, SLOP_PX = 10;
const PENDING = 'Reading what you wrote…';
const DRAFT_KEY = 'garden.reflect.draft';
const PROMPT_KEY = 'garden.reflect.prompt.v1';
const LEGACY_PROMPT = 'No prompt saved with this historical card.';
const PHONE_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.59 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.27 1.73.47 2.63.59A2 2 0 0 1 22 16.92z"/></svg>`;

type Side = 'front' | 'back' | 'photo';
type SubmissionStage = 'lift' | 'waiting' | 'revealing';
interface SubmissionFlow {
  id: string; generation: number; stage: SubmissionStage; visibleText: string;
  flippedAt: number; gateTimer?: number; revealTimer?: number; streamTimer?: number;
}

export interface ReflectHandle { setVisible(v: boolean): void; doneToday(): boolean; refresh(): void }

export function mountReflect(pane: HTMLElement, opts: { onChange(): void; navigate(pane: string): void }): ReflectHandle {
  seedOnce();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  pane.insertAdjacentHTML('beforeend', `
    <div class="rf-drawer">
      <div class="rf-position" role="status" aria-live="polite" aria-atomic="true"></div>
      <p class="sr" id="rf-drawer-help">Drag vertically to file between cards. Tap an older strip to bring it forward. On a focused card, Arrow Up shows the older card and Arrow Down shows the newer card. Press E to edit.</p>
      <div class="rf-list" role="list" aria-label="Your card drawer" aria-describedby="rf-drawer-help"></div>
    </div>
    <div class="rf-writer" data-noswipe>
      <div class="rf-rule" aria-hidden="true"></div>
      <div class="rf-compose">
        <div class="rf-prompt-tools"><span class="rf-note" aria-live="polite"></span>
          <button class="rf-shuffle" type="button" aria-label="Show another writing prompt">↻ <span>Another prompt</span></button></div>
        <textarea class="rf-text" rows="3" maxlength="${MAX_CHARS}" aria-label="Write a few lines"
          autocomplete="off" autocapitalize="sentences" spellcheck="true"></textarea>
        <div class="rf-commit" role="group" aria-label="Add your card with a mood">
          <button class="rf-cam" type="button" aria-label="Add a photo"><span class="rf-cam-icon">${CAMERA_SVG}</span><img class="rf-cam-thumb" alt="" hidden /></button>
          <div class="rf-moods">${([0, 1, 2, 3] as const).map(mood => `
            <button class="rf-mood" type="button" data-mood="${mood}" aria-label="Add card with mood: ${moodName(mood)}" disabled>
              ${faceSvg(mood, 23)}<span>${moodName(mood)}</span></button>`).join('')}</div>
        </div>
      </div>
      <div class="rf-camera" hidden>
        <video class="rf-video" playsinline muted autoplay></video>
        <canvas class="rf-freeze" hidden></canvas>
        <p class="rf-cam-msg" hidden>The camera is not available here.
          <button class="rf-pick" type="button">Choose a photo</button></p>
        <button class="rf-cancel" type="button">Cancel</button>
        <button class="rf-shutter" type="button" aria-label="Take the photo"><span></span></button>
        <input class="rf-file" type="file" accept="image/*" capture="environment" hidden />
      </div>
    </div>
    <div class="rf-measure" aria-hidden="true"><div class="rf-card"><div class="rf-front"><div class="rf-tbox"><i class="rf-sp"></i><i class="rf-nt"></i><i class="rf-lsp"></i><i class="rf-ln"></i><div class="rf-txt"></div></div></div></div></div>
    <p class="sr" aria-live="polite"></p>`);
  const $ = <T extends Element>(s: string) => pane.querySelector<T>(s)!;
  const drawer = $<HTMLElement>('.rf-drawer'), list = $<HTMLElement>('.rf-list'), writer = $<HTMLElement>('.rf-writer');
  const ta = $<HTMLTextAreaElement>('.rf-text'), camBtn = $<HTMLButtonElement>('.rf-cam'), note = $<HTMLElement>('.rf-note');
  const camThumb = camBtn.querySelector<HTMLImageElement>('.rf-cam-thumb')!;
  const shuffleBtn = $<HTMLButtonElement>('.rf-shuffle'), compose = $<HTMLElement>('.rf-compose'), camera = $<HTMLElement>('.rf-camera');
  const video = $<HTMLVideoElement>('.rf-video'), freeze = $<HTMLCanvasElement>('.rf-freeze'), camMsg = $<HTMLElement>('.rf-cam-msg');
  const fileIn = $<HTMLInputElement>('.rf-file'), shutter = $<HTMLButtonElement>('.rf-shutter');
  const moodBtns = [...pane.querySelectorAll<HTMLButtonElement>('.rf-mood')];
  const measureTxt = $<HTMLElement>('.rf-measure .rf-txt'), measureBox = $<HTMLElement>('.rf-measure .rf-tbox');
  const live = $<HTMLElement>('p.sr[aria-live]');

  const sizeClass = (n: number) => (n <= 60 ? 's28' : n <= 130 ? 's22' : 's18');
  const writerSize = (n: number) => (n <= 70 ? 'w22' : 'w18');
  const find = (id: string) => cards().find(card => card.id === id);

  // ---------------------------------------------------------------- card text fitting and character limits
  function fits(text: string, editing = false): boolean {
    measureTxt.textContent = text;
    measureTxt.closest('.rf-front')!.className = `rf-front ${sizeClass(text.length)}`;
    measureTxt.closest('.rf-card')!.className = `rf-card${editing ? ' editing' : ''}`;
    const r = measureTxt.getBoundingClientRect(), b = measureBox.getBoundingClientRect();
    return r.bottom <= b.bottom + 0.5 && r.right <= b.right + 0.5;
  }
  const breaks = (s: string) => (s.match(/\n/g) || []).length;
  const allowed = (s: string, editing = false) => s.length <= MAX_CHARS && breaks(s) <= MAX_BREAKS && fits(s, editing);

  // ---------------------------------------------------------------- daily invitation and draft
  let promptUse = { date: localDate(), shuffles: 0 };
  try {
    const stored = JSON.parse(localStorage.getItem(PROMPT_KEY) || 'null');
    if (stored && stored.date === localDate() && Number.isInteger(stored.shuffles)) {
      promptUse.shuffles = Math.max(0, Math.min(MAX_SHUFFLES, stored.shuffles));
    }
  } catch { /* a corrupt counter simply starts this day again */ }
  try { localStorage.setItem(PROMPT_KEY, JSON.stringify(promptUse)); } catch { /* private mode can still use the deck */ }
  let prompt: DailyPrompt = promptForDate(promptUse.date, promptUse.shuffles);
  let draft: { text: string; photo: string | null } = { text: '', photo: null };
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d) draft = { text: String(d.text || ''), photo: d.photo || null };
  } catch { /* fresh */ }
  const saveDraft = () => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  const inFlight = new Set<string>();
  const isPending = () => inFlight.size > 0;
  let thumbLoad = 0;

  function paintCameraThumb(): void {
    const id = draft.photo;
    if (!id) {
      thumbLoad++; delete camThumb.dataset.photo;
      camThumb.hidden = true; camThumb.removeAttribute('src'); camBtn.classList.remove('loaded');
      return;
    }
    if (camThumb.dataset.photo === id) return;
    const request = ++thumbLoad;
    camThumb.dataset.photo = id;
    camThumb.hidden = true; camThumb.removeAttribute('src'); camBtn.classList.remove('loaded');
    void photoUrl(id).then(url => {
      if (!url || request !== thumbLoad || draft.photo !== id) return;
      camThumb.src = url; camThumb.hidden = false; camBtn.classList.add('loaded');
    });
  }

  function paintWriter(): void {
    const today = localDate();
    if (promptUse.date !== today) {
      promptUse = { date: today, shuffles: 0 };
      try { localStorage.setItem(PROMPT_KEY, JSON.stringify(promptUse)); } catch { /* storage may be unavailable */ }
      prompt = promptForDate(today, 0);
    }
    ta.value = draft.text;
    ta.className = `rf-text ${writerSize(draft.text.length)} ${prompt.kind}`;
    ta.placeholder = prompt.text;
    ta.readOnly = isPending();
    const canCommit = !isPending() && (!!draft.text.trim() || !!draft.photo);
    moodBtns.forEach(button => { button.disabled = !canCommit; });
    camBtn.disabled = isPending();
    camBtn.classList.toggle('on', !!draft.photo);
    camBtn.classList.toggle('primary', prompt.kind === 'photo');
    camBtn.setAttribute('aria-label', draft.photo ? 'Photo added. Take another photo' : prompt.kind === 'photo' ? 'Take a photo for this prompt' : 'Add a photo');
    paintCameraThumb();
    writer.dataset.kind = prompt.kind;
    note.textContent = draft.photo ? 'Photo added · text is optional' : '';
    shuffleBtn.disabled = isPending() || promptUse.shuffles >= MAX_SHUFFLES;
    shuffleBtn.title = promptUse.shuffles >= MAX_SHUFFLES ? 'No more alternatives today' : `${MAX_SHUFFLES - promptUse.shuffles} alternatives left today`;
    shuffleBtn.setAttribute('aria-label', `Show another writing prompt. ${MAX_SHUFFLES - promptUse.shuffles} left today`);
  }

  let lastGood = draft.text;
  ta.addEventListener('beforeinput', () => { lastGood = ta.value; });
  ta.addEventListener('input', () => {
    if (!allowed(ta.value)) {
      const at = Math.max(0, (ta.selectionStart ?? lastGood.length) - (ta.value.length - lastGood.length));
      ta.value = lastGood; ta.setSelectionRange(at, at);
    }
    draft.text = ta.value; saveDraft(); lastGood = ta.value;
    ta.className = `rf-text ${writerSize(draft.text.length)} ${prompt.kind}`;
    const enabled = !isPending() && (!!draft.text.trim() || !!draft.photo);
    moodBtns.forEach(button => { button.disabled = !enabled; });
  });
  shuffleBtn.addEventListener('click', () => {
    if (shuffleBtn.disabled || promptUse.shuffles >= MAX_SHUFFLES) return;
    promptUse.shuffles++;
    try { localStorage.setItem(PROMPT_KEY, JSON.stringify(promptUse)); } catch { /* the choice still works in memory */ }
    prompt = promptForDate(promptUse.date, promptUse.shuffles);
    paintWriter();
    log('reflect_prompt_shuffled', { date: promptUse.date, shuffles: promptUse.shuffles, prompt: prompt.id });
    live.textContent = `Another invitation: ${prompt.text}`;
  });

  // ---------------------------------------------------------------- drawer state
  let visible = false;
  let frontId: string | null = cards().at(-1)?.id ?? null;
  const sides = new Map<string, Side>();
  const els = new Map<string, HTMLElement>();
  let editingId: string | null = null;
  let gesture: { id: number; y: number; delta: number; moved: boolean } | null = null;
  let suppressClick = false;
  let cancelHold: (() => void) | null = null;
  let submissionSerial = 0;
  const submissions = new Map<string, SubmissionFlow>();

  function cardHtml(c: Card): string {
    return `<div class="rf-item" role="listitem" data-id="${c.id}">
      <button class="rf-strip" type="button"><span class="rf-strip-date"></span><span class="rf-strip-words"></span></button>
      <div class="rf-card" data-side="front">
        <div class="rf-flip">
          <div class="rf-front"><div class="rf-tbox"><i class="rf-sp"></i><i class="rf-nt"></i><i class="rf-lsp"></i><i class="rf-ln"></i><div class="rf-txt"></div></div><button class="rf-face" type="button"></button></div>
          <div class="rf-back">${c.photo ? '<img class="rf-img" alt="Photo on this card" />' : ''}<div class="rf-veil"></div>
            <div class="rf-back-content">
              <p class="rf-prompt-back"></p>
              <div class="rf-reply-block"><p class="rf-reply"></p></div>
              <button class="rf-link" type="button" hidden></button>
              <div class="rf-flag" hidden>
                <p class="rf-safety">${SAFETY_REPLY}</p>
                <p class="rf-flag-h">From your plan</p><p class="rf-flag-line"></p><p class="rf-resources"></p>
                <div class="rf-flag-row"><a class="rf-call" hidden>Call</a><button class="rf-plan" type="button">Open my plan</button></div>
              </div>
            </div>
          </div>
        </div>
        <button class="rf-done" type="button" hidden>Done</button>
        <button class="rf-remove" type="button" aria-label="Remove this card" hidden>Remove</button>
        <button class="rf-turn" type="button" aria-keyshortcuts="E ArrowUp ArrowDown"></button>
      </div>
    </div>`;
  }

  function validLinkedCard(c: Card): Card | null {
    if (!c.linkId || c.linkId === c.id) return null;
    return find(c.linkId) ?? null;
  }

  function paintCard(c: Card): void {
    const item = els.get(c.id)!, card = item.querySelector<HTMLElement>('.rf-card')!;
    const current = item.classList.contains('current');
    const side: Side = current ? sides.get(c.id) || 'front' : 'front';
    const editing = card.classList.contains('editing');
    const flagged = !!c.text.trim() && (c.flagged || hasSafetyPhrase(c.text));
    card.className = `rf-card ${sizeClass(c.text.length)}${editing ? ' editing' : ''}${flagged ? ' flagged' : ''}`;
    card.dataset.side = side;
    card.style.setProperty('--card', moodColour(c.mood));
    item.style.setProperty('--card', moodColour(c.mood));
    const txt = card.querySelector<HTMLElement>('.rf-txt')!;
    if (!editing) txt.textContent = c.text;

    const storedPrompt = promptById(c.prompt);
    card.querySelector('.rf-prompt-back')!.textContent = storedPrompt?.text ?? LEGACY_PROMPT;
    const canHaveReply = !!c.text.trim();
    const flow = submissions.get(c.id);
    const storedReply = flagged ? SAFETY_REPLY : canHaveReply ? inFlight.has(c.id) ? PENDING : c.reply ?? '' : '';
    let replyText = storedReply;
    if (flow && !flagged) {
      if (flow.stage === 'lift') replyText = '';
      else if (flow.stage === 'waiting') replyText = flow.visibleText || PENDING;
      else replyText = flow.visibleText;
    }
    card.dataset.submission = flow?.stage ?? 'settled';
    card.querySelector('.rf-reply')!.textContent = replyText;
    card.classList.toggle('pending', canHaveReply && !flagged && (inFlight.has(c.id) || flow?.stage === 'waiting'));
    card.querySelector<HTMLElement>('.rf-reply-block')!.hidden = flagged || !canHaveReply;
    const link = card.querySelector<HTMLButtonElement>('.rf-link')!, linked = validLinkedCard(c);
    link.hidden = !!flow || flagged || !linked || !canHaveReply || !c.reply;
    if (linked) {
      link.textContent = `You wrote about this on ${linkWeekday(linked)} too.`;
      link.dataset.link = linked.id;
    } else delete link.dataset.link;

    const img = card.querySelector<HTMLImageElement>('.rf-img');
    if (img && c.photo && !img.src) photoUrl(c.photo).then(url => { if (url && img.isConnected) img.src = url; });
    card.classList.toggle('has-photo', !!c.photo);

    const face = card.querySelector<HTMLButtonElement>('.rf-face')!;
    const faceAvailable = current && side === 'front';
    face.hidden = !faceAvailable;
    face.disabled = !faceAvailable;
    face.tabIndex = faceAvailable ? 0 : -1;
    face.setAttribute('aria-hidden', String(!faceAvailable));
    face.innerHTML = faceSvg(c.mood, 24);
    face.setAttribute('aria-label', `Mood: ${moodName(c.mood)}. Change to the next mood`);
    face.style.setProperty('--face-colour', moodColour(c.mood));
    const what = c.text.trim() ? `“${c.text.trim()}”` : c.photo ? 'A photo card' : 'A blank card';
    const showing = side === 'front' ? 'front showing' : side === 'photo' ? 'photo showing' : 'back showing';
    const turn = card.querySelector<HTMLButtonElement>('.rf-turn')!;
    turn.setAttribute('aria-label', `${what}. Mood: ${moodName(c.mood)}${c.photo ? '. Has a photo' : ''}. ${showing}. Turn the card. Press E to edit.`);
    turn.setAttribute('aria-description', 'Hold for half a second to edit or remove. Drag vertically, tap an older strip, or use Arrow Up and Arrow Down to move through the drawer.');

    const strip = item.querySelector<HTMLButtonElement>('.rf-strip')!;
    strip.querySelector('.rf-strip-date')!.textContent = stripDate(c);
    strip.querySelector('.rf-strip-words')!.textContent = firstWords(c.text, !!c.photo);
    strip.setAttribute('aria-label', `${stripDate(c)}: ${firstWords(c.text, !!c.photo)}. Bring this card to the front`);

    const flag = card.querySelector<HTMLElement>('.rf-flag')!;
    flag.hidden = !flagged;
    if (flagged) {
      const plan = readSafetyPlan();
      const firstLine = plan.sections.find(line => line.trim())?.trim() || '';
      const person = plan.contacts.map(contact => ({ contact, phone: callablePhone(contact.phone) })).find(entry => entry.phone);
      const empty = !firstLine && plan.contacts.length === 0;
      flag.querySelector<HTMLElement>('.rf-flag-h')!.hidden = empty;
      const line = flag.querySelector<HTMLElement>('.rf-flag-line')!;
      line.hidden = !firstLine; line.textContent = firstLine;
      const resources = flag.querySelector<HTMLElement>('.rf-resources')!;
      resources.hidden = !empty; resources.textContent = empty ? EMPTY_PLAN_RESOURCES : '';
      const call = flag.querySelector<HTMLAnchorElement>('.rf-call')!;
      call.hidden = !person;
      if (person) {
        const name = person.contact.name.trim() || 'my contact';
        const label = `Call ${name} at ${person.contact.phone.trim()}`;
        call.innerHTML = PHONE_SVG;
        call.setAttribute('aria-label', label); call.title = label;
        call.href = `tel:${person.phone}`;
      } else {
        call.replaceChildren(); call.removeAttribute('aria-label'); call.removeAttribute('title'); call.removeAttribute('href');
      }
    }
  }

  function render(): void {
    const all = cards(), ids = new Set(all.map(c => c.id));
    for (const [id, el] of els) if (!ids.has(id)) { el.remove(); els.delete(id); sides.delete(id); }
    if (!frontId || !ids.has(frontId)) frontId = all.at(-1)?.id ?? null;
    const current = Math.max(0, all.findIndex(c => c.id === frontId));
    const receding = new Set(recedingIndices(current, all.length));
    all.forEach((c, index) => {
      if (!els.has(c.id)) {
        list.insertAdjacentHTML('beforeend', cardHtml(c));
        const item = list.lastElementChild as HTMLElement;
        els.set(c.id, item); wire(item, c.id);
      }
      const item = els.get(c.id)!;
      const isCurrent = index === current;
      item.classList.toggle('current', isCurrent);
      item.classList.toggle('receding', !isCurrent);
      item.hidden = reduced.matches ? false : index > current || !receding.has(index) && !isCurrent;
      item.style.setProperty('--step', String(Math.max(0, current - index)));
      item.style.zIndex = reduced.matches ? '' : String(isCurrent ? 20 : 20 - (current - index));
      if (isCurrent) item.setAttribute('aria-current', 'true'); else item.removeAttribute('aria-current');
      paintCard(c);
    });
    const position = $<HTMLElement>('.rf-position');
    position.textContent = all.length ? `${current + 1} of ${all.length}` : 'No cards';
    position.setAttribute('aria-label', all.length ? `Card ${current + 1} of ${all.length}` : 'No cards');
    drawer.classList.toggle('reduced', reduced.matches);
    list.dataset.current = frontId ?? '';
  }

  function clearSubmissionTimers(flow: SubmissionFlow): void {
    if (flow.gateTimer !== undefined) clearTimeout(flow.gateTimer);
    if (flow.revealTimer !== undefined) clearTimeout(flow.revealTimer);
    if (flow.streamTimer !== undefined) clearTimeout(flow.streamTimer);
  }

  function finishSubmission(flow: SubmissionFlow): void {
    if (submissions.get(flow.id) !== flow) return;
    clearSubmissionTimers(flow); submissions.delete(flow.id);
    els.get(flow.id)?.classList.remove('arriving');
    const current = find(flow.id);
    if (current) {
      paintCard(current);
      if (current.text.trim()) live.textContent = current.flagged || hasSafetyPhrase(current.text) ? SAFETY_REPLY : current.reply ?? FALLBACK;
      else live.textContent = 'Photo card added. Its prompt is on the back.';
    }
  }

  function streamSubmission(flow: SubmissionFlow): void {
    if (submissions.get(flow.id) !== flow) return;
    const current = find(flow.id); if (!current) return;
    if (current.flagged || hasSafetyPhrase(current.text)) { finishSubmission(flow); return; }
    if (current.reply === null) { paintCard(current); return; }
    const pieces = current.reply.match(/\S+\s*/g) || [];
    if (!pieces.length) { finishSubmission(flow); return; }
    flow.stage = 'revealing'; flow.visibleText = '';
    let index = 0;
    const next = () => {
      if (submissions.get(flow.id) !== flow) return;
      flow.visibleText += pieces[index] || '';
      paintCard(current);
      index++;
      if (index >= pieces.length) { finishSubmission(flow); return; }
      const piece = pieces[index] || '';
      const eased = 42 + Math.min(90, piece.trim().length * 9) + (index % 3) * 17 + (/[.!?]$/.test(piece.trim()) ? 120 : 0);
      flow.streamTimer = window.setTimeout(next, eased);
    };
    next();
  }

  function revealWhenReady(id: string): void {
    const flow = submissions.get(id); if (!flow || flow.stage === 'lift' || flow.revealTimer !== undefined) return;
    const current = find(id); if (!current) return;
    if (!current.text.trim()) {
      flow.revealTimer = window.setTimeout(() => finishSubmission(flow), Math.max(0, 420 - (performance.now() - flow.flippedAt)));
      return;
    }
    if (current.reply === null) { paintCard(current); return; }
    const delay = reduced.matches ? 0 : Math.max(0, 420 - (performance.now() - flow.flippedAt));
    flow.revealTimer = window.setTimeout(() => {
      flow.revealTimer = undefined;
      if (submissions.get(id) === flow) streamSubmission(flow);
    }, delay);
    paintCard(current);
  }

  function beginSubmission(c: Card): void {
    if (reduced.matches) { sides.set(c.id, 'back'); paintCard(c); return; }
    const flow: SubmissionFlow = { id: c.id, generation: ++submissionSerial, stage: 'lift', visibleText: '', flippedAt: 0 };
    submissions.set(c.id, flow); sides.set(c.id, 'front'); paintCard(c);
    const item = els.get(c.id)!;
    item.dataset.liftCount = '1';
    requestAnimationFrame(() => {
      if (submissions.get(c.id) === flow && flow.stage === 'lift') item.classList.add('arriving');
    });
    flow.gateTimer = window.setTimeout(() => {
      if (submissions.get(c.id) !== flow) return;
      item.classList.remove('arriving');
      flow.stage = 'waiting'; flow.flippedAt = performance.now(); sides.set(c.id, 'back');
      paintCard(c); revealWhenReady(c.id);
    }, 2000);
  }

  function settleSubmissionsForReducedMotion(): void {
    if (!reduced.matches) return;
    for (const flow of submissions.values()) {
      clearSubmissionTimers(flow);
      els.get(flow.id)?.classList.remove('arriving');
      submissions.delete(flow.id);
      sides.set(flow.id, 'back');
      const current = find(flow.id); if (current) paintCard(current);
    }
  }

  function showCard(id: string, side: Side = 'front', focus = false): void {
    if (!find(id) || frontId !== id && submissions.has(frontId || '')) return;
    frontId = id; sides.set(id, side); render();
    const item = els.get(id)!;
    if (reduced.matches) item.scrollIntoView({ block: 'nearest' });
    if (focus) item.querySelector<HTMLButtonElement>('.rf-turn')!.focus({ preventScroll: true });
  }

  function stepCard(direction: -1 | 1, focus = false): void {
    const all = cards(), index = all.findIndex(c => c.id === frontId);
    const next = Math.max(0, Math.min(all.length - 1, index + direction));
    if (all[next] && next !== index) {
      log('card_drawer_moved', { from: frontId, to: all[next]!.id, via: focus ? 'keyboard' : 'button' });
      showCard(all[next]!.id, 'front', focus);
      live.textContent = `${stripDate(all[next]!)}. ${firstWords(all[next]!.text, !!all[next]!.photo)}`;
    }
  }

  // ---------------------------------------------------------------- turn, mood, and hold/keyboard editing
  function turn(id: string): void {
    if (editingId || submissions.has(id)) return;
    const c = find(id); if (!c || id !== frontId) return;
    const side = sides.get(id) || 'front';
    // Photo cards show front → photo → prompt/reply → front; text cards alternate front/back.
    const to: Side = c.photo ? side === 'front' ? 'photo' : side === 'photo' ? 'back' : 'front'
      : side === 'front' ? 'back' : 'front';
    sides.set(id, to); log('card_turned', { id, to }); paintCard(c);
  }

  function wire(item: HTMLElement, id: string): void {
    const card = item.querySelector<HTMLElement>('.rf-card')!;
    const turnBtn = card.querySelector<HTMLButtonElement>('.rf-turn')!;
    const txt = card.querySelector<HTMLElement>('.rf-txt')!;
    let press: { x: number; y: number; timer: number; moved: boolean } | null = null;
    let suppressTurn = false;

    turnBtn.addEventListener('pointerdown', e => {
      if (e.button > 0 || editingId) return;
      suppressTurn = false;
      press = { x: e.clientX, y: e.clientY, moved: false, timer: window.setTimeout(() => {
        if (!press || press.moved || gesture?.moved) return;
        press = null; suppressTurn = true;
        startEdit(id, 'hold');
      }, HOLD_MS) };
      cancelHold = () => { if (press) clearTimeout(press.timer); press = null; };
    });
    turnBtn.addEventListener('pointermove', e => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) {
        press.moved = true; suppressTurn = true; cancelHold?.();
      }
    });
    const lift = () => { cancelHold?.(); cancelHold = null; };
    turnBtn.addEventListener('pointerup', lift);
    turnBtn.addEventListener('pointercancel', () => { lift(); suppressTurn = true; });
    turnBtn.addEventListener('contextmenu', e => e.preventDefault());
    turnBtn.addEventListener('click', () => { if (suppressTurn || suppressClick) { suppressTurn = false; return; } turn(id); });
    turnBtn.addEventListener('keydown', e => {
      if (e.key.toLowerCase() === 'e') { e.preventDefault(); startEdit(id, 'key'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); stepCard(-1, true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); stepCard(1, true); }
    });

    item.querySelector<HTMLButtonElement>('.rf-strip')!.addEventListener('click', () => {
      if (!suppressClick) { showCard(id, 'front', true); live.textContent = 'Card brought to the front.'; }
    });
    card.querySelector('.rf-face')!.addEventListener('click', () => {
      const c = find(id); if (!c || id !== frontId || (sides.get(id) || 'front') !== 'front') return;
      const to = nextMood(c.mood);
      log('card_mood_changed', { id, from: c.mood, to });
      render(); opts.onChange();
    });
    card.querySelector('.rf-done')!.addEventListener('click', () => endEdit(id));
    card.querySelector('.rf-remove')!.addEventListener('click', () => removeCard(id));
    card.querySelector<HTMLButtonElement>('.rf-link')!.addEventListener('click', event => {
      const target = (event.currentTarget as HTMLButtonElement).dataset.link;
      if (target && validLinkedCard(find(id)!)) {
        log('card_link_opened', { id, to: target }); showCard(target, 'back', true);
      }
    });
    txt.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); endEdit(id); } });

    let good = '';
    txt.addEventListener('beforeinput', () => { good = txt.innerText; });
    txt.addEventListener('input', () => {
      const now = txt.innerText.replace(/\n$/, '');
      if (!allowed(now, true)) { txt.textContent = good; caretEnd(txt); return; }
      card.className = `rf-card ${sizeClass(now.length)} editing${hasSafetyPhrase(now) ? ' flagged' : ''}`;
      card.dataset.side = 'front';
    });
    txt.addEventListener('paste', e => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '');
    });
    item.querySelector('.rf-call')!.addEventListener('click', () => log('plan_call', { from: 'reflect', id }));
    item.querySelector('.rf-plan')!.addEventListener('click', () => { log('plan_open', { from: 'reflect', id }); opts.navigate('toolkit'); });
  }

  function caretEnd(el: HTMLElement): void {
    el.focus();
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  }

  function startEdit(id: string, via: string): void {
    if (id !== frontId || !find(id) || submissions.has(id)) return;
    if (editingId) endEdit(editingId);
    const card = els.get(id)!.querySelector<HTMLElement>('.rf-card')!;
    const txt = card.querySelector<HTMLElement>('.rf-txt')!;
    const go = () => {
      sides.set(id, 'front'); paintCard(find(id)!);
      editingId = id; pane.classList.add('card-editing');
      card.classList.add('editing');
      card.querySelector<HTMLButtonElement>('.rf-done')!.hidden = false;
      card.querySelector<HTMLButtonElement>('.rf-remove')!.hidden = false;
      card.querySelector<HTMLButtonElement>('.rf-turn')!.tabIndex = -1;
      txt.setAttribute('contenteditable', 'plaintext-only');
      if (txt.contentEditable !== 'plaintext-only') txt.setAttribute('contenteditable', 'true');
      txt.setAttribute('role', 'textbox'); txt.setAttribute('aria-multiline', 'true'); txt.setAttribute('aria-label', 'Edit this card');
      log('card_edit_start', { id, via }); caretEnd(txt); liftForKeyboard();
    };
    if (reduced.matches || via === 'key') { go(); return; }
    card.classList.add('shake');
    setTimeout(() => { card.classList.remove('shake'); go(); }, 320);
  }

  function endEdit(id: string): void {
    if (editingId !== id) return;
    editingId = null; pane.classList.remove('card-editing');
    const card = els.get(id)!.querySelector<HTMLElement>('.rf-card')!;
    const txt = card.querySelector<HTMLElement>('.rf-txt')!;
    const to = txt.innerText.replace(/\n$/, '');
    txt.removeAttribute('contenteditable'); txt.removeAttribute('role'); txt.removeAttribute('aria-label'); txt.removeAttribute('aria-multiline');
    card.classList.remove('editing');
    card.querySelector<HTMLButtonElement>('.rf-done')!.hidden = true;
    card.querySelector<HTMLButtonElement>('.rf-remove')!.hidden = true;
    card.querySelector<HTMLButtonElement>('.rf-turn')!.tabIndex = 0;
    const from = find(id)?.text ?? '';
    if (to !== from) log('card_text_edited', { id, from, to });
    log('card_edit_end', { id, changed: to !== from });
    paintCard(find(id)!);
    card.querySelector<HTMLButtonElement>('.rf-turn')!.focus({ preventScroll: true });
  }

  function removeCard(id: string): void {
    if (editingId !== id) return;
    endEdit(id); log('card_deleted', { id });
    live.textContent = 'Card removed.'; frontId = null; render(); opts.onChange();
    camBtn.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- one request, with a bounded five-card text history
  async function ask(c: Card): Promise<void> {
    if (!c.text.trim() || !find(c.id) || inFlight.has(c.id)) return;
    // A local phrase match is answered locally, without a network call or a pending lock.
    if (hasSafetyPhrase(c.text)) {
      if (find(c.id)?.reply === null) log('card_reply_received', { id: c.id, reply: SAFETY_REPLY, flagged: true, source: 'local', linkId: null });
      paintCard(find(c.id)!); revealWhenReady(c.id); return;
    }
    const storedPrompt = promptById(c.prompt);
    // Historical records with neither value preserved remain visibly historical; never invent data to send.
    if (c.mood === null || !storedPrompt) return;
    const all = cards(), currentIndex = all.findIndex(card => card.id === c.id);
    const history = all.slice(0, Math.max(0, currentIndex)).slice(-5).map(card => ({
      id: card.id, date: cardDate(card), text: card.text,
    }));
    const entry: ReplyEntry = {
      id: c.id, text: c.text, mood: c.mood, prompt: storedPrompt,
      hasPhoto: !!c.photo, history,
    };
    inFlight.add(c.id); paintWriter(); paintCard(c);
    try {
      const result = await reply(entry).catch((): ReplyResult => ({ reply: FALLBACK, linkId: null, flagged: false, source: 'fallback' }));
      const current = find(c.id);
      if (!current || current.reply !== null) return;
      const flagged = !!result.flagged || hasSafetyPhrase(c.text) || hasSafetyPhrase(current.text);
      const candidate = result.linkId;
      const linkId = candidate && candidate !== c.id && find(candidate) ? candidate : null;
      const text = typeof result.reply === 'string' && result.reply.trim() ? result.reply : FALLBACK;
      const source = typeof result.source === 'string' ? result.source : 'fallback';
      log('card_reply_received', { id: c.id, reply: flagged ? SAFETY_REPLY : text, flagged, source, linkId });
    } finally {
      inFlight.delete(c.id); paintWriter();
      const current = find(c.id); if (current) {
        paintCard(current); revealWhenReady(c.id);
        if (!submissions.has(c.id)) live.textContent = current.flagged || hasSafetyPhrase(current.text) ? SAFETY_REPLY : current.reply ?? FALLBACK;
      }
    }
  }

  function commit(mood: Mood): void {
    if (mood === null || isPending() || (!draft.text.trim() && !draft.photo)) return;
    const text = draft.text.replace(/\s+$/, ''), id = newId();
    log('card_created', { id, text, mood, prompt: prompt.id, ...(draft.photo ? { photo: draft.photo } : {}) });
    if (draft.photo) log('card_photo_attached', { id, photo: draft.photo });
    frontId = id; sides.set(id, reduced.matches ? 'back' : 'front');
    draft = { text: '', photo: null }; saveDraft(); lastGood = '';
    render(); paintWriter(); opts.onChange();
    if (reduced.matches) els.get(id)?.scrollIntoView({ block: 'nearest' });
    const created = find(id)!;
    beginSubmission(created);
    if (created.text.trim()) void ask(created);
    else if (reduced.matches) live.textContent = 'Photo card added. Its prompt is on the back.';
  }

  moodBtns.forEach(button => button.addEventListener('click', () => commit(Number(button.dataset.mood) as Mood)));

  // ---------------------------------------------------------------- vertical filing gesture and alternatives
  list.addEventListener('pointerdown', e => {
    if (reduced.matches || editingId || e.button > 0 || (e.target as Element).closest('.rf-face,.rf-done,.rf-remove,.rf-link,.rf-plan,.rf-call')) return;
    gesture = { id: e.pointerId, y: e.clientY, delta: 0, moved: false };
  });
  list.addEventListener('pointermove', e => {
    if (!gesture || gesture.id !== e.pointerId) return;
    gesture.delta = e.clientY - gesture.y;
    if (!gesture.moved && Math.abs(gesture.delta) > SLOP_PX) {
      gesture.moved = true; cancelHold?.(); list.setPointerCapture(e.pointerId); list.classList.add('dragging');
    }
    if (gesture.moved) {
      e.preventDefault();
      const delta = Math.max(-100, Math.min(180, gesture.delta));
      list.style.setProperty('--drag-y', `${delta}px`);
    }
  });
  function finishGesture(e: PointerEvent): void {
    if (!gesture || gesture.id !== e.pointerId) return;
    const g = gesture; gesture = null; cancelHold?.(); cancelHold = null;
    list.classList.remove('dragging'); list.style.removeProperty('--drag-y');
    if (list.hasPointerCapture(e.pointerId)) list.releasePointerCapture(e.pointerId);
    if (g.moved) {
      suppressClick = true;
      const all = cards(), current = Math.max(0, all.findIndex(c => c.id === frontId));
      const next = snapIndex(current, g.delta, all.length);
      if (next !== current && all[next]) showCard(all[next]!.id);
      setTimeout(() => { suppressClick = false; }, 0);
    }
  }
  list.addEventListener('pointerup', finishGesture);
  list.addEventListener('pointercancel', finishGesture);
  list.addEventListener('click', e => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  reduced.addEventListener('change', () => { gesture = null; settleSubmissionsForReducedMotion(); render(); });

  // ---------------------------------------------------------------- on-device camera and photos
  let stream: MediaStream | null = null;
  function stopStream(): void { stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; }
  function closeCamera(): void {
    stopStream(); camera.hidden = true; compose.hidden = false; freeze.hidden = true; camMsg.hidden = true;
    writer.classList.remove('cam');
  }
  async function attach(blob: Blob, via: string): Promise<void> {
    const id = await putPhoto(blob);
    draft.photo = id; saveDraft(); log('photo_taken', { via, photo: id }); paintWriter();
  }
  camBtn.addEventListener('click', async () => {
    if (isPending()) return;
    log('camera_open', {});
    compose.hidden = true; camera.hidden = false; writer.classList.add('cam');
    shutter.hidden = false; camMsg.hidden = true; video.hidden = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
      if (camera.hidden) { stopStream(); return; }
      video.srcObject = stream; await video.play().catch(() => {});
    } catch (err) {
      log('camera_unavailable', { error: String((err as Error)?.name || err) });
      shutter.hidden = true; video.hidden = true; camMsg.hidden = false;
    }
  });
  pane.querySelector('.rf-cancel')!.addEventListener('click', () => { log('camera_cancel', {}); closeCamera(); camBtn.focus(); });
  shutter.addEventListener('click', async () => {
    if (!stream || !video.videoWidth) return;
    const w = video.videoWidth, h = video.videoHeight;
    freeze.width = w; freeze.height = h; freeze.getContext('2d')!.drawImage(video, 0, 0, w, h);
    freeze.hidden = false; stopStream();
    const blob = await toJpeg(freeze, w, h); await attach(blob, 'camera');
    setTimeout(() => { closeCamera(); camBtn.focus(); }, reduced.matches ? 0 : 350);
  });
  pane.querySelector('.rf-pick')!.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files?.[0]; fileIn.value = ''; if (!file) return;
    const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) return;
    await attach(await toJpeg(bmp, bmp.width, bmp.height), 'file'); closeCamera(); camBtn.focus();
  });

  // ---------------------------------------------------------------- reserve space for the on-screen keyboard
  let fakeKb = 0;
  function liftForKeyboard(): void {
    const vv = window.visualViewport;
    const overlap = fakeKb || (vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0);
    const bar = document.querySelector<HTMLElement>('.bar')?.offsetHeight || 96;
    const typing = document.activeElement === ta || !!editingId;
    const lift = typing ? Math.max(0, overlap - bar) : 0;
    pane.style.setProperty('--kb', `${lift}px`);
    if (editingId && lift) els.get(editingId)?.scrollIntoView({ block: 'nearest' });
  }
  window.visualViewport?.addEventListener('resize', liftForKeyboard);
  window.visualViewport?.addEventListener('scroll', liftForKeyboard);
  ta.addEventListener('focus', liftForKeyboard);
  ta.addEventListener('blur', () => setTimeout(liftForKeyboard, 50));
  (globalThis as any).garden.reflectKb = (px: number) => { fakeKb = px; liftForKeyboard(); };

  // ---------------------------------------------------------------- start
  render(); paintWriter();
  for (const c of cards()) {
    if (c.text.trim() && c.reply === null && !c.seed) {
      if (c.id === frontId) sides.set(c.id, 'back');
      void ask(c);
    }
  }

  return {
    setVisible(value) {
      if (value === visible) return;
      visible = value;
      if (value) paintWriter();
      else { if (!camera.hidden) closeCamera(); if (editingId) endEdit(editingId); }
    },
    doneToday: addedToday,
    refresh() { paintWriter(); render(); },
  };
}
