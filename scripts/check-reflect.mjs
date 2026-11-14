// Reflect checks, one per behaviour in the designers' spec (~/chat/A/briefs/garden-reflect-spec.md).
// Called from scripts/check.mjs; the browser there runs with Chromium's fake camera.
export async function reflectChecks({ page, context, check, BASE }) {
  const SEED = ['Slept badly, but I made it out for the walk anyway.', 'Everything feels pointless tonight.',
    'Walked the long way home. The river had ice on the edges.'];
  const PLACEHOLDER = 'Thank you for putting this into words.', FALLBACK = 'I have this.', PENDING = 'Reading what you wrote…';
  const events = () => page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]'));
  const ev = async type => (await events()).filter(e => e.type === type);
  const ids = () => page.$$eval('.rf-item', els => els.map(e => e.dataset.id));
  const side = id => page.getAttribute(`.rf-item[data-id="${id}"] .rf-card`, 'data-side');
  const cardSel = id => `.rf-item[data-id="${id}"] .rf-card`;
  const turnSel = id => `.rf-item[data-id="${id}"] .rf-turn`;
  const reveal = id => page.evaluate(id => document.querySelector(`.rf-item[data-id="${id}"]`).scrollIntoView({ block: 'center' }), id);
  const tapCard = async id => { await reveal(id); await page.waitForTimeout(100); await page.locator(turnSel(id)).tap(); await page.waitForTimeout(120); };
  const lastId = async () => (await ids()).at(-1);
  const addText = async (t, waitReply = true) => {
    await page.click('.rf-text'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
    await page.keyboard.insertText(t);
    await page.click('.rf-add');
    if (waitReply) await page.waitForFunction(() => !document.querySelector('.rf-add').disabled || !document.querySelector('.rf-text').readOnly, null, { timeout: 8000 });
    return lastId();
  };
  async function hold(sel, ms) {
    const b = await page.locator(sel).boundingBox();
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.35); await page.mouse.down();
    await page.waitForTimeout(ms); await page.mouse.up();
  }
  const cdp = await context.newCDPSession(page);
  async function touchDrag(x0, y0, x1, y1, ms = 250, steps = 10) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let k = 1; k <= steps; k++) {
      await new Promise(r => setTimeout(r, ms / steps));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / steps, y: y0 + (y1 - y0) * k / steps }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(450);
  }
  const visiblePane = () => page.evaluate(() => [...document.querySelectorAll('.pane')].find(p => Math.abs(p.getBoundingClientRect().left) < 2)?.dataset.pane);

  // ---- fresh start on Reflect
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(450);

  check('Reflect: title and line', await page.innerText('[data-pane="reflect"] h1') === 'Reflect'
    && await page.innerText('[data-pane="reflect"] .sub') === 'Tap a card to turn it. Hold it to rewrite. Older cards are above.');
  const texts = await page.$$eval('.rf-item .rf-txt', els => els.map(e => e.textContent));
  check('Reflect: the three seed cards, oldest first', JSON.stringify(texts) === JSON.stringify(SEED), JSON.stringify(texts));
  const atBottom = await page.evaluate(() => { const l = document.querySelector('.rf-list'); return l.scrollHeight - l.clientHeight - l.scrollTop; });
  check('Reflect: opens scrolled to the bottom (newest card)', atBottom <= 2, `${atBottom}px from the bottom`);
  const geo = await page.evaluate(() => { const c = document.querySelector('.rf-card').getBoundingClientRect(), w = document.querySelector('.rf-writer').getBoundingClientRect();
    const r = getComputedStyle(document.querySelector('.rf-front')).borderRadius; const t = document.querySelector('.rf-text').getBoundingClientRect();
    const items = [...document.querySelectorAll('.rf-item')].map(e => e.getBoundingClientRect());
    return { cw: Math.round(c.width), ch: Math.round(c.height), r, writer: Math.round(w.height), ta: Math.round(t.height), gap: Math.round(items[1].top - items[0].bottom) }; });
  check('Reflect: card 350 x 233, radius 24, 16 px apart', geo.cw === 350 && geo.ch === 233 && geo.r === '24px' && geo.gap >= 16, JSON.stringify(geo));
  check('Reflect: writing area well under half the screen, text area 96 px', geo.writer < 844 / 2 - 100 && geo.ta === 96, `writer ${geo.writer}px`);
  const seedSeedSprout = await page.evaluate(() => document.querySelector('.tab[data-pane="reflect"]').classList.contains('done'));
  check('Reflect: seed cards do not set the sprout', !seedSeedSprout);
  const flagNow = await page.evaluate(() => [...document.querySelectorAll('.rf-flag')].filter(f => !f.hidden).length);
  check('Reflect: no flag panel while every card shows its front', flagNow === 0);

  // ---- writing area
  check('Add disabled when there is neither text nor a photo', await page.isDisabled('.rf-add'));
  const rule0 = await page.evaluate(() => getComputedStyle(document.querySelector('.rf-rule')).backgroundColor);
  check('rule is #cfd6d2 with no suggested mood', rule0 === 'rgb(207, 214, 210)', rule0);
  await page.click('.rf-text'); await page.keyboard.insertText('A short line');
  const short = await page.evaluate(() => getComputedStyle(document.querySelector('.rf-text')).fontSize);
  await page.keyboard.insertText(' that keeps going past seventy characters so the type steps down a size');
  const long = await page.evaluate(() => getComputedStyle(document.querySelector('.rf-text')).fontSize);
  check('writing type 22 px up to 70 characters, then 18 px', short === '22px' && long === '18px', `${short} -> ${long}`);
  check('Add enabled with text', !(await page.isDisabled('.rf-add')));
  // the draft survives leaving the pane and a reload
  const draftText = await page.inputValue('.rf-text');
  await page.click('.tab[data-pane="home"]'); await page.waitForTimeout(350); await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(350);
  const kept1 = await page.inputValue('.rf-text');
  await page.reload({ waitUntil: 'networkidle' }); await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(350);
  check('leaving the pane keeps the draft (and a reload)', kept1 === draftText && await page.inputValue('.rf-text') === draftText
    && (await ev('card_created')).length === 3);
  // hard limit 220, the line-break cap, and the fit check
  await page.click('.rf-text'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  for (let k = 0; k < 30; k++) await page.keyboard.insertText('little words ');
  const n220 = (await page.inputValue('.rf-text')).length;
  check('hard limit: at most 220 characters', n220 <= 220 && n220 >= 200, `${n220} characters after typing 390`);
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  for (let k = 0; k < 9; k++) { await page.keyboard.insertText('line'); await page.keyboard.press('Enter'); }
  const nl = ((await page.inputValue('.rf-text')).match(/\n/g) || []).length;
  check('line breaks capped (at most 4)', nl <= 4, `${nl} breaks after pressing Enter 9 times`);
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await page.keyboard.insertText('W'.repeat(220));
  const wide = await page.inputValue('.rf-text');
  check('text that would overflow a card is refused (220 wide letters)', wide.length < 220, `${wide.length} kept`);

  // ---- Add, pending, reply; the placeholder alternates; the sprout
  const ph0 = await page.getAttribute('.rf-text', 'placeholder');
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await page.keyboard.insertText('Fed the birds.');
  await page.click('.rf-add'); await page.waitForTimeout(120);
  const id1 = await lastId();
  const pend = { side: await side(id1), reply: await page.innerText(`${cardSel(id1)} .rf-reply`), add: await page.isDisabled('.rf-add'),
    ro: await page.evaluate(() => document.querySelector('.rf-text').readOnly), cam: await page.isDisabled('.rf-cam') };
  check('Add appends the card at the bottom, turned over, "Reading what you wrote…"', pend.side === 'back' && pend.reply === PENDING
    && (await ids()).length === 4, JSON.stringify(pend));
  check('writing area locked while the reply is pending', pend.add && pend.ro && pend.cam);
  await page.waitForTimeout(1300);
  check('the reply arrives (stub placeholder)', await page.innerText(`${cardSel(id1)} .rf-reply`) === PLACEHOLDER);
  check('writing area unlocked, empty, Add disabled again', !(await page.evaluate(() => document.querySelector('.rf-text').readOnly))
    && await page.inputValue('.rf-text') === '' && await page.isDisabled('.rf-add'));
  check('placeholder alternates after an add', ph0 !== await page.getAttribute('.rf-text', 'placeholder')
    && ['What is on your mind?', 'One thing from today?'].includes(ph0), `${ph0} -> ${await page.getAttribute('.rf-text', 'placeholder')}`);
  check('an add today sets Reflect\'s sprout (blue)', await page.evaluate(() => { const t = document.querySelector('.tab[data-pane="reflect"]');
    return t.classList.contains('done') && getComputedStyle(t.querySelector('.mark svg')).color === 'rgb(47, 111, 176)'; }));

  // the three type steps on the card front
  const idMid = await addText('I sat by the window for a long while and watched the snow come down on the street until the lamps came on.');
  const idLong = await addText('Called my sister in the afternoon and we talked about nothing much, which was good. Then I cooked the soup she likes and ate it slowly. The kitchen was warm and I stayed there a while longer.');
  const fs = async id => page.evaluate(sel => getComputedStyle(document.querySelector(sel)).fontSize + '/' + getComputedStyle(document.querySelector(sel)).lineHeight, `${cardSel(id)} .rf-txt`);
  const steps = [await fs('seed-1'), await fs(idMid), await fs(idLong)];
  check('card type by length: 28/36, 22/30, 18/26', steps.join(' ') === '28px/36px 22px/30px 18px/26px', steps.join(' '));
  const fitAll = await page.evaluate(() => [...document.querySelectorAll('.rf-card[data-side="front"] .rf-front')].every(f => {
    const t = f.querySelector('.rf-txt').getBoundingClientRect(), b = f.querySelector('.rf-tbox').getBoundingClientRect(); return t.bottom <= b.bottom + 0.5; }));
  check('no card text overflows its card', fitAll);
  const facesClear = await page.evaluate(() => [...document.querySelectorAll('.rf-card[data-side="front"] .rf-front')].every(f => {
    const face = f.closest('.rf-card').querySelector('.rf-face').getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(f.querySelector('.rf-txt'));
    return [...range.getClientRects()].every(r => r.right <= face.left || r.bottom <= face.top || r.width === 0); }));
  check('text never runs under the face button', facesClear);

  // ---- turning, the face, hold to rewrite
  await tapCard(idMid); await tapCard(idLong); await page.waitForTimeout(500);   // added cards start turned over
  const s0 = await side('seed-1');
  await tapCard('seed-1'); const s1 = await side('seed-1');
  await tapCard('seed-1'); const s2 = await side('seed-1');
  check('tap turns a card and tap again turns it back', s0 === 'front' && s1 === 'back' && s2 === 'front', `${s0} ${s1} ${s2}`);
  const flipDur = await page.evaluate(() => getComputedStyle(document.querySelector('.rf-flip')).transitionDuration);
  check('the turn is a ~500 ms horizontal flip', flipDur === '0.5s' && await page.evaluate(() => getComputedStyle(document.querySelector('.rf-back')).transform.startsWith('matrix3d')), flipDur);
  const backBg = await page.evaluate(() => { const b = getComputedStyle(document.querySelector('.rf-item[data-id="seed-1"] .rf-back')); return b.backgroundColor + ' ' + b.borderTopColor + ' ' + b.borderTopWidth; });
  check('text card back: white, 1 px #cfd6d2', backBg === 'rgb(255, 255, 255) rgb(207, 214, 210) 1px', backBg);
  const moods = [];
  for (let k = 0; k < 5; k++) {
    await page.click(`${cardSel('seed-1')} .rf-face`); await page.waitForTimeout(320);
    moods.push(await page.evaluate(sel => { const c = document.querySelector(sel); return getComputedStyle(c.querySelector('.rf-front')).backgroundColor + '|' + c.querySelector('.rf-face').getAttribute('aria-label').split('.')[0]; }, cardSel('seed-1')));
  }
  check('face steps the mood up and wraps; colour and mouth follow', JSON.stringify(moods) === JSON.stringify([
    'rgb(246, 231, 207)|Mood: Okay', 'rgb(242, 200, 143)|Mood: Good', 'rgb(174, 191, 217)|Mood: Bad', 'rgb(211, 220, 234)|Mood: Not great', 'rgb(246, 231, 207)|Mood: Okay']), moods.join(' '));
  check('the face does not turn the card', await side('seed-1') === 'front');
  const noMoodFace = await page.evaluate(() => { const id = [...document.querySelectorAll('.rf-item')].at(-1).dataset.id; return document.querySelector(`.rf-item[data-id="${id}"] .rf-face svg`).querySelectorAll('path').length; });
  check('no mood: a face with no mouth (eyes only)', noMoodFace === 2, `${noMoodFace} paths`);

  await reveal('seed-1'); await page.waitForTimeout(100);
  await hold(turnSel('seed-1'), 750); await page.waitForTimeout(250);
  const ed = await page.evaluate(sel => { const c = document.querySelector(sel); return { editing: c.classList.contains('editing'), side: c.dataset.side,
    done: !c.querySelector('.rf-done').hidden, ce: c.querySelector('.rf-txt').isContentEditable, outline: getComputedStyle(c.querySelector('.rf-front')).boxShadow }; }, cardSel('seed-1'));
  check('hold 500 ms: editable in place, dark outline, Done, and it did not turn', ed.editing && ed.side === 'front' && ed.done && ed.ce
    && ed.outline.startsWith('rgb(28, 36, 34) 0px 0px 0px 2px'), JSON.stringify(ed));
  const shortHold = await (async () => { await page.click(`${cardSel('seed-1')} .rf-done`); await hold(turnSel('seed-1'), 250); await page.waitForTimeout(200);
    const r = { editing: await page.evaluate(sel => document.querySelector(sel).classList.contains('editing'), cardSel('seed-1')), side: await side('seed-1') };
    await tapCard('seed-1'); return r; })();
  check('a 250 ms press is a tap, not an edit', !shortHold.editing && shortHold.side === 'back', JSON.stringify(shortHold));
  // edit to blank; the reply stays as it was; the original text stays in the log
  const replyBefore = await page.innerText(`${cardSel('seed-1')} .rf-reply`);
  await reveal('seed-1'); await hold(turnSel('seed-1'), 750); await page.waitForTimeout(400);
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await page.click(`${cardSel('seed-1')} .rf-done`); await page.waitForTimeout(150);
  const edits = await ev('card_text_edited');
  check('a card can be edited to blank', await page.innerText(`${cardSel('seed-1')} .rf-txt`) === '' && edits.at(-1)?.payload.to === '');
  check('the edit keeps the original text in the log', edits.some(e => e.payload.from === SEED[0]), JSON.stringify(edits.at(-1)?.payload));
  check('the reply does not change after the text is edited', await page.innerText(`${cardSel('seed-1')} .rf-reply`) === replyBefore && replyBefore === 'You went out even though the night was rough.');
  const del = await page.evaluate(() => [...document.querySelectorAll('[data-pane="reflect"] button, [data-pane="reflect"] [role="button"]')]
    .filter(b => /delete|remove|discard|trash/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') || ''))).length);
  check('no delete anywhere; the card is still there', del === 0 && (await ids()).includes('seed-1'));

  // ---- the photo card's three taps
  const ph = [];
  for (let k = 0; k < 3; k++) {
    await tapCard('seed-3'); await page.waitForTimeout(350);
    ph.push(await page.evaluate(sel => { const c = document.querySelector(sel); const img = c.querySelector('.rf-img');
      return `${c.dataset.side}:${getComputedStyle(img).filter}:${getComputedStyle(c.querySelector('.rf-veil')).opacity}:${getComputedStyle(c.querySelector('.rf-reply')).opacity}:${img.naturalWidth > 0}`; }, cardSel('seed-3')));
  }
  check('photo card: photo, then blurred with the reply on a veil, then the front', ph[0] === 'photo:none:0:0:true'
    && ph[1] === 'reply:blur(14px):1:1:true' && ph[2].startsWith('front:'), ph.join(' '));

  // ---- flagged: the plan under the card, calm
  await tapCard('seed-2'); await page.waitForTimeout(200);
  const flag = await page.evaluate(() => { const item = document.querySelector('.rf-item[data-id="seed-2"]'), f = item.querySelector('.rf-flag');
    const c = item.querySelector('.rf-card').getBoundingClientRect(), r = f.getBoundingClientRect(), cs = getComputedStyle(f);
    const all = [f, ...f.querySelectorAll('*')].flatMap(e => { const s = getComputedStyle(e); return [s.color, s.backgroundColor, s.borderTopColor]; });
    const red = all.filter(x => { const m = x.match(/\d+/g); if (!m) return false; const [r1, g1, b1, a] = m.map(Number); return a !== 0 && r1 > g1 + 40 && r1 > b1 + 40; });
    return { shown: !f.hidden, under: Math.round(r.top - c.bottom), bg: cs.backgroundColor, border: cs.borderTopColor + ' ' + cs.borderTopWidth, radius: cs.borderRadius,
      text: f.innerText, buttons: [...f.querySelectorAll('button')].map(b => b.textContent), red, svg: f.querySelectorAll('svg, img').length }; });
  check('flagged card: the plan panel opens directly under it', flag.shown && flag.under === 16 && flag.bg === 'rgb(255, 255, 255)'
    && flag.border === 'rgb(139, 151, 146) 1px' && flag.radius === '20px', JSON.stringify({ ...flag, text: undefined }));
  check('panel: "From your plan", the plan line, Call and Open my plan', flag.text.startsWith('From your plan') && flag.buttons.length === 2
    && flag.buttons[0].startsWith('Call ') && flag.buttons[1] === 'Open my plan', flag.buttons.join(' | '));
  check('panel: no red, no warning icon', flag.red.length === 0 && flag.svg === 0, flag.red.join(' '));
  check('the flagged card still shows its acknowledgement', await page.innerText(`${cardSel('seed-2')} .rf-reply`) === 'That is a heavy thing to carry, and you wrote it down.');
  await page.click('.rf-item[data-id="seed-2"] .rf-plan'); await page.waitForTimeout(400);
  check('"Open my plan" goes to Toolkit', await visiblePane() === 'toolkit');
  await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(400);

  // ---- the reply service: flagged, slow, failed
  await page.evaluate(() => localStorage.setItem('garden.test.reply', 'flagged'));
  const idF = await addText('Not sure what the point is.');
  await page.waitForTimeout(200);
  check('a flagged new entry: acknowledgement on the back and the plan panel under it', await page.innerText(`${cardSel(idF)} .rf-reply`) === PLACEHOLDER
    && await page.evaluate(id => !document.querySelector(`.rf-item[data-id="${id}"] .rf-flag`).hidden, idF));
  await page.evaluate(() => localStorage.setItem('garden.test.reply', 'fail'));
  const idX = await addText('The bus was late again.');
  check('a failed service still answers "I have this."', await page.innerText(`${cardSel(idX)} .rf-reply`) === FALLBACK);
  await page.evaluate(() => localStorage.setItem('garden.test.reply', 'slow'));
  const t0 = Date.now(); const idS = await addText('Rain all day.');
  const waited = Date.now() - t0;
  check('a slow service answers "I have this." within about 5 s', await page.innerText(`${cardSel(idS)} .rf-reply`) === FALLBACK && waited < 7000, `${waited} ms`);
  await page.evaluate(() => localStorage.removeItem('garden.test.reply'));
  await page.waitForTimeout(300);
  const replies = (await ev('card_reply_received')).filter(e => e.payload.id === idS);
  check('one reply per card, recorded once', replies.length === 1 && replies[0].payload.source === 'fallback');

  // ---- suggested mood: the rule and a new card take it
  await page.evaluate(() => garden.setMood(3));
  await page.click('.tab[data-pane="home"]'); await page.waitForTimeout(300); await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(300);
  const rule3 = await page.evaluate(() => getComputedStyle(document.querySelector('.rf-rule')).backgroundColor);
  const idM = await addText('Good walk.');
  const cm = await page.evaluate(sel => getComputedStyle(document.querySelector(sel + ' .rf-front')).backgroundColor, cardSel(idM));
  check('suggested mood: rule in its colour, a new card takes it', rule3 === 'rgb(242, 200, 143)' && cm === 'rgb(242, 200, 143)', `${rule3} ${cm}`);
  await page.evaluate(() => garden.setMood(null));

  // ---- camera: live view, capture, Photo added, a photo card
  await page.click('.rf-cam');
  await page.waitForFunction(() => document.querySelector('.rf-video').videoWidth > 0, null, { timeout: 5000 }).catch(() => {});
  const camGeo = await page.evaluate(() => { const c = document.querySelector('.rf-camera').getBoundingClientRect();
    return { w: Math.round(c.width), h: Math.round(c.height), r: getComputedStyle(document.querySelector('.rf-camera')).borderRadius,
      live: document.querySelector('.rf-video').videoWidth > 0, writer: !document.querySelector('.rf-compose').hidden }; });
  check('camera: card-sized view (350 x 233, radius 24) in place of the writing area, live camera', camGeo.w === 350 && camGeo.h === 233
    && camGeo.r === '24px' && camGeo.live && !camGeo.writer, JSON.stringify(camGeo));
  await page.click('.rf-shutter'); await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ closed: document.querySelector('.rf-camera').hidden, note: document.querySelector('.rf-note').textContent,
    on: document.querySelector('.rf-cam').classList.contains('on'), bg: getComputedStyle(document.querySelector('.rf-cam')).backgroundColor,
    add: document.querySelector('.rf-add').disabled, streams: document.querySelector('.rf-video').srcObject }));
  check('capture: view closes, "Photo added", the camera button fills dark, camera released', after.closed && after.note === 'Photo added' && after.on
    && after.bg === 'rgb(28, 36, 34)' && !after.add && after.streams === null, JSON.stringify(after));
  await page.click('.rf-add'); await page.waitForTimeout(1500);
  const idP = await lastId();
  const pc = await page.evaluate(sel => { const c = document.querySelector(sel); const img = c.querySelector('.rf-img');
    return { side: c.dataset.side, img: !!img && img.naturalWidth > 0 && img.src.startsWith('blob:'), w: img?.naturalWidth, h: img?.naturalHeight }; }, cardSel(idP));
  check('a photo-only card: added turned over with the reply, the photo from the device (IndexedDB)', pc.side === 'reply' && pc.img
    && Math.max(pc.w, pc.h) <= 1200, JSON.stringify(pc));
  await page.click('.rf-cam'); await page.waitForTimeout(600); await page.click('.rf-cancel'); await page.waitForTimeout(150);
  check('Cancel closes the camera and keeps the writing area', await page.evaluate(() => document.querySelector('.rf-camera').hidden && !document.querySelector('.rf-compose').hidden
    && document.querySelector('.rf-video').srcObject === null));

  // ---- the log
  const types = new Set((await events()).map(e => e.type));
  const need = ['card_created', 'card_text_edited', 'card_mood_changed', 'card_photo_attached', 'card_reply_received'];
  check('log has created / text edited / mood changed / photo attached / reply received', need.every(t => types.has(t)), need.filter(t => !types.has(t)).join(' '));
  const pa = (await ev('card_photo_attached')).filter(e => e.payload.id === idP);
  check('photo attached logged by id, the photo itself not in the log', pa.length === 1 && /^p-/.test(pa[0].payload.photo)
    && !JSON.stringify(await events()).includes('data:image'));
  await page.reload({ waitUntil: 'networkidle' }); await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(400);
  const again = await page.$$eval('.rf-item .rf-txt', els => els.map(e => e.textContent));
  check('the stack is rebuilt from the log after a reload', again[0] === '' && again.length === 11 && again[2] === SEED[2], `${again.length} cards`);

  // ---- keyboard routes
  const k = {};
  await page.focus(turnSel('seed-3')); await page.keyboard.press('Enter'); k.turn = await side('seed-3');
  await page.keyboard.press('Space'); k.turn2 = await side('seed-3'); await page.keyboard.press('Space'); await page.waitForTimeout(100);
  await page.focus(`${cardSel('seed-3')} .rf-face`); await page.keyboard.press('Enter');
  k.face = (await ev('card_mood_changed')).at(-1)?.payload.id;
  await page.focus(`${cardSel('seed-3')} .rf-editkey`);
  k.editVisible = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).opacity, `${cardSel('seed-3')} .rf-editkey`);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  k.edit = await page.evaluate(sel => document.querySelector(sel).classList.contains('editing') && document.activeElement.classList.contains('rf-txt'), cardSel('seed-3'));
  await page.keyboard.insertText(' Cold.'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  k.done = (await page.innerText(`${cardSel('seed-3')} .rf-txt`)).endsWith('Cold.') && !(await page.evaluate(sel => document.querySelector(sel).classList.contains('editing'), cardSel('seed-3')));
  await page.focus(turnSel('seed-1')); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);   // Rewrite, then Done
  k.doneKey = !(await page.evaluate(sel => document.querySelector(sel).classList.contains('editing'), cardSel('seed-1')));
  await page.focus('.rf-cam'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  k.cam = await page.evaluate(() => !document.querySelector('.rf-camera').hidden);
  await page.focus('.rf-cancel'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  await page.focus('.rf-text'); await page.keyboard.insertText('Typed and added from the keyboard.');
  await page.focus('.rf-add'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  k.add = (await page.innerText(`${cardSel(await lastId())} .rf-txt`)) === 'Typed and added from the keyboard.';
  await page.waitForTimeout(1200);
  check('keyboard: turn (Enter/Space), face, Rewrite, Escape and Done, camera, Add', k.turn === 'photo' && k.turn2 === 'reply' && k.face === 'seed-3'
    && k.editVisible === '1' && k.edit && k.done && k.doneKey && k.cam && k.add, JSON.stringify(k));
  const label = await page.getAttribute(turnSel('seed-2'), 'aria-label');
  check('card labels state the text and the mood', label.includes(SEED[1]) && label.includes('Mood: Bad'), label);

  // ---- touch: swipe vs scroll, hold and text selection
  await page.evaluate(() => { const l = document.querySelector('.rf-list'); l.scrollTop = l.scrollHeight; });
  const st0 = await page.evaluate(() => document.querySelector('.rf-list').scrollTop);
  await touchDrag(195, 330, 200, 560, 300);
  const st1 = await page.evaluate(() => document.querySelector('.rf-list').scrollTop);
  check('touch: a vertical drag scrolls the cards and stays on Reflect', st1 < st0 - 100 && await visiblePane() === 'reflect', `scrollTop ${st0} -> ${st1}`);
  // Chromium cancels a horizontal TOUCH drag inside a text area by itself, so the guard that matters is for a mouse
  // drag that selects text, and for a card being rewritten (probed: both change pane without the guard).
  const ta = await page.locator('.rf-text').boundingBox();
  await page.click('.rf-text'); await page.keyboard.insertText('select some of these words with a drag');
  await page.mouse.move(ta.x + 300, ta.y + 16); await page.mouse.down(); await page.mouse.move(ta.x + 20, ta.y + 18, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(450);
  const selPane = await visiblePane();
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await reveal('seed-2'); await hold(turnSel('seed-2'), 750); await page.waitForTimeout(300);
  const eb = await page.locator(`${cardSel('seed-2')} .rf-txt`).boundingBox();
  await page.mouse.move(eb.x + 260, eb.y + 12); await page.mouse.down(); await page.mouse.move(eb.x + 10, eb.y + 14, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(450);
  const editPane = await visiblePane();
  await page.click(`${cardSel('seed-2')} .rf-done`);
  check('selecting text by dragging (writing area, or a card being rewritten) does not change pane', selPane === 'reflect' && editPane === 'reflect', `${selPane} ${editPane}`);
  await touchDrag(330, 450, 90, 455, 200);
  check('touch: a quick horizontal flick over the cards still changes pane', await visiblePane() === 'home');
  await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(400);

  // ---- the on-screen keyboard (emulated: a 320 px keyboard over the layout viewport)
  await page.focus('.rf-text'); await page.evaluate(() => garden.reflectKb(320)); await page.waitForTimeout(250);
  const wb = await page.evaluate(() => document.querySelector('.rf-writer').getBoundingClientRect().bottom);
  await page.evaluate(() => garden.reflectKb(0)); await page.evaluate(() => document.activeElement.blur());
  check('keyboard up (emulated 320 px): the writing area stays above it', wb <= 844 - 320 + 1, `writer bottom ${Math.round(wb)} vs keyboard top ${844 - 320}`);

  // ---- reduced motion: no flip or shake animation
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const rm = await page.evaluate(() => getComputedStyle(document.querySelector('.rf-flip')).transitionDuration);
  await reveal('seed-3'); await hold(turnSel('seed-3'), 600); await page.waitForTimeout(60);
  const rmEdit = await page.evaluate(() => { const c = document.querySelector('.rf-item[data-id="seed-3"] .rf-card'); return { editing: c.classList.contains('editing'), anim: getComputedStyle(c).animationName }; });
  await page.click(`${cardSel('seed-3')} .rf-done`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  check('reduced motion: the turn is instant and there is no shake', rm === '0s' && rmEdit.editing && rmEdit.anim === 'none', `${rm} ${JSON.stringify(rmEdit)}`);

  // ---- contrast: every text against what is behind it, worst case
  const con = await page.evaluate(() => {
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/)[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
    const hex = h => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: 1 });
    const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const ink = parse(getComputedStyle(document.querySelector('.rf-txt')).color);
    const out = [];
    const add = (what, fg, bgs) => out.push({ what, r: Math.round(Math.min(...bgs.map(b => ratio(fg, b))) * 100) / 100 });
    for (const c of ['#aebfd9', '#d3dcea', '#f6e7cf', '#f2c88f', '#e6e9e6']) add(`card text on ${c}`, ink, [hex(c)]);
    add('reply on white', parse(getComputedStyle(document.querySelector('.rf-reply')).color), [hex('#ffffff')]);
    const veil = { r: 255, g: 255, b: 255, a: 0.76 };
    add('reply over the blurred photo (black to white beneath the veil)', ink, [over(veil, hex('#000000')), over(veil, hex('#ffffff'))]);
    add('pending line on white', hex('#4f5b57'), [hex('#ffffff')]);
    add('pending line over a photo (ink)', ink, [over(veil, hex('#000000'))]);
    const ground = hex('#f4f6f3');
    for (const sel of ['[data-pane="reflect"] h1', '[data-pane="reflect"] .sub', '.rf-note']) add(sel, parse(getComputedStyle(document.querySelector(sel)).color), [ground]);
    add('text area', parse(getComputedStyle(document.querySelector('.rf-text')).color), [ground]);
    add('placeholder', hex('#4f5b57'), [ground]);
    add('Add (white on #1c2422)', hex('#ffffff'), [hex('#1c2422')]);
    add('Done / Rewrite', hex('#ffffff'), [hex('#1c2422')]);
    add('panel heading', parse(getComputedStyle(document.querySelector('.rf-flag-h')).color), [hex('#ffffff')]);
    add('panel line', parse(getComputedStyle(document.querySelector('.rf-flag-line')).color), [hex('#ffffff')]);
    add('Call (white on #1c2422)', parse(getComputedStyle(document.querySelector('.rf-call')).color), [parse(getComputedStyle(document.querySelector('.rf-call')).backgroundColor)]);
    add('Open my plan', parse(getComputedStyle(document.querySelector('.rf-plan')).color), [hex('#ffffff')]);
    const scrim = parse(getComputedStyle(document.querySelector('.rf-cancel')).backgroundColor);
    add('Cancel over any camera frame', hex('#ffffff'), [over(scrim, hex('#ffffff')), over(scrim, hex('#000000'))]);
    add('camera message on #0e1114', hex('#ffffff'), [hex('#0e1114')]);
    return out;
  });
  const lowc = con.filter(c => c.r < 4.5);
  check(`Reflect contrast >= 4.5:1 for ${con.length} text/background pairs`, lowc.length === 0,
    lowc.length ? JSON.stringify(lowc) : `lowest ${Math.min(...con.map(c => c.r))} (${con.sort((a, b) => a.r - b.r)[0].what})`);

  return { BASE };
}
