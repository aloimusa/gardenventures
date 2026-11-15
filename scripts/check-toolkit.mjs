// Focused Toolkit document/editor checks. Also runnable directly: node scripts/check-toolkit.mjs [url].
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

const V2 = 'garden.safetyPlan.v2', V1 = 'garden.safetyPlan.v1';
const sleep = page => page.waitForTimeout(280);
const savedDoc = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), V2);
const summary = doc => doc.blocks.map(b => b.type === 'text' ? `text:${b.text}` : `contact:${b.contact.name}`);

export async function toolkitChecks({ page, check }) {
  const goToolkit = async () => {
    await page.click('.tab[data-pane="toolkit"]');
    await page.waitForFunction(() => {
      const r = document.querySelector('.pane[data-pane="toolkit"]').getBoundingClientRect();
      return document.querySelector('.tab[data-pane="toolkit"]').getAttribute('aria-current') === 'page'
        && Math.abs(r.left) < .5 && Math.abs(r.right - innerWidth) < .5;
    }, null, { timeout: 10000 });
  };
  const openPlan = async () => {
    if (!await page.isVisible('#toolkit-safety-plan')) await page.click('.toolkit-option[data-option="safety-plan"]');
    await page.waitForTimeout(100);
  };
  const back = async () => { await page.click('#toolkit-safety-plan .tk-back'); await page.waitForTimeout(100); };
  const fit = () => page.evaluate(() => {
    const pane = document.querySelector('.pane[data-pane="toolkit"]'), box = document.querySelector('.toolkit-options');
    const outer = box.getBoundingClientRect();
    return { paneNoScroll: pane.scrollHeight <= pane.clientHeight + 1, noScroll: box.scrollHeight <= box.clientHeight + 1,
      noHorizontal: box.scrollWidth <= box.clientWidth + 1,
      allInside: [...document.querySelectorAll('.toolkit-option')].every(el => {
        const r = el.getBoundingClientRect(); return r.top >= outer.top - 1 && r.bottom <= outer.bottom + 1 && r.left >= outer.left - 1 && r.right <= outer.right + 1;
      }), heights: [...document.querySelectorAll('.toolkit-option')].map(e => Math.round(e.getBoundingClientRect().height)) };
  });
  const addRowFit = () => page.evaluate(() => {
    const row = document.querySelector('.tk-contact-add'), name = row.querySelector('.tk-new-name'), phone = row.querySelector('.tk-new-phone');
    const add = row.querySelector('.tk-add-contact'), box = row.getBoundingClientRect(), n = name.getBoundingClientRect();
    const p = phone.getBoundingClientRect(), a = add.getBoundingClientRect();
    return { viewport: innerWidth, nameWidth: n.width, phoneWidth: p.width, addWidth: a.width,
      heights: [n.height, p.height, a.height], noHorizontal: row.scrollWidth <= row.clientWidth + 1,
      phoneWider: p.width >= n.width + 10, nameUsable: n.width >= 64, addWider: a.width >= 60,
      targets: [n, p, a].every(r => r.height >= 44),
      noOverlap: n.left >= box.left - 1 && n.right < p.left && p.right < a.left && a.right <= box.right + 1 };
  });
  const putCursor = (selector, atEnd = true) => page.locator(selector).first().evaluate((line, end) => {
    line.focus(); const range = document.createRange(); range.selectNodeContents(line); range.collapse(!end);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }, atEnd);

  // Deterministic fresh demo. In particular, do not inherit Wind down's compact viewport,
  // reduced-motion state, or an emulated-keyboard offset when this exported suite follows another one.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    globalThis.garden?.toolkitKb?.(0);
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await goToolkit();
  const ids = await page.$$eval('.toolkit-option', els => els.map(e => e.dataset.option));
  check('Toolkit closed list has plan, placeholders, Skip, then Reset', ids.join(',') === 'safety-plan,wearable,drift,skip-day,reset-demo', ids.join(','));
  const initialFit = await fit();
  check('390px closed Toolkit does not scroll and every option fits', initialFit.paneNoScroll && initialFit.noScroll && initialFit.noHorizontal
    && initialFit.allInside, JSON.stringify(initialFit));
  check('all closed options share a compact button height', initialFit.heights.every(h => h === initialFit.heights[0]), initialFit.heights.join('/'));
  await page.screenshot({ path: '/tmp/opencode/toolkit-closed-390.png' });

  const fresh = await savedDoc(page);
  check('a new demo seeds a concise editable example in v2', fresh?.v === 2 && fresh.updated === null
    && fresh.blocks.filter(b => b.type === 'text').length === 5 && fresh.blocks.filter(b => b.type === 'contact').length === 1
    && fresh.blocks.some(b => b.type === 'text' && b.text.includes('yellow jumper')), JSON.stringify(summary(fresh || { blocks: [] })));
  check('the example contains one real inline contact, not a separate list', fresh.blocks.some(b => b.type === 'contact'
    && b.contact.name === 'Aino' && b.contact.phone === '+358 40 123 4567'));

  await openPlan();
  const takeover = await page.evaluate(() => {
    const panel = document.querySelector('#toolkit-safety-plan'), back = panel.querySelector('.tk-back').getBoundingClientRect();
    const head = panel.querySelector('.tk-detail-head').getBoundingClientRect(), editor = panel.querySelector('.tk-editor').getBoundingClientRect();
    const options = document.querySelector('.toolkit-options');
    return { listHidden: getComputedStyle(document.querySelector('.toolkit-list')).display === 'none',
      siblingsHidden: [...document.querySelectorAll('.toolkit-option')].every(e => e.getBoundingClientRect().width === 0),
      backTopRight: back.top >= head.top && back.bottom <= head.bottom && back.right <= head.right && back.left > head.left + head.width / 2,
      editorBelowBack: editor.top >= head.bottom, noOuterScroll: options.scrollHeight <= options.clientHeight + 1,
      oneSurface: panel.querySelectorAll('[contenteditable="plaintext-only"], [contenteditable="true"]').length === 1,
      textareas: panel.querySelectorAll('textarea, .tk-plan-section').length };
  });
  check('open plan fills Toolkit, hides every option, and keeps the pane non-scrolling', takeover.listHidden && takeover.siblingsHidden
    && takeover.noOuterScroll, JSON.stringify(takeover));
  check('colored text Back is top-right and the editor fills below it', takeover.backTopRight && takeover.editorBelowBack);
  check('plan has exactly one freeform editor and no legacy section textareas', takeover.oneSurface && takeover.textareas === 0);
  const inline = await page.evaluate(() => {
    const call = document.querySelector('.tk-contact .tk-call'), action = call.querySelector('.tk-contact-verb');
    return { chips: document.querySelectorAll('.tk-editor > .tk-contact').length,
      href: call.getAttribute('href'), aria: call.getAttribute('aria-label'), title: call.title,
      icon: action.querySelectorAll('svg.tk-phone-icon[aria-hidden="true"]').length,
      visibleActionText: action.textContent.trim(), callTarget: call.getBoundingClientRect().height,
      exampleCaption: document.querySelector('.tk-plan-meta').textContent.includes('Example'),
      autosave: document.querySelector('.tk-save-status').textContent };
  });
  check('seed has no explanatory example caption and the editor keeps only Auto-saved here', inline.chips === 1
    && !inline.exampleCaption && inline.autosave === 'Auto-saved here', JSON.stringify(inline));
  check('inline call uses an accessible labelled telephone icon without visible Call text', inline.href === 'tel:+358401234567'
    && inline.aria === 'Call Aino at +358 40 123 4567' && inline.title === inline.aria && inline.icon === 1
    && inline.visibleActionText === '' && inline.callTarget >= 44, JSON.stringify(inline));
  const row390 = await addRowFit();
  check('390px add row gives Phone more width, widens Add, and keeps 44px targets without overflow', row390.viewport === 390
    && row390.phoneWider && row390.nameUsable && row390.addWider && row390.targets && row390.noHorizontal && row390.noOverlap,
  JSON.stringify(row390));
  const insets = await page.evaluate(() => {
    const editor = document.querySelector('.tk-editor'), style = getComputedStyle(editor), box = editor.getBoundingClientRect();
    const prose = editor.querySelector('.tk-prose').getBoundingClientRect();
    return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), top: parseFloat(style.paddingTop),
      bottom: parseFloat(style.paddingBottom), proseInset: Math.round(prose.left - box.left),
      addSeparate: box.bottom < document.querySelector('.tk-contact-add').getBoundingClientRect().top };
  });
  check('editor gains four pixels of inner inset while its flexible row stays separate', insets.left === 14 && insets.right === 14
    && insets.top === 12 && insets.bottom === 12 && insets.proseInset >= 15 && insets.addSeparate, JSON.stringify(insets));
  await page.screenshot({ path: '/tmp/opencode/toolkit-example-390.png' });

  await putCursor('.tk-prose', false);
  await page.keyboard.insertText('For me: ');
  await sleep(page);
  check('typing autosaves without re-rendering or losing surrounding prose', (await savedDoc(page)).blocks[0].text
    === 'For me: Evening plan: shower, tea, and something familiar on TV.');
  await page.reload({ waitUntil: 'networkidle' }); await goToolkit(); await openPlan();
  check('edited example survives reload', (await page.locator('.tk-prose').first().textContent()).startsWith('For me:'));
  await back();

  // Placeholder tools are fullscreen too, including their own Back route.
  for (const id of ['wearable', 'drift']) {
    await page.click(`.toolkit-option[data-option="${id}"]`);
    const result = await page.evaluate(id => {
      const panel = document.querySelector(`#toolkit-${id}`), back = panel.querySelector('.tk-back');
      return { open: !panel.hidden, placeholder: panel.querySelector('.toolkit-placeholder')?.dataset.placeholder,
        text: panel.textContent, back: !!back && back.textContent.includes('Back'), backIcon: !!back?.querySelector('span'),
        fields: panel.querySelectorAll('input, textarea, a').length,
        siblingsHidden: [...document.querySelectorAll('.toolkit-option')].every(e => e.getBoundingClientRect().width === 0) };
    }, id);
    const content = id === 'wearable' ? result.text.includes('not built yet') && result.text.includes('No wearable is connected')
      : result.text.includes('No drift measurement exists yet') && result.text.includes('ground truth') && result.text.includes('not drift measures');
    check(`${id} is an honest fullscreen placeholder with icon+text Back and no fake controls`, result.open && result.placeholder === 'true'
      && result.back && result.backIcon && result.fields === 0 && result.siblingsHidden && content, result.text);
    await page.click(`#toolkit-${id} .tk-back`);
    check(`${id} Back restores the simple list`, await page.isVisible('.toolkit-option[data-option="safety-plan"]')
      && !await page.isVisible(`#toolkit-${id}`));
  }

  const oldDate = await page.innerText('.toolkit-date');
  await page.click('.toolkit-option[data-option="skip-day"]');
  check('Skip day remains an immediate working utility', (await page.innerText('.toolkit-date')) !== oldDate
    && await page.evaluate(() => Number(localStorage.getItem('garden.dayOffset')) >= 1));

  // A valid but empty legacy plan is personal data, not a reason to inject the example.
  await page.evaluate(key => { localStorage.clear(); localStorage.setItem(key, JSON.stringify({ v: 1,
    sections: ['', '', '', ''], contacts: [], updated: 10 })); }, V1);
  await page.reload({ waitUntil: 'networkidle' }); await goToolkit(); await openPlan();
  check('a deliberately empty v1 plan stays empty and is not silently reseeded', await page.locator('.tk-contact').count() === 0
    && await page.evaluate(([v2, v1]) => localStorage.getItem(v2) === null && !!localStorage.getItem(v1), [V2, V1])
    && !(await page.locator('.tk-editor').innerText()).includes('yellow jumper'));

  await page.evaluate(key => { localStorage.setItem(key, JSON.stringify({ v: 1,
    sections: ['Keep this note', '', '', ''], contacts: [{ id: 'no-phone', name: 'No phone yet', phone: '' }] })); }, V1);
  await page.reload({ waitUntil: 'networkidle' }); await goToolkit(); await openPlan();
  check('legacy contact without a callable number keeps a visible name and explicit Edit action', await page.isVisible('.tk-contact-name')
    && await page.innerText('.tk-contact-name') === 'No phone yet' && await page.innerText('.tk-contact-verb') === 'Edit'
    && await page.getAttribute('.tk-call', 'role') === 'button');
  await page.click('.tk-call');
  check('choosing Edit for a non-callable contact opens its phone editor', await page.isVisible('.tk-contact-edit .tk-edit-phone')
    && await page.evaluate(() => localStorage.getItem('garden.safetyPlan.v2') === null));

  await page.evaluate(([legacyKey, currentKey]) => localStorage.setItem(currentKey, '{malformed'), [V1, V2]);
  await page.reload({ waitUntil: 'networkidle' }); await goToolkit(); await openPlan();
  check('malformed v2 safely falls back to intact v1 without overwriting either raw record', await page.isVisible('.tk-contact-name')
    && (await page.locator('.tk-editor').innerText()).includes('Keep this note')
    && await page.evaluate(([legacyKey, currentKey]) => localStorage.getItem(currentKey) === '{malformed'
      && !!localStorage.getItem(legacyKey) && !localStorage.getItem(legacyKey).includes('Evening plan'), [V1, V2]));

  const legacy = { v: 1, updated: 123,
    sections: ['First line for Reflect.', 'Second prose line.', '', 'Fourth prose line.'],
    contacts: [{ id: 'aino', name: 'Aino', phone: '+358 40 123 4567' }, { id: 'mika', name: 'Mika', phone: '040 555 0101' }] };
  const legacyRaw = JSON.stringify(legacy);
  await page.evaluate(([key, raw]) => { localStorage.clear(); localStorage.setItem(key, raw); }, [V1, legacyRaw]);
  await page.reload({ waitUntil: 'networkidle' }); await goToolkit(); await openPlan();
  const migrated = await page.evaluate(() => ({ texts: [...document.querySelectorAll('.tk-editor > .tk-prose:not([data-virtual])')].map(e => e.textContent),
    names: [...document.querySelectorAll('.tk-contact-name')].map(e => e.textContent),
    phones: [...document.querySelectorAll('.tk-edit-phone')].map(e => e.value), v2: localStorage.getItem('garden.safetyPlan.v2') }));
  check('v1 prose migrates intact and contacts enter the same surface in prior order', migrated.texts.join('|') === legacy.sections.join('|')
    && migrated.names.join(',') === 'Aino,Mika' && migrated.phones[1] === '040 555 0101' && migrated.v2 === null, JSON.stringify(migrated));

  await putCursor('.tk-editor > .tk-prose:not([data-virtual="true"]) >> nth=1'); await page.keyboard.insertText(' Edited.');
  await sleep(page);
  const afterMigrationSave = await page.evaluate(([v1, v2]) => ({ old: localStorage.getItem(v1), doc: JSON.parse(localStorage.getItem(v2)) }), [V1, V2]);
  check('editing migrated data writes v2 while preserving the original v1 key byte-for-byte', afterMigrationSave.old === legacyRaw
    && afterMigrationSave.doc.blocks.filter(b => b.type === 'contact').map(b => b.contact.name).join(',') === 'Aino,Mika'
    && afterMigrationSave.doc.blocks[1].text === 'Second prose line. Edited.');

  // Plain-text paste, including markup-looking text, must never become contenteditable HTML.
  await putCursor('.tk-editor > .tk-prose:not([data-virtual="true"]) >> nth=1');
  await page.locator('.tk-editor > .tk-prose:not([data-virtual="true"])').nth(1).evaluate(line => {
    const transfer = new DataTransfer(); transfer.setData('text/plain', ' <b>literal</b> & safe');
    transfer.setData('text/html', '<img src=x onerror="window.__tkInjected=1">SHOULD_NOT_APPEAR');
    line.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
  });
  await sleep(page);
  const pasted = await page.evaluate(() => ({ text: document.querySelectorAll('.tk-editor > .tk-prose')[1].textContent,
    images: document.querySelectorAll('.tk-editor img, .tk-editor b, .tk-editor script').length, injected: window.__tkInjected,
    saved: JSON.parse(localStorage.getItem('garden.safetyPlan.v2')).blocks[1].text }));
  check('paste stays plain text, persists literally, and cannot inject markup/handlers', pasted.text.includes('<b>literal</b> & safe')
    && !pasted.text.includes('SHOULD_NOT_APPEAR') && pasted.images === 0 && !pasted.injected
    && pasted.saved.endsWith('<b>literal</b> & safe'), JSON.stringify(pasted));

  // Add by keyboard, inspect the real tel: action, then edit through the accessible chip menu.
  await page.fill('.tk-new-name', 'Li'); await page.fill('.tk-new-phone', '+358 44 000 1122'); await page.press('.tk-new-phone', 'Enter');
  let doc = await savedDoc(page);
  const liId = doc.blocks.at(-1).contact.id;
  check('keyboard Add appends one contact to the end of the mixed document', doc.blocks.filter(b => b.type === 'contact').length === 3
    && doc.blocks.at(-1).type === 'contact' && doc.blocks.at(-1).contact.name === 'Li'
    && await page.locator('.tk-contact').count() === 3, JSON.stringify(summary(doc)));
  check('added contact exposes a real callable telephone link', await page.getAttribute(`.tk-contact[data-id="${liId}"] .tk-call`, 'href') === 'tel:+358440001122');
  await page.locator(`.tk-contact[data-id="${liId}"] .tk-call`).evaluate(a => { a.addEventListener('click', e => e.preventDefault(), { once: true }); a.click(); });
  check('chip call action is live and logged without number/prose payloads', await page.evaluate(id => JSON.parse(localStorage.getItem('garden.log') || '[]')
    .some(e => e.type === 'plan_call' && e.payload.from === 'toolkit' && e.payload.id === id), liId));

  await page.focus(`.tk-contact[data-id="${liId}"] .tk-chip-menu`); await page.keyboard.press('Enter');
  await page.focus(`.tk-contact[data-id="${liId}"] .tk-edit-contact`); await page.keyboard.press('Enter');
  await page.fill(`.tk-contact[data-id="${liId}"] .tk-edit-name`, 'Lee');
  await page.fill(`.tk-contact[data-id="${liId}"] .tk-edit-phone`, '044 777 8899');
  await page.click(`.tk-contact[data-id="${liId}"] .tk-edit-done`);
  doc = await savedDoc(page);
  check('contact menu supports keyboard editing and updates name/phone/call persistently', doc.blocks.at(-1).contact.name === 'Lee'
    && doc.blocks.at(-1).contact.phone === '044 777 8899'
    && await page.getAttribute(`.tk-contact[data-id="${liId}"] .tk-call`, 'href') === 'tel:0447778899');

  // Accessible reorder must change meaningful saved blocks, not a transient visual spacer.
  await page.click('.tk-contact[data-id="aino"] .tk-chip-menu');
  await page.click('.tk-contact[data-id="aino"] .tk-move-down');
  check('accessible move down swaps actual contact order', (await savedDoc(page)).blocks.filter(b => b.type === 'contact').map(b => b.contact.name).join(',') === 'Mika,Aino,Lee');
  await page.click('.tk-contact[data-id="aino"] .tk-move-up');
  await page.click('.tk-contact[data-id="aino"] .tk-move-up');
  const beforeAccessibleReload = summary(await savedDoc(page));
  check('accessible move up places a contact among prose lines', (await savedDoc(page)).blocks.findIndex(b => b.type === 'contact' && b.contact.name === 'Aino') === 3);
  await page.reload({ waitUntil: 'networkidle' }); await goToolkit(); await openPlan();
  check('accessible mixed-document order is durable across reload', JSON.stringify(summary(await savedDoc(page))) === JSON.stringify(beforeAccessibleReload));
  await page.click('.tk-contact[data-id="aino"] .tk-chip-menu'); await page.click('.tk-contact[data-id="aino"] .tk-move-down');
  await page.click('.tk-contact[data-id="aino"] .tk-chip-menu'); // close after the move

  async function dragContact(id, targetIndex, after, touch = false, screenshot = false) {
    const handle = page.locator(`.tk-contact[data-id="${id}"] .tk-drag`);
    const target = page.locator('.tk-editor > .tk-prose:not([data-virtual="true"])').nth(targetIndex);
    await handle.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded();
    const h = await handle.boundingBox(), t = await target.boundingBox();
    const x0 = h.x + h.width / 2, y0 = h.y + h.height / 2;
    const x1 = t.x + Math.min(90, t.width / 2), y1 = t.y + t.height * (after ? .9 : .1);
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 8, y: y0 + (y1 - y0) * i / 8 }] });
        await page.waitForTimeout(25);
      }
      if (screenshot) await page.screenshot({ path: '/tmp/opencode/toolkit-dragging-390.png' });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 10 });
      if (screenshot) await page.screenshot({ path: '/tmp/opencode/toolkit-dragging-390.png' });
      await page.mouse.up();
    }
    await page.waitForTimeout(100);
  }

  const proseBeforeDrag = (await savedDoc(page)).blocks.filter(b => b.type === 'text').map(b => b.text);
  await dragContact('mika', 0, false);
  doc = await savedDoc(page);
  check('pointer drag inserts a contact before the first prose line without duplicating chips', doc.blocks[0].type === 'contact'
    && doc.blocks[0].contact.name === 'Mika' && doc.blocks.filter(b => b.id === 'mika').length === 1
    && await page.locator('.tk-contact[data-id="mika"]').count() === 1, JSON.stringify(summary(doc)));
  await dragContact('mika', 1, true, true, true);
  doc = await savedDoc(page);
  check('touch Pointer Events drag inserts at a later prose line and preserves every text block', doc.blocks[2]?.type === 'contact'
    && doc.blocks[2].contact.name === 'Mika' && JSON.stringify(doc.blocks.filter(b => b.type === 'text').map(b => b.text)) === JSON.stringify(proseBeforeDrag),
  JSON.stringify(summary(doc)));

  // A no-op pointer gesture retains capture and makes no storage change.
  const noopHandle = page.locator('.tk-contact[data-id="aino"] .tk-drag');
  await noopHandle.evaluate(el => el.addEventListener('pointerdown', e => el.dataset.pointer = String(e.pointerId), { once: true }));
  const unchangedRaw = await page.evaluate(key => localStorage.getItem(key), V2);
  const noop = await noopHandle.boundingBox();
  await page.mouse.move(noop.x + noop.width / 2, noop.y + noop.height / 2); await page.mouse.down();
  await page.mouse.move(noop.x + noop.width / 2 + 2, noop.y + noop.height / 2 + 2);
  const held = await noopHandle.evaluate(el => el.hasPointerCapture(Number(el.dataset.pointer)));
  await page.mouse.up();
  check('tiny/no-change drag retains pointer capture until release and changes nothing', held
    && await page.evaluate(key => localStorage.getItem(key), V2) === unchangedRaw
    && !await page.locator('.tk-contact.dragging').count());

  // Pointer cancellation outside is non-destructive; release outside performs removal only at release.
  // Raw mouse paths do not auto-scroll like locator.click(). Bring the real handle into the editor's
  // scrollport before measuring it; otherwise a compact editor can make this a drag from empty space.
  const outsideHandle = page.locator(`.tk-contact[data-id="${liId}"] .tk-drag`);
  const prepareOutsideDrag = async (recordPointer = false) => {
    if (recordPointer) await outsideHandle.evaluate(el => el.addEventListener('pointerdown',
      e => el.dataset.pointer = String(e.pointerId), { once: true }));
    await outsideHandle.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const box = await outsideHandle.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const saveOutsideFailure = async (name, start, end) => {
    const artifact = await page.evaluate(({ id, start, end }) => {
      const editor = document.querySelector('.tk-editor'), r = editor.getBoundingClientRect();
      const at = point => {
        const el = document.elementFromPoint(point.x, point.y);
        return el ? `${el.tagName}.${el.className}` : null;
      };
      return { viewport: { width: innerWidth, height: innerHeight }, start, end,
        hitAtStart: at(start), hitAtEnd: at(end), editor: { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
          scrollTop: editor.scrollTop, scrollHeight: editor.scrollHeight, clientHeight: editor.clientHeight },
        dragging: document.querySelectorAll('.tk-is-dragging, .tk-contact.dragging').length,
        willRemove: document.querySelectorAll('.tk-will-remove').length,
        document: JSON.parse(localStorage.getItem('garden.safetyPlan.v2')),
        contactPresent: !!document.querySelector(`.tk-contact[data-id="${id}"]`) };
    }, { id: liId, start, end });
    await writeFile(`/tmp/opencode/toolkit-${name}-FAIL.json`, JSON.stringify(artifact, null, 2));
    await page.screenshot({ path: `/tmp/opencode/toolkit-${name}-FAIL.png` });
  };

  const editorBox = await page.locator('.tk-editor').boundingBox();
  let outsideStart = await prepareOutsideDrag(true);
  await page.mouse.move(outsideStart.x, outsideStart.y); await page.mouse.down();
  const outsideEnd = { x: Math.max(2, editorBox.x - 18), y: outsideStart.y + 20 };
  await page.mouse.move(outsideEnd.x, outsideEnd.y, { steps: 8 });
  await page.waitForFunction(() => !!document.querySelector('.tk-will-remove'), null, { timeout: 1500 }).catch(() => {});
  const outsideIsAffordance = await page.locator('.tk-will-remove').count() === 1
    && (await savedDoc(page)).blocks.some(b => b.id === liId) && await page.locator(`.tk-contact[data-id="${liId}"]`).count() === 1;
  if (!outsideIsAffordance) await saveOutsideFailure('outside-affordance', outsideStart, outsideEnd);
  check('while outside, remove is only an affordance and contact remains saved', outsideIsAffordance);
  await outsideHandle.evaluate(el => el.dispatchEvent(new PointerEvent('pointercancel',
    { bubbles: true, pointerId: Number(el.dataset.pointer) })));
  await page.mouse.up();
  check('pointercancel outside leaves document/contact unchanged', (await savedDoc(page)).blocks.some(b => b.id === liId)
    && await page.locator(`.tk-contact[data-id="${liId}"]`).count() === 1 && !await page.locator('.tk-is-dragging').count());

  outsideStart = await prepareOutsideDrag();
  await page.mouse.move(outsideStart.x, outsideStart.y); await page.mouse.down();
  outsideEnd.x = Math.max(2, editorBox.x - 18); outsideEnd.y = outsideStart.y + 20;
  await page.mouse.move(outsideEnd.x, outsideEnd.y, { steps: 8 });
  await page.waitForFunction(() => !!document.querySelector('.tk-will-remove'), null, { timeout: 1500 }).catch(() => {});
  await page.screenshot({ path: '/tmp/opencode/toolkit-drag-outside.png' });
  await page.mouse.up();
  await page.screenshot({ path: '/tmp/opencode/toolkit-drag-outside-released.png' });
  const outsideReleaseRemoved = !(await savedDoc(page)).blocks.some(b => b.id === liId)
    && await page.locator(`.tk-contact[data-id="${liId}"]`).count() === 0
    && (await savedDoc(page)).blocks.filter(b => b.type === 'contact').length === 2;
  if (!outsideReleaseRemoved) await saveOutsideFailure('outside-release', outsideStart, outsideEnd);
  check('release outside removes exactly that chip and persists its deletion', outsideReleaseRemoved);

  const finalSummary = summary(await savedDoc(page));
  await page.reload({ waitUntil: 'networkidle' }); await goToolkit(); await openPlan();
  check('reload restores exact mixed order after drag/edit/removal with no duplicates', JSON.stringify(summary(await savedDoc(page))) === JSON.stringify(finalSummary)
    && await page.locator('.tk-contact').count() === 2);

  // Reflect's existing derived interface must read actual v2 document order.
  doc = await savedDoc(page);
  const firstText = doc.blocks.filter(b => b.type === 'text').flatMap(b => b.text.split('\n')).find(t => t.trim()).trim();
  const firstContact = doc.blocks.find(b => b.type === 'contact').contact;
  await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(400);
  await page.locator('.rf-item[data-id="seed-2"]').scrollIntoViewIfNeeded();
  await page.click('.rf-item[data-id="seed-2"] .rf-strip');
  await page.click('.rf-item[data-id="seed-2"] .rf-turn'); await page.waitForTimeout(550);
  const reflected = await page.evaluate(() => ({ line: document.querySelector('.rf-item[data-id="seed-2"] .rf-flag-line').textContent,
    call: document.querySelector('.rf-item[data-id="seed-2"] .rf-call').textContent,
    href: document.querySelector('.rf-item[data-id="seed-2"] .rf-call').getAttribute('href') }));
  check('Reflect shows the first non-empty document text line and first contact in order', reflected.line === firstText
    && reflected.call === `Call ${firstContact.name.trim()}`, JSON.stringify({ ...reflected, expectedLine: firstText, expectedContact: firstContact.name }));
  await page.click('.rf-item[data-id="seed-2"] .rf-plan'); await page.waitForTimeout(400);
  check('Reflect Open my plan arrives at the fullscreen editor with options hidden', await page.isVisible('#toolkit-safety-plan')
    && await page.locator('.toolkit-option:visible').count() === 0);

  const planEvents = await page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]').filter(e => e.type === 'safety_plan_saved'));
  check('autosave history stores counts only, never plan prose or phone numbers', planEvents.length > 5
    && !JSON.stringify(planEvents).includes('Second prose') && !JSON.stringify(planEvents).includes('123 4567')
    && planEvents.every(e => Number.isInteger(e.payload.lines) && Number.isInteger(e.payload.contacts)), `${planEvents.length} saves`);

  // Compact width/height and emulated visual keyboard.
  await back(); await page.setViewportSize({ width: 320, height: 568 }); await page.waitForTimeout(150);
  const compactFit = await fit();
  check('320 x 568 closed list fits without pane/list/horizontal scrolling', compactFit.paneNoScroll && compactFit.noScroll
    && compactFit.noHorizontal && compactFit.allInside, JSON.stringify(compactFit));
  await page.screenshot({ path: '/tmp/opencode/toolkit-closed-320.png' });
  await openPlan();
  const compact = await page.evaluate(() => {
    const panel = document.querySelector('#toolkit-safety-plan'), editor = panel.querySelector('.tk-editor');
    const pane = document.querySelector('.pane[data-pane="toolkit"]'), options = document.querySelector('.toolkit-options');
    return { panelWidth: panel.getBoundingClientRect().width, options: options.scrollWidth <= options.clientWidth + 1,
      editor: editor.scrollWidth <= editor.clientWidth + 1, pane: pane.scrollHeight <= pane.clientHeight + 1,
      optionsNoScroll: options.scrollHeight <= options.clientHeight + 1,
      otherOptions: [...document.querySelectorAll('.toolkit-option')].filter(e => e.getBoundingClientRect().width).length };
  });
  check('320px open editor reaches the add row inside the pane with no horizontal overflow', compact.panelWidth < 320 && compact.options
    && compact.editor && compact.pane && compact.optionsNoScroll && compact.otherOptions === 0, JSON.stringify(compact));
  const row320 = await addRowFit();
  check('320px add row preserves smaller Name, larger Phone, usable Add, and 44px targets', row320.viewport === 320
    && row320.phoneWider && row320.nameUsable && row320.addWider && row320.targets && row320.noHorizontal && row320.noOverlap,
  JSON.stringify(row320));
  await page.screenshot({ path: '/tmp/opencode/toolkit-compact-320.png' });
  await page.focus('.tk-new-name'); await page.evaluate(() => garden.toolkitKb(260)); await page.waitForTimeout(120);
  const keyboard = await page.evaluate(() => ({ addBottom: document.querySelector('.tk-contact-add').getBoundingClientRect().bottom,
    visibleBottom: innerHeight - 260, panelBottom: document.querySelector('#toolkit-safety-plan').getBoundingClientRect().bottom,
    overflow: document.querySelector('.toolkit-options').scrollHeight > document.querySelector('.toolkit-options').clientHeight + 1 }));
  check('emulated keyboard shrinks the open tool above the keyboard without outer overflow', keyboard.addBottom <= keyboard.visibleBottom + 1
    && keyboard.panelBottom <= keyboard.visibleBottom + 1 && !keyboard.overflow, JSON.stringify(keyboard));
  await page.evaluate(() => { garden.toolkitKb(0); document.activeElement.blur(); });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100); await back();
}

