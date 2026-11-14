// Reflect screenshots at 390x844: node scripts/reflect-shots.mjs [baseUrl] [prefix]
// Uses Chromium's fake camera, so the camera view shows its test pattern.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const BASE = process.argv[2] || 'http://127.0.0.1:8815/';
const PRE = process.argv[3] || 'reflect';
const OUT = `${homedir()}/projects/garden-shots`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  permissions: ['camera'] });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle' });
await page.click('.tab[data-pane="reflect"]'); await page.waitForTimeout(700);
let i = 1; const shot = async n => { await page.screenshot({ path: `${OUT}/${PRE}-${String(i++).padStart(2, '0')}-${n}.png` }); };
const card = id => `.rf-item[data-id="${id}"] .rf-turn`;
const tap = async id => { await page.locator(card(id)).tap(); await page.waitForTimeout(650); };
const scrollTo = id => page.evaluate(id => document.querySelector(`.rf-item[data-id="${id}"]`).scrollIntoView({ block: 'center' }), id);

await shot('stack');
await scrollTo('seed-1'); await page.waitForTimeout(200); await tap('seed-1'); await shot('turned');
await tap('seed-1');
await scrollTo('seed-3'); await page.waitForTimeout(200);
await tap('seed-3'); await shot('photo-tap1');
await tap('seed-3'); await shot('photo-tap2');
await tap('seed-3'); await shot('photo-tap3');
await scrollTo('seed-2'); await page.waitForTimeout(200); await tap('seed-2');
await page.evaluate(() => document.querySelector('.rf-item[data-id="seed-2"]').scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
await shot('flagged');
await tap('seed-2');
// hold to rewrite
await scrollTo('seed-1'); await page.waitForTimeout(200);
{ const b = await page.locator(card('seed-1')).boundingBox(); await page.mouse.move(b.x + 100, b.y + 80); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); await page.waitForTimeout(300); }
await shot('edit');
await page.click('.rf-item[data-id="seed-1"] .rf-done'); await page.waitForTimeout(300);
// writing area with text, then a photo
await page.click('.rf-text'); await page.keyboard.type('The coffee was good this morning.'); await page.evaluate(() => document.activeElement.blur());
await page.waitForTimeout(200); await shot('writing-text');
await page.click('.rf-cam'); await page.waitForTimeout(1500); await shot('camera');
await page.click('.rf-shutter'); await page.waitForTimeout(900); await shot('photo-added');
await page.click('.rf-add'); await page.waitForTimeout(300); await shot('added-pending');
await page.waitForTimeout(1500); await shot('added-reply');
await browser.close();
console.log('shots in', OUT);
