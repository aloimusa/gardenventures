// Generates src/reflect/assets/seed-river.jpg: the demo card's photo, a wintry river with ice on the edges.
// Drawn with canvas in headless Chromium from a seeded PRNG, so it is ours and reproducible. No stock, no network.
//   node scripts/seed-photo.mjs
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);

const draw = () => {
  const W = 1200, H = 800;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let s = 20261114; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lin = (y0, y1, stops) => { const l = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => l.addColorStop(o, col)); return l; };

  g.fillStyle = '#d9dfe4'; g.fillRect(0, 0, W, H);
  // winter late-afternoon sky
  g.fillStyle = lin(0, 330, [[0, '#b9c9d8'], [0.55, '#dfe3e6'], [1, '#f1dcc8']]); g.fillRect(0, 0, W, 330);
  const sun = g.createRadialGradient(860, 300, 4, 860, 300, 260);
  sun.addColorStop(0, 'rgba(255,236,210,0.9)'); sun.addColorStop(1, 'rgba(255,236,210,0)');
  g.fillStyle = sun; g.fillRect(0, 0, W, 360);

  // far bank: soft blue-grey tree line
  g.filter = 'blur(3px)';
  for (const [col, base, amp] of [['#a9b5c0', 300, 26], ['#8796a3', 318, 16]]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, 350);
    for (let x = 0; x <= W; x += 18) g.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x / 97 + base)) - 10 * rnd());
    g.lineTo(W, 350); g.fill();
  }
  g.filter = 'blur(0.6px)';
  // bare trees, thin dark branches
  const tree = (x, y, len, ang, w, d) => {
    if (d === 0 || len < 3) return;
    const x2 = x + Math.cos(ang) * len, y2 = y - Math.sin(ang) * len;
    g.strokeStyle = `rgba(52,58,66,${0.55 + 0.1 * d})`; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    const n = 2 + (rnd() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) tree(x2, y2, len * (0.62 + 0.18 * rnd()), ang + (rnd() - 0.5) * 1.1, w * 0.68, d - 1);
  };
  for (let k = 0; k < 9; k++) { const x = 40 + k * 140 + rnd() * 60; tree(x, 336, 40 + rnd() * 34, Math.PI / 2 + (rnd() - 0.5) * 0.2, 3.2, 6); }

  g.filter = 'none';
  // snowy bank on the far side
  g.fillStyle = lin(330, 370, [[0, '#eef1f3'], [1, '#d7dee4']]);
  g.beginPath(); g.moveTo(0, 336); for (let x = 0; x <= W; x += 10) g.lineTo(x, 340 + 6 * Math.sin(x / 60) + 4 * rnd()); g.lineTo(W, 372); g.lineTo(0, 372); g.fill();

  // the river, dark open water in the middle, receding to the far bank
  g.fillStyle = lin(360, H, [[0, '#6f8597'], [0.35, '#4b6274'], [1, '#2f4352']]); g.fillRect(0, 360, W, H - 360);
  // sky and sun reflected in the open water, broken into ripples
  for (let k = 0; k < 900; k++) {
    const y = 370 + Math.pow(rnd(), 1.6) * (H - 370), x = rnd() * W, len = 8 + rnd() * 60 * (y / H);
    const near = Math.abs(x - 860) < 120 + y * 0.15;
    g.strokeStyle = near ? `rgba(255,226,196,${0.12 + 0.25 * rnd()})` : `rgba(200,215,228,${0.05 + 0.12 * rnd()})`;
    g.lineWidth = 1 + 2 * (y / H); g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
  }

  // ice shelves along both edges: irregular plates, thicker near the bank, cracked, blue in the shadows
  const shelf = (side) => {
    const pts = [];
    for (let y = 360; y <= H + 10; y += 14) {
      const t = (y - 360) / (H - 360);
      const reach = 40 + 300 * t * t + 60 * Math.sin(y / 37) * t + 40 * rnd() * t;
      pts.push([side < 0 ? reach : W - reach, y]);
    }
    const edgeX = side < 0 ? -10 : W + 10;
    // body
    g.beginPath(); g.moveTo(edgeX, 360); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(edgeX, H + 10); g.closePath();
    g.fillStyle = lin(360, H, [[0, '#e6edf2'], [1, '#cfdde8']]); g.fill();
    // the lip where ice meets water: a thin bright edge over a blue shadow
    g.lineWidth = 7; g.strokeStyle = 'rgba(120,160,190,0.55)';
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x + side * -4, y + 3) : g.moveTo(x + side * -4, y + 3)); g.stroke();
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    // cracks and plates
    g.lineWidth = 1.2;
    for (let k = 0; k < 70; k++) {
      const i = Math.floor(rnd() * pts.length), [px, py] = pts[i];
      const x0 = side < 0 ? rnd() * px : px + rnd() * (W - px);
      g.strokeStyle = `rgba(140,170,195,${0.25 + 0.35 * rnd()})`;
      g.beginPath(); g.moveTo(x0, py); let x = x0, y = py;
      for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 40; y += 6 + rnd() * 14; g.lineTo(x, y); } g.stroke();
    }
    // a few loose floes drifting off the edge
    for (let k = 0; k < 9; k++) {
      const [px, py] = pts[Math.floor(rnd() * pts.length)];
      const fx = px - side * (20 + rnd() * 70), fy = py + rnd() * 10, r = 6 + rnd() * 18 * (fy / H);
      g.fillStyle = 'rgba(232,240,246,0.95)';
      g.beginPath(); for (let a = 0; a < 6; a++) { const ang = a / 6 * Math.PI * 2 + rnd() * 0.5; g.lineTo(fx + Math.cos(ang) * r * 1.6, fy + Math.sin(ang) * r * 0.55); } g.fill();
      g.fillStyle = 'rgba(110,150,180,0.35)'; g.fillRect(fx - r * 1.2, fy + r * 0.45, r * 2.4, 2);
    }
  };
  shelf(-1); shelf(1);

  const soft = document.createElement('canvas'); soft.width = W; soft.height = H;
  const sg = soft.getContext('2d'); sg.filter = 'blur(1.1px)'; sg.drawImage(c, 0, 0);
  g.drawImage(soft, 0, 0);
  // light snow texture and a little grain so it reads as a photo, not a diagram
  for (let k = 0; k < 2200; k++) { g.fillStyle = `rgba(255,255,255,${0.15 * rnd()})`; g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5); }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  // gentle vignette
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,30,40,0.28)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c.toDataURL('image/jpeg', 0.84);
};

const b = await chromium.launch();
const p = await b.newPage();
const url = await p.evaluate(draw);
await b.close();
const out = new URL('../src/reflect/assets/seed-river.jpg', import.meta.url);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out.pathname);