/** Run after the other pane checks: this deliberately resets their local fixtures. */
export async function toolkitResetChecks({ page, check }) {
  await page.evaluate(async () => {
    localStorage.setItem('garden.resetSentinel', 'keep until confirmed');
    localStorage.setItem('garden.dayOffset', '4');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('garden', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const request = db.transaction('photos', 'readwrite').objectStore('photos').put(new Blob(['reset sentinel']), 'reset-sentinel');
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    db.close();
  });
  await page.click('.tab[data-pane="toolkit"]'); await page.waitForTimeout(350);
  const beforeCancel = await page.evaluate(([v1, v2]) => ({ v1: localStorage.getItem(v1), v2: localStorage.getItem(v2) }), [V1, V2]);
  page.once('dialog', dialog => dialog.dismiss());
  await page.click('.toolkit-option[data-option="reset-demo"]');
  check('Reset demo cancellation preserves plan and local sentinel', await page.evaluate(([keys, before]) => localStorage.getItem('garden.resetSentinel') === 'keep until confirmed'
    && localStorage.getItem(keys[0]) === before.v1 && localStorage.getItem(keys[1]) === before.v2, [[V1, V2], beforeCancel]));

  const navigation = page.waitForNavigation({ waitUntil: 'networkidle' });
  page.once('dialog', dialog => dialog.accept());
  await page.click('.toolkit-option[data-option="reset-demo"]');
  await navigation;
  const reset = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('garden', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const photo = await new Promise((resolve, reject) => {
      const request = db.transaction('photos', 'readonly').objectStore('photos').get('reset-sentinel');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    const plan = JSON.parse(localStorage.getItem('garden.safetyPlan.v2'));
    return { sentinel: localStorage.getItem('garden.resetSentinel'), oldPlan: localStorage.getItem('garden.safetyPlan.v1'), plan,
      winddown: localStorage.getItem('garden.winddown'), offset: localStorage.getItem('garden.dayOffset'), photo,
      home: document.querySelector('.tab[data-pane="home"]').getAttribute('aria-current') === 'page',
      seeds: JSON.parse(localStorage.getItem('garden.log') || '[]').filter(e => e.type === 'card_created' && e.payload.seed).length };
  });
  check('Reset clears legacy/local content/photos/progress and reloads only a fresh example', reset.sentinel === null && reset.oldPlan === null
    && reset.plan?.v === 2 && reset.plan.updated === null && reset.plan.blocks.some(b => b.type === 'text' && b.text.includes('Evening plan'))
    && reset.winddown === null && reset.offset === null && reset.photo === undefined && reset.home && reset.seeds === 3, JSON.stringify(reset));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
  const BASE = process.argv[2] || 'http://127.0.0.1:8815/';
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`); };
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await toolkitChecks({ page, check });
  await toolkitResetChecks({ page, check });
  check('no Toolkit console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}
