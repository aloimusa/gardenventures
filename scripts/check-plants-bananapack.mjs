// Isolated visual and geometry checks for the new banana/apple/mango botanical pack.
// Run: node scripts/check-plants-bananapack.mjs
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as THREE from 'three';
import { createBanana } from '../src/venture/plants/banana.js';
import { createApple } from '../src/venture/plants/apple.js';
import { createMango } from '../src/venture/plants/mango.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const factories = { banana: createBanana, apple: createApple, mango: createMango };
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) failures.push(message);
};

for (const [species, create] of Object.entries(factories)) {
  for (const seed of [1, 7, 42]) {
    const model = create(seed);
    model.group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    let finite = true, meshes = 0;
    const geometries = new Set(), materials = new Set();
    model.group.traverse(object => {
      if (!object.isMesh) return;
      meshes++;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      for (const value of object.geometry.attributes.position.array) finite &&= Number.isFinite(value);
    });
    check(finite && size.x <= 2.48 && size.y <= 2.8 && size.z <= 2.48,
      `${species} seed ${seed}: finite geometry, ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
    let geometryDisposals = 0, materialDisposals = 0;
    for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
    for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
    model.dispose();
    model.dispose();
    check(geometryDisposals === geometries.size && materialDisposals === materials.size,
      `${species} seed ${seed}: disposes ${geometries.size} geometries and ${materials.size} materials exactly once (${meshes} meshes)`);
  }
}

const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#e9eee6}
  body{display:grid;place-items:center}canvas{display:block;width:640px;height:700px}
  #icons{display:flex;align-items:center;justify-content:center;gap:48px;padding:48px}#icons svg{width:160px;height:160px}
</style></head><body><script type="module">
import * as THREE from 'three';
import { createBanana } from '/src/venture/plants/banana.js';
import { createApple } from '/src/venture/plants/apple.js';
import { createMango } from '/src/venture/plants/mango.js';
import { bananaIcon } from '/src/venture/plants/icons/banana.ts';
import { appleIcon } from '/src/venture/plants/icons/apple.ts';
import { mangoIcon } from '/src/venture/plants/icons/mango.ts';
const species = new URLSearchParams(location.search).get('species') || 'icons';
if (species === 'icons') {
  const icons = document.createElement('div'); icons.id = 'icons';
  icons.innerHTML = bananaIcon + appleIcon + mangoIcon; document.body.append(icons);
  window.__packReady = true;
} else {
  const create = { banana: createBanana, apple: createApple, mango: createMango }[species];
  const model = create(7);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe9eee6);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(1.5); renderer.setSize(640, 700);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xf5f7e9, 0x69705a, 2.1));
  const sun = new THREE.DirectionalLight(0xfff1d8, 3.1); sun.position.set(-3.5, 6, 5);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 16 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.018; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdce9e3, 0.65); fill.position.set(4, 2.5, -5); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x56604d, opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.008; floor.receiveShadow = true; scene.add(floor);
  scene.add(model.group); model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const targetY = (bounds.min.y + bounds.max.y) * 0.5;
  const camera = new THREE.OrthographicCamera(-1.315, 1.315, 1.44, -1.44, 0.1, 50);
  camera.position.set(4.2, targetY + 1.68, 7.5); camera.lookAt(0, targetY, 0);
  renderer.render(scene, camera);
  window.__pack = { model, scene, camera, renderer, bounds };
  window.__packReady = true;
}
</script></body></html>`;

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'isolated-bananapack-preview',
    configureServer(vite) {
      vite.middlewares.use('/__bananapack', async (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end(await vite.transformIndexHtml('/__bananapack', pageHtml));
      });
    },
  }],
});
await server.listen();
const address = server.httpServer.address();
const base = `http://127.0.0.1:${address.port}/__bananapack`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 680, height: 740 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
for (const species of Object.keys(factories)) {
  await page.goto(`${base}/?species=${species}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__packReady === true);
  const size = await page.evaluate(() => {
    const size = window.__pack.bounds.getSize(new window.__pack.model.group.position.constructor());
    return [size.x, size.y, size.z];
  });
  check(size.every(Number.isFinite), `${species}: browser render initialized (${size.map(value => value.toFixed(2)).join(' × ')})`);
  await page.screenshot({ path: `/tmp/opencode/${species}-pack.png` });
  console.log(`     screenshot /tmp/opencode/${species}-pack.png`);
}
await page.setViewportSize({ width: 680, height: 300 });
await page.goto(`${base}/?species=icons`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__packReady === true);
check(await page.locator('#icons svg').count() === 3, 'all three standalone SVG icons parse');
for (const [index, species] of Object.keys(factories).entries()) {
  const icon = page.locator('#icons svg').nth(index);
  check(await icon.getAttribute('aria-hidden') === 'true' && await icon.getAttribute('viewBox') === '0 0 64 64', `${species} icon: 64 × 64 and aria-hidden`);
}
await page.screenshot({ path: '/tmp/opencode/bananapack-icons.png' });
console.log('     screenshot /tmp/opencode/bananapack-icons.png');
check(errors.length === 0, `no browser errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
await server.close();
if (failures.length) process.exitCode = 1;
