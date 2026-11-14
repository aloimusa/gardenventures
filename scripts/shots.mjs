// Milestone screenshots at 390x844. node scripts/shots.mjs [baseUrl] [prefix]
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const BASE = process.argv[2] || 'http://127.0.0.1:8815/';
const PRE = process.argv[3] || 'shell';
const OUT = `${homedir()}/projects/garden-shots`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
let i = 1; const nn = () => String(i++).padStart(2, '0');
await shot(`${nn()}-${PRE}-home-before`);
const box = await page.evaluate(() => { const c = document.querySelector('.stage').getBoundingClientRect(); return { x: c.width / 2, y: c.height * 0.58 }; });
await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.waitForTimeout(450);
await shot(`${nn()}-${PRE}-home-during`);
await page.waitForTimeout(400); await page.mouse.up(); await page.waitForTimeout(700);
await shot(`${nn()}-${PRE}-home-after`);
for (const p of ['winddown', 'reflect', 'venture', 'toolkit']) {
  await page.click(`.tab[data-pane="${p}"]`); await page.waitForTimeout(500);
  await shot(`${nn()}-${PRE}-${p}`);
}
await browser.close();
console.log('shots in', OUT);
