// Focused checks for the Reflect drawer redesign. Can run alone against Vite:
//   node scripts/check-reflect.mjs http://127.0.0.1:8815/
//   node scripts/check-reflect.mjs --isolated   (latest Reflect source only; no Venture imports, ephemeral Vite server)
// Also exports reflectChecks() for scripts/check.mjs. Model requests are intercepted for deterministic, fast cases;
// one case deliberately continues to the real same-origin API. Screenshots default to /tmp/opencode/reflect-redesign.
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const PENDING = 'Reading what you wrote…';
const FALLBACK = 'It is down on the card now.';
const SAFETY = 'That sounds very heavy. You do not have to hold it alone.';
const RESOURCES = 'MIELI Kriisipuhelin 09 2525 0111 · Päivystysapu 116 117 · 112';
const LEGACY_PROMPT = 'No prompt saved with this historical card.';
const REPLY = 'That detail stayed with you.';
const PHOTO = [
  'Take a picture of something blue.', 'Take a picture of something green.', 'Take a picture of something round.',
  'Take a picture of something older than you.', 'Take a picture of the light where you are right now.',
  'Take a picture of what you see from the nearest window.', 'Take a picture of something you used today.',
  'Take a picture of something soft.', 'Take a picture of the smallest thing on the table.',
  'Take a picture of something that is yours.',
  'Take a picture of something growing.', 'Take a picture of your cup.',
];
const WRITE = [
  'One thing you ate today.', 'Something you heard today.', 'Where did you sit the longest?',
  'Something you moved or carried.', 'One thing that took effort.', 'Who did you see or hear from?',
  'Something you finished, however small.', 'What is the weather doing?', 'One thing you put off.',
  'Something you looked at for a while.', 'The last thing that made a sound near you.',
  'One thing you would do again tomorrow.',
];
const ALL_PROMPTS = [...PHOTO, ...WRITE];
const SHOTS = process.env.REFLECT_SHOTS || '/tmp/opencode/reflect-redesign';

