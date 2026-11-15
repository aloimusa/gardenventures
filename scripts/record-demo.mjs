// Real mobile Garden video demos, captured in isolated Chromium contexts with Playwright recordVideo.
// Usage: node scripts/record-demo.mjs [--base=https://garden.hopeajahti.lol/] [--only=home,venture,market,reflect,winddown]
// Add --dry-run to exercise the real interactions without writing video. A dry run never submits a Reflect entry.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'demo');
const RAW = path.join(OUT, 'raw');
const REVIEW = path.join(OUT, 'review');
const BASE = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) || 'https://garden.hopeajahti.lol/';
const DRY_RUN = process.argv.includes('--dry-run');
const ALL = ['home', 'venture', 'market', 'reflect', 'winddown'];
const selectedArg = process.argv.find(arg => arg.startsWith('--only='));
const selected = selectedArg ? selectedArg.slice(7).split(',').filter(Boolean) : ALL;
for (const name of selected) if (!ALL.includes(name)) throw new Error(`Unknown clip: ${name}`);
if (DRY_RUN && selected.includes('reflect')) throw new Error('Reflect dry runs are disabled to avoid an unnecessary real reply request.');
const VIEWPORT = { width: 390, height: 844 };
const VIDEO_SIZE = { width: 780, height: 1688 };
const TARGETS = { home: [10, 12], venture: [17, 22], market: [14, 20], reflect: [15, 20], winddown: [8, 12] };
const metadata = { base: BASE, recordedAt: new Date().toISOString(), dryRun: DRY_RUN, clips: {} };
for (const directory of [OUT, RAW, REVIEW]) await mkdir(directory, { recursive: true });
if (!DRY_RUN) {
  try {
    const earlier = JSON.parse(await readFile(path.join(OUT, 'metadata.json'), 'utf8'));
    if (earlier.base === BASE && earlier.clips) Object.assign(metadata.clips, earlier.clips);
  } catch { /* first recording run */ }
}

