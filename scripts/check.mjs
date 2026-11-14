// Behaviour checks for the garden shell and Home. Rerunnable by anyone on tuf:
//   node scripts/check.mjs [url]        default http://127.0.0.1:8815/ ; the live URL also checks offline + install
// Prints one line per check and exits 1 if any fails.
import { createRequire } from 'node:module';
import { reflectChecks } from './check-reflect.mjs';
import { homedir } from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);

const BASE = process.argv[2] || 'http://127.0.0.1:8815/';
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

const events = () => page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]'));
const count = async type => (await events()).filter(e => e.type === type).length;
const text = sel => page.locator(sel).first().innerText();
const homeDone = () => page.evaluate(() => document.querySelector('.tab[data-pane="home"]').classList.contains('done'));
const visiblePane = () => page.evaluate(() => [...document.querySelectorAll('.pane')]
  .find(p => Math.abs(p.getBoundingClientRect().left) < 2)?.dataset.pane);
async function holdOnPlant(ms, wander = 0) {
  const b = await page.evaluate(() => garden.hitBox());
  const x = b.x + b.width * 0.3, y = b.y + b.height * 0.7;
  await page.mouse.move(x, y); await page.mouse.down();
  if (wander) { await page.waitForTimeout(ms / 2); await page.mouse.move(x + wander, y + wander / 2, { steps: 5 }); await page.waitForTimeout(ms / 2); }
  else await page.waitForTimeout(ms);
  await page.mouse.up(); await page.waitForTimeout(150);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);

check('opens on Home', await visiblePane() === 'home' && await text('[data-pane="home"] h1') === 'Home');
check('Home text before watering', (await text('[data-pane="home"] .sub')).startsWith('Hold on your plant to tip the can.')
  && await text('.water') === 'Hold to water');
check('no completion sprout before watering', !(await homeDone()));

for (const p of ['winddown', 'reflect', 'venture', 'toolkit', 'home']) {
  await page.click(`.tab[data-pane="${p}"]`); await page.waitForTimeout(450);
  const vis = await visiblePane();
  const cur = await page.getAttribute(`.tab[data-pane="${p}"]`, 'aria-current');
  let extra = '';
  if (p === 'winddown') {
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.bar')).backgroundColor);
    check('Wind down turns the bar dark', bg === 'rgb(14, 17, 20)', bg);
  }
  check(`bar button slides to ${p}`, vis === p && cur === 'page', `visible=${vis}`);
}
const bgLight = await page.evaluate(() => getComputedStyle(document.querySelector('.bar')).backgroundColor);
check('bar light again off Wind down', bgLight === 'rgb(255, 255, 255)', bgLight);

// swipe: a quick horizontal flick moves one pane
{
  const y = 400; await page.mouse.move(320, y); await page.mouse.down(); await page.mouse.move(120, y, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(450); const v = await visiblePane();
  check('flick left goes to Venture', v === 'venture', `visible=${v}`);
  await page.click('.tab[data-pane="home"]'); await page.waitForTimeout(450);
}

// early release changes nothing
await holdOnPlant(300);
check('early release (300 ms): no watered event, texts unchanged', await count('watered') === 0 && await text('.water') === 'Hold to water' && !(await homeDone()));

// a hold that wanders a little still counts
await holdOnPlant(800, 30);
check('hold 800 ms that wanders 34 px waters', await count('watered') === 1, `watered events=${await count('watered')}`);
check('after: "Watered today." and the pill', await text('[data-pane="home"] .sub') === 'Watered today.' && await text('.water') === 'Watered today');
check('completion sprout on Home', await homeDone());
check('aria-label states the plant', (await page.getAttribute('.water', 'aria-label')).includes('Watered today'));

await holdOnPlant(700);
check('second hold the same day adds no watered event', await count('watered') === 1 && await count('water_again') >= 1);

await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
check('reload keeps the state', await text('.water') === 'Watered today' && await homeDone());

// yesterday -> waterable again
await page.evaluate(() => { const d = new Date(Date.now() - 864e5); const p = n => String(n).padStart(2, '0');
  localStorage.setItem('garden.state', JSON.stringify({ v: 1, wateredOn: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })); });
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
check('stored date yesterday -> waterable again', await text('.water') === 'Hold to water' && !(await homeDone()));

// keyboard: Enter on the button waters
await page.focus('.water'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
check('Enter on the button waters', await count('watered') === 2 && await text('.water') === 'Watered today');
check('log is append-only and ordered', (await events()).every((e, i, a) => typeof e.t === 'number' && typeof e.type === 'string' && (i === 0 || a[i - 1].t <= e.t)));

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

await reflectChecks({ page, context, check, BASE });

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
