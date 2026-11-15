// Regression for upgrading a controlling stale worker, then bypassing /video HTML and byte ranges.
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { createServiceWorkerSource } from '../vite.config.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const OLD_CACHE = 'garden-videoold';
const NEW_CACHE = 'garden-videonew';
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const appHTML = version => `<!doctype html><html><head><script type="module" src="./assets/shell-${version}.js"></script></head><body><h1>Garden ${version} application</h1></body></html>`;
const appJS = version => `window.shellVersion = '${version}';
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {}));`;
const playerHTML = '<!doctype html><html><body><h1>Garden video player</h1><video controls preload="metadata" src="../home.mp4"></video></body></html>';
const legacyWorker = `const CACHE = '${OLD_CACHE}';
const FILES = ['./', 'index.html', 'assets/shell-old.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put('index.html', c)); return res; })
      .catch(() => caches.match('index.html', { ignoreVary: true })));
    return;
  }
  e.respondWith(caches.match(r, { ignoreVary: true }).then(hit => hit || fetch(r)));
});`;

async function fixture(parent, version) {
  const root = join(parent, version);
  await mkdir(join(root, 'assets'), { recursive: true });
  await mkdir(join(root, 'video/home'), { recursive: true });
  const files = ['./', 'index.html', `assets/shell-${version}.js`];
  await Promise.all([
    writeFile(join(root, 'index.html'), appHTML(version)),
    writeFile(join(root, `assets/shell-${version}.js`), appJS(version)),
    writeFile(join(root, 'sw.js'), version === 'old' ? legacyWorker : createServiceWorkerSource(files, 'videonew')),
    writeFile(join(root, 'video/index.html'), '<!doctype html><html><body><h1>Gallery index</h1></body></html>'),
    writeFile(join(root, 'video/home/index.html'), playerHTML),
    writeFile(join(root, 'video/home.mp4'), Buffer.alloc(4096, 7)),
  ]);
  return root;
}

const parent = await mkdtemp('/tmp/opencode/garden-video-pwa-');
let deployed = 'old';
const roots = { old: await fixture(parent, 'old'), new: await fixture(parent, 'new') };
const server = createServer(async (req, res) => {
  const requestURL = new URL(req.url, 'http://127.0.0.1');
  let pathname = decodeURIComponent(requestURL.pathname);
  let file = normalize(join(roots[deployed], pathname));
  if (!file.startsWith(`${roots[deployed]}/`)) { res.writeHead(403).end(); return; }
  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(308, { Location: `${pathname}/` }).end(); return; }
      pathname = `${pathname}index.html`;
      file = join(file, 'index.html');
      info = await stat(file);
    }
    const headers = {
      'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mp4': 'video/mp4' }[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'max-age=14400',
      'Accept-Ranges': 'bytes',
    };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d+)?$/);
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(Number(range[2] ?? info.size - 1), info.size - 1);
      if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
      res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}` });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': info.size });
    res.end(await readFile(file));
  } catch { res.writeHead(404, { 'Cache-Control': 'no-store' }).end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const context = await chromium.launchPersistentContext(join(parent, 'profile'), { headless: true, viewport: { width: 390, height: 844 } });
const page = context.pages()[0] || await context.newPage();
let offline = false;
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  check('stale non-bypassing worker controls the app', await page.evaluate(() => !!navigator.serviceWorker.controller && window.shellVersion === 'old'));

  await page.goto(`${base}video/home`, { waitUntil: 'networkidle' });
  check('stale worker initially passes through an online gallery navigation', await page.locator('h1').textContent() === 'Garden video player');
  // The deliberately legacy worker opens/puts its cache without waitUntil. Let that write settle
  // before activation deletes the old cache, or the obsolete write can recreate it late in the test.
  await page.waitForFunction(async cacheName => {
    const response = await (await caches.open(cacheName)).match('/index.html', { ignoreVary: true });
    return !!response && (await response.text()).includes('Garden video player');
  }, OLD_CACHE);

  deployed = 'new';
  await page.evaluate(async () => {
    window.testControllerChanges = 0;
    navigator.serviceWorker.addEventListener('controllerchange', () => { window.testControllerChanges++; });
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  await page.waitForFunction(async ({ expected, oldCache }) => {
    const registration = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    return window.testControllerChanges > 0 && registration?.active?.state === 'activated'
      && !registration.installing && !registration.waiting && keys.includes(expected) && !keys.includes(oldCache);
  }, { expected: NEW_CACHE, oldCache: OLD_CACHE }, { timeout: 15000 });
  await page.goto(base, { waitUntil: 'networkidle' });
  check('stale client accepts and activates the bypass worker', await page.evaluate(() => window.shellVersion === 'new' && !!navigator.serviceWorker.controller));

  for (const path of ['video', 'video/home', 'video/home/']) {
    const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    const expected = path === 'video' ? 'Gallery index' : 'Garden video player';
    check(`upgraded worker bypasses /${path}`, response?.ok() && await page.locator('h1').textContent() === expected
      && await page.evaluate(() => !!navigator.serviceWorker.controller));
  }
  const media = await page.evaluate(async () => {
    const response = await fetch('/video/home.mp4', { headers: { Range: 'bytes=0-1023' } });
    return { status: response.status, type: response.headers.get('content-type'), range: response.headers.get('content-range'), bytes: (await response.arrayBuffer()).byteLength };
  });
  check('upgraded worker leaves MP4 ranges to the static server', media.status === 206 && media.type === 'video/mp4' && media.bytes === 1024, JSON.stringify(media));
  const cacheState = await page.evaluate(async cacheName => {
    const keys = await caches.keys();
    const matches = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      for (const path of ['/video/', '/video/home/', '/video/home.mp4']) if (await cache.match(path, { ignoreVary: true })) matches.push(`${key}:${path}`);
    }
    const generated = await caches.open(cacheName);
    const cachedShell = await generated.match('/index.html', { ignoreVary: true });
    const shell = await cachedShell?.text();
    return { keys, matches, shellIsNew: !!shell?.includes('Garden new application') };
  }, NEW_CACHE);
  check('gallery HTML/media never enter generated caches; app shell remains fresh', cacheState.keys.includes(NEW_CACHE)
    && cacheState.matches.length === 0 && cacheState.shellIsNew, JSON.stringify(cacheState));

  await context.setOffline(true);
  offline = true;
  await page.goto(base, { waitUntil: 'networkidle' });
  const offlineResult = await page.evaluate(async () => {
    const app = await fetch('/index.html', { cache: 'no-cache' });
    let video;
    try {
      const response = await fetch('/video/home/', { cache: 'no-store' });
      video = { status: response.status, text: (await response.text()).slice(0, 80) };
    } catch (error) { video = { error: error.name }; }
    return { app: (await app.text()).includes('Garden new application'), video };
  });
  check('offline app survives while bypassed gallery cannot fall back to it', offlineResult.app && offlineResult.video.error === 'TypeError', JSON.stringify(offlineResult));
} finally {
  if (offline) await context.setOffline(false);
  await context.close();
  await new Promise(resolve => server.close(resolve));
  await rm(parent, { recursive: true, force: true });
}
console.log(failures ? `${failures} video PWA check(s) failed` : 'All video PWA checks passed');
process.exit(failures ? 1 : 0);
