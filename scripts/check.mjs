// Behaviour checks for the garden shell and Home. Rerunnable by anyone on tuf:
//   node scripts/check.mjs [url] [--nav-only]   default http://127.0.0.1:8815/ ; the live URL also checks offline + install
// Prints one line per check and exits 1 if any fails.
import { createRequire } from 'node:module';
import { reflectChecks } from './check-reflect.mjs';
import { homeChecks } from './check-home.mjs';
import { ventureChecks } from './check-venture.mjs';
import { toolkitChecks, toolkitResetChecks } from './check-toolkit.mjs';
import { winddownChecks } from './check-winddown.mjs';
import { homedir } from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);

const NAV_ONLY = process.argv.includes('--nav-only');
const BASE = process.argv.slice(2).find(a => !a.startsWith('--')) || 'http://127.0.0.1:8815/';
const ORIGIN = new URL(BASE).origin;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });   // Reflect's camera: Chromium's test pattern
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, permissions: ['camera'] });
const page = await context.newPage();
const errors = [], foreign = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', r => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== ORIGIN) foreign.push(u); });

// Use an isolated browser context so daily task setup cannot affect Home and the feature suites below.
async function navigationChecks() {
  const navContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const nav = await navContext.newPage();
  nav.on('pageerror', e => errors.push(e.message));
  const url = new URL(BASE);
  url.searchParams.set('venture-test', '1');
  await nav.goto(url.href, { waitUntil: 'networkidle' });
  await nav.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('garden.test.reply', 'fail');
    localStorage.setItem('garden.test.ventureSeconds', '0.4');
  });
  await nav.reload({ waitUntil: 'networkidle' });
  const colors = () => nav.evaluate(() => Object.fromEntries(['reflect', 'venture'].map(id => {
    const tab = document.querySelector(`.tab[data-pane="${id}"]`);
    const iconStyle = getComputedStyle(tab.querySelector(':scope > svg'));
    return [id, {
      iconColor: iconStyle.color,
      iconStroke: iconStyle.stroke,
      labelColor: getComputedStyle(tab.querySelector('.label')).color,
      done: tab.classList.contains('done'),
      mark: getComputedStyle(tab.querySelector('.mark')).visibility,
    }];
  })));
  const MONO = 'rgb(93, 105, 101)', BLUE = 'rgb(47, 111, 176)', RED = 'rgb(200, 69, 60)';
  const matches = (state, color, done) => state.iconColor === color && state.iconStroke === color
    && state.labelColor === color && state.done === done && state.mark === (done ? 'visible' : 'hidden');

  let state = await colors();
  check('Reflect initially has a gray computed icon SVG color/stroke and label', matches(state.reflect, MONO, false), JSON.stringify(state.reflect));
  check('Venture initially has a gray computed icon SVG color/stroke and label', matches(state.venture, MONO, false), JSON.stringify(state.venture));

  for (const p of ['winddown', 'reflect', 'venture', 'toolkit', 'home']) {
    await nav.click(`.tab[data-pane="${p}"]`); await nav.waitForTimeout(450);
    const vis = await nav.evaluate(() => [...document.querySelectorAll('.pane')]
      .find(pane => Math.abs(pane.getBoundingClientRect().left) < 2)?.dataset.pane);
    const cur = await nav.getAttribute(`.tab[data-pane="${p}"]`, 'aria-current');
    if (p === 'winddown') {
      const bg = await nav.evaluate(() => getComputedStyle(document.querySelector('.bar')).backgroundColor);
      check('Wind down turns the bar dark', bg === 'rgb(14, 17, 20)', bg);
    }
    check(`bar button slides to ${p}`, vis === p && cur === 'page', `visible=${vis}`);
  }
  const bgLight = await nav.evaluate(() => getComputedStyle(document.querySelector('.bar')).backgroundColor);
  check('bar light again off Wind down', bgLight === 'rgb(255, 255, 255)', bgLight);

  // Navigation is explicit: horizontal flicks over the viewport never change the pane.
  {
    const views = await nav.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]').filter(e => e.type === 'pane_view').length);
    const y = 400;
    await nav.mouse.move(320, y); await nav.mouse.down(); await nav.mouse.move(120, y, { steps: 4 }); await nav.mouse.up();
    await nav.waitForTimeout(450);
    const left = await nav.evaluate(() => [...document.querySelectorAll('.pane')].find(pane => Math.abs(pane.getBoundingClientRect().left) < 2)?.dataset.pane);
    await nav.mouse.move(80, y); await nav.mouse.down(); await nav.mouse.move(280, y, { steps: 4 }); await nav.mouse.up();
    await nav.waitForTimeout(450);
    const right = await nav.evaluate(() => [...document.querySelectorAll('.pane')].find(pane => Math.abs(pane.getBoundingClientRect().left) < 2)?.dataset.pane);
    const after = await nav.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]').filter(e => e.type === 'pane_view').length);
    check('horizontal flicks do not navigate or log pane views', left === 'home' && right === 'home' && after === views,
      `left=${left}, right=${right}`);
  }

  await nav.click('.tab[data-pane="reflect"]'); await nav.waitForTimeout(400);
  await nav.click('.rf-item[data-id="seed-2"] .rf-strip'); await nav.waitForTimeout(250);
  await nav.click('.rf-item[data-id="seed-2"] .rf-turn'); await nav.waitForTimeout(550);
  await nav.click('.rf-item[data-id="seed-2"] .rf-plan'); await nav.waitForTimeout(400);
  const linkDestination = await nav.evaluate(() => ({
    pane: [...document.querySelectorAll('.pane')].find(pane => Math.abs(pane.getBoundingClientRect().left) < 2)?.dataset.pane,
    expanded: document.querySelector('.toolkit-option[data-option="safety-plan"]').getAttribute('aria-expanded'),
  }));
  check('Reflect to Toolkit plan link navigation still works', linkDestination.pane === 'toolkit' && linkDestination.expanded === 'true', JSON.stringify(linkDestination));

  await nav.click('.tab[data-pane="venture"]'); await nav.waitForTimeout(400);
  await nav.click('.venture-choice[data-plant="banana"]');
  // Venture v4: only the first choice starts one real 2 s practice before the daily round.
  const practiceStart = nav.locator('.venture-practice-start');
  if (await practiceStart.isVisible()) {
    const practiceStartsDisabled = await practiceStart.isDisabled();
    await nav.click('.venture-stage');
    await nav.waitForFunction(() => garden.venture.practiceStatus === 'result'
      && !document.querySelector('.venture-practice-start').disabled, null, { timeout: 4000 });
    check('Venture first-run pointer practice enables Start before the daily round',
      practiceStartsDisabled && await practiceStart.isEnabled());
    await practiceStart.click();
  }
  await nav.waitForFunction(() => document.querySelector('.tab[data-pane="venture"]').classList.contains('done'), null, { timeout: 3000 });
  state = await colors();
  check('Venture completion alone turns its icon SVG and label red; Reflect stays gray',
    matches(state.venture, RED, true) && matches(state.reflect, MONO, false), JSON.stringify(state));

  await nav.click('.tab[data-pane="reflect"]'); await nav.waitForTimeout(400);
  const cardsBefore = await nav.locator('.rf-item').count();
  await nav.fill('.rf-text', 'Navigation colour check.');
  await nav.click('.rf-mood[data-mood="2"][aria-label="Add card with mood: Okay"]');
  await nav.waitForFunction(() => document.querySelector('.tab[data-pane="reflect"]').classList.contains('done'));
  state = await colors();
  const cardsAfter = await nav.locator('.rf-item').count();
  check('Reflect Okay face creates one card and turns its icon SVG and label blue while Venture stays red',
    cardsAfter === cardsBefore + 1 && matches(state.reflect, BLUE, true) && matches(state.venture, RED, true),
    JSON.stringify({ ...state, cardsBefore, cardsAfter }));

  await nav.reload({ waitUntil: 'networkidle' }); await nav.waitForTimeout(300);
  state = await colors();
  check('completed Reflect/Venture icon and label colors survive reload',
    matches(state.reflect, BLUE, true) && matches(state.venture, RED, true), JSON.stringify(state));

  await nav.click('.tab[data-pane="toolkit"]'); await nav.waitForTimeout(400);
  await nav.click('.toolkit-option[data-option="skip-day"]');
  await nav.waitForFunction(() => ['reflect', 'venture'].every(id => !document.querySelector(`.tab[data-pane="${id}"]`).classList.contains('done')));
  state = await colors();
  check('day reset returns both icon SVG color/strokes and labels to gray with hidden marks',
    matches(state.reflect, MONO, false) && matches(state.venture, MONO, false), JSON.stringify(state));
  await navContext.close();
}

