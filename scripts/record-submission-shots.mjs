// Additional submission shots, captured from the live app in disposable Playwright contexts.
// Usage: node scripts/record-submission-shots.mjs [--base=https://garden.hopeajahti.lol/]
//        [--only=intro-home,growth-bloom,reflect-photo,safety-plan] [--dry-run]
// There is no application-source or production-data mutation. The only capture-only CSS hides Toolkit's
// Skip day, Reset demo and unfinished Drift controls; Skip day itself is still invoked through its real handler.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'demo', 'submission');
const RAW = path.join(OUT, 'raw');
const REVIEW = path.join(OUT, 'review');
const CAMERA = path.join(OUT, 'fake-camera.y4m');
const BASE = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) || 'https://garden.hopeajahti.lol/';
const DRY_RUN = process.argv.includes('--dry-run');
const VIEWPORT = { width: 390, height: 844 };
const EXPORT_SIZE = { width: 780, height: 1688 };
const FPS = 25;
const ALL = ['intro-home', 'growth-bloom', 'reflect-photo', 'safety-plan'];
const selectedArg = process.argv.find(arg => arg.startsWith('--only='));
const selected = selectedArg ? selectedArg.slice(7).split(',').filter(Boolean) : ALL;
for (const name of selected) if (!ALL.includes(name)) throw new Error(`Unknown shot: ${name}. Choose from ${ALL.join(', ')}`);
if (process.argv.includes('--help')) {
  console.log('node scripts/record-submission-shots.mjs [--base=URL] [--only=' + ALL.join(',') + '] [--dry-run]');
  process.exit(0);
}
const SUMMARIES = {
  'intro-home': 'Four seconds of idle live Home with the Moon moth genuinely attached to the orchid, including the last frame.',
  'growth-bloom': 'Continuous Home capture from orchid day 0 through fifteen real Skip day handler invocations to the first fully open bloom on day 15, then a slowable four-second bloom hold. Toolkit is never opened.',
  'reflect-photo': 'Real prompt shuffles to a photo invitation, Chromium fake-device camera, shutter, one Good-mood commit, genuine card turns among back/front/photo, centered prompt footer and receding older cards. Photo-only: no text, reply request or model content.',
  'safety-plan': 'The app’s mild seeded heavy card is selected and turned to its centered support / inline plan call / Open my plan group, then Open my plan and the actual Back control are used; Aino remains inline in the seeded local plan.',
};

const metadata = {
  base: BASE,
  recordedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  exportedSize: EXPORT_SIZE,
  fps: FPS,
  isolation: 'A fresh incognito Chromium context and fresh origin storage for every shot; no production/user profile is accessed.',
  captureAdjustments: {
    hiddenToolkitControls: ['drift', 'skip-day', 'reset-demo'],
    reason: 'Required exclusion of unfinished or administrative labels from every recorded frame. No other app visuals are altered.',
    dayAdvance: 'The existing Skip day button handler is invoked programmatically while Home stays visible; no Toolkit navigation or click instruction appears.',
    fakeCamera: 'A generated abstract window-light Y4M is used by Chromium — no external/private image enters the app.',
  },
  clips: {},
};
for (const directory of [OUT, RAW, REVIEW]) await mkdir(directory, { recursive: true });
if (!DRY_RUN) {
  try {
    const earlier = JSON.parse(await readFile(path.join(OUT, 'inventory.json'), 'utf8'));
    if (earlier.base === BASE && earlier.clips) Object.assign(metadata.clips, earlier.clips);
  } catch { /* first run */ }
}

