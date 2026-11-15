import { defineConfig, type Plugin } from 'vite';

export function createServiceWorkerSource(list: string[], version: string): string {
  return `// generated at build; precaches the shell
const CACHE = 'garden-${version}';
const FILES = ${JSON.stringify(list)};
// A returning PWA can have a previously cacheable index.html in the HTTP cache. Never install that stale shell.
const PRECACHE = FILES.map(file => new Request(file, { cache: 'no-cache' }));
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
// Activation follows a successful install. Remove only prior generated shells, never custom media caches.
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && /^garden-[a-z0-9]+$/.test(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  const url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== location.origin) return;
  // The static gallery owns its HTML and media. Let the network/server handle byte ranges and
  // directory indexes instead of caching them or replacing a video page with the app shell.
  const scopePath = new URL(self.registration.scope).pathname;
  const scopedPath = url.pathname.startsWith(scopePath)
    ? url.pathname.slice(scopePath.length)
    : url.pathname.slice(1);
  if (scopedPath === 'video' || scopedPath.startsWith('video/')) return;
  if (r.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        // Revalidate even when an older install left a fresh-for-hours HTML response in the HTTP cache.
        const res = await fetch(r, { cache: 'no-cache' });
        if (res.ok) {
          try {
            const cache = await caches.open(CACHE);
            await cache.put('index.html', res.clone());
          } catch { /* A quota/cache failure must not hide a successful network response. */ }
        }
        return res;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('index.html', { ignoreVary: true })) || Response.error();
      }
    })());
    return;
  }
  // Vite serves Vary: Origin. Module/CSS requests carry Origin; pre-cache requests do not.
  e.respondWith(caches.match(r, { ignoreVary: true }).then(hit => hit || fetch(r)));
});
`;
}

// Publishes the existing rendered clips after Vite has emitted the application shell.
// The gallery is deliberately absent from the shell pre-cache; sw.js also bypasses it at fetch time.
function videoGallery(): Plugin {
  let outDir = '';
  return {
    name: 'garden-video-gallery',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir.startsWith('/') ? config.build.outDir : `${config.root}/${config.build.outDir}`; },
    async closeBundle() {
      const { buildVideoGallery } = await import('./scripts/build-video-gallery.mjs');
      await buildVideoGallery({ outDir });
    },
  };
}

// Writes dist/sw.js with the list of every built file, so the service worker can precache the whole shell
// (hashed assets included) on install and the app reloads offline after one online visit.
function serviceWorker(): Plugin {
  return {
    name: 'garden-sw',
    apply: 'build',
    generateBundle(_o, bundle) {
      const files = Object.keys(bundle).filter(f => !f.endsWith('.map'));
      const extra = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
        'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg'];
      const list = [...new Set([...extra, ...files])];
      const src = createServiceWorkerSource(list, Date.now().toString(36));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1', port: 8815, strictPort: true, allowedHosts: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8817', changeOrigin: false } },
  },
  preview: { host: '127.0.0.1', port: 8816, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  plugins: [videoGallery(), serviceWorker()],
});
