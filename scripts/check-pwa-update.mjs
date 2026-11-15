// PWA upgrade regression with real Chromium workers and persistent HTTP/Cache Storage profiles.
//   node scripts/check-pwa-update.mjs
// No dev server or feature build is needed; the fixture uses the production worker generator.
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { createServiceWorkerSource } from '../vite.config.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const OLD_CACHE = 'garden-oldtest';
const NEW_CACHE = 'garden-newtest';
const AUDIO_CACHE = 'garden-winddown-audio-v1';
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};

function html(version) {
  return `<!doctype html><html><head><script type="module" crossorigin src="./assets/shell-${version}hash.js"></script></head><body>fixture</body></html>`;
}
function script(version) {
  return `document.body.dataset.shell = '${version}'; window.shellVersion = '${version}';
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {}));`;
}
function legacyServiceWorker(version) {
  // The shipped worker before the stale-HTML fix. Kept here to exercise migration of actual old clients.
  return `const CACHE = 'garden-${version}test';
const FILES = ['./', 'index.html', 'assets/shell-${version}hash.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && /^garden-[a-z0-9]+$/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
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
}

async function makeFixture(parent, version, legacy) {
  const root = join(parent, version);
  await mkdir(join(root, 'assets'), { recursive: true });
  const files = ['./', 'index.html', `assets/shell-${version}hash.js`];
  const source = legacy && version === 'old'
    ? legacyServiceWorker(version)
    : createServiceWorkerSource(files, `${version}test`);
  await Promise.all([
    writeFile(join(root, 'index.html'), html(version)),
    writeFile(join(root, `assets/shell-${version}hash.js`), script(version)),
    writeFile(join(root, 'sw.js'), source),
  ]);
  return root;
}

async function cachedShell(page, cacheName) {
  return page.evaluate(async name => {
    const cache = await caches.open(name);
    const response = await cache.match('index.html', { ignoreVary: true });
    return response?.ok ? (await response.text()).match(/shell-(old|new)hash\.js/)?.[1] || 'unknown' : 'missing';
  }, cacheName);
}
async function activeShell(page) {
  return page.evaluate(() => ({
    version: window.shellVersion || 'not loaded',
    script: document.querySelector('script[type="module"]')?.src || 'missing',
    controlled: !!navigator.serviceWorker.controller,
  }));
}
async function waitForActivation(page) {
  let last;
  for (let attempt = 0; attempt < 150; attempt++) {
    last = await page.evaluate(async ({ oldCache, newCache }) => {
      const keys = await caches.keys();
      const registration = await navigator.serviceWorker.getRegistration();
      return {
        ready: keys.includes(newCache) && !keys.includes(oldCache) && registration?.active?.state === 'activated',
        keys,
        active: registration?.active?.state,
        installing: registration?.installing?.state,
        waiting: registration?.waiting?.state,
      };
    }, { oldCache: OLD_CACHE, newCache: NEW_CACHE });
    if (last.ready) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Replacement worker did not activate: ${JSON.stringify(last)}`);
}

async function upgradeScenario(browserParent, legacy) {
  const label = legacy ? 'legacy stale-HTML client' : 'fixed-to-fixed upgrade';
  const sandbox = await mkdtemp(join(browserParent, legacy ? 'legacy-' : 'future-'));
  const roots = { old: await makeFixture(sandbox, 'old', legacy), new: await makeFixture(sandbox, 'new', false) };
  let deployed = 'old';
  const requests = [];
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = normalize(join(roots[deployed], pathname));
    if (!file.startsWith(`${roots[deployed]}/`)) { res.writeHead(403); res.end(); return; }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      requests.push({ deployed, pathname, cacheControl: req.headers['cache-control'] || '', serviceWorker: req.headers['service-worker'] || '' });
      const cacheControl = pathname === '/index.html'
        ? (legacy && deployed === 'old' ? 'max-age=14400' : 'no-cache')
        : 'max-age=14400';
      res.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Last-Modified': info.mtime.toUTCString(),
        'Cache-Control': cacheControl,
        'Vary': 'Origin',
      });
      res.end(await readFile(file));
    } catch { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const profile = join(sandbox, 'profile');
  await mkdir(profile);
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 390, height: 844 },
  });
  const page = context.pages()[0] || await context.newPage();
  let offline = false;
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(async expected => (await caches.keys()).includes(expected), OLD_CACHE);
    check(`${label}: old shell starts controlled and cached`, (await activeShell(page)).version === 'old'
      && (await activeShell(page)).controlled && await cachedShell(page, OLD_CACHE) === 'old');
    await page.evaluate(async name => {
      const audio = await caches.open(name);
      await audio.put('/audio/offline-sentinel.mp3', new Response('audio survives'));
    }, AUDIO_CACHE);

    deployed = 'new';
    requests.length = 0;
    await page.goto(base, { waitUntil: 'networkidle' }); // Ordinary PWA launch, not a hard reload.
    await waitForActivation(page);
    const first = await activeShell(page);
    if (!legacy) check(`${label}: first online return loads new hashed JS`, first.version === 'new' && first.script.endsWith('/assets/shell-newhash.js'), JSON.stringify(first));
    check(`${label}: replacement worker precaches fresh HTML, not the legacy HTTP-cache entry`, await cachedShell(page, NEW_CACHE) === 'new',
      `cache=${await cachedShell(page, NEW_CACHE)}, displayed=${first.version}`);
    check(`${label}: sw.js update bypasses the live-style four-hour HTTP cache`, requests.some(r => r.pathname === '/sw.js' && r.serviceWorker === 'script'),
      JSON.stringify(requests.filter(r => r.pathname === '/sw.js')));

    if (legacy) await page.goto(base, { waitUntil: 'networkidle' });
    const returned = await activeShell(page);
    check(`${label}: next launch under the replacement worker uses new assets`, returned.version === 'new' && returned.script.endsWith('/assets/shell-newhash.js'), JSON.stringify(returned));
    const keysAfterUpgrade = await page.evaluate(() => caches.keys());
    check(`${label}: activation removes only the old generated shell`, keysAfterUpgrade.includes(NEW_CACHE) && !keysAfterUpgrade.includes(OLD_CACHE)
      && keysAfterUpgrade.includes(AUDIO_CACHE) && keysAfterUpgrade.length === 2, JSON.stringify(keysAfterUpgrade));

    await context.setOffline(true);
    offline = true;
    await page.goto(base, { waitUntil: 'load' });
    const offlineShell = await activeShell(page);
    check(`${label}: fresh offline launch uses the new installed shell`, offlineShell.version === 'new'
      && offlineShell.script.endsWith('/assets/shell-newhash.js') && offlineShell.controlled, JSON.stringify(offlineShell));
    const audio = await page.evaluate(async () => {
      const response = await fetch('/audio/offline-sentinel.mp3');
      return { ok: response.ok, body: await response.text() };
    });
    check(`${label}: custom audio remains readable offline`, audio.ok && audio.body === 'audio survives', JSON.stringify(audio));
  } finally {
    if (offline) await context.setOffline(false);
    await context.close();
    await new Promise(resolve => server.close(resolve));
    await rm(sandbox, { recursive: true, force: true });
  }
}

const parent = await mkdtemp('/tmp/opencode/garden-pwa-update-');
try {
  await upgradeScenario(parent, true);
  await upgradeScenario(parent, false);
} finally {
  await rm(parent, { recursive: true, force: true });
}
console.log(`\n${failures ? `${failures} PWA upgrade check(s) failed` : 'All PWA upgrade checks passed'}`);
process.exit(failures ? 1 : 0);