export async function reflectChecks({ page, context, check, BASE }) {
  mkdirSync(SHOTS, { recursive: true });
  const errors = [], foreign = [], requests = [];
  const origin = new URL(BASE).origin;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith('http') && new URL(url).origin !== origin) foreign.push(url);
  });

  let responseFor = () => ({ reply: REPLY, linkId: null, flagged: false, source: 'service' });
  let holdResponse = null, realNext = false, realApi = null;
  await page.route('**/api/reflect-reply', async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (realNext) {
      realNext = false;
      const response = await route.fetch();
      realApi = { status: response.status(), body: await response.json().catch(() => null) };
      await route.fulfill({ response });
      return;
    }
    if (holdResponse) await holdResponse;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseFor(body)) });
  });

  const events = () => page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]'));
  const ev = async type => (await events()).filter(event => event.type === type);
  const ids = () => page.$$eval('.rf-item', elements => elements.map(element => element.dataset.id));
  const currentId = () => page.getAttribute('.rf-item.current', 'data-id');
  const cardSel = id => `.rf-item[data-id="${id}"] .rf-card`;
  const turnSel = id => `${cardSel(id)} .rf-turn`;
  const side = id => page.getAttribute(cardSel(id), 'data-side');
  const shot = async name => { await page.waitForTimeout(550); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const waitSettled = id => page.waitForFunction(id =>
    document.querySelector(`.rf-item[data-id="${id}"] .rf-card`)?.dataset.submission === 'settled', id, { timeout: 10000 });
  const waitReply = id => page.waitForFunction(id => {
    const card = document.querySelector(`.rf-item[data-id="${id}"] .rf-card`);
    const answered = JSON.parse(localStorage.getItem('garden.log') || '[]')
      .some(event => event.type === 'card_reply_received' && event.payload.id === id);
    return answered && card?.dataset.submission === 'settled';
  }, id, { timeout: 10000 });

  async function reset(plan = null) {
    await page.evaluate(plan => {
      localStorage.clear();
      if (plan) localStorage.setItem('garden.safetyPlan.v2', JSON.stringify(plan));
    }, plan);
    requests.length = 0;
    responseFor = () => ({ reply: REPLY, linkId: null, flagged: false, source: 'service' });
    holdResponse = null; realNext = false; realApi = null;
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('.tab[data-pane="reflect"]');
    await page.waitForTimeout(400);
  }

  async function setOffset(offset) {
    await page.evaluate(offset => localStorage.setItem('garden.dayOffset', String(offset)), offset);
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('.tab[data-pane="reflect"]');
    await page.waitForTimeout(350);
  }

  async function addText(text, mood = 2) {
    await page.fill('.rf-text', text);
    await page.click(`.rf-mood[data-mood="${mood}"]`);
    const id = await currentId();
    await waitReply(id);
    return id;
  }

  async function bring(id) {
    const all = await ids(), target = all.indexOf(id);
    for (let n = 0; n < all.length + 2 && await currentId() !== id; n++) {
      const now = all.indexOf(await currentId());
      await page.focus('.rf-item.current .rf-turn');
      await page.keyboard.press(now > target ? 'ArrowUp' : 'ArrowDown');
      await page.waitForTimeout(40);
    }
  }

  async function hold(id, ms = 850) {
    const box = await page.locator(turnSel(id)).boundingBox();
    await page.mouse.move(box.x + box.width * .36, box.y + box.height * .35);
    await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
    await page.waitForTimeout(100);
  }

  async function capturePhoto() {
    await page.click('.rf-cam');
    await page.waitForFunction(() => document.querySelector('.rf-video').videoWidth > 0, null, { timeout: 6000 });
    await page.click('.rf-shutter');
    await page.waitForFunction(() => document.querySelector('.rf-camera').hidden, null, { timeout: 6000 });
  }

  const cdp = await context.newCDPSession(page);
  async function touchVertical(fromY, toY) {
    const x = 80;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
    for (let n = 1; n <= 5; n++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: fromY + (toY - fromY) * n / 5 }] });
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(220);
  }

  // A demo date whose base invitation is photographic, calculated with the same stable public date deck algorithm.
  function photoOffset() {
    const hash = text => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
    for (let offset = 0; offset < 60; offset++) {
      const now = new Date(), day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
      const p = n => String(n).padStart(2, '0');
      const date = `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
      if (hash(date) % 24 < 12) return offset;
    }
    return 0;
  }

  const savedPlan = {
    v: 2, updated: 1,
    blocks: [
      { type: 'text', id: 'blank', text: '' },
      { type: 'text', id: 'first', text: 'Evening plan: shower, tea, and something familiar on TV.' },
      { type: 'contact', id: 'aino', contact: { id: 'aino', name: 'Aino', phone: '+358 40 123 4567' } },
      { type: 'text', id: 'second', text: 'A later plan line.' },
      { type: 'contact', id: 'second-person', contact: { id: 'second-person', name: 'Second', phone: '040 555 0100' } },
    ],
  };

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await reset(savedPlan);

  // ---- fixed daily invitations and bounded shuffles
  check('newest card is open at the front with a wide 20 px inset', await currentId() === 'seed-3'
    && await side('seed-3') === 'front');
  await shot('01-front');
  const basePrompt = await page.getAttribute('.rf-text', 'placeholder');
  check('daily writing invitation is from the exact fixed deck', ALL_PROMPTS.includes(basePrompt), basePrompt);
  check('writer has no Add button and starts with all four faces dimmed', await page.locator('.rf-add').count() === 0
    && await page.locator('.rf-mood:disabled').count() === 4);
  await page.reload({ waitUntil: 'networkidle' }); await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(300);
  check('same local/demo date gives the same invitation after reload', await page.getAttribute('.rf-text', 'placeholder') === basePrompt);
  const alternatives = [basePrompt];
  for (let n = 0; n < 3; n++) { await page.click('.rf-shuffle'); alternatives.push(await page.getAttribute('.rf-text', 'placeholder')); }
  check('shuffle gives three deterministic, distinct alternatives', new Set(alternatives).size === 4
    && alternatives.every(text => ALL_PROMPTS.includes(text)), JSON.stringify(alternatives));
  check('shuffle hard-stops at three and persists its count', await page.isDisabled('.rf-shuffle')
    && await page.evaluate(() => JSON.parse(localStorage.getItem('garden.reflect.prompt.v1')).shuffles === 3));
  const fourth = alternatives.at(-1);
  await page.reload({ waitUntil: 'networkidle' }); await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(300);
  check('reload restores the fourth invitation and the disabled limit', await page.isDisabled('.rf-shuffle')
    && await page.getAttribute('.rf-text', 'placeholder') === fourth);
  await setOffset(1);
  check('advancing the demo day resets the daily shuffle allowance', !await page.isDisabled('.rf-shuffle')
    && await page.evaluate(() => JSON.parse(localStorage.getItem('garden.reflect.prompt.v1')).shuffles === 0),
    await page.evaluate(() => JSON.stringify({ disabled: document.querySelector('.rf-shuffle').disabled, use: localStorage.getItem('garden.reflect.prompt.v1'), offset: localStorage.getItem('garden.dayOffset') })));

  // ---- photo invitation, explicit commit, prompt on card and complete request
  await setOffset(photoOffset());
  const photoPrompt = await page.getAttribute('.rf-text', 'placeholder');
  const cameraPrimary = await page.evaluate(() => ({ primary: document.querySelector('.rf-cam').classList.contains('primary'),
    bg: getComputedStyle(document.querySelector('.rf-cam')).backgroundColor, readOnly: document.querySelector('.rf-text').readOnly }));
  check('photo invitation gives camera primary colour without disabling text', PHOTO.includes(photoPrompt)
    && cameraPrimary.primary && cameraPrimary.bg === 'rgb(47, 111, 176)' && !cameraPrimary.readOnly, JSON.stringify(cameraPrimary));
  await shot('02-photo-prompt');
  await page.fill('.rf-text', 'I put the cup on the table.');
  await page.screenshot({ path: `${SHOTS}/12-submit-writer.png` });
  check('text or photo enables all four labelled commit faces', await page.locator('.rf-mood:not(:disabled)').count() === 4
    && JSON.stringify(await page.locator('.rf-mood span').allTextContents()) === JSON.stringify(['Bad', 'Not great', 'Okay', 'Good']));
  const submitStarted = Date.now();
  await page.click('.rf-mood[data-mood="1"]');
  const idPrompt = await currentId();
  await page.waitForTimeout(Math.max(0, 1000 - (Date.now() - submitStarted)));
  const lifted = await page.evaluate(id => {
    const item = document.querySelector(`.rf-item[data-id="${id}"]`), card = item.querySelector('.rf-card');
    return { current: item.classList.contains('current'), arriving: item.classList.contains('arriving'), liftCount: item.dataset.liftCount,
      side: card.dataset.side, state: card.dataset.submission, text: card.querySelector('.rf-txt').textContent, reply: card.querySelector('.rf-reply').textContent };
  }, idPrompt);
  check('commit lifts the visible text card for two seconds with no early reply content', Date.now() - submitStarted >= 900
    && Date.now() - submitStarted < 2000 && lifted.current && lifted.arriving && lifted.liftCount === '1' && lifted.side === 'front'
    && lifted.state === 'lift' && lifted.text === 'I put the cup on the table.' && lifted.reply === '', JSON.stringify(lifted));
  await page.screenshot({ path: `${SHOTS}/13-submit-lift-1s.png` });
  await page.waitForFunction(id => {
    const card = document.querySelector(`.rf-item[data-id="${id}"] .rf-card`);
    return card?.dataset.submission === 'revealing' && !!card.querySelector('.rf-reply').textContent;
  }, idPrompt, { timeout: 7000 });
  const progressive = await page.innerText(`${cardSel(idPrompt)} .rf-reply`);
  const actualAnswer = (await ev('card_reply_received')).find(event => event.payload.id === idPrompt).payload.reply;
  check('only after the 2 s gate does the real arrived answer reveal progressively', Date.now() - submitStarted >= 2000
    && await side(idPrompt) === 'back' && progressive.length > 0 && progressive.length < actualAnswer.length
    && actualAnswer.startsWith(progressive), `${Date.now() - submitStarted} ms: ${progressive}`);
  await page.screenshot({ path: `${SHOTS}/14-submit-back-reveal.png` });
  await waitReply(idPrompt);
  check('single submit generation creates one card/lift and settles on the full frozen answer', (await ev('card_created')).filter(event => event.payload.id === idPrompt).length === 1
    && await page.getAttribute(`.rf-item[data-id="${idPrompt}"]`, 'data-lift-count') === '1'
    && await page.innerText(`${cardSel(idPrompt)} .rf-reply`) === actualAnswer);
  const createdPrompt = (await ev('card_created')).find(event => event.payload.id === idPrompt)?.payload;
  check('face makes an explicit mood, with no Add or implied global mood', createdPrompt.mood === 1
    && await page.locator('.rf-add').count() === 0
    && await page.evaluate(() => getComputedStyle(document.querySelector('.rf-rule')).backgroundColor) === 'rgb(207, 214, 210)');
  check('prompt id is stored and its exact small text is on the card back', typeof createdPrompt.prompt === 'string'
    && await page.innerText(`${cardSel(idPrompt)} .rf-prompt-back`) === photoPrompt);
  const promptFooter = await page.evaluate(id => {
    const content = document.querySelector(`.rf-item[data-id="${id}"] .rf-back-content`).getBoundingClientRect();
    const footer = document.querySelector(`.rf-item[data-id="${id}"] .rf-prompt-back`), box = footer.getBoundingClientRect();
    const reply = document.querySelector(`.rf-item[data-id="${id}"] .rf-reply`).getBoundingClientRect();
    return { bottomGap: content.bottom - box.bottom, clearReply: box.top >= reply.bottom, fontSize: getComputedStyle(footer).fontSize,
      align: getComputedStyle(footer).textAlign };
  }, idPrompt);
  check('daily prompt is a quiet low footer below the centered reply', promptFooter.bottomGap <= .6 && promptFooter.clearReply
    && promptFooter.fontSize === '11px' && promptFooter.align === 'center', JSON.stringify(promptFooter));
  const complete = requests.at(-1);
  check('request carries current id/text/mood/full prompt/hasPhoto', complete.id === idPrompt
    && complete.text === 'I put the cup on the table.' && complete.mood === 1 && complete.hasPhoto === false
    && complete.prompt.text === photoPrompt && complete.prompt.kind === 'photo' && typeof complete.prompt.id === 'string');
  check('history contains the most recent earlier id/date/text cards only', complete.history.length === 3
    && complete.history.every((card, index) => card.id === `seed-${index + 1}` && /^\d{4}-\d{2}-\d{2}$/.test(card.date)
      && typeof card.text === 'string' && !('photo' in card) && !('prompt' in card)));
  const replyCentre = await page.evaluate(id => {
    const card = document.querySelector(`.rf-item[data-id="${id}"] .rf-card`).getBoundingClientRect();
    const reply = document.querySelector(`.rf-item[data-id="${id}"] .rf-reply`), box = reply.getBoundingClientRect(), style = getComputedStyle(reply);
    return { dx: Math.abs((box.left + box.right) / 2 - (card.left + card.right) / 2),
      dy: Math.abs((box.top + box.bottom) / 2 - (card.top + card.bottom) / 2), align: style.textAlign, weight: style.fontWeight };
  }, idPrompt);
  check('committed reply text is centered on both axes with readable medium weight', replyCentre.dx <= 2 && replyCentre.dy <= 2
    && replyCentre.align === 'center' && Number(replyCentre.weight) >= 500, JSON.stringify(replyCentre));
  await shot('03-back');

  // ---- six-strip recession and full wide geometry with enough cards
  for (let n = 0; n < 6; n++) await addText(`Everyday card ${n + 1} with a small detail.`, n % 4);
  const committedMoods = (await ev('card_created')).filter(event => !event.payload.seed).map(event => event.payload.mood);
  check('every new card retains an explicit face mood across all four choices', committedMoods.every(Number.isInteger)
    && [0, 1, 2, 3].every(mood => committedMoods.includes(mood)), JSON.stringify(committedMoods));
  const cappedHistory = requests.at(-1).history;
  const creationIds = (await ev('card_created')).map(event => event.payload.id);
  const expectedHistory = creationIds.slice(-6, -1);
  check('history is capped at exactly the five nearest earlier cards, oldest-to-newest', cappedHistory.length === 5
    && JSON.stringify(cappedHistory.map(card => card.id)) === JSON.stringify(expectedHistory), JSON.stringify(cappedHistory));
  await page.waitForTimeout(300);
  const drawer = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.rf-item')], visible = all.filter(item => !item.hidden);
    const current = document.querySelector('.rf-item.current .rf-card').getBoundingClientRect();
    const writer = document.querySelector('.rf-writer').getBoundingClientRect();
    const strips = visible.filter(item => item.classList.contains('receding'));
    return { all: all.length, visible: visible.length, strips: strips.length, width: current.width, height: current.height,
      left: current.left, right: innerWidth - current.right, writerTop: writer.top, half: document.querySelector('[data-pane="reflect"]').clientHeight / 2,
      transforms: strips.map(item => ({ opacity: getComputedStyle(item).opacity, transform: getComputedStyle(item).transform,
        step: item.style.getPropertyValue('--step') })) };
  });
  check('wide card is 350 × about 233 at 390 and writer starts below half the pane', Math.abs(drawer.width - 350) < .1
    && Math.abs(drawer.height - 233.333) < .1 && drawer.left === 20 && drawer.right === 20
    && drawer.writerTop > drawer.half, JSON.stringify(drawer));
  check('drawer shows one front card plus at most six receding strips', drawer.all === 10 && drawer.visible === 7 && drawer.strips === 6);
  const position = await page.evaluate(() => {
    const status = document.querySelector('.rf-position'), statusBox = status.getBoundingClientRect();
    const cardBox = document.querySelector('.rf-item.current .rf-card').getBoundingClientRect();
    return { text: status.textContent, above: statusBox.bottom < cardBox.top,
      oldControls: document.querySelectorAll('.rf-nav,.rf-older,.rf-newer').length };
  });
  check('quiet n of m status is above the deck and Older/Newer controls are gone', position.text === '10 of 10'
    && position.above && position.oldControls === 0, JSON.stringify(position));
  check('receding strips expose only date/words, never ghosted full card text', await page.evaluate(() =>
    [...document.querySelectorAll('.rf-item.receding:not([hidden]) .rf-tbox')].every(box => getComputedStyle(box).visibility === 'hidden')));
  check('older strips use 900 px-style Z recession, −28 px steps and .08 opacity steps', drawer.transforms.every((item, index) =>
    item.step === String(6 - index) && item.transform.startsWith('matrix3d')
    && Math.abs(Number(item.opacity) - (1 - (6 - index) * .08)) < .001));
  const prior = (await ids()).at(-2), allIds = await ids(), newest = allIds.at(-1);
  await page.click(`.rf-item[data-id="${prior}"] .rf-strip`); await page.waitForTimeout(200);
  check('tapping a dated strip snaps that card to the open front', await currentId() === prior && await side(prior) === 'front'
    && await page.innerText('.rf-position') === `${allIds.length - 1} of ${allIds.length}`);
  const priorBox = await page.locator(turnSel(prior)).boundingBox();
  await touchVertical(priorBox.y + priorBox.height * .45, priorBox.y + priorBox.height * .45 - 110);
  const dragNewest = await currentId();
  check('an upward vertical drag brings the next newer card forward and updates status', dragNewest === newest
    && await page.innerText('.rf-position') === `${allIds.length} of ${allIds.length}`);
  const dragBox = await page.locator(turnSel(dragNewest)).boundingBox();
  await touchVertical(dragBox.y + dragBox.height * .65, dragBox.y + dragBox.height * .65 + 110);
  check('a downward vertical touch drag drops the front card and snaps to the next older', await currentId() === prior);
  const beforeShort = await currentId();
  await touchVertical(dragBox.y + dragBox.height * .55, dragBox.y + dragBox.height * .55 + 25);
  check('a short vertical gesture snaps back to the same card', await currentId() === beforeShort);
  await page.focus(turnSel(beforeShort)); await page.keyboard.press('ArrowDown');
  const keyboardNewer = await currentId(); await page.keyboard.press('ArrowUp');
  const keyboardOlder = await currentId(); await page.keyboard.press('ArrowDown');
  check('ArrowUp/ArrowDown provide an equivalent keyboard filing route', keyboardNewer === newest
    && keyboardOlder === prior && await currentId() === dragNewest);
  const keyboardHelp = await page.evaluate(() => ({
    shortcuts: document.querySelector('.rf-item.current .rf-turn').getAttribute('aria-keyshortcuts'),
    instruction: document.querySelector('#rf-drawer-help').textContent,
    status: document.querySelector('.rf-position').getAttribute('aria-label'),
  }));
  check('current card exposes keyboard instructions and card-position status accessibly', keyboardHelp.shortcuts.includes('ArrowUp')
    && keyboardHelp.shortcuts.includes('ArrowDown') && keyboardHelp.instruction.includes('Drag vertically')
    && keyboardHelp.status === `Card ${allIds.length} of ${allIds.length}`, JSON.stringify(keyboardHelp));

  // ---- turn, keyboard edit/frozen response, hold edit/removal
  if (await side(dragNewest) === 'front') await page.click(turnSel(dragNewest));
  const frozen = await page.innerText(`${cardSel(dragNewest)} .rf-reply`), requestCount = requests.length;
  await page.focus(turnSel(dragNewest)); await page.keyboard.press('e'); await page.waitForTimeout(100);
  check('E is a visible-focus keyboard edit route; writer hides and removal appears only here', await page.evaluate(() =>
    !!document.querySelector('.rf-card.editing') && getComputedStyle(document.querySelector('.rf-writer')).display === 'none'
    && !document.querySelector('.rf-card.editing .rf-remove').hidden));
  await shot('04-edit');
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.keyboard.insertText('Edited after the answer.');
  await page.click(`${cardSel(dragNewest)} .rf-done`); await page.click(turnSel(dragNewest)); await page.waitForTimeout(100);
  check('later text editing freezes the original reply and sends no new request, lift, or stream', await page.innerText(`${cardSel(dragNewest)} .rf-reply`) === frozen
    && requests.length === requestCount && await page.getAttribute(`.rf-item[data-id="${dragNewest}"]`, 'data-lift-count') === '1'
    && !await page.locator(`.rf-item[data-id="${dragNewest}"]`).evaluate(item => item.classList.contains('arriving'))
    && await page.getAttribute(cardSel(dragNewest), 'data-submission') === 'settled');
  await page.waitForTimeout(550);
  const backFace = await page.evaluate(id => {
    const card = document.querySelector(`.rf-item[data-id="${id}"] .rf-card`), face = card.querySelector('.rf-face');
    const box = face.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { parent: face.parentElement.classList.contains('rf-front'), backface: getComputedStyle(face.parentElement).backfaceVisibility,
      disabled: face.disabled, tabIndex: face.tabIndex, hidden: face.getAttribute('aria-hidden'), hiddenProp: face.hidden,
      display: getComputedStyle(face).display, hit: !!hit && (hit === face || face.contains(hit)), side: card.dataset.side };
  }, dragNewest);
  const moodEventsOnBack = (await ev('card_mood_changed')).length;
  await page.evaluate(id => document.querySelector(`.rf-item[data-id="${id}"] .rf-face`).dispatchEvent(new MouseEvent('click', { bubbles: true })), dragNewest);
  check('back flip hides the front-child face from pointer hit-testing and removes it from accessibility/tab order', backFace.parent
    && backFace.backface === 'hidden' && backFace.disabled && backFace.tabIndex === -1 && backFace.hidden === 'true'
    && backFace.hiddenProp && backFace.display === 'none' && !backFace.hit && backFace.side === 'back'
    && (await ev('card_mood_changed')).length === moodEventsOnBack, JSON.stringify(backFace));
  if (await side(dragNewest) !== 'front') await page.click(turnSel(dragNewest));
  const beforeFrontMood = (await ev('card_mood_changed')).length;
  await page.click(`${cardSel(dragNewest)} .rf-face`);
  check('front-corner face remains tappable to cycle mood without turning the card', await side(dragNewest) === 'front'
    && (await ev('card_mood_changed')).length === beforeFrontMood + 1
    && await page.isHidden(`${cardSel(dragNewest)} .rf-remove`));
  await hold(dragNewest);
  check('500 ms hold shakes into the same in-place editor', await page.evaluate(() => !!document.querySelector('.rf-card.editing')));
  const beforeEditingMood = (await ev('card_mood_changed')).length;
  await page.click(`${cardSel(dragNewest)} .rf-face`);
  check('front-child face also changes mood while editing in place', (await ev('card_mood_changed')).length === beforeEditingMood + 1
    && await page.evaluate(() => !!document.querySelector('.rf-card.editing')));
  await page.click(`${cardSel(dragNewest)} .rf-remove`); await page.waitForTimeout(100);
  check('Remove deletes only from hold/E edit and restores the writer', !(await ids()).includes(dragNewest)
    && (await ev('card_deleted')).some(event => event.payload.id === dragNewest) && await page.isVisible('.rf-writer'));

  // ---- legacy cards are honestly neutral; their first face tap is an explicit user edit
  const beforeLegacy = requests.length;
  await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('garden.log'));
    all.push({ t: Date.now(), d: Number(localStorage.getItem('garden.dayOffset') || 0), type: 'card_created', payload: { id: 'legacy', text: 'An old card from before prompts.' } });
    localStorage.setItem('garden.log', JSON.stringify(all));
  });
  await page.reload({ waitUntil: 'networkidle' }); await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(350);
  const legacy = await page.evaluate(() => ({ colour: getComputedStyle(document.querySelector('.rf-item[data-id="legacy"] .rf-front')).backgroundColor,
    label: document.querySelector('.rf-item[data-id="legacy"] .rf-face').getAttribute('aria-label') }));
  check('historical missing mood stays explicit neutral instead of being invented', legacy.colour === 'rgb(230, 233, 230)'
    && legacy.label.includes('No mood recorded') && requests.length === beforeLegacy, JSON.stringify(legacy));
  await page.click(turnSel('legacy'));
  check('historical missing prompt has an intentional visible fallback and no model call', await page.innerText(`${cardSel('legacy')} .rf-prompt-back`) === LEGACY_PROMPT
    && requests.length === beforeLegacy && !await page.locator(cardSel('legacy')).evaluate(card => card.classList.contains('pending')));
  if (await side('legacy') !== 'front') await page.click(turnSel('legacy'));
  await page.click(`${cardSel('legacy')} .rf-face`);
  check('changing a legacy face records the chosen mood rather than backfilling silently', (await ev('card_mood_changed')).at(-1)?.payload.to === 0);

  // ---- link construction/opening and invalid link immunity
  await reset(savedPlan);
  const linkTarget = await addText('A previous note about the river.', 3);
  await addText('An unrelated card.', 2);
  responseFor = () => ({ reply: REPLY, linkId: linkTarget, flagged: false, source: 'service' });
  const linked = await addText('The river is in this note too.', 2);
  const expectedWeekday = await page.evaluate(id => {
    const event = JSON.parse(localStorage.getItem('garden.log')).find(event => event.type === 'card_created' && event.payload.id === id);
    const date = new Date(event.t); const p = n => String(n).padStart(2, '0');
    return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date(`${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T12:00:00`));
  }, linkTarget);
  check('a valid other-card link gets the exact code-built weekday line', await page.innerText(`${cardSel(linked)} .rf-link`) === `You wrote about this on ${expectedWeekday} too.`);
  await page.click(`${cardSel(linked)} .rf-link`); await page.waitForTimeout(100);
  check('tapping the link brings the stored linked card to the front/open', await currentId() === linkTarget && await side(linkTarget) === 'back');
  await bring(linked);
  for (const kind of ['missing', 'current']) {
    responseFor = body => ({ reply: REPLY, linkId: kind === 'missing' ? 'not-a-card' : body.id, flagged: false, source: 'service' });
    const id = await addText(`A ${kind} link should be ignored.`);
    check(`${kind} link id is ignored`, await page.isHidden(`${cardSel(id)} .rf-link`));
  }

  // ---- pending is for actual text requests; reload retry and bounded fallback rendering
  let release;
  holdResponse = new Promise(resolve => { release = resolve; });
  await page.fill('.rf-text', 'A request held briefly for the pending check.');
  await page.click('.rf-mood[data-mood="2"]');
  const pendingId = await currentId();
  check('only an in-flight text model entry locks the writer during the lift', await page.evaluate(() => document.querySelector('.rf-text').readOnly)
    && await page.isDisabled('.rf-cam') && await page.isDisabled('.rf-mood[data-mood="0"]')
    && await side(pendingId) === 'front');
  await page.waitForFunction(id => document.querySelector(`.rf-item[data-id="${id}"] .rf-reply`)?.textContent === 'Reading what you wrote…', pendingId, { timeout: 7000 });
  const pendingCentre = await page.evaluate(id => {
    const card = document.querySelector(`.rf-item[data-id="${id}"] .rf-card`).getBoundingClientRect();
    const box = document.querySelector(`.rf-item[data-id="${id}"] .rf-reply`).getBoundingClientRect();
    return { dx: Math.abs((box.left + box.right) / 2 - (card.left + card.right) / 2), dy: Math.abs((box.top + box.bottom) / 2 - (card.top + card.bottom) / 2) };
  }, pendingId);
  check('a still-pending response waits after the gate in the same centered position', await side(pendingId) === 'back'
    && pendingCentre.dx <= 2 && pendingCentre.dy <= 2, JSON.stringify(pendingCentre));
  release(); await waitReply(pendingId);
  check('request completion releases the pending writer lock', !await page.evaluate(() => document.querySelector('.rf-text').readOnly));
  const beforeRetry = requests.length;
  await page.evaluate(id => {
    const all = JSON.parse(localStorage.getItem('garden.log')).filter(event => !(event.type === 'card_reply_received' && event.payload.id === id));
    localStorage.setItem('garden.log', JSON.stringify(all));
  }, pendingId);
  await page.reload({ waitUntil: 'networkidle' }); await page.click('.tab[data-pane="reflect"]'); await waitReply(pendingId);
  check('an unanswered stored text entry retries on reload with the same full prompt but no repeated lift', requests.length === beforeRetry + 1
    && requests.at(-1).id === pendingId && requests.at(-1).prompt.id && requests.at(-1).prompt.kind
    && !(await page.locator(`.rf-item[data-id="${pendingId}"]`).evaluate(item => item.classList.contains('arriving')))
    && await page.getAttribute(`.rf-item[data-id="${pendingId}"]`, 'data-lift-count') === null);
  await page.evaluate(() => localStorage.setItem('garden.test.reply', 'fail'));
  const failed = await addText('The bus was late again.');
  check('service failure renders the current bounded fallback', await page.innerText(`${cardSel(failed)} .rf-reply`) === FALLBACK
    && (await ev('card_reply_received')).find(event => event.payload.id === failed)?.payload.source === 'fallback');
  await page.evaluate(() => localStorage.removeItem('garden.test.reply'));
  realNext = true;
  const integrated = await addText('One ordinary detail for the real integration.');
  check('real same-origin API accepts the full prompt object and its result renders', requests.at(-1).id === integrated
    && realApi?.status === 200 && typeof realApi?.body?.reply === 'string'
    && (await ev('card_reply_received')).some(event => event.payload.id === integrated)
    && !!(await page.innerText(`${cardSel(integrated)} .rf-reply`)).trim(), JSON.stringify(realApi));

  // ---- model/local flags, near-flag, saved plan and exact empty-plan resources
  await reset(savedPlan);
  responseFor = () => ({ reply: 'This model text must never appear.', linkId: null, flagged: true, source: 'service' });
  const modelFlag = await addText('The evening feels difficult.');
  check('model-flagged card replaces (never displays) the model reply with the exact support line', await page.innerText(`${cardSel(modelFlag)} .rf-safety`) === SAFETY
    && !(await page.locator(cardSel(modelFlag)).innerText()).includes('This model text'));
  check('saved plan uses the actual first text line and first callable contact in document order', await page.innerText(`${cardSel(modelFlag)} .rf-flag-line`) === 'Evening plan: shower, tea, and something familiar on TV.'
    && await page.getAttribute(`${cardSel(modelFlag)} .rf-call`, 'aria-label') === 'Call Aino at +358 40 123 4567'
    && await page.getAttribute(`${cardSel(modelFlag)} .rf-call`, 'href') === 'tel:+358401234567');
  const savedFlag = await page.evaluate(id => {
    const root = document.querySelector(`.rf-item[data-id="${id}"]`), card = root.querySelector('.rf-card').getBoundingClientRect();
    const flag = root.querySelector('.rf-flag').getBoundingClientRect(), row = root.querySelector('.rf-flag-row').getBoundingClientRect();
    const safety = root.querySelector('.rf-safety').getBoundingClientRect(), line = root.querySelector('.rf-flag-line').getBoundingClientRect();
    const footer = root.querySelector('.rf-prompt-back').getBoundingClientRect();
    const call = root.querySelector('.rf-call'), plan = root.querySelector('.rf-plan'), actions = [call, plan].map(el => el.getBoundingClientRect());
    const centreX = box => Math.abs((box.left + box.right) / 2 - (card.left + card.right) / 2);
    const actionGroup = { left: Math.min(...actions.map(box => box.left)), right: Math.max(...actions.map(box => box.right)) };
    return { supportX: centreX(safety), planTextX: centreX(line), actionsX: Math.abs((actionGroup.left + actionGroup.right) / 2 - (card.left + card.right) / 2),
      groupY: Math.abs((safety.top + row.bottom) / 2 - (flag.top + flag.bottom) / 2), footerGap: footer.top - row.bottom,
      inside: actions.every(box => box.left >= card.left && box.right <= card.right && box.top >= card.top && box.bottom <= card.bottom),
      callSize: [actions[0].width, actions[0].height], rows: root.querySelectorAll('.rf-flag-row').length,
      actions: [...root.querySelectorAll('.rf-flag-row > a:not([hidden]),.rf-flag-row > button:not([hidden])')].length,
      phoneIcon: call.querySelectorAll('svg[aria-hidden="true"]').length };
  }, modelFlag);
  check('saved support sentence, plan text, and Call/Open actions form one centered block above the footer', savedFlag.supportX <= 2
    && savedFlag.planTextX <= 2 && savedFlag.actionsX <= 2 && savedFlag.groupY <= 2 && savedFlag.footerGap >= 4
    && savedFlag.inside && Math.abs(savedFlag.callSize[0] - 44) < .1 && Math.abs(savedFlag.callSize[1] - 44) < .1, JSON.stringify(savedFlag));
  check('saved flag has one row with two reachable actions and a labelled true phone icon', savedFlag.rows === 1
    && savedFlag.actions === 2 && savedFlag.phoneIcon === 1, JSON.stringify(savedFlag));
  await shot('05-flag');
  await page.click(`${cardSel(modelFlag)} .rf-plan`);
  check('Open my plan receives the pointer above the turned card and invokes Toolkit navigation', await page.evaluate(() =>
    document.body.dataset.destination === 'toolkit' || document.querySelector('.toolkit-option[data-option="safety-plan"]')?.getAttribute('aria-expanded') === 'true'));
  await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(350);
  const beforeLocalFlag = requests.length;
  responseFor = () => ({ reply: REPLY, linkId: null, flagged: false, source: 'service' });
  const localFlag = await addText('I want to die.');
  check('conservative local wanting-to-die phrase shows support without a network request or pending wait', requests.length === beforeLocalFlag
    && await page.innerText(`${cardSel(localFlag)} .rf-safety`) === SAFETY
    && (await ev('card_reply_received')).find(event => event.payload.id === localFlag)?.payload.source === 'local');
  const nearFlag = await addText('Dead tired after moving the sofa.');
  check('ordinary “dead tired” is a near-flag, not flagged', await page.isHidden(`${cardSel(nearFlag)} .rf-flag`)
    && await page.innerText(`${cardSel(nearFlag)} .rf-reply`) === REPLY);
  await page.evaluate(() => localStorage.setItem('garden.safetyPlan.v2', JSON.stringify({ v: 2, blocks: [], updated: null })));
  await page.reload({ waitUntil: 'networkidle' }); await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(300);
  await bring(modelFlag); if (await side(modelFlag) === 'front') await page.click(turnSel(modelFlag));
  check('empty saved plan shows the exact resource line, never a create-plan warning', await page.innerText(`${cardSel(modelFlag)} .rf-resources`) === RESOURCES
    && await page.isVisible(`${cardSel(modelFlag)} .rf-plan`)
    && !(await page.locator(cardSel(modelFlag)).innerText()).includes('Create a personal safety plan'));
  const emptyFlag = await page.evaluate(id => {
    const root = document.querySelector(`.rf-item[data-id="${id}"]`), card = root.querySelector('.rf-card').getBoundingClientRect();
    const flag = root.querySelector('.rf-flag').getBoundingClientRect(), safety = root.querySelector('.rf-safety').getBoundingClientRect();
    const resources = root.querySelector('.rf-resources').getBoundingClientRect(), row = root.querySelector('.rf-flag-row').getBoundingClientRect();
    const plan = root.querySelector('.rf-plan').getBoundingClientRect(), footer = root.querySelector('.rf-prompt-back').getBoundingClientRect();
    const centreX = box => Math.abs((box.left + box.right) / 2 - (card.left + card.right) / 2);
    return { supportX: centreX(safety), resourcesX: centreX(resources), planX: centreX(plan),
      groupY: Math.abs((safety.top + row.bottom) / 2 - (flag.top + flag.bottom) / 2), footerGap: footer.top - row.bottom,
      inside: plan.left >= card.left && plan.right <= card.right && plan.bottom <= card.bottom,
      rows: root.querySelectorAll('.rf-flag-row').length,
      actions: [...root.querySelectorAll('.rf-flag-row > a:not([hidden]),.rf-flag-row > button:not([hidden])')].length };
  }, modelFlag);
  check('empty-resource support and Open my plan stay centered inside one safe block without a call row', emptyFlag.supportX <= 2
    && emptyFlag.resourcesX <= 2 && emptyFlag.planX <= 2 && emptyFlag.groupY <= 2 && emptyFlag.footerGap >= 4
    && emptyFlag.inside && emptyFlag.rows === 1 && emptyFlag.actions === 1, JSON.stringify(emptyFlag));
  await shot('06-flag-empty');

  // ---- genuine on-device photo capture; blank/photo-only never waits or calls the model
  await reset(savedPlan); await setOffset(photoOffset());
  await shot('07-photo-prompt-clean');
  await capturePhoto();
  await page.waitForFunction(() => {
    const image = document.querySelector('.rf-cam-thumb');
    return document.querySelector('.rf-cam').classList.contains('loaded') && !image.hidden && image.complete && image.naturalWidth > 0;
  });
  const thumbBefore = await page.evaluate(() => ({ src: document.querySelector('.rf-cam-thumb').src,
    width: document.querySelector('.rf-cam').getBoundingClientRect().width, label: document.querySelector('.rf-cam').getAttribute('aria-label') }));
  check('capture fills a wider camera button with a loaded local thumbnail and retake label', thumbBefore.width >= 60
    && thumbBefore.src.startsWith('blob:') && thumbBefore.label.includes('Take another photo'), JSON.stringify(thumbBefore));
  check('captured on-device photo leaves optional text available and enables faces', (await page.inputValue('.rf-text')) === ''
    && !await page.evaluate(() => document.querySelector('.rf-text').readOnly)
    && await page.locator('.rf-mood:not(:disabled)').count() === 4
    && (await page.innerText('.rf-note')).includes('text is optional'));
  await shot('15-camera-thumb');
  const photoBefore = requests.length, photoPromptText = await page.getAttribute('.rf-text', 'placeholder');
  await page.click('.rf-mood[data-mood="0"]'); const photoOnly = await currentId();
  check('commit immediately clears draft and thumbnail', (await page.inputValue('.rf-text')) === ''
    && !await page.locator('.rf-cam').evaluate(button => button.classList.contains('loaded')) && await page.isHidden('.rf-cam-thumb'));
  check('photo-only commit makes no model request and no pending lock', requests.length === photoBefore
    && !await page.evaluate(() => document.querySelector('.rf-text').readOnly)
    && !await page.locator(cardSel(photoOnly)).evaluate(card => card.classList.contains('pending')));
  await waitSettled(photoOnly);
  check('photo-only back shows its prompt only (no reply/pending/plan)', await page.innerText(`${cardSel(photoOnly)} .rf-prompt-back`) === photoPromptText
    && await page.isHidden(`${cardSel(photoOnly)} .rf-reply-block`) && await page.isHidden(`${cardSel(photoOnly)} .rf-flag`));
  const photoFooter = await page.evaluate(id => {
    const content = document.querySelector(`.rf-item[data-id="${id}"] .rf-back-content`), footer = content.querySelector('.rf-prompt-back');
    return { gap: content.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom, align: getComputedStyle(footer).textAlign,
      fontSize: getComputedStyle(footer).fontSize };
  }, photoOnly);
  check('photo-only prompt stays a small bottom footer on its actual back side', photoFooter.gap <= .6
    && photoFooter.align === 'center' && photoFooter.fontSize === '11px' && await side(photoOnly) === 'back', JSON.stringify(photoFooter));
  const photoFace = await page.evaluate(id => {
    const face = document.querySelector(`.rf-item[data-id="${id}"] .rf-face`), box = face.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { parent: face.parentElement.classList.contains('rf-front'), hidden: face.hidden, disabled: face.disabled,
      tabIndex: face.tabIndex, display: getComputedStyle(face).display, hit: !!hit && (hit === face || face.contains(hit)) };
  }, photoOnly);
  check('photo prompt back has no rendered, tabbable, or pointer-actionable mood face', photoFace.parent && photoFace.hidden
    && photoFace.disabled && photoFace.tabIndex === -1 && photoFace.display === 'none' && !photoFace.hit, JSON.stringify(photoFace));
  await page.waitForFunction(id => document.querySelector(`.rf-item[data-id="${id}"] .rf-img`)?.naturalWidth > 0, photoOnly);
  await shot('08-photo-card');
  await page.click(turnSel(photoOnly), { position: { x: 30, y: 30 } }); await shot('16-photo-front');
  await page.click(turnSel(photoOnly), { position: { x: 30, y: 30 } }); await page.waitForTimeout(550);
  check('full photo side also removes the mood face from rendering and accessibility and labels its actual side', await side(photoOnly) === 'photo'
    && (await page.getAttribute(turnSel(photoOnly), 'aria-label')).includes('photo showing')
    && await page.isHidden(`${cardSel(photoOnly)} .rf-face`) && await page.isDisabled(`${cardSel(photoOnly)} .rf-face`));
  await capturePhoto();
  await page.waitForFunction(previous => {
    const image = document.querySelector('.rf-cam-thumb');
    return image.complete && image.naturalWidth > 0 && image.src && image.src !== previous;
  }, thumbBefore.src);
  check('clicking the loaded thumbnail captures a fresh replacement', await page.evaluate(() => document.querySelector('.rf-cam-thumb').src) !== thumbBefore.src);
  await page.fill('.rf-text', 'A photograph and a few words.');
  await page.click('.rf-mood[data-mood="3"]'); const photoText = await currentId(); await waitReply(photoText);
  check('photo+text sends only hasPhoto plus the five text histories, never attachments/photo ids/blob URLs', requests.at(-1).hasPhoto === true
    && !JSON.stringify(requests.at(-1)).includes('data:image') && !JSON.stringify(requests.at(-1)).includes('blob:')
    && requests.at(-1).history.every(card => !('photo' in card) && !('hasPhoto' in card)));
  check('on-device photos remain log references, not blobs', (await ev('card_photo_attached')).some(event => event.payload.id === photoText && /^p-/.test(event.payload.photo))
    && !JSON.stringify(await events()).includes('data:image'));
  await page.fill('.rf-text', 'x'.repeat(260));
  check('writer keeps its 220-character ceiling', (await page.inputValue('.rf-text')).length <= 220);
  await page.fill('.rf-text', 'a\nb\nc\nd\ne\nf\ng\nh');
  check('writer keeps its four-line-break ceiling', ((await page.inputValue('.rf-text')).match(/\n/g) || []).length <= 4);
  await page.fill('.rf-text', '');

  // ---- reduced motion: ordinary list with every card and every action
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(150);
  const plain = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.rf-item')]; const list = document.querySelector('.rf-list');
    return { all: items.length, visible: items.filter(item => !item.hidden).length,
      perspective: getComputedStyle(list).perspective, overflow: getComputedStyle(list).overflowY,
      transforms: [...new Set(items.map(item => getComputedStyle(item).transform))], flip: getComputedStyle(document.querySelector('.rf-flip')).transitionDuration };
  });
  check('reduced motion is a scrollable plain list with no 3D/flip motion and no hidden cards', plain.visible === plain.all
    && plain.perspective === 'none' && plain.overflow === 'auto' && plain.transforms.join(',') === 'none' && plain.flip === '0s', JSON.stringify(plain));
  await page.click('.rf-item[data-id="seed-1"] .rf-strip');
  check('plain-list strip still brings a card front with its actions', await currentId() === 'seed-1' && await page.isVisible(turnSel('seed-1')));
  await shot('09-reduced');
  await page.focus(turnSel('seed-1')); await page.keyboard.press('e');
  check('reduced-motion edit has no shake and remains operable', await page.evaluate(() =>
    !!document.querySelector('.rf-card.editing') && getComputedStyle(document.querySelector('.rf-card.editing')).animationName === 'none'));
  await page.click(`${cardSel('seed-1')} .rf-done`); await page.click(turnSel('seed-1'));
  check('reduced-motion turn swaps front/back without a 3D transform', await side('seed-1') === 'back'
    && await page.evaluate(() => getComputedStyle(document.querySelector('.rf-item.current .rf-back')).transform === 'none'));
  const reducedStarted = Date.now();
  await page.fill('.rf-text', 'A reduced-motion submission.');
  await page.click('.rf-mood[data-mood="3"]');
  const reducedCard = await currentId(); await waitReply(reducedCard);
  check('reduced motion skips lift and stream and shows the actual answer as soon as it arrives', Date.now() - reducedStarted < 2000
    && await side(reducedCard) === 'back' && await page.getAttribute(`.rf-item[data-id="${reducedCard}"]`, 'data-lift-count') === null
    && !await page.locator(`.rf-item[data-id="${reducedCard}"]`).evaluate(item => item.classList.contains('arriving'))
    && await page.innerText(`${cardSel(reducedCard)} .rf-reply`) === REPLY);
  await shot('17-reduced-submit');

  // ---- compact accessibility/geometry, including a full-back safety card
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 320, height: 740 }); await page.waitForTimeout(250);
  await reset({ v: 2, blocks: [], updated: null });
  responseFor = () => ({ reply: REPLY, linkId: null, flagged: true, source: 'service' });
  const compactFlag = await addText('A compact flag layout check.');
  const compact = await page.evaluate(() => {
    const card = document.querySelector('.rf-item.current .rf-card').getBoundingClientRect();
    const row = document.querySelector('.rf-item.current .rf-flag-row').getBoundingClientRect();
    const footer = document.querySelector('.rf-item.current .rf-prompt-back').getBoundingClientRect();
    const face = document.querySelector('.rf-item.current .rf-face').getBoundingClientRect();
    return { width: card.width, left: card.left, right: innerWidth - card.right, rowBottom: row.bottom, cardBottom: card.bottom,
      footerGap: footer.top - row.bottom, rowRight: row.right, cardRight: card.right, face: [face.width, face.height], overflow: document.documentElement.scrollWidth > innerWidth };
  });
  check('320 px: 280 px wide card, 20 px insets, support controls fit and no horizontal overflow', compact.width === 280
    && compact.left === 20 && compact.right === 20 && compact.rowBottom <= compact.cardBottom - 5
    && compact.footerGap >= 4 && compact.rowRight <= compact.cardRight && !compact.overflow, JSON.stringify(compact));
  await shot('10-compact-320-flag');
  await page.click(turnSel(compactFlag), { position: { x: 30, y: 30 } });
  await shot('11-compact-320-front');
  const compactFrontFace = await page.locator(`${cardSel(compactFlag)} .rf-face`).boundingBox();
  check('320 px: front face retains a 44 px keyboard/touch target and all mood labels remain present', compactFrontFace.width === 44 && compactFrontFace.height === 44
    && JSON.stringify(await page.locator('.rf-mood span').allTextContents()) === JSON.stringify(['Bad', 'Not great', 'Okay', 'Good']));
  await page.setViewportSize({ width: 360, height: 780 }); await page.waitForTimeout(150);
  const at360 = await page.evaluate(() => ({ width: document.querySelector('.rf-item.current .rf-card').getBoundingClientRect().width,
    overflow: document.documentElement.scrollWidth > innerWidth }));
  check('360 px compact drawer preserves 320 px card and accessible controls without overflow', at360.width === 320 && !at360.overflow, JSON.stringify(at360));
  await page.setViewportSize({ width: 390, height: 844 });

  check('focused suite has zero console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('focused suite made no foreign requests; model API is same-origin only', foreign.length === 0, foreign.slice(0, 3).join(' '));
  console.log(`Reflect screenshots: ${SHOTS}`);
  return { BASE, screenshots: SHOTS, modelRequests: requests.length };
}

// Standalone runner. --isolated is an honest module boundary: it mounts only Reflect and its real dependencies,
// leaving an unrelated broken feature untouched instead of testing a stale preview or rewriting its imports.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const isolated = process.argv.includes('--isolated');
  let BASE = process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'http://127.0.0.1:8815/';
  let server = null;
  if (isolated) {
    const project = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
    const root = `/tmp/opencode/reflect-harness-${process.pid}`;
    mkdirSync(root, { recursive: true });
    writeFileSync(`${root}/index.html`, `<!doctype html><html lang="en"><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Reflect isolated check</title>
      <style>.track{width:100%!important;transform:none!important}.pane{width:100%!important}.bar{grid-template-columns:1fr!important}</style>
      </head><body><div id="app"><main class="viewport"><div class="track">
      <section class="pane" data-pane="reflect" aria-label="Reflect"><div class="head sr"><h1>Reflect</h1><p class="sub">Your filing drawer.</p></div></section>
      </div></main><nav class="bar" aria-label="Panes"><button class="tab" data-pane="reflect" aria-current="page">Reflect</button></nav></div>
      <script type="module" src="/main.ts"></script></body></html>`);
    writeFileSync(`${root}/main.ts`, `
      import '/@fs${project}/node_modules/@fontsource/inter/latin-400.css';
      import '/@fs${project}/node_modules/@fontsource/inter/latin-500.css';
      import '/@fs${project}/node_modules/@fontsource/inter/latin-600.css';
      import '/@fs${project}/src/style.css';
      import { mountReflect } from '/@fs${project}/src/reflect/index.ts';
      const reflect = mountReflect(document.querySelector('[data-pane="reflect"]'), {
        onChange() {}, navigate(id) { document.body.dataset.destination = id; },
      });
      reflect.setVisible(true);
    `);
    const { createServer } = await import('vite');
    server = await createServer({ configFile: false, root, publicDir: false, logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, fs: { allow: [project, root] },
        proxy: { '/api': { target: 'http://127.0.0.1:8817', changeOrigin: false } } } });
    await server.listen();
    const address = server.httpServer.address();
    BASE = `http://127.0.0.1:${address.port}/`;
    console.log(`Reflect isolated source server: ${BASE}`);
  }
  const require = createRequire(import.meta.url);
  const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`); };
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, permissions: ['camera'] });
  const page = await context.newPage();
  try { await reflectChecks({ page, context, check, BASE }); }
  finally { await browser.close(); if (server) await server.close(); }
  const failed = results.filter(result => !result).length;
  console.log(`\n${results.length - failed}/${results.length} Reflect checks passed`);

  process.exit(failed ? 1 : 0);
}
