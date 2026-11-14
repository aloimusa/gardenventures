// Reflect: a stack of the person's own cards. They write a few lines at the bottom, press Add, and the card joins
// the stack turned over, showing one sentence back. Everything the stack shows is derived from the event log.
import './reflect.css';
import { log, state } from '../state';
import { cards, newId, addedToday, seedOnce, PLAN_STUB, type Card } from './model';
import { type Mood, moodName, moodColour, nextMood, faceSvg, MOOD_COLOUR, NO_MOOD_RULE, CAMERA_SVG } from './moods';
import { putPhoto, photoUrl, toJpeg } from './photos';
import { reply, FALLBACK } from './reply';

const MAX_CHARS = 220;
const MAX_BREAKS = 4;              // at most five lines by hand; the fit check below catches the rest
const HOLD_MS = 500, SLOP_PX = 10;
const PENDING = 'Reading what you wrote…';
const PLACEHOLDERS = ['What is on your mind?', 'One thing from today?'];
const DRAFT_KEY = 'garden.reflect.draft', PH_KEY = 'garden.reflect.ph';

type Side = 'front' | 'back' | 'photo' | 'reply';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const sizeClass = (n: number) => (n <= 60 ? 's28' : n <= 130 ? 's22' : 's18');
const writerSize = (n: number) => (n <= 70 ? 'w22' : 'w18');

export interface ReflectHandle { setVisible(v: boolean): void; doneToday(): boolean; refresh(): void }

