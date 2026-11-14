// Renders public/icons/icon.svg to the PNG icons with headless Chromium. Run: node scripts/icons.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const square = svg.replace('rx="112"', 'rx="0"');                    // maskable and apple: full bleed
const maskable = square.replace('scale(11)', 'scale(8.5)');          // sprout inside the 80 % safe zone
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, src, px] of [['icon-192', svg, 192], ['icon-512', svg, 512], ['maskable-512', maskable, 512], ['apple-touch-icon', square, 180]]) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${px}px;height:${px}px;display:block}</style>${src}`);
  await page.screenshot({ path: `public/icons/${name}.png`, omitBackground: true });
}
await browser.close();
console.log('icons written');