// Synthetic, non-identifying camera source. Its temporal noise makes it a real video stream, not a still-image UI mock.
async function ensureCamera() {
  try { if ((await stat(CAMERA)).size > 10000) return; } catch { /* generate below */ }
  const ground = 'color=c=0x7d8b92:s=640x480:r=25:d=30';
  const filters = [
    'drawbox=x=94:y=52:w=398:h=318:color=0xe8ddb8:t=fill',
    'drawbox=x=108:y=66:w=370:h=290:color=0xf6e7ae:t=fill',
    'drawbox=x=286:y=66:w=13:h=290:color=0xb0aca0:t=fill',
    'drawbox=x=108:y=202:w=370:h=13:color=0xb0aca0:t=fill',
    'drawbox=x=0:y=374:w=640:h=106:color=0x9b8a73:t=fill',
    'drawbox=x=74:y=355:w=438:h=22:color=0x696f70:t=fill',
    'drawbox=x=428:y=268:w=82:h=103:color=0x789483:t=fill',
    'noise=alls=2:allf=t+u',
    'format=yuv420p',
  ].join(',');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', ground,
    '-vf', filters, '-an', CAMERA], { timeout: 120000 });
}

function installSeed(kind) {
  if (sessionStorage.getItem('__garden_submission_seeded')) return;
  sessionStorage.setItem('__garden_submission_seeded', '1');
  localStorage.clear();
  if (kind === 'intro-home' || kind === 'growth-bloom') {
    // This is a normal local owned/equipped Market ledger, not a visual mesh substitution.
    localStorage.setItem('garden.market.v1', JSON.stringify({ v: 1, trades: [], owned: ['moon-moth'], equipped: 'moon-moth' }));
  }
  if (kind === 'reflect-photo') {
    const now = Date.now(), entries = [];
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
  if (kind === 'safety-plan') {
    // A deliberately simple demo plan. Its contact remains in document order between prose blocks.
    localStorage.setItem('garden.safetyPlan.v2', JSON.stringify({ v: 2, updated: null, blocks: [
      { type: 'text', id: 'demo-line-1', text: 'Make tea and sit somewhere quiet.' },
      { type: 'contact', id: 'example-aino', contact: { id: 'example-aino', name: 'Aino', phone: '+358 40 123 4567' } },
      { type: 'text', id: 'demo-line-2', text: 'Take a slow walk around the block.' },
      { type: 'text', id: 'demo-line-3', text: 'I can ask Aino for a chat or a walk.' },
      { type: 'text', id: 'demo-line-4', text: 'Water nearby, something to eat, one thing at a time.' },
    ] }));
  }
}

function installCaptureRules() {
  const install = () => {
    if (document.getElementById('__garden-submission-rules')) return;
    const style = document.createElement('style');
    style.id = '__garden-submission-rules';
    style.textContent = `
      .toolkit-option[data-option="drift"], .toolkit-detail[data-tool="drift"],
      .toolkit-option[data-option="skip-day"], .toolkit-option[data-option="reset-demo"] { display: none !important; }
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
  async function moveTo(px, py, duration = 220) {
    const fromX = x, fromY = y, distance = Math.hypot(px - fromX, py - fromY);
    if (distance < 1) { await page.mouse.move(px, py); x = px; y = py; return; }
    const steps = Math.max(3, Math.min(7, Math.round(duration / 32)));
    for (let index = 1; index <= steps; index++) {
      const t = index / steps, eased = t * t * (3 - 2 * t);
      const arc = Math.sin(Math.PI * t) * Math.min(7, distance * .02);
      await page.mouse.move(fromX + (px - fromX) * eased, fromY + (py - fromY) * eased - arc);
      await page.waitForTimeout(Math.max(7, Math.round(duration / steps)));
    }
    x = px; y = py;
  }
  async function center(selector, fraction = null) {
    const locator = typeof selector === 'string' ? page.locator(selector).first() : selector;
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const box = await locator.boundingBox();
    if (!box) throw new Error(`No visible box for ${selector}`);
    return { x: box.x + box.width * (fraction?.x ?? .5), y: box.y + box.height * (fraction?.y ?? .5) };
  }
  async function click(selector, options = {}) {
    const point = await center(selector, options.fraction);
    await moveTo(point.x, point.y, options.duration ?? 220);
    await page.mouse.down(); await page.waitForTimeout(options.hold ?? 70); await page.mouse.up();
    await page.waitForTimeout(options.after ?? 80);
  }
  return { moveTo, click };
}

async function settlePane(page, id) {
  await page.waitForFunction(pane => {
    const element = document.querySelector(`.pane[data-pane="${pane}"]`);
    return element && !element.hasAttribute('aria-hidden') && Math.abs(element.getBoundingClientRect().left) < .5;
  }, id, { timeout: 6000 });
  await page.waitForTimeout(260);
}
const events = page => page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]'));

async function beginAudit(page, label) {
  await page.evaluate(initialLabel => {
    const audit = { label: initialLabel, frames: 0, hits: [], active: true };
    globalThis.__gardenSubmissionAudit = audit;
    const banned = [/skip day/i, /reset demo/i, /drift measurer/i, /\bundefined\b/i];
    const tick = () => {
      if (!audit.active) return;
      audit.frames++;
      const text = document.body.innerText;
      for (const pattern of banned) if (pattern.test(text)) audit.hits.push({ label: audit.label, match: String(pattern) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, label);
}
async function stage(page, label) {
  await page.evaluate(value => { if (globalThis.__gardenSubmissionAudit) globalThis.__gardenSubmissionAudit.label = value; }, label);
}
async function endAudit(page) {
  const result = await page.evaluate(() => {
    const audit = globalThis.__gardenSubmissionAudit || { frames: 0, hits: [] };
    audit.active = false;
    return { animationFramesChecked: audit.frames, bannedTextHits: audit.hits };
  });
  if (result.bannedTextHits.length) throw new Error(`Forbidden visible text in capture: ${JSON.stringify(result.bannedTextHits)}`);
  return result;
}

async function introHome({ page, pointer, mark }) {
  await beginAudit(page, 'idle-home');
  const before = await page.evaluate(() => garden.homeSnapshot());
  if (before.ornament !== 'moon-moth' || before.ornamentMeshes < 1) throw new Error('Intro ornament was not genuinely attached.');
  await pointer.moveTo(75, 165, 140); const idleStart = mark('idle-ornament-start');
  await page.waitForTimeout(3900);
  const after = await page.evaluate(() => garden.homeSnapshot()); mark('idle-ornament-last');
  if (after.ornament !== 'moon-moth' || after.ornamentMeshes < 1 || after.world !== 'home') throw new Error('Intro last pose lost its attached ornament.');
  return { verification: { ageAtStart: before.age, ornament: after.ornament, ornamentMeshes: after.ornamentMeshes, ornamentAtLastFrame: true },
    exportStartAt: idleStart, exportDuration: 4, exportFromEnd: true, audit: await endAudit(page) };
}

async function growthBloom({ page, mark }) {
  const initial = await page.evaluate(() => garden.homeSnapshot());
  if (initial.age !== 0 || initial.targetAge !== 0) throw new Error(`Growth did not start on true day 0: ${JSON.stringify(initial)}`);
  await beginAudit(page, 'day-0'); mark('day-0');
  await page.waitForTimeout(700);
  const ages = [initial.age];
  await stage(page, 'programmatic-day-advance');
  for (let offset = 1; offset <= 15; offset++) {
    await page.evaluate(() => {
      const button = document.querySelector('.toolkit-option[data-option="skip-day"]');
      if (!(button instanceof HTMLButtonElement)) throw new Error('The real Skip day handler is unavailable.');
      button.click(); // actual app handler -> skipDay() -> refreshAll(); deliberately no navigation/pointer guidance
    });
    await page.waitForFunction(expected => {
      const snap = garden.homeSnapshot();
      const log = JSON.parse(localStorage.getItem('garden.log') || '[]');
      return snap.age === expected && snap.targetAge === expected && !snap.growing
        && log.filter(event => event.type === 'day_skipped').length === expected;
    }, offset, { timeout: 5000 });
    ages.push(offset);
    await page.waitForTimeout(offset === 14 ? 420 : offset >= 12 ? 240 : 155);
  }
  await stage(page, 'first-bloom'); mark('first-bloom');
  const birthday = await page.evaluate(() => ({ ...garden.homeSnapshot(), dayOffset: Number(localStorage.getItem('garden.dayOffset')) }));
  await page.waitForTimeout(4000);
  const final = await page.evaluate(() => garden.homeSnapshot()); mark('bloom-hold-last');
  const skipped = (await events(page)).filter(event => event.type === 'day_skipped');
  if (birthday.age !== 15 || birthday.dayOffset !== 15 || skipped.length !== 15 || final.age !== 15
    || skipped.some((event, index) => event.payload.offset !== index + 1)) throw new Error('Day 0 → fully open bloom proof failed.');
  return { verification: { startAge: initial.age, finalAge: final.age, dayOffset: birthday.dayOffset,
    realSkipHandlerInvocations: skipped.length, ages, bloomOpeningStartsAtDay: 12, firstBloomFullyOpenAtDay: 15, bloomHoldSeconds: 4,
    ornamentAtLastFrame: final.ornament === 'moon-moth' && final.ornamentMeshes > 0,
    toolkitNavigated: (await events(page)).some(event => event.type === 'pane_view' && event.payload?.pane === 'toolkit') }, audit: await endAudit(page) };
}

async function reflectPhoto({ page, pointer, network, mark }) {
  await beginAudit(page, 'reflect-photo');
  await pointer.click('.tab[data-pane="reflect"]'); await settlePane(page, 'reflect');
  const initialPrompt = await page.locator('.rf-text').getAttribute('placeholder');
  for (let count = 0; count < 4; count++) {
    if (await page.locator('.rf-text').evaluate(element => element.classList.contains('photo'))) break;
    if (count === 3) throw new Error('Photo prompt was not reachable through the actual prompt-shuffle control.');
    await pointer.click('.rf-shuffle', { after: 120 });
  }
  const photoPrompt = await page.locator('.rf-text').getAttribute('placeholder');
  const shuffles = (await events(page)).filter(event => event.type === 'reflect_prompt_shuffled').length;
  if (!photoPrompt || initialPrompt === photoPrompt || !shuffles) throw new Error('Prompt did not genuinely switch to photo.');
  await stage(page, 'photo-prompt'); mark('photo-prompt');
  await page.waitForTimeout(320);
  await pointer.click('.rf-cam');
  await page.waitForFunction(() => {
    const video = document.querySelector('.rf-video');
    return !document.querySelector('.rf-camera').hidden && video.videoWidth > 0 && document.querySelector('.rf-cam-msg').hidden;
  }, null, { timeout: 10000 });
  await page.waitForTimeout(850);
  const camera = await page.locator('.rf-video').evaluate(video => ({ width: video.videoWidth, height: video.videoHeight, paused: video.paused, readyState: video.readyState }));
  await stage(page, 'fake-device-camera-live'); mark('fake-device-camera-live');
  await pointer.click('.rf-shutter');
  await page.waitForFunction(() => document.querySelector('.rf-camera').hidden && document.querySelector('.rf-cam').classList.contains('on')
    && !document.querySelector('.rf-cam-thumb').hidden && !!document.querySelector('.rf-cam-thumb').src, null, { timeout: 8000 });
  const taken = (await events(page)).filter(event => event.type === 'photo_taken');
  if (taken.length !== 1 || taken[0].payload.via !== 'camera' || camera.width < 1 || camera.paused) throw new Error('Actual fake-camera/local-photo pipeline failed.');
  await stage(page, 'local-photo-attached'); mark('local-photo-attached');
  await page.waitForTimeout(220);
  const previousId = await page.locator('.rf-item.current').getAttribute('data-id');
  await pointer.click('.rf-mood[data-mood="3"]');
  await page.waitForFunction(previous => document.querySelector('.rf-item.current')?.dataset.id !== previous, previousId);
  const cardId = await page.locator('.rf-item.current').getAttribute('data-id');
  const own = `.rf-item[data-id="${cardId}"]`;
  await page.waitForFunction(selector => {
    const card = document.querySelector(`${selector} .rf-card`);
    return card?.dataset.side === 'back' && card?.dataset.submission === 'settled';
  }, own, { timeout: 7000 });
  await stage(page, 'photo-card-back'); mark('photo-card-back');
  const footer = await page.locator(`${own} .rf-prompt-back`).evaluate(element => ({ text: element.textContent, fontSize: getComputedStyle(element).fontSize, textAlign: getComputedStyle(element).textAlign }));
  if (footer.text !== photoPrompt || footer.fontSize !== '11px' || footer.textAlign !== 'center') throw new Error(`Photo footer invalid: ${JSON.stringify(footer)}`);
  await page.waitForTimeout(380);
  await pointer.click(`${own} .rf-turn`, { fraction: { x: .12, y: .13 } });
  await page.waitForFunction(selector => document.querySelector(`${selector} .rf-card`)?.dataset.side === 'front', own);
  await page.waitForTimeout(220);
  await pointer.click(`${own} .rf-turn`, { fraction: { x: .12, y: .13 } });
  await page.waitForFunction(selector => document.querySelector(`${selector} .rf-card`)?.dataset.side === 'photo', own);
  await page.waitForTimeout(550);
  await stage(page, 'full-photo-card'); mark('full-photo-card');
  await pointer.click(`${own} .rf-turn`, { fraction: { x: .12, y: .13 } });
  await page.waitForFunction(selector => document.querySelector(`${selector} .rf-card`)?.dataset.side === 'back', own);
  await page.waitForTimeout(650);
  await stage(page, 'prompt-footer-and-receding-cards'); mark('prompt-footer-and-receding-cards');
  const localProof = await page.evaluate(async selector => {
    const log = JSON.parse(localStorage.getItem('garden.log') || '[]');
    const id = document.querySelector(selector)?.dataset.id;
    const created = log.find(event => event.type === 'card_created' && event.payload?.id === id);
    const draft = JSON.parse(localStorage.getItem('garden.reflect.draft') || 'null');
    const count = await new Promise((resolve, reject) => {
      const request = indexedDB.open('garden', 1);
      request.onsuccess = () => {
        const db = request.result, read = db.transaction('photos', 'readonly').objectStore('photos').count();
        read.onsuccess = () => { resolve(read.result); db.close(); };
        read.onerror = () => reject(read.error);
      };
      request.onerror = () => reject(request.error);
    });
    return { photoCreatedWithoutText: created?.payload?.text === '' && typeof created.payload.photo === 'string',
      mood: created?.payload?.mood, photoAttached: log.some(event => event.type === 'card_photo_attached' && event.payload?.id === id),
      draftCleared: !draft?.text && !draft?.photo, localPhotoStoreCount: count,
      recedingVisible: [...document.querySelectorAll('.rf-item.receding')].filter(element => !element.hidden).length };
  }, own);
  if (!localProof.photoCreatedWithoutText || localProof.mood !== 3 || !localProof.photoAttached || !localProof.draftCleared
    || localProof.localPhotoStoreCount !== 1 || localProof.recedingVisible < 3 || network.replyRequests.length) {
    throw new Error(`Photo local-only verification failed: ${JSON.stringify({ localProof, replyRequests: network.replyRequests })}`);
  }
  return { verification: { promptChangedByActualShuffles: shuffles, promptKind: 'photo', cameraSource: 'Chromium fake-device Y4M through getUserMedia',
    camera, localPhotoPipeline: true, explicitCommittedMood: 'Good', footer, localProof,
    replyRequests: 0, generatedReply: false, replyNote: 'Photo-only cards have a prompt footer but no reply body/model request by design.' }, audit: await endAudit(page) };
}

async function safetyPlan({ page, pointer, network, mark }) {
  await beginAudit(page, 'seeded-flagged-card');
  await pointer.click('.tab[data-pane="reflect"]'); await settlePane(page, 'reflect');
  await pointer.click('.rf-item[data-id="seed-2"] .rf-strip');
  await page.waitForFunction(() => document.querySelector('.rf-item.current')?.dataset.id === 'seed-2');
  await pointer.click('.rf-item[data-id="seed-2"] .rf-turn', { fraction: { x: .14, y: .15 } });
  await page.waitForFunction(() => {
    const item = document.querySelector('.rf-item[data-id="seed-2"]');
    return item?.classList.contains('current') && item.querySelector('.rf-card')?.dataset.side === 'back'
      && !item.querySelector('.rf-flag').hidden && !item.querySelector('.rf-call').hidden;
  });
  const support = await page.evaluate(() => {
    const item = document.querySelector('.rf-item[data-id="seed-2"]'), flag = item.querySelector('.rf-flag');
    const row = item.querySelector('.rf-flag-row'), call = item.querySelector('.rf-call'), plan = item.querySelector('.rf-plan');
    return { text: item.querySelector('.rf-txt').textContent, reply: item.querySelector('.rf-safety').textContent,
      planLine: item.querySelector('.rf-flag-line').textContent, planText: plan.textContent,
      callLabel: call.getAttribute('aria-label'), callHref: call.getAttribute('href'),
      flagAlign: getComputedStyle(flag).alignItems, flagJustify: getComputedStyle(flag).justifyContent,
      flagTextAlign: getComputedStyle(flag).textAlign, rowJustify: getComputedStyle(row).justifyContent };
  });
  if (support.text !== 'Everything feels pointless tonight.' || support.planLine !== 'Make tea and sit somewhere quiet.'
    || support.planText !== 'Open my plan' || support.callHref !== 'tel:+358401234567'
    || support.flagAlign !== 'center' || support.flagJustify !== 'center' || support.flagTextAlign !== 'center' || support.rowJustify !== 'center') {
    throw new Error(`Centered safety support verification failed: ${JSON.stringify(support)}`);
  }
  await page.waitForTimeout(850);
  await stage(page, 'centered-support-plan-call'); mark('centered-support-plan-call');
  await pointer.click('.rf-item[data-id="seed-2"] .rf-plan');
  await settlePane(page, 'toolkit');
  await page.waitForFunction(() => {
    const panel = document.querySelector('.toolkit-detail[data-tool="safety-plan"]');
    return panel && !panel.hidden && document.querySelector('.tk-contact[data-id="example-aino"]')?.getBoundingClientRect().height > 0;
  });
  await stage(page, 'open-plan-inline-contact'); mark('open-plan-inline-contact');
  const plan = await page.evaluate(() => {
    const panel = document.querySelector('.toolkit-detail[data-tool="safety-plan"]'), rect = panel.getBoundingClientRect();
    const contact = document.querySelector('.tk-contact[data-id="example-aino"]'), cr = contact.getBoundingClientRect();
    return { title: panel.querySelector('h2').textContent, inlineOrder: [...panel.querySelector('.tk-editor').children]
      .filter(element => element.matches('.tk-prose:not([data-virtual="true"]), .tk-contact'))
      .map(element => element.classList.contains('tk-contact') ? `contact:${element.querySelector('.tk-contact-name').textContent}` : `note:${element.textContent}`),
      contactVisible: cr.top >= 0 && cr.bottom <= innerHeight && cr.left >= 0 && cr.right <= innerWidth,
      panelFillsPane: rect.top >= 0 && rect.bottom <= innerHeight && rect.height > 650,
      storedOrder: JSON.parse(localStorage.getItem('garden.safetyPlan.v2')).blocks.map(block => block.type === 'contact' ? `contact:${block.contact.name}` : 'note') };
  });
  if (plan.title !== 'My safety plan' || !plan.contactVisible || !plan.panelFillsPane
    || plan.inlineOrder[1] !== 'contact:Aino' || !plan.storedOrder.includes('contact:Aino')) throw new Error(`Inline plan/contact failed: ${JSON.stringify(plan)}`);
  await page.waitForTimeout(1100);
  await pointer.click('.toolkit-detail[data-tool="safety-plan"] .tk-back');
  await page.waitForFunction(() => document.querySelector('.toolkit-detail[data-tool="safety-plan"]').hidden
    && !document.querySelector('.toolkit-list').hidden);
  await stage(page, 'actual-back-to-toolkit'); mark('actual-back-to-toolkit');
  await page.waitForTimeout(500);
  const visibleOptions = await page.locator('.toolkit-option:visible').evaluateAll(elements => elements.map(element => element.dataset.option));
  if (visibleOptions.some(id => ['drift', 'skip-day', 'reset-demo'].includes(id)) || !visibleOptions.includes('safety-plan')) throw new Error('Toolkit return exposed a banned control.');
  await pointer.click('.tab[data-pane="reflect"]'); await settlePane(page, 'reflect');
  await page.waitForFunction(() => document.querySelector('.rf-item[data-id="seed-2"] .rf-card')?.dataset.side === 'back'
    && !document.querySelector('.rf-item[data-id="seed-2"] .rf-flag').hidden);
  await stage(page, 'support-after-return'); mark('support-after-return');
  await page.waitForTimeout(550);
  const log = await events(page);
  if (network.replyRequests.length || log.filter(event => event.type === 'plan_call').length || log.filter(event => event.type === 'plan_open').length !== 1) {
    throw new Error('Safety shot made an unexpected reply/call request or did not open the plan exactly once.');
  }
  return { verification: { seededHeavyCard: support.text, support, plan, actualBackUsed: true, returnedToFlaggedCard: true,
    inlineContact: 'Aino (the existing demo contact only)', replyRequests: 0, callsPlaced: 0 }, audit: await endAudit(page) };
}

const FLOWS = { 'intro-home': introHome, 'growth-bloom': growthBloom, 'reflect-photo': reflectPhoto, 'safety-plan': safetyPlan };

async function newContext(browser, name, record) {
  const context = await browser.newContext({
    viewport: VIEWPORT, screen: VIEWPORT, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    reducedMotion: 'no-preference', colorScheme: 'light',
    ...(record ? { recordVideo: { dir: path.join(RAW, name), size: VIEWPORT } } : {}),
  });
  await context.addInitScript(installSeed, name);
  await context.addInitScript(installCaptureRules);
  if (name === 'reflect-photo') await context.grantPermissions(['camera'], { origin: new URL(BASE).origin });
  return context;
}
async function preparePage(context) {
  // Playwright's CDP screencast is 390x844 CSS pixels even with DPR 2. Recording at 780x1688 would pad, not upscale.
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForFunction(() => globalThis.garden?.homeSnapshot && globalThis.garden?.marketSnapshot && globalThis.garden?.venture, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(400);
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  if (size.width !== 390 || size.height !== 844 || size.dpr !== 2) throw new Error(`Unexpected native capture: ${JSON.stringify(size)}`);
  return page;
}
async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,pix_fmt,nb_frames', '-of', 'json', file]);
  return JSON.parse(stdout);
}
async function exportShot(name, raw, trimStart, requestedDuration, timeline, startOffset = 0) {
  const rawInfo = await probe(raw), rawVideo = rawInfo.streams.find(stream => stream.codec_type === 'video');
  if (rawVideo.width !== VIEWPORT.width || rawVideo.height !== VIEWPORT.height) throw new Error(`${name} raw capture is not 390x844.`);
  const webm = path.join(OUT, `${name}.webm`), mp4 = path.join(OUT, `${name}.mp4`);
  const common = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', trimStart.toFixed(3), '-i', raw,
    '-t', requestedDuration.toFixed(3), '-map', '0:v:0', '-an', '-vf', `scale=${EXPORT_SIZE.width}:${EXPORT_SIZE.height}:flags=lanczos,fps=${FPS}`];
  await run('ffmpeg', [...common, '-c:v', 'libvpx-vp9', '-crf', '25', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', webm], { timeout: 120000, maxBuffer: 1024 * 1024 });
  await run('ffmpeg', [...common, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { timeout: 120000, maxBuffer: 1024 * 1024 });
  const [webmInfo, mp4Info] = await Promise.all([probe(webm), probe(mp4)]);
  const stream = mp4Info.streams.find(item => item.codec_type === 'video');
  const duration = Number(mp4Info.format.duration);
  if (stream.width !== EXPORT_SIZE.width || stream.height !== EXPORT_SIZE.height || stream.avg_frame_rate !== `${FPS}/1`
    || !(duration > 0) || Math.abs(duration - requestedDuration) > .12 || stream.codec_name !== 'h264') {
    throw new Error(`${name} ffprobe/duration validation failed (requested ${requestedDuration}s): ${JSON.stringify(mp4Info)}`);
  }
  const review = [];
  for (const item of timeline) {
    const at = Math.min(Math.max(0, duration - .04), Math.max(0, item.at - startOffset + .08));
    const file = path.join(REVIEW, `${name}-${item.label}.png`);
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(3), '-i', mp4, '-frames:v', '1', file]);
    review.push({ label: item.label, at: Number(at.toFixed(3)), path: file });
  }
  return { webm, mp4, rawSource: raw, trimStart: Number(trimStart.toFixed(3)), duration,
    nativeCapture: '390x844 CSS-pixel screencast with deviceScaleFactor 2', resolution: `${stream.width}x${stream.height}`, fps: FPS,
    frameRate: stream.avg_frame_rate, codecs: { webm: webmInfo.streams.find(item => item.codec_type === 'video')?.codec_name, mp4: stream.codec_name },
    audio: 'none', webmDuration: Number(webmInfo.format.duration),
    sizes: { mp4: Number(mp4Info.format.size), webm: Number(webmInfo.format.size) }, ffprobe: mp4Info, review };
}

async function captureShot(browser, name) {
  const recording = !DRY_RUN, context = await newContext(browser, name, recording);
  const errors = [], network = { replyRequests: [] };
  let createdAt = null, startedAt = null, endedAt = null, raw = null;
  try {
    createdAt = Date.now();
    const page = await preparePage(context);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (request.url().includes('/api/reflect-reply') && request.method() === 'POST') network.replyRequests.push(request.url()); });
    const video = page.video(), pointer = makePointer(page), began = Date.now(), timeline = [];
    const mark = label => {
      const at = Number(((Date.now() - began) / 1000).toFixed(3));
      timeline.push({ label, at });
      return at;
    };
    startedAt = began;
    const result = await FLOWS[name]({ page, pointer, network, mark });
    endedAt = Date.now();
    await page.waitForTimeout(140);
    if (recording) {
      await context.close();
      raw = path.join(RAW, name, `${name}-raw.webm`);
      await video.saveAs(raw);
      const requestedDuration = Number(result.exportDuration ?? ((endedAt - startedAt) / 1000 + .10));
      let trimStart = Math.max(0, (startedAt - createdAt) / 1000 - .08 + Number(result.exportStartAt ?? 0));
      if (result.exportFromEnd) {
        const rawDuration = Number((await probe(raw)).format.duration);
        trimStart = Math.max(0, rawDuration - requestedDuration);
      }
      const exported = await exportShot(name, raw, trimStart, requestedDuration, timeline, Number(result.exportStartAt ?? 0));
      metadata.clips[name] = { path: exported.mp4, contentSummary: SUMMARIES[name], ...result, ...exported,
        browserErrors: errors, timeline, wallTimings: { createdAt, startedAt, endedAt } };
      if (errors.length) throw new Error(`${name} browser errors: ${errors.join(' | ')}`);
      console.log(`${name}: ${exported.duration.toFixed(2)}s / ${exported.frameRate} fps / ${exported.resolution} / ${exported.mp4}`);
    } else {
      metadata.clips[name] = { path: null, contentSummary: SUMMARIES[name], ...result,
        duration: Number(result.exportDuration ?? ((endedAt - startedAt) / 1000).toFixed(3)), browserErrors: errors, timeline };
      if (errors.length) throw new Error(`${name} browser errors: ${errors.join(' | ')}`);
      console.log(`${name}: dry run OK (${metadata.clips[name].duration.toFixed(2)}s)`);
    }
  } finally {
    try { await context.close(); } catch { /* already closed */ }
  }
}

await ensureCamera();
const browser = await chromium.launch({ headless: true, args: [
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${CAMERA}`,
] });
try {
  for (const name of selected) await captureShot(browser, name);
} catch (error) {
  metadata.failure = error.stack || String(error);
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(path.join(OUT, DRY_RUN ? 'dry-run.json' : 'inventory.json'), JSON.stringify(metadata, null, 2));
}