await navigationChecks();
if (NAV_ONLY) {
  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

await homeChecks({ page, check, BASE });

// contrast of every visible text against what is behind it (gradient stops / composited pill, worst case)
const contrast = await page.evaluate(async () => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/)[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const HOME = ['#e2f0ee', '#cde5d5', '#f3efd9'].map(h => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: 1 }));
  const bgsOf = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      if (e.dataset?.pane === 'home' && e.classList.contains('pane')) return layers.length ? HOME.map(h => layers.reduceRight((acc, l) => over(l, acc), h)) : HOME;
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c.a > 0) { layers.push(c); if (c.a === 1) return [layers.reduceRight((acc, l) => over(l, acc), { r: 255, g: 255, b: 255, a: 1 })]; }
    }
    return [{ r: 255, g: 255, b: 255, a: 1 }];
  };
  const out = [];
  const panes = ['winddown', 'reflect', 'home', 'venture', 'toolkit'];
  for (const p of panes) {
    document.querySelector(`.tab[data-pane="${p}"]`).click();
    await new Promise(r => setTimeout(r, 400));
    const els = [...document.querySelectorAll(`.pane[data-pane="${p}"] h1, .pane[data-pane="${p}"] .sub, .pane[data-pane="${p}"] .water, .tab .label`)];
    for (const el of els) {
      const fg = parse(getComputedStyle(el).color);
      const worst = Math.min(...bgsOf(el).map(b => ratio(fg, b)));
      out.push({ pane: p, el: el.className || el.tagName, text: el.innerText.slice(0, 24), ratio: Math.round(worst * 100) / 100 });
    }
  }
  document.querySelector('.tab[data-pane="home"]').click();
  return out;
});
const low = contrast.filter(c => c.ratio < 4.5);
check(`contrast >= 4.5:1 for ${contrast.length} text/background pairs`, low.length === 0,
  low.length ? JSON.stringify(low) : `lowest ${Math.min(...contrast.map(c => c.ratio))}`);