// Local-only, innocuous demo data. No production/user storage is touched: each clip has a fresh incognito context.
function installSeed(kind) {
  if (sessionStorage.getItem('__garden_demo_seeded')) return;
  sessionStorage.setItem('__garden_demo_seeded', '1');
  localStorage.clear();
  const now = Date.now(), date = (() => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  if (kind === 'market') {
    const entries = [];
    for (const [index, plant, reward] of [[0, 'banana', 8], [1, 'strawberry', 3]]) {
      const id = `demo-market-${plant}`, roundId = `venture-v4:${date}:${id}`;
      entries.push({ t: now - 5000 + index, d: 0, type: 'venture_harvest_result', payload: {
        v: 4, mode: 'vittala_foraging_adaptation_v1', date, day: 1, roundId, plant,
        actionId: `${roundId}:action:0`, decisionId: `${roundId}:decision:0`, occurrenceId: `${roundId}:occurrence:0`,
        occurrenceIndex: 0, reward, lastObservedYield: reward, roundYield: reward, maturedBeforeRoundEnd: true,
        rewardReadyAt: now - 6000, rewardDisplayedAt: now - 5000 + index,
        rulesVersion: 'vittala_adaptation_rules_v1', timingVersion: 'vittala_adaptation_timing_v1',
        rngVersion: 'venture-normal-beta-rng-v2', distribution: 'beta_22_3_multiplicative_rounded',
        selectedFactor: .88, previousObservedYield: reward, gammaAlpha: 22, gammaShape2: 3,
      } });
    }
    localStorage.setItem('garden.log', JSON.stringify(entries));
  }
  if (kind === 'reflect') {
    const entries = [];
    const history = [
      ['demo-history-1', 'I watered the little plant before breakfast.', 'The morning care is on the card.'],
      ['demo-history-2', 'A quiet bus ride gave me time to look outside.', 'The quiet view stayed with you.'],
      ['demo-history-3', 'I opened the window for some fresh air.', 'The fresh air is part of the day now.'],
      ['demo-history-4', 'The corner shop had fresh bread this morning.', 'The small morning detail is written down.'],
      ['demo-history-5', 'I noticed green leaves along the path home.', 'The green along the path stayed with you.'],
    ];
    history.forEach(([id, text, reply], index) => {
      const t = now - (history.length - index) * 86400000;
      entries.push({ t, d: 0, type: 'card_created', payload: { id, text, mood: index % 2 ? 2 : 3, seed: true } });
      entries.push({ t: t + 1, d: 0, type: 'card_reply_received', payload: { id, reply, flagged: false, source: 'seed', linkId: null } });
    });
    entries.push({ t: now - 1000, d: 0, type: 'reflect_seeded', payload: { cards: history.length } });
    localStorage.setItem('garden.log', JSON.stringify(entries));
  }
}

function installDemoCursor() {
  const install = () => {
    if (document.getElementById('__garden-demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #__garden-demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483646; width: 20px; height: 20px;
        border: 1.5px solid rgba(255,255,255,.96); border-radius: 50%; background: rgba(31,73,59,.16);
        box-shadow: 0 0 0 1px rgba(24,48,43,.58), 0 2px 7px rgba(20,37,34,.24); pointer-events: none; opacity: 0;
        transition: opacity 180ms ease, width 90ms ease, height 90ms ease; will-change: transform; }
      #__garden-demo-cursor::after { content: ''; position: absolute; left: 6px; top: 6px; width: 5px; height: 5px;
        border-radius: 50%; background: #dff4cf; box-shadow: 0 0 0 1px rgba(26,64,47,.45); }
      #__garden-demo-cursor[data-down="true"] { background: rgba(172,222,185,.3); border-color: #fff; }
    `;
    const cursor = document.createElement('div');
    cursor.id = '__garden-demo-cursor'; cursor.setAttribute('aria-hidden', 'true');
    document.documentElement.append(style, cursor);
    let x = -40, y = -40, down = false, idle;
    const paint = () => {
      const half = down ? 9 : 10;
      cursor.style.width = cursor.style.height = `${half * 2}px`;
      cursor.style.transform = `translate3d(${x - half}px,${y - half}px,0)`;
      cursor.dataset.down = String(down);
    };
    const wake = event => {
      if (event.pointerType && event.pointerType !== 'mouse') { cursor.style.opacity = '0'; return; }
      x = event.clientX; y = event.clientY; cursor.style.opacity = '.9'; paint();
      clearTimeout(idle); idle = setTimeout(() => { cursor.style.opacity = '.48'; }, 850);
    };
    addEventListener('pointermove', wake, { capture: true, passive: true });
    addEventListener('pointerdown', event => { down = true; wake(event); }, { capture: true, passive: true });
    addEventListener('pointerup', event => { down = false; wake(event); }, { capture: true, passive: true });
    addEventListener('pointercancel', () => { down = false; cursor.style.opacity = '0'; paint(); }, { capture: true, passive: true });
    addEventListener('blur', () => { cursor.style.opacity = '0'; });
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

function makePointer(page) {
  let x = 195, y = 420;
  void page.mouse.move(x, y);
  async function moveTo(px, py, duration = 260) {
    const fromX = x, fromY = y, distance = Math.hypot(px - fromX, py - fromY);
    if (distance < 1) { await page.mouse.move(px, py); x = px; y = py; return; }
    const steps = Math.max(3, Math.min(8, Math.round(duration / 32)));
    for (let index = 1; index <= steps; index++) {
      const t = index / steps, eased = t * t * (3 - 2 * t);
      const arc = Math.sin(Math.PI * t) * Math.min(7, distance * .02);
      await page.mouse.move(fromX + (px - fromX) * eased, fromY + (py - fromY) * eased - arc);
      await page.waitForTimeout(Math.max(8, Math.round(duration / steps)));
    }
    x = px; y = py;
  }
  async function locatorCenter(selector, fraction = null) {
    const locator = typeof selector === 'string' ? page.locator(selector).first() : selector;
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const box = await locator.boundingBox();
    if (!box) throw new Error(`No visible box for ${selector}`);
    return { x: box.x + box.width * (fraction?.x ?? .5), y: box.y + box.height * (fraction?.y ?? .5), box };
  }
  async function moveToLocator(selector, fraction, duration) {
    const point = await locatorCenter(selector, fraction);
    await moveTo(point.x, point.y, duration);
    return point;
  }
  async function click(selector, options = {}) {
    await moveToLocator(selector, options.fraction, options.duration ?? 260);
    await page.mouse.down(); await page.waitForTimeout(options.hold ?? 75); await page.mouse.up();
    await page.waitForTimeout(options.after ?? 90);
  }
  return { moveTo, moveToLocator, click, locatorCenter };
}

async function settlePane(page, id) {
  await page.waitForFunction(pane => {
    const element = document.querySelector(`.pane[data-pane="${pane}"]`);
    return element && !element.hasAttribute('aria-hidden') && Math.abs(element.getBoundingClientRect().left) < .5;
  }, id, { timeout: 6000 });
  await page.waitForTimeout(360);
}

const eventCount = (page, type) => page.evaluate(name =>
  JSON.parse(localStorage.getItem('garden.log') || '[]').filter(event => event.type === name).length, type);
const allEvents = page => page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]'));

async function recordHome({ page, pointer }) {
  await page.waitForFunction(() => window.garden?.homeSnapshot && window.garden?.marketSnapshot);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => ({ age: garden.homeSnapshot().age, portal: garden.marketSnapshot().visual.portalCanvas }));
  const stage = await pointer.locatorCenter('.stage', { x: .2, y: .16 });
  await pointer.moveTo(stage.x, stage.y, 180);
  await page.mouse.down();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('garden.log') || '[]').some(event => event.type === 'watered'), null, { timeout: 9000 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const snap = garden.homeSnapshot(), status = document.querySelector('.watered-status');
    return !snap.growing && !status.hidden && status.getAnimations().every(animation => animation.playState === 'finished');
  }, null, { timeout: 12000 });
  await page.waitForTimeout(100);
  await pointer.moveToLocator('.wormhole-rim', { x: .52, y: .48 }, 180);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({
    age: garden.homeSnapshot().age,
    status: document.querySelector('.watered-status').textContent,
    portal: garden.marketSnapshot().visual.portalCanvas,
    portalSize: [document.querySelector('.wormhole-live-preview').width, document.querySelector('.wormhole-live-preview').height],
    world: garden.marketSnapshot().world,
  }));
  if (after.age !== before.age + 1 || !before.portal || !after.portal || after.world !== 'home') throw new Error('Home capture did not complete the genuine watering/portal sequence.');
  return { verification: { before, after, wateredEvents: await eventCount(page, 'watered') } };
}

async function recordVenture({ page, pointer }) {
  await pointer.click('.tab[data-pane="venture"]');
  await settlePane(page, 'venture');
  await page.waitForTimeout(200);
  await pointer.click('.venture-choice[data-plant="banana"]');
  await page.waitForFunction(() => garden.venture.phase === 'practice' && garden.venture.practiceStatus === 'ready');
  await page.waitForTimeout(200);
  await pointer.click('.venture-stage', { fraction: { x: .5, y: .46 }, after: 0 });
  await page.waitForFunction(() => garden.venture.practiceStatus === 'result', null, { timeout: 5000 });
  await page.waitForTimeout(250);
  await pointer.click('.venture-practice-start');
  await page.waitForFunction(() => garden.venture.phase === 'decision' && garden.venture.displayedHarvestCount === 0);
  await page.waitForTimeout(200);
  for (const result of [1, 2]) {
    await pointer.click('.venture-stage', { fraction: { x: .5, y: .46 }, after: 0, duration: result === 1 ? 240 : 170 });
    await page.waitForFunction(expected => garden.venture.displayedHarvestCount === expected && garden.venture.phase === 'decision', result, { timeout: 6000 });
    await page.waitForTimeout(result === 1 ? 230 : 400);
  }
  const rewards = (await allEvents(page)).filter(event => event.type === 'venture_harvest_result');
  if (rewards.length !== 2 || rewards[1].payload.distribution !== 'beta_22_3_multiplicative_rounded') {
    throw new Error('Venture did not produce the expected normal then Beta harvest pair.');
  }
  await pointer.click('.venture-move', { duration: 220, after: 0 });
  await page.waitForFunction(() => garden.venture.phase === 'move_wait');
  await page.waitForFunction(() => garden.venture.phase === 'decision' && garden.venture.occurrenceIndex === 1, null, { timeout: 13000 });
  await page.waitForTimeout(650);
  return { verification: {
    practiceResults: await eventCount(page, 'venture_practice_result'),
    rewards: rewards.map(event => ({ reward: event.payload.reward, distribution: event.payload.distribution, plant: event.payload.plant })),
    arrival: await page.evaluate(() => ({ occurrence: garden.venture.occurrenceIndex, plant: garden.venture.plant, phase: garden.venture.phase })),
  } };
}

async function skipVisibleArrival(page, pointer = null) {
  const skip = page.locator('.market-arrival-skip');
  await skip.waitFor({ state: 'visible', timeout: 6000 });
  const fields = page.locator('.market-arrival-form fieldset');
  if (await fields.count() > 2) await fields.last().scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    const button = document.querySelector('.market-arrival-skip'), rect = button.getBoundingClientRect();
    const pane = document.querySelector('.pane[data-pane="home"]').getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const last = document.querySelector('.market-arrival-form fieldset:last-child')?.getBoundingClientRect();
    return { rect: rect.toJSON(), pane: pane.toJSON(), hit: hit === button || button.contains(hit),
      hitElement: hit ? `${hit.tagName}.${hit.className}` : null, lastBottom: last?.bottom ?? null };
  });
  const { rect, pane } = geometry;
  // In Chromium, elementFromPoint can retarget around an aria-modal/inert subtree; the subsequent real click and
  // arrivalVisible transition are the functional proof. Geometry itself must still be onscreen and unobscured by the form.
  if (rect.left < 0 || rect.right > 390 || rect.top < 0 || rect.bottom > pane.bottom + 1
    || (geometry.lastBottom !== null && geometry.lastBottom > rect.top + 2)) {
    throw new Error(`Market Not now is clipped or obstructed: ${JSON.stringify(geometry)}`);
  }
  if (pointer) await pointer.click('.market-arrival-skip');
  else await skip.click();
  await page.waitForFunction(() => !garden.marketSnapshot().arrivalVisible, null, { timeout: 4000 });
}

async function recordMarket({ page, pointer }) {
  const began = Date.now(), timeline = [];
  const mark = label => timeline.push({ label, at: Number(((Date.now() - began) / 1000).toFixed(2)) });
  await page.waitForFunction(() => window.garden?.marketSnapshot?.().inventory.total === 11);
  await page.waitForTimeout(700);
  await pointer.click('.wormhole-rim', { fraction: { x: .52, y: .48 } }); mark('portal clicked');
  await page.waitForFunction(() => garden.marketSnapshot().world === 'market' && garden.marketSnapshot().arrivalVisible);
  await page.waitForTimeout(650); mark('arrival ready');
  await skipVisibleArrival(page, pointer); mark('Not now completed');
  await page.waitForTimeout(850);
  await pointer.moveToLocator('.market-inventory', { x: .4, y: .65 }, 230);
  await page.waitForTimeout(500); mark('basket shown');
  const trade = await pointer.locatorCenter('.market-trader-hit', { x: .53, y: .55 });
  await pointer.moveTo(trade.x, trade.y, 300);
  await page.mouse.down();
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('garden.market.v1') || '{"trades":[]}').trades || []).length === 1, null, { timeout: 6000 });
  await page.mouse.up(); mark('trade completed');
  await page.waitForFunction(() => garden.marketSnapshot().dialogueHistory.length === 3
    && garden.marketSnapshot().dialogue === "Here's something for your plant", null, { timeout: 6000 });
  await page.waitForTimeout(1200); mark('gift dialogue shown');
  await pointer.click('.wormhole-rim', { fraction: { x: .52, y: .48 }, duration: 330 });
  await page.waitForFunction(() => garden.marketSnapshot().world === 'home');
  await page.locator('.home-ornament-place').waitFor({ state: 'visible' });
  await page.waitForTimeout(800); mark('Home placement available');
  await pointer.click('.home-ornament-place');
  await page.waitForFunction(() => garden.homeSnapshot().ornament === 'moon-moth' && garden.homeSnapshot().ornamentMeshes > 0);
  await page.waitForTimeout(1800); mark('ornament placed');
  const verification = await page.evaluate(() => ({
    gift: garden.marketSnapshot().gift,
    dialogue: garden.marketSnapshot().dialogueHistory,
    ornament: garden.homeSnapshot().ornament, ornamentMeshes: garden.homeSnapshot().ornamentMeshes,
    traded: JSON.parse(localStorage.getItem('garden.market.v1')).trades.map(trade => ({ total: trade.total, ornament: trade.ornament })),
    skippedOnly: JSON.parse(localStorage.getItem('garden.log') || '[]').filter(event => event.type === 'market_phq2' || event.type === 'market_phq9')
      .map(event => ({ type: event.type, status: event.payload.status })),
  }));
  return { verification, timeline };
}

async function recordReflect({ page, pointer, network }) {
  await pointer.click('.tab[data-pane="reflect"]');
  await settlePane(page, 'reflect');
  await page.waitForTimeout(1300);
  await pointer.click('.rf-text', { fraction: { x: .5, y: .5 } });
  await page.keyboard.type('I heard rain on the window while I made tea.', { delay: 68 });
  await page.waitForTimeout(800);
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/reflect-reply') && response.request().method() === 'POST', { timeout: 9000 });
  await pointer.click('.rf-mood[data-mood="3"]');
  const id = await page.locator('.rf-item.current').getAttribute('data-id');
  if (!await page.evaluate(cardId => document.querySelector(`.rf-item[data-id="${cardId}"]`)?.classList.contains('current'), id)) {
    throw new Error('Reflect submission did not keep the new card current.');
  }
  const response = await responsePromise;
  network.reflectStatus = response.status();
  const request = response.request().postDataJSON();
  network.reflectHistory = { count: request.history.length, ids: request.history.map(card => card.id), promptKind: request.prompt.kind };
  if (request.history.length > 5 || request.history.length !== 5) throw new Error('Reflect did not bound the real request to the five nearest histories.');
  await page.waitForFunction(cardId => {
    const card = document.querySelector(`.rf-item[data-id="${cardId}"] .rf-card`);
    const logged = JSON.parse(localStorage.getItem('garden.log') || '[]').some(event => event.type === 'card_reply_received'
      && event.payload.id === cardId && event.payload.source === 'service');
    return logged && card?.dataset.submission === 'settled' && !!card.querySelector('.rf-reply').textContent.trim();
  }, id, { timeout: 12000 });
  const result = await page.evaluate(cardId => {
    const item = document.querySelector(`.rf-item[data-id="${cardId}"]`);
    const footer = item.querySelector('.rf-prompt-back'), style = getComputedStyle(footer);
    const event = JSON.parse(localStorage.getItem('garden.log') || '[]').find(entry => entry.type === 'card_reply_received' && entry.payload.id === cardId);
    return { source: event.payload.source, flagged: event.payload.flagged, side: item.querySelector('.rf-card').dataset.side,
      prompt: footer.textContent, footer: { fontSize: style.fontSize, textAlign: style.textAlign } };
  }, id);
  if (result.source !== 'service' || result.flagged || result.side !== 'back' || result.footer.fontSize !== '11px' || result.footer.textAlign !== 'center') {
    throw new Error(`Reflect real-service/back/footer verification failed: ${JSON.stringify(result)}`);
  }
  await page.waitForTimeout(2000);
  await pointer.click(`.rf-item[data-id="${id}"] .rf-turn`, { fraction: { x: .11, y: .15 } });
  await page.waitForFunction(cardId => document.querySelector(`.rf-item[data-id="${cardId}"] .rf-card`)?.dataset.side === 'front', id);
  await page.waitForTimeout(2000);
  return { verification: { id, ...network, ...result } };
}

async function recordWinddown({ page, pointer }) {
  await pointer.click('.tab[data-pane="winddown"]');
  await settlePane(page, 'winddown');
  await page.waitForTimeout(1050);
  await pointer.click('[data-add="5"]');
  await page.waitForFunction(() => document.querySelector('.wd-clock').textContent !== '0:00'
    && document.querySelector('[data-wd-state]').textContent === 'White Noise and Heartbeat'
    && !document.querySelector('.wd-pause').disabled, null, { timeout: 7000 });
  await page.waitForTimeout(1800);
  await pointer.click('[data-category="nature"]');
  await page.locator('[data-sound="rain"]').waitFor({ state: 'visible' });
  await page.waitForTimeout(450);
  await pointer.click('[data-sound="rain"]');
  await page.waitForFunction(() => document.querySelector('.wd-visual').dataset.tone === 'rain'
    && document.querySelector('.wd-visual').dataset.shape === 'drop' && document.querySelector('[data-wd-state]').textContent === 'Rain',
    null, { timeout: 7000 });
  await page.waitForTimeout(2200);
  return { verification: await page.evaluate(() => ({
    clock: document.querySelector('.wd-clock').textContent, state: document.querySelector('[data-wd-state]').textContent,
    tone: document.querySelector('.wd-visual').dataset.tone, shape: document.querySelector('.wd-visual').dataset.shape,
    audioNote: 'Playwright recordVideo has no audio track; only the actual UI-initiated local playback is shown.',
  })) };
}

const FLOWS = { home: recordHome, venture: recordVenture, market: recordMarket, reflect: recordReflect, winddown: recordWinddown };

async function newContext(browser, name, record) {
  const context = await browser.newContext({
    viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    reducedMotion: 'no-preference', colorScheme: 'light',
    ...(record ? { recordVideo: { dir: path.join(RAW, name), size: VIEWPORT } } : {}),
  });
  await context.addInitScript(installSeed, name);
  await context.addInitScript(installDemoCursor);
  return context;
}

async function preparePage(context) {
  // CDP screencast emits CSS-pixel frames even with deviceScaleFactor=2. RecordVideo must therefore use the real
  // 390×844 frame size; asking it for 780×1688 would only pad the upper-left image. HD scaling happens at export.
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForFunction(() => window.garden?.homeSnapshot && window.garden?.marketSnapshot && window.garden?.venture, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(500);
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  if (size.width !== 390 || size.height !== 844 || size.dpr !== 2) throw new Error(`Unexpected native capture size: ${JSON.stringify(size)}`);
  return page;
}

// Do not record any clip while the live optional check-in is clipped or blocks trading. This is a read-only-to-production
// preflight: all clicks and Not now records stay in this disposable browser context.
async function marketPreflight(browser) {
  const context = await newContext(browser, 'market', false);
  try {
    const page = await preparePage(context), pointer = makePointer(page);
    if (!await page.evaluate(() => garden.marketSnapshot().present)) throw new Error('Market is not present on this demo date.');
    await pointer.click('.wormhole-rim');
    await page.waitForFunction(() => garden.marketSnapshot().world === 'market' && garden.marketSnapshot().arrivalVisible);
    await skipVisibleArrival(page);
    if (!await page.evaluate(() => !garden.marketSnapshot().arrivalVisible && !document.querySelector('.market-shell').inert
      && document.querySelector('.market-trader-hit').getAttribute('aria-disabled') === 'false')) {
      throw new Error('Weekly Not now did not immediately expose a working Market/trade surface.');
    }
    await page.click('.market-questions');
    await page.waitForFunction(() => garden.marketSnapshot().arrivalVisible);
    await skipVisibleArrival(page);
    if (!await page.evaluate(() => document.querySelector('.market-trader-hit').getAttribute('aria-disabled') === 'false')) {
      throw new Error('Full quiz Not now did not return to an immediately tradable Market.');
    }
    return { weeklyNotNow: 'visible, unclipped, immediate entry', fullQuizNotNow: 'visible, unclipped, immediate entry', basket: 11 };
  } finally { await context.close(); }
}

async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,pix_fmt', '-of', 'json', file]);
  return JSON.parse(stdout);
}

async function exportClip(name, raw, trimStart, duration) {
  const probeRaw = await probe(raw), video = probeRaw.streams.find(stream => stream.codec_type === 'video');
  if (video.width !== VIEWPORT.width || video.height !== VIEWPORT.height) {
    throw new Error(`Raw ${name} video is ${video.width}×${video.height}, expected ${VIEWPORT.width}×${VIEWPORT.height}.`);
  }
  const webm = path.join(OUT, `${name}.webm`), mp4 = path.join(OUT, `${name}.mp4`);
  const scale = `scale=${VIDEO_SIZE.width}:${VIDEO_SIZE.height}:flags=lanczos,fps=25`;
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', trimStart.toFixed(3), '-i', raw,
    '-t', duration.toFixed(3), '-map', '0:v:0', '-an', '-vf', scale, '-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', webm], { maxBuffer: 1024 * 1024 });
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', trimStart.toFixed(3), '-i', raw,
    '-t', duration.toFixed(3), '-map', '0:v:0', '-an', '-vf', scale, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { maxBuffer: 1024 * 1024 });
  const [webmInfo, mp4Info] = await Promise.all([probe(webm), probe(mp4)]);
  const stream = mp4Info.streams.find(item => item.codec_type === 'video');
  const summary = {
    webm, mp4, raw, trimStart: Number(trimStart.toFixed(3)), duration: Number(mp4Info.format.duration),
    nativeCapture: `${video.width}×${video.height} CSS frames with deviceScaleFactor 2`,
    resolution: `${stream.width}×${stream.height}`, frameRate: stream.avg_frame_rate,
    codecs: { webm: webmInfo.streams.find(item => item.codec_type === 'video')?.codec_name, mp4: stream.codec_name },
    audio: 'none (silent by design)', webmDuration: Number(webmInfo.format.duration),
  };
  for (const [index, fraction] of [.15, .52, .88].entries()) {
    const at = Math.max(0, summary.duration * fraction);
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(3), '-i', mp4,
      '-frames:v', '1', path.join(REVIEW, `${name}-${index + 1}.png`)]);
  }
  return summary;
}

async function captureClip(browser, name) {
  const recording = !DRY_RUN, context = await newContext(browser, name, recording);
  const errors = [], network = {};
  let raw = null, createdAt = null, startedAt = null, endedAt = null, result = null;
  try {
    createdAt = Date.now();
    const page = await preparePage(context);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const video = page.video();
    const pointer = makePointer(page), timing = { createdAt };
    startedAt = Date.now(); timing.startedAt = startedAt;
    result = await FLOWS[name]({ page, pointer, network });
    endedAt = Date.now(); timing.endedAt = endedAt;
    await page.waitForTimeout(180); // a small recorded tail avoids clipping the last compositor frame
    if (recording) {
      await context.close();
      raw = path.join(RAW, name, `${name}-raw.webm`);
      await video.saveAs(raw);
      const duration = (endedAt - startedAt) / 1000;
      const trimStart = Math.max(0, (startedAt - createdAt) / 1000 - .12);
      const exported = await exportClip(name, raw, trimStart, duration);
      metadata.clips[name] = { ...result, ...exported, errors,
        wallTimings: { createdAt, startedAt, endedAt }, targetSeconds: TARGETS[name] };
      if (errors.length) throw new Error(`${name} had browser errors: ${errors.join(' | ')}`);
      const [minimum, maximum] = TARGETS[name];
      if (duration < minimum - .5 || duration > maximum + 1) {
        console.warn(`WARN ${name}: ${duration.toFixed(2)}s is outside target ${minimum}–${maximum}s (kept real uncut action).`);
      }
      console.log(`${name}: ${exported.duration.toFixed(2)}s · ${exported.resolution} · ${exported.frameRate} fps · ${exported.mp4}`);
    } else {
      metadata.clips[name] = { ...result, errors, duration: (endedAt - startedAt) / 1000 };
      console.log(`${name}: dry run OK (${metadata.clips[name].duration.toFixed(2)}s)`);
    }
  } finally {
    try { await context.close(); } catch { /* already closed after saving video */ }
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
let preflight = null;
try {
  if (!DRY_RUN) {
    preflight = await marketPreflight(browser);
    metadata.marketPreflight = preflight;
    console.log('Market preflight OK: weekly and full-quiz Not now are unclipped and permit immediate trade.');
    await writeFile(path.join(OUT, 'preflight.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), ...preflight }, null, 2));
  }
  for (const name of selected) await captureClip(browser, name);
} catch (error) {
  metadata.failure = error.stack || String(error);
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(path.join(OUT, DRY_RUN ? 'dry-run.json' : 'metadata.json'), JSON.stringify(metadata, null, 2));
}
