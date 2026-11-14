import { defineConfig, type Plugin } from 'vite';

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
      const version = Date.now().toString(36);
      const src = `// generated at build; precaches the shell
const CACHE = 'garden-${version}';
const FILES = ${JSON.stringify(list)};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {   // network first, so a deploy shows on the next online load; cached shell offline
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put('index.html', c)); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(hit => hit || fetch(r)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 8815, strictPort: true, allowedHosts: true },
  preview: { host: '127.0.0.1', port: 8816, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  plugins: [serviceWorker()],
});
