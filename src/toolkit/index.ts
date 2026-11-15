import { localDate, log, skipDay } from '../state';
import {
  callablePhone, ensureSafetyPlanDocument, newContact, saveSafetyPlanDocument,
  type PlanBlock, type SafetyContact, type SafetyPlanDocument,
} from './plan';
import { clearPhotos } from '../reflect/photos';

interface ToolkitOption {
  id: string;
  label: string;
  detail: string;
  icon: string;
  panel?: HTMLElement;
  onSelect?(): void;
}

const lineId = () => globalThis.crypto?.randomUUID?.() ?? `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const PHONE_ICON = `<svg class="tk-phone-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
  stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.03 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/>
</svg>`;

function optionMarkup(option: ToolkitOption): string {
  return `<span class="toolkit-option-icon" aria-hidden="true">${option.icon}</span>
    <span class="toolkit-option-copy"><span>${option.label}</span><small>${option.detail}</small></span>`;
}

function makeDetail(id: string, title: string, icon: string, body: HTMLElement): HTMLElement {
  const panel = document.createElement('section');
  panel.dataset.tool = id;
  panel.setAttribute('aria-labelledby', `tk-${id}-title`);
  const head = document.createElement('header');
  head.className = 'tk-detail-head';
  const heading = document.createElement('div');
  heading.className = 'tk-detail-heading';
  heading.innerHTML = `<span class="tk-detail-icon" aria-hidden="true">${icon}</span><h2 id="tk-${id}-title"></h2>`;
  heading.querySelector('h2')!.textContent = title;
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'tk-back';
  back.innerHTML = '<span aria-hidden="true">←</span><span>Back</span>';
  back.setAttribute('aria-label', 'Back to Toolkit');
  head.append(heading, back);
  panel.append(head, body);
  return panel;
}

function placeholder(text: string, body: string): HTMLElement {
  const content = document.createElement('div');
  content.className = 'toolkit-placeholder';
  content.dataset.placeholder = 'true';
  const symbol = document.createElement('span');
  symbol.className = 'tk-placeholder-mark';
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = '···';
  const heading = document.createElement('strong');
  heading.textContent = text;
  const copy = document.createElement('p');
  copy.textContent = body;
  content.append(symbol, heading, copy);
  return content;
}

export function mountToolkit(pane: HTMLElement, opts: { onDayChange(): void; onPlanChange(): void }):
  { refresh(): void; openPlan(): void } {
  pane.insertAdjacentHTML('beforeend', `<div class="toolkit-options" data-noswipe>
    <div class="toolkit-list"></div><p class="toolkit-date" aria-live="polite"></p>
  </div>`);
  const options = pane.querySelector<HTMLElement>('.toolkit-options')!;
  const list = options.querySelector<HTMLElement>('.toolkit-list')!;
  const date = options.querySelector<HTMLElement>('.toolkit-date')!;
  const buttons = new Map<string, HTMLButtonElement>();
  const panels = new Map<string, HTMLElement>();
  let active: string | null = null;
  let plan = ensureSafetyPlanDocument();
  let saveTimer = 0;

  // ----------------------------------------------------------- one freeform plan surface
  const planBody = document.createElement('div');
  planBody.className = 'tk-plan';
  planBody.innerHTML = `
    <div class="tk-plan-meta"><p class="tk-save-status" role="status" aria-live="polite"></p></div>
    <div class="tk-editor" role="textbox" aria-multiline="true" aria-label="My safety plan"
      aria-describedby="tk-plan-help" spellcheck="true" autocapitalize="sentences"></div>
    <p id="tk-plan-help" class="sr">Write freely. Contacts are part of the document. Each contact has a menu with move, edit, and remove actions. Drag a contact and release outside the plan to remove it.</p>
    <div class="tk-contact-add" role="group" aria-label="Add a contact">
      <label class="sr" for="tk-new-name">Contact name</label><input id="tk-new-name" class="tk-new-name" type="text" maxlength="80" placeholder="Name" autocomplete="off" />
      <label class="sr" for="tk-new-phone">Phone number</label><input id="tk-new-phone" class="tk-new-phone" type="tel" maxlength="40" placeholder="Phone" inputmode="tel" autocomplete="off" />
      <button class="toolkit-primary tk-add-contact" type="button" aria-label="Add contact">Add</button>
    </div>
    <div class="tk-drag-badge" role="status" aria-live="polite" hidden></div>`;
  const editor = planBody.querySelector<HTMLElement>('.tk-editor')!;
  editor.setAttribute('contenteditable', 'plaintext-only');
  if (editor.contentEditable !== 'plaintext-only') editor.setAttribute('contenteditable', 'true');
  const status = planBody.querySelector<HTMLElement>('.tk-save-status')!;
  const newName = planBody.querySelector<HTMLInputElement>('.tk-new-name')!;
  const newPhone = planBody.querySelector<HTMLInputElement>('.tk-new-phone')!;
  const addButton = planBody.querySelector<HTMLButtonElement>('.tk-add-contact')!;
  const dragBadge = planBody.querySelector<HTMLElement>('.tk-drag-badge')!;
  const contacts = new Map<string, SafetyContact>();

  function contactElements(): HTMLElement[] {
    return [...editor.querySelectorAll<HTMLElement>(':scope > .tk-contact')];
  }

  function refreshContactActions(): void {
    const children = [...editor.children].filter(el => el.matches('.tk-prose, .tk-contact')
      && !(el.classList.contains('tk-prose') && el.getAttribute('data-virtual') === 'true' && !proseText(el as HTMLElement)));
    for (const chip of contactElements()) {
      const index = children.indexOf(chip);
      chip.querySelector<HTMLButtonElement>('.tk-move-up')!.disabled = index <= 0;
      chip.querySelector<HTMLButtonElement>('.tk-move-down')!.disabled = index < 0 || index >= children.length - 1;
    }
    addButton.disabled = contacts.size >= 20;
  }

  function closeContactMenus(except?: HTMLElement): void {
    for (const chip of contactElements()) {
      if (chip === except) continue;
      chip.querySelector<HTMLElement>('.tk-contact-menu')!.hidden = true;
      chip.querySelector<HTMLButtonElement>('.tk-chip-menu')!.setAttribute('aria-expanded', 'false');
    }
  }

  function updateChip(chip: HTMLElement, contact: SafetyContact): void {
    const name = contact.name.trim() || 'Contact';
    const number = callablePhone(contact.phone);
    chip.querySelector<HTMLElement>('.tk-contact-name')!.textContent = name;
    chip.querySelector<HTMLElement>('.tk-contact-number')!.textContent = contact.phone;
    const call = chip.querySelector<HTMLAnchorElement>('.tk-call')!;
    const action = call.querySelector<HTMLElement>('.tk-contact-verb')!;
    if (number) action.innerHTML = PHONE_ICON;
    else action.textContent = 'Edit';
    call.classList.toggle('tk-call-disabled', !number);
    if (number) {
      call.href = `tel:${number}`;
      call.setAttribute('aria-label', `Call ${name} at ${contact.phone}`);
      call.title = `Call ${name} at ${contact.phone}`;
      call.removeAttribute('role');
      call.removeAttribute('aria-disabled');
    } else {
      call.removeAttribute('href');
      call.removeAttribute('title');
      call.setAttribute('aria-label', `Edit ${name}: no callable phone number`);
      call.setAttribute('role', 'button');
    }
    chip.querySelector<HTMLButtonElement>('.tk-drag')!.setAttribute('aria-label', `Drag ${name}. Keyboard options are in the contact menu.`);
    chip.querySelector<HTMLButtonElement>('.tk-chip-menu')!.setAttribute('aria-label', `Actions for ${name}`);
    for (const [selector, verb] of [['.tk-move-up', 'Move up'], ['.tk-move-down', 'Move down'], ['.tk-edit-contact', 'Edit'], ['.tk-remove', 'Remove']]) {
      chip.querySelector(selector)!.setAttribute('aria-label', `${verb} ${name}`);
    }
  }

  function makeContact(contact: SafetyContact): HTMLElement {
    const chip = document.createElement('div');
    chip.className = 'tk-contact';
    chip.dataset.id = contact.id;
    chip.contentEditable = 'false';
    chip.innerHTML = `
      <div class="tk-contact-line">
        <button class="tk-drag" type="button" title="Drag to move; release outside to remove"><span aria-hidden="true">⋮⋮</span></button>
        <a class="tk-call"><span class="tk-contact-name"></span><span class="tk-contact-number"></span><span class="tk-contact-verb"></span></a>
        <button class="tk-chip-menu" type="button" aria-expanded="false"><span aria-hidden="true">⋯</span></button>
      </div>
      <div class="tk-contact-menu" role="group" hidden>
        <button class="tk-move-up" type="button">↑ <span>Move up</span></button>
        <button class="tk-move-down" type="button">↓ <span>Move down</span></button>
        <button class="tk-edit-contact" type="button">Edit</button>
        <button class="tk-remove" type="button">Remove</button>
      </div>
      <div class="tk-contact-edit" hidden>
        <label><span>Name</span><input class="tk-edit-name" type="text" maxlength="80" /></label>
        <label><span>Phone</span><input class="tk-edit-phone" type="tel" maxlength="40" inputmode="tel" /></label>
        <button class="tk-edit-done" type="button">Done</button>
      </div>`;
    chip.querySelector<HTMLInputElement>('.tk-edit-name')!.value = contact.name;
    chip.querySelector<HTMLInputElement>('.tk-edit-phone')!.value = contact.phone;
    updateChip(chip, contact);
    return chip;
  }

  function makeProse(id: string, text: string, virtual = false): HTMLElement {
    const line = document.createElement('div');
    line.className = 'tk-prose';
    line.dataset.id = id;
    line.textContent = text;
    if (virtual) {
      line.dataset.virtual = 'true';
      line.dataset.placeholder = 'Add a line…';
    }
    return line;
  }

  function ensureBoundaries(): void {
    // Spacers only make a caret target around non-editable chips; they are never saved while empty.
    editor.querySelectorAll<HTMLElement>(':scope > .tk-prose[data-virtual="true"]').forEach(line => { if (!proseText(line)) line.remove(); });
    if (!editor.children.length) editor.appendChild(makeProse(lineId(), '', true));
    for (const chip of contactElements()) {
      if (!chip.previousElementSibling?.classList.contains('tk-prose')) chip.before(makeProse(lineId(), '', true));
      if (!chip.nextElementSibling?.classList.contains('tk-prose')) chip.after(makeProse(lineId(), '', true));
    }
    const spacers = [...editor.querySelectorAll<HTMLElement>(':scope > .tk-prose[data-virtual="true"]')];
    spacers.forEach(line => {
      if (spacers.length && (editor.children.length === 1 || line === editor.lastElementChild)) line.dataset.placeholder = 'Add a line…';
      else line.removeAttribute('data-placeholder');
    });
  }

  function renderEditor(): void {
    editor.replaceChildren();
    contacts.clear();
    for (const block of plan.blocks) {
      if (block.type === 'text') editor.appendChild(makeProse(block.id, block.text));
      else {
        contacts.set(block.contact.id, { ...block.contact });
        editor.appendChild(makeContact(block.contact));
      }
    }
    ensureBoundaries();
    status.textContent = 'Auto-saved here';
    refreshContactActions();
  }

  function proseText(line: HTMLElement): string {
    // Chromium leaves one final newline in an otherwise empty contenteditable line.
    return (line.innerText ?? line.textContent ?? '').replace(/\r/g, '').replace(/\n$/, '');
  }

  function documentFromEditor(): SafetyPlanDocument {
    const blocks: PlanBlock[] = [];
    for (const node of [...editor.childNodes]) {
      if (node instanceof HTMLElement && node.classList.contains('tk-contact')) {
        const contact = contacts.get(node.dataset.id!);
        if (contact) blocks.push({ type: 'contact', id: contact.id, contact: { ...contact } });
      } else if (node instanceof HTMLElement && node.classList.contains('tk-prose')) {
        const text = proseText(node);
        if (node.dataset.virtual === 'true' && !text) continue;
        blocks.push({ type: 'text', id: node.dataset.id || lineId(), text });
      } else {
        const text = node.textContent || '';
        if (text) blocks.push({ type: 'text', id: lineId(), text });
      }
    }
    return { v: 2, blocks, updated: plan.updated };
  }

  const planDetail = () => {
    const lines = plan.blocks.filter(b => b.type === 'text' && b.text.trim()).length;
    const people = plan.blocks.filter(b => b.type === 'contact').length;
    return lines || people ? `${lines} ${lines === 1 ? 'line' : 'lines'} · ${people} ${people === 1 ? 'person' : 'people'}` : 'Your words and contacts';
  };

  function persist(force = false): void {
    if (!force && !saveTimer) return;
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    const next = documentFromEditor();
    if (JSON.stringify(next.blocks) === JSON.stringify(plan.blocks)) {
      status.textContent = 'Auto-saved here';
      return;
    }
    try {
      plan = saveSafetyPlanDocument(next);
      status.textContent = 'Saved on this device';
      log('safety_plan_saved', {
        lines: plan.blocks.filter(b => b.type === 'text' && b.text.trim()).length,
        contacts: plan.blocks.filter(b => b.type === 'contact').length,
        blocks: plan.blocks.length,
      });
      const small = buttons.get('safety-plan')?.querySelector('small');
      if (small) small.textContent = planDetail();
      refreshContactActions();
      opts.onPlanChange();
    } catch {
      status.textContent = 'Could not save in this browser';
    }
  }

  function queueSave(): void {
    status.textContent = 'Saving…';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => persist(true), 240);
  }

  function caretAt(line: HTMLElement, offset: number): void {
    const range = document.createRange();
    const textNode = line.firstChild || line.appendChild(document.createTextNode(''));
    range.setStart(textNode, Math.min(offset, textNode.textContent?.length || 0));
    range.collapse(true);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    line.scrollIntoView({ block: 'nearest' });
  }

  function selectedOffsets(line: HTMLElement): { start: number; end: number } | null {
    const selection = getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!line.contains(range.startContainer) || !line.contains(range.endContainer)) return null;
    const before = document.createRange();
    before.selectNodeContents(line);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    return { start, end: start + range.toString().length };
  }

  function replaceSelection(text: string): void {
    const selection = getSelection();
    const anchor = selection?.anchorNode instanceof HTMLElement ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const line = anchor?.closest<HTMLElement>('.tk-prose');
    if (!line || !editor.contains(line)) return;
    const offsets = selectedOffsets(line) || { start: proseText(line).length, end: proseText(line).length };
    const original = proseText(line);
    const before = original.slice(0, offsets.start), after = original.slice(offsets.end);
    const pieces = text.replace(/\r\n?/g, '\n').split('\n');
    line.textContent = before + pieces[0];
    delete line.dataset.virtual;
    line.removeAttribute('data-placeholder');
    let last = line;
    for (let i = 1; i < pieces.length; i++) {
      const added = makeProse(lineId(), pieces[i] + (i === pieces.length - 1 ? after : ''));
      last.after(added);
      last = added;
    }
    if (last === line && pieces.length === 1) line.textContent = before + pieces[0] + after;
    caretAt(last, pieces[pieces.length - 1].length);
    queueSave();
  }

  renderEditor();

  editor.addEventListener('beforeinput', e => {
    const input = e as InputEvent;
    if (input.inputType === 'insertParagraph' || input.inputType === 'insertLineBreak') {
      e.preventDefault();
      replaceSelection('\n');
    } else if (input.inputType === 'insertFromDrop') e.preventDefault();
  });
  editor.addEventListener('paste', e => {
    e.preventDefault();
    replaceSelection(e.clipboardData?.getData('text/plain') || '');
  });
  // Contacts have their own captured Pointer Events. No external rich text may be dropped into the document.
  editor.addEventListener('drop', e => e.preventDefault());
  editor.addEventListener('input', e => {
    const target = e.target as HTMLElement;
    const edit = target.closest<HTMLInputElement>('.tk-contact-edit input');
    if (edit) {
      const chip = edit.closest<HTMLElement>('.tk-contact')!;
      const contact = contacts.get(chip.dataset.id!)!;
      contact.name = chip.querySelector<HTMLInputElement>('.tk-edit-name')!.value;
      contact.phone = chip.querySelector<HTMLInputElement>('.tk-edit-phone')!.value;
      updateChip(chip, contact);
      queueSave();
      return;
    }
    if (target === editor || target.closest('.tk-prose')) queueSave();
  });

  function moveContact(chip: HTMLElement, direction: -1 | 1): void {
    const meaningful = [...editor.children].filter(el => el.matches('.tk-prose, .tk-contact')
      && !(el.classList.contains('tk-prose') && el.getAttribute('data-virtual') === 'true' && !proseText(el as HTMLElement)));
    const sibling = meaningful[meaningful.indexOf(chip) + direction];
    if (!sibling) return;
    if (direction < 0) editor.insertBefore(chip, sibling);
    else editor.insertBefore(chip, sibling.nextSibling);
    ensureBoundaries();
    refreshContactActions();
    persist(true);
    status.textContent = `Moved ${contacts.get(chip.dataset.id!)?.name || 'contact'} · saved`;
  }

  editor.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const chip = target.closest<HTMLElement>('.tk-contact');
    if (!chip) { closeContactMenus(); return; }
    const contact = contacts.get(chip.dataset.id!);
    if (!contact) return;
    if (target.closest('.tk-call')) {
      if (!callablePhone(contact.phone)) {
        e.preventDefault();
        closeContactMenus();
        chip.querySelector<HTMLElement>('.tk-contact-edit')!.hidden = false;
        chip.querySelector<HTMLInputElement>('.tk-edit-phone')!.focus();
        liftForKeyboard();
      } else log('plan_call', { from: 'toolkit', id: contact.id });
      return;
    }
    if (target.closest('.tk-chip-menu')) {
      const menu = chip.querySelector<HTMLElement>('.tk-contact-menu')!;
      const opening = menu.hidden;
      closeContactMenus(chip);
      menu.hidden = !opening;
      chip.querySelector<HTMLButtonElement>('.tk-chip-menu')!.setAttribute('aria-expanded', String(opening));
      if (opening) refreshContactActions();
    } else if (target.closest('.tk-move-up')) moveContact(chip, -1);
    else if (target.closest('.tk-move-down')) moveContact(chip, 1);
    else if (target.closest('.tk-remove')) {
      contacts.delete(contact.id);
      chip.remove();
      ensureBoundaries();
      persist(true);
      newName.focus({ preventScroll: true });
    } else if (target.closest('.tk-edit-contact')) {
      closeContactMenus();
      chip.querySelector<HTMLElement>('.tk-contact-edit')!.hidden = false;
      const input = chip.querySelector<HTMLInputElement>('.tk-edit-name')!;
      input.focus(); input.select();
      liftForKeyboard();
    } else if (target.closest('.tk-edit-done')) {
      chip.querySelector<HTMLElement>('.tk-contact-edit')!.hidden = true;
      persist(true);
      chip.querySelector<HTMLButtonElement>('.tk-chip-menu')!.focus({ preventScroll: true });
    }
  });

  // ----------------------------------------------------------- contact drag: reorder into prose, or remove on outside release
  interface DragState {
    pointerId: number;
    handle: HTMLButtonElement;
    chip: HTMLElement;
    startX: number;
    startY: number;
    active: boolean;
    outside: boolean;
    before: HTMLElement | null;
  }
  let drag: DragState | null = null;

  function clearDropMarkers(): void {
    editor.querySelectorAll('.tk-drop-before, .tk-drop-after').forEach(el => el.classList.remove('tk-drop-before', 'tk-drop-after'));
  }

  function positionDrop(e: PointerEvent): void {
    if (!drag) return;
    const bounds = editor.getBoundingClientRect();
    const outside = e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom;
    drag.outside = outside;
    editor.classList.toggle('tk-will-remove', outside);
    clearDropMarkers();
    if (outside) {
      drag.before = null;
      dragBadge.textContent = `Release to remove ${contacts.get(drag.chip.dataset.id!)?.name || 'contact'}`;
      return;
    }
    dragBadge.textContent = 'Drop on a line · release outside to remove';
    const candidates = [...editor.children].filter((el): el is HTMLElement => el instanceof HTMLElement
      && el !== drag!.chip && el.matches('.tk-prose, .tk-contact'));
    drag.before = null;
    for (const child of candidates) {
      const r = child.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { drag.before = child; break; }
    }
    if (drag.before) drag.before.classList.add('tk-drop-before');
    else if (candidates.length) candidates[candidates.length - 1].classList.add('tk-drop-after');
    if (e.clientY < bounds.top + 34) editor.scrollTop -= 12;
    else if (e.clientY > bounds.bottom - 34) editor.scrollTop += 12;
  }

  function finishDrag(cancelled: boolean, e?: PointerEvent): void {
    const current = drag;
    if (!current || (e && e.pointerId !== current.pointerId)) return;
    drag = null;
    if (current.active && !cancelled) {
      if (current.outside) {
        contacts.delete(current.chip.dataset.id!);
        current.chip.remove();
      } else editor.insertBefore(current.chip, current.before);
      ensureBoundaries();
      persist(true);
      status.textContent = current.outside ? 'Contact removed · saved' : 'Contact moved · saved';
    }
    current.chip.classList.remove('dragging');
    editor.classList.remove('tk-is-dragging', 'tk-will-remove');
    dragBadge.hidden = true;
    clearDropMarkers();
    refreshContactActions();
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
  }

  editor.addEventListener('pointerdown', e => {
    const handle = (e.target as HTMLElement).closest<HTMLButtonElement>('.tk-drag');
    if (!handle || e.button !== 0 || drag) return;
    const chip = handle.closest<HTMLElement>('.tk-contact')!;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, handle, chip, startX: e.clientX, startY: e.clientY,
      active: false, outside: false, before: chip.nextElementSibling as HTMLElement | null };
    closeContactMenus();
  });
  editor.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    if (!drag.active) {
      drag.active = true;
      drag.chip.classList.add('dragging');
      editor.classList.add('tk-is-dragging');
      dragBadge.hidden = false;
    }
    e.preventDefault();
    positionDrop(e);
  });
  editor.addEventListener('pointerup', e => finishDrag(false, e));
  editor.addEventListener('pointercancel', e => finishDrag(true, e));
  editor.addEventListener('lostpointercapture', e => { if (drag?.pointerId === e.pointerId) finishDrag(true); });
  planBody.addEventListener('keydown', e => {
    if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); persist(true); }
    if (e.key === 'Escape') {
      if (drag) { e.preventDefault(); finishDrag(true); return; }
      closeContactMenus();
      const edit = (e.target as HTMLElement).closest<HTMLElement>('.tk-contact');
      if (edit && !edit.querySelector<HTMLElement>('.tk-contact-edit')!.hidden) {
        edit.querySelector<HTMLElement>('.tk-contact-edit')!.hidden = true;
        edit.querySelector<HTMLButtonElement>('.tk-chip-menu')!.focus();
      }
    }
  });

  function addContact(): void {
    const name = newName.value.trim(), phone = newPhone.value.trim();
    if (!name || !callablePhone(phone)) {
      status.textContent = 'Add a name and phone number';
      (!name ? newName : newPhone).focus();
      return;
    }
    if (contacts.size >= 20) return;
    const contact = { ...newContact(), name, phone };
    contacts.set(contact.id, contact);
    const chip = makeContact(contact);
    const trailing = editor.lastElementChild?.classList.contains('tk-prose')
      && editor.lastElementChild.getAttribute('data-virtual') === 'true' ? editor.lastElementChild : null;
    editor.insertBefore(chip, trailing);
    ensureBoundaries();
    newName.value = ''; newPhone.value = '';
    persist(true);
    chip.querySelector<HTMLButtonElement>('.tk-chip-menu')!.focus({ preventScroll: true });
    chip.scrollIntoView({ block: 'nearest' });
  }
  addButton.addEventListener('click', addContact);
  for (const input of [newName, newPhone]) input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addContact(); }
  });

  const planPanel = makeDetail('safety-plan', 'My safety plan', '✎', planBody);

  // ----------------------------------------------------------- compact closed list + full-pane open tools
  function open(id: string): void {
    if (active === id) return;
    if (active === 'safety-plan') persist(true);
    for (const [key, panel] of panels) {
      panel.hidden = key !== id;
      buttons.get(key)!.setAttribute('aria-expanded', String(key === id));
    }
    active = id;
    pane.classList.add('toolkit-is-open');
    options.dataset.open = id;
    list.hidden = true;
    date.hidden = true;
    panels.get(id)!.hidden = false;
  }

  function close(returnFocus = true): void {
    if (!active) return;
    if (active === 'safety-plan') persist(true);
    const previous = active;
    panels.get(previous)!.hidden = true;
    buttons.get(previous)!.setAttribute('aria-expanded', 'false');
    active = null;
    pane.classList.remove('toolkit-is-open');
    delete options.dataset.open;
    list.hidden = false;
    date.hidden = false;
    if (returnFocus) buttons.get(previous)!.focus({ preventScroll: true });
  }

  // Leaving a nested tool must not strand its state when the user later returns through the tab bar.
  // Reflect's direct openPlan() route does not trigger this and still lands inside the editor.
  document.addEventListener('click', e => {
    const tab = (e.target as Element).closest?.('.tab[data-pane]') as HTMLElement | null;
    if (tab && tab.dataset.pane !== 'toolkit' && active) close(false);
  }, true);

  function addOption(option: ToolkitOption): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toolkit-option';
    button.dataset.option = option.id;
    button.dataset.icon = option.icon;
    button.innerHTML = optionMarkup(option);
    if (option.panel) {
      option.panel.id = `toolkit-${option.id}`;
      option.panel.classList.add('toolkit-detail');
      option.panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', option.panel.id);
      options.appendChild(option.panel);
      panels.set(option.id, option.panel);
      option.panel.querySelector<HTMLButtonElement>('.tk-back')!.addEventListener('click', () => close());
      button.addEventListener('click', () => open(option.id));
    } else if (option.onSelect) button.addEventListener('click', option.onSelect);
    list.appendChild(button);
    buttons.set(option.id, button);
    return button;
  }

  const planButton = addOption({ id: 'safety-plan', label: 'My safety plan', detail: planDetail(), icon: '✎', panel: planPanel });
  buttons.set('safety-plan', planButton);
  addOption({
    id: 'wearable', label: 'Wearable', detail: 'No device connection', icon: '⌁',
    panel: makeDetail('wearable', 'Wearable', '⌁', placeholder('Device support is not built yet',
      'No wearable is connected, and Garden is not reading or storing sensor data.')),
  });
  addOption({
    id: 'drift', label: 'Drift measurer', detail: 'Method undefined', icon: '≈',
    panel: makeDetail('drift', 'Drift measurer', '≈', placeholder('No drift measurement exists yet',
      'The construct, observations, scoring, ground truth, and validation are undefined. Venture timing and plant appearance are not drift measures.')),
  });
  const skip = addOption({
    id: 'skip-day', label: 'Skip day', detail: 'Advance to the next day', icon: '→',
    onSelect() { skipDay(); paint(); opts.onDayChange(); },
  });
  const reset = addOption({
    id: 'reset-demo', label: 'Reset demo', detail: 'Start fresh in this browser', icon: '↺',
    onSelect() {
      if (!window.confirm('Reset the demo? This clears all Garden cards, photos, plans, contacts, sound settings, and progress stored in this browser.')) return;
      reset.disabled = true;
      reset.querySelector<HTMLElement>('small')!.textContent = 'Resetting this browser…';
      void (async () => {
        try {
          await clearPhotos();
          localStorage.clear();
          location.reload();
        } catch {
          reset.disabled = false;
          reset.querySelector<HTMLElement>('small')!.textContent = 'Could not reset. Please try again.';
        }
      })();
    },
  });

  // ----------------------------------------------------------- viewport keyboard: shrink the open tool, never the outer pane
  let fakeKb = 0;
  function liftForKeyboard(): void {
    const vv = window.visualViewport;
    const overlap = fakeKb || (vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0);
    const bar = document.querySelector<HTMLElement>('.bar')?.offsetHeight || 96;
    const typing = planBody.contains(document.activeElement);
    options.style.setProperty('--tk-kb', `${typing ? Math.max(0, overlap - bar) : 0}px`);
  }
  window.visualViewport?.addEventListener('resize', liftForKeyboard);
  window.visualViewport?.addEventListener('scroll', liftForKeyboard);
  planBody.addEventListener('focusin', liftForKeyboard);
  planBody.addEventListener('focusout', () => setTimeout(liftForKeyboard, 50));
  window.addEventListener('pagehide', () => persist(true));
  (globalThis as any).garden.toolkitKb = (px: number) => { fakeKb = px; liftForKeyboard(); };

  function paint(): void {
    date.textContent = `Demo date · ${localDate()}`;
    skip.querySelector<HTMLElement>('small')!.textContent = `Next day · ${localDate()}`;
    const small = planButton.querySelector<HTMLElement>('small')!;
    if (!saveTimer) small.textContent = planDetail();
  }
  paint();
  return {
    refresh: paint,
    openPlan() { open('safety-plan'); },
  };
}