// performance rules: DPR cap, render stops off Home
const dpr = await page.evaluate(() => { const c = document.querySelector('.stage canvas'); return c.width / c.clientWidth; });
check('canvas pixel ratio capped at 2', dpr <= 2.01, `ratio=${dpr.toFixed(2)}`);
await page.click('.tab[data-pane="toolkit"]'); await page.waitForTimeout(500);
const rafOff = await page.evaluate(() => new Promise(r => { let calls = 0; const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = f => { calls++; return raf(f); }; setTimeout(() => { window.requestAnimationFrame = raf; r(calls); }, 600); }));
check('no render loop while Home is not visible', rafOff === 0, `rAF calls in 600 ms=${rafOff}`);
await page.click('.tab[data-pane="home"]'); await page.waitForTimeout(400);

// prefers-reduced-motion: no slide, no idle float (the pour still shows)
await page.emulateMedia({ reducedMotion: 'reduce' });
const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.track')).transitionDuration);
check('reduced motion: panes switch without a slide', dur === '0s', `transition=${dur}`);
await page.emulateMedia({ reducedMotion: 'no-preference' });

await winddownChecks({ page, check, BASE });
await toolkitChecks({ page, check });
await ventureChecks({ page, check });
await reflectChecks({ page, context, check, BASE });
await toolkitResetChecks({ page, check });

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
check('no request leaves the origin', foreign.length === 0, foreign.slice(0, 3).join(' '));

// PWA: manifest, installability and offline reload (only where the service worker is built in)
const hasSW = (await page.request.get(new URL('sw.js', BASE).href)).ok() && !BASE.includes(':8815');
if (hasSW) {
  const cdp = await context.newCDPSession(page);
  const man = await cdp.send('Page.getAppManifest');
  check('manifest parses', man.errors.length === 0, man.errors.map(e => e.message).join('; '));
  const inst = await cdp.send('Page.getInstallabilityErrors');
  check('installable (Chromium says no installability errors)', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(800);
  const ok = await page.evaluate(() => document.querySelector('[data-pane="home"] h1')?.innerText === 'Home' && !!document.querySelector('.stage canvas')
    && document.fonts.check('600 28px "Space Grotesk"')).catch(() => false);
  check('offline reload shows the shell with its fonts', ok);
  await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(500);
  const rOff = await page.evaluate(async () => { const img = document.querySelector('.rf-item[data-id="seed-3"] .rf-img');
    if (img && !img.complete) await new Promise(r => { img.onload = img.onerror = r; });
    return { cards: document.querySelectorAll('.rf-item').length, seedPhoto: !!img && img.naturalWidth > 0 }; }).catch(() => ({}));
  check('offline: Reflect shows its cards and the seed photo', rOff.cards >= 3 && rOff.seedPhoto, JSON.stringify(rOff));
  await context.setOffline(false);
} else console.log('--   PWA checks skipped (dev server has no service worker; run against the live URL)');

await browser.close();
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