export function mountReflect(pane: HTMLElement, opts: { onChange(): void; navigate(pane: string): void }): ReflectHandle {
  seedOnce();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  pane.insertAdjacentHTML('beforeend', `
    <div class="rf-list" role="list" aria-label="Your cards"></div>
    <div class="rf-writer" data-noswipe>
      <div class="rf-rule" aria-hidden="true"></div>
      <div class="rf-compose">
        <textarea class="rf-text" rows="3" maxlength="${MAX_CHARS}" aria-label="Write a few lines"
          autocomplete="off" autocapitalize="sentences" spellcheck="true"></textarea>
        <div class="rf-row">
          <button class="rf-cam" type="button" aria-label="Add a photo">${CAMERA_SVG}</button>
          <span class="rf-note" aria-live="polite"></span>
          <button class="rf-add" type="button">Add</button>
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
    <div class="rf-measure" aria-hidden="true"><div class="rf-card"><div class="rf-tbox"><i class="rf-sp"></i><i class="rf-nt"></i><i class="rf-lsp"></i><i class="rf-ln"></i><div class="rf-txt"></div></div></div></div>
    <p class="sr" aria-live="polite"></p>`);
  const $ = <T extends Element>(s: string) => pane.querySelector<T>(s)!;
  const list = $<HTMLElement>('.rf-list'), writer = $<HTMLElement>('.rf-writer'), rule = $<HTMLElement>('.rf-rule');
  const ta = $<HTMLTextAreaElement>('.rf-text'), camBtn = $<HTMLButtonElement>('.rf-cam'), note = $<HTMLElement>('.rf-note');
  const addBtn = $<HTMLButtonElement>('.rf-add'), compose = $<HTMLElement>('.rf-compose'), camera = $<HTMLElement>('.rf-camera');
  const video = $<HTMLVideoElement>('.rf-video'), freeze = $<HTMLCanvasElement>('.rf-freeze'), camMsg = $<HTMLElement>('.rf-cam-msg');
  const fileIn = $<HTMLInputElement>('.rf-file'), shutter = $<HTMLButtonElement>('.rf-shutter');
  const measureTxt = $<HTMLElement>('.rf-measure .rf-txt'), measureBox = $<HTMLElement>('.rf-measure .rf-tbox');
  const live = pane.querySelector<HTMLElement>('p.sr')!;

  // ---------------------------------------------------------------- fit: the text must never overflow a card
  function fits(text: string, editing = false): boolean {
    measureTxt.textContent = text;
    measureTxt.parentElement!.parentElement!.className = `rf-card ${sizeClass(text.length)}${editing ? ' editing' : ''}`;
    const r = measureTxt.getBoundingClientRect(), b = measureBox.getBoundingClientRect();
    return r.bottom <= b.bottom + 0.5;
  }
  const breaks = (s: string) => (s.match(/\n/g) || []).length;
  const allowed = (s: string, editing = false) => s.length <= MAX_CHARS && breaks(s) <= MAX_BREAKS && fits(s, editing);

  // ---------------------------------------------------------------- draft (stays when the pane is left)
  let draft: { text: string; photo: string | null } = { text: '', photo: null };
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (d) draft = { text: String(d.text || ''), photo: d.photo || null }; } catch { /* fresh */ }
  const saveDraft = () => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  let pending = 0;   // replies in flight; the writing area is locked meanwhile

  function paintWriter(): void {
    ta.value = draft.text;
    ta.className = `rf-text ${writerSize(draft.text.length)}`;
    ta.placeholder = PLACEHOLDERS[Number(localStorage.getItem(PH_KEY) || 0) % 2];
    ta.readOnly = pending > 0;
    camBtn.classList.toggle('on', !!draft.photo);
    camBtn.setAttribute('aria-label', draft.photo ? 'Photo added. Take another photo' : 'Add a photo');
    camBtn.disabled = pending > 0;
    note.textContent = draft.photo ? 'Photo added' : '';
    addBtn.disabled = pending > 0 || (!draft.text.trim() && !draft.photo);
    const m = state.mood;
    rule.style.background = m === null ? NO_MOOD_RULE : MOOD_COLOUR[m];
  }

  let lastGood = draft.text;
  ta.addEventListener('beforeinput', () => { lastGood = ta.value; });
  ta.addEventListener('input', () => {
    if (!allowed(ta.value)) {
      const at = Math.max(0, (ta.selectionStart ?? lastGood.length) - (ta.value.length - lastGood.length));
      ta.value = lastGood; ta.setSelectionRange(at, at);
    }
    draft.text = ta.value; saveDraft(); lastGood = ta.value;
    ta.className = `rf-text ${writerSize(draft.text.length)}`;
    addBtn.disabled = pending > 0 || (!draft.text.trim() && !draft.photo);
  });

  // ---------------------------------------------------------------- the stack
  let visible = false;
  const sides = new Map<string, Side>();
  const els = new Map<string, HTMLElement>();

  function cardHtml(c: Card): string {
    return `<div class="rf-item" role="listitem" data-id="${c.id}">
      <div class="rf-card">
        <div class="rf-flip">
          <div class="rf-front"><div class="rf-tbox"><i class="rf-sp"></i><i class="rf-nt"></i><i class="rf-lsp"></i><i class="rf-ln"></i><div class="rf-txt"></div></div></div>
          <div class="rf-back">${c.photo ? '<img class="rf-img" alt="" />' : ''}<div class="rf-veil"></div><p class="rf-reply"></p></div>
        </div>
        <button class="rf-done" type="button" hidden>Done</button>
        <button class="rf-turn" type="button"></button>
        <button class="rf-face" type="button"></button>
        <button class="rf-editkey" type="button">Rewrite</button>
      </div>
      <div class="rf-flag" hidden>
        <p class="rf-flag-h">From your plan</p>
        <p class="rf-flag-line">${esc(PLAN_STUB.firstLine)}</p>
        <div class="rf-flag-row">
          <button class="rf-call" type="button">Call ${esc(PLAN_STUB.person)}</button>
          <button class="rf-plan" type="button">Open my plan</button>
        </div>
      </div>
    </div>`;
  }

  function paintCard(c: Card): void {
    const item = els.get(c.id)!, card = item.querySelector<HTMLElement>('.rf-card')!;
    const side = sides.get(c.id) || 'front';
    const editing = card.classList.contains('editing');
    card.className = `rf-card ${sizeClass(c.text.length)}${editing ? ' editing' : ''}`;
    card.dataset.side = side;
    card.style.setProperty('--card', moodColour(c.mood));
    const txt = card.querySelector<HTMLElement>('.rf-txt')!;
    if (!editing) txt.textContent = c.text;
    card.querySelector('.rf-reply')!.textContent = c.reply ?? PENDING;
    card.classList.toggle('pending', c.reply === null);
    const img = card.querySelector<HTMLImageElement>('.rf-img');
    if (img && c.photo && !img.src) photoUrl(c.photo).then(u => { if (u) img.src = u; });
    const face = card.querySelector<HTMLButtonElement>('.rf-face')!;
    face.innerHTML = faceSvg(c.mood);
    face.setAttribute('aria-label', `Mood: ${moodName(c.mood)}. Change mood`);
    const showing = side === 'front' ? 'front showing' : side === 'photo' ? 'photo showing' : `reply showing: ${c.reply ?? PENDING}`;
    const what = c.text.trim() ? `“${c.text.trim()}”` : c.photo ? 'A photo' : 'An empty card';
    card.querySelector('.rf-turn')!.setAttribute('aria-label', `${what}. Mood: ${moodName(c.mood)}${c.photo ? '. Has a photo' : ''}. ${showing}. Turn the card`);
    card.querySelector('.rf-editkey')!.setAttribute('aria-label', `Rewrite this card: ${what}`);
    const flag = item.querySelector<HTMLElement>('.rf-flag')!;
    const open = c.flagged && side !== 'front';
    if (open && flag.hidden && visible) requestAnimationFrame(() => flag.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' }));
    flag.hidden = !open;
  }

  function render(): void {
    for (const c of cards()) {
      if (!els.has(c.id)) {
        list.insertAdjacentHTML('beforeend', cardHtml(c));
        const item = list.lastElementChild as HTMLElement;
        els.set(c.id, item); wire(item, c.id);
      }
      paintCard(c);
    }
  }
  const find = (id: string) => cards().find(c => c.id === id)!;

  // ---------------------------------------------------------------- turning, mood, hold to rewrite
  function turn(id: string): void {
    const c = find(id), s = sides.get(id) || 'front';
    const to: Side = c.photo ? (s === 'front' ? 'photo' : s === 'photo' ? 'reply' : 'front') : (s === 'front' ? 'back' : 'front');
    sides.set(id, to);
    log('card_turned', { id, to });
    paintCard(c);
  }

  function wire(item: HTMLElement, id: string): void {
    const card = item.querySelector<HTMLElement>('.rf-card')!;
    const turnBtn = card.querySelector<HTMLButtonElement>('.rf-turn')!;
    const txt = card.querySelector<HTMLElement>('.rf-txt')!;
    let press: { x: number; y: number; timer: number; moved: boolean } | null = null;
    let suppress = false;

    turnBtn.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      suppress = false;
      press = { x: e.clientX, y: e.clientY, moved: false, timer: window.setTimeout(() => {
        if (!press || press.moved) return;
        press = null; suppress = true;
        startEdit(id, 'hold');
      }, HOLD_MS) };
    });
    turnBtn.addEventListener('pointermove', e => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP_PX) { press.moved = true; suppress = true; clearTimeout(press.timer); press = null; }
    });
    const lift = () => { if (press) { clearTimeout(press.timer); press = null; } };
    turnBtn.addEventListener('pointerup', lift);
    turnBtn.addEventListener('pointercancel', () => { lift(); suppress = true; });
    turnBtn.addEventListener('contextmenu', e => e.preventDefault());
    turnBtn.addEventListener('click', () => { if (suppress) { suppress = false; return; } turn(id); });

    card.querySelector('.rf-face')!.addEventListener('click', () => {
      const c = find(id), to = nextMood(c.mood);
      log('card_mood_changed', { id, from: c.mood, to });
      paintCard(find(id));
    });
    card.querySelector('.rf-editkey')!.addEventListener('click', () => startEdit(id, 'key'));
    card.querySelector('.rf-done')!.addEventListener('click', () => endEdit(id));
    txt.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); endEdit(id); } });

    // editing in place: same limits as the writing area, measured in the card's own edit layout
    let good = '';
    txt.addEventListener('beforeinput', () => { good = txt.innerText; });
    txt.addEventListener('input', () => {
      const now = txt.innerText.replace(/\n$/, '');
      if (!allowed(now, true)) { txt.textContent = good; caretEnd(txt); return; }
      card.className = `rf-card ${sizeClass(now.length)} editing`;
      card.dataset.side = 'front';
    });
    txt.addEventListener('paste', e => {      // plain text only, whatever the clipboard holds
      e.preventDefault();
      const t = e.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText', false, t);
    });

    item.querySelector('.rf-call')!.addEventListener('click', () => log('plan_call', { from: 'reflect', id, stub: true }));
    item.querySelector('.rf-plan')!.addEventListener('click', () => { log('plan_open', { from: 'reflect', id }); opts.navigate('toolkit'); });
  }

  function caretEnd(el: HTMLElement): void {
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
  }

  let editingId: string | null = null;
  function startEdit(id: string, via: string): void {
    if (editingId) endEdit(editingId);
    const card = els.get(id)!.querySelector<HTMLElement>('.rf-card')!;
    const txt = card.querySelector<HTMLElement>('.rf-txt')!;
    const go = () => {
      sides.set(id, 'front'); paintCard(find(id));
      editingId = id;
      card.classList.add('editing');
      card.querySelector<HTMLButtonElement>('.rf-done')!.hidden = false;
      card.querySelector<HTMLButtonElement>('.rf-turn')!.tabIndex = -1;      // Tab from the text goes to Done
      card.querySelector<HTMLButtonElement>('.rf-editkey')!.tabIndex = -1;
      card.closest('.rf-item')!.setAttribute('data-noswipe', '');
      txt.setAttribute('contenteditable', 'plaintext-only');
      if (txt.contentEditable !== 'plaintext-only') txt.setAttribute('contenteditable', 'true');
      txt.setAttribute('role', 'textbox'); txt.setAttribute('aria-multiline', 'true'); txt.setAttribute('aria-label', 'Rewrite the card');
      log('card_edit_start', { id, via });
      caretEnd(txt);
      liftForKeyboard();
    };
    if (reduced.matches || via === 'key') { go(); return; }
    card.classList.add('shake');
    setTimeout(() => { card.classList.remove('shake'); go(); }, 320);
  }

  function endEdit(id: string): void {
    if (editingId !== id) return;
    editingId = null;
    const card = els.get(id)!.querySelector<HTMLElement>('.rf-card')!;
    const txt = card.querySelector<HTMLElement>('.rf-txt')!;
    const to = txt.innerText.replace(/\n$/, '');
    txt.removeAttribute('contenteditable'); txt.removeAttribute('role'); txt.removeAttribute('aria-label'); txt.removeAttribute('aria-multiline');
    card.classList.remove('editing');
    card.querySelector<HTMLButtonElement>('.rf-done')!.hidden = true;
    card.querySelector<HTMLButtonElement>('.rf-turn')!.tabIndex = 0;
    card.querySelector<HTMLButtonElement>('.rf-editkey')!.tabIndex = 0;
    card.closest('.rf-item')!.removeAttribute('data-noswipe');
    const from = find(id).text;
    if (to !== from) log('card_text_edited', { id, from, to });
    log('card_edit_end', { id, changed: to !== from });
    paintCard(find(id));
    card.querySelector<HTMLButtonElement>('.rf-turn')!.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- Add, and the one sentence back
  function ask(c: Card): void {
    pending++; paintWriter();
    reply({ text: c.text, hasPhoto: !!c.photo, mood: c.mood }).then(r => {
      if (find(c.id).reply === null) log('card_reply_received', { id: c.id, reply: r.reply, flagged: r.flagged, source: r.source });
      pending--; paintWriter();
      const now = find(c.id);
      paintCard(now);
      live.textContent = now.reply ?? FALLBACK;
    });
  }

  addBtn.addEventListener('click', () => {
    if (addBtn.disabled) return;
    const text = draft.text.replace(/\s+$/, '');
    const id = newId(), mood = state.mood as Mood;
    log('card_created', { id, text, mood, ...(draft.photo ? { photo: draft.photo } : {}) });
    if (draft.photo) log('card_photo_attached', { id, photo: draft.photo });
    sides.set(id, draft.photo ? 'reply' : 'back');
    draft = { text: '', photo: null }; saveDraft(); lastGood = '';
    localStorage.setItem(PH_KEY, String((Number(localStorage.getItem(PH_KEY) || 0) + 1) % 2));
    render();
    list.scrollTo({ top: list.scrollHeight, behavior: reduced.matches ? 'auto' : 'smooth' });
    ask(find(id));
    opts.onChange();
  });

  // ---------------------------------------------------------------- camera
  let stream: MediaStream | null = null;
  function stopStream(): void { stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; }
  function closeCamera(): void {
    stopStream();
    camera.hidden = true; compose.hidden = false; freeze.hidden = true; camMsg.hidden = true;
    writer.classList.remove('cam');
  }
  async function attach(blob: Blob, via: string): Promise<void> {
    const id = await putPhoto(blob);
    draft.photo = id; saveDraft();
    log('photo_taken', { via, photo: id });
    paintWriter();
  }
  camBtn.addEventListener('click', async () => {
    if (pending) return;
    log('camera_open', {});
    compose.hidden = true; camera.hidden = false; writer.classList.add('cam');
    shutter.hidden = false; camMsg.hidden = true; video.hidden = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
      if (camera.hidden) { stopStream(); return; }            // cancelled while asking
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
    freeze.width = w; freeze.height = h;
    freeze.getContext('2d')!.drawImage(video, 0, 0, w, h);
    freeze.hidden = false; stopStream();                         // the frame freezes...
    const blob = await toJpeg(freeze, w, h);
    await attach(blob, 'camera');
    setTimeout(() => { closeCamera(); camBtn.focus(); }, reduced.matches ? 0 : 350);   // ...then the view closes
  });
  pane.querySelector('.rf-pick')!.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0]; fileIn.value = '';
    if (!f) return;
    const bmp = await createImageBitmap(f).catch(() => null);
    if (!bmp) return;
    await attach(await toJpeg(bmp, bmp.width, bmp.height), 'file');
    closeCamera(); camBtn.focus();
  });

  // ---------------------------------------------------------------- the on-screen keyboard
  // On a phone the keyboard covers the bottom of the layout viewport. Lift the writing area (or scroll the card
  // being rewritten) so it stays above it. TEST HOOK: garden.reflectKb(px) simulates a keyboard of that height.
  let fakeKb = 0;
  function liftForKeyboard(): void {
    const vv = window.visualViewport;
    const overlap = fakeKb || (vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0);
    const bar = document.querySelector<HTMLElement>('.bar')?.offsetHeight || 96;
    const typing = document.activeElement === ta || !!editingId;
    const lift = typing ? Math.max(0, overlap - bar) : 0;
    pane.style.setProperty('--kb', `${lift}px`);
    if (editingId && lift) els.get(editingId)!.scrollIntoView({ block: 'nearest' });
  }
  window.visualViewport?.addEventListener('resize', liftForKeyboard);
  window.visualViewport?.addEventListener('scroll', liftForKeyboard);
  ta.addEventListener('focus', liftForKeyboard);
  ta.addEventListener('blur', () => setTimeout(liftForKeyboard, 50));
  (globalThis as any).garden.reflectKb = (px: number) => { fakeKb = px; liftForKeyboard(); };

  // ---------------------------------------------------------------- start
  render();
  paintWriter();
  list.scrollTop = list.scrollHeight;                    // opens on the newest card
  for (const c of cards()) if (c.reply === null && !c.seed) { sides.set(c.id, c.photo ? 'reply' : 'back'); paintCard(c); ask(c); }

  return {
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      if (v) { paintWriter(); if (!list.dataset.opened) { list.dataset.opened = '1'; list.scrollTop = list.scrollHeight; } }
      else { if (!camera.hidden) closeCamera(); if (editingId) endEdit(editingId); }
    },
    doneToday: addedToday,
    refresh() { paintWriter(); },
  };
}
