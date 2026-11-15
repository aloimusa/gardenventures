// Isolated visual/API checks for the three decorative redesign models.
// Start Vite, then: node scripts/check-plants-citrpack.mjs [baseUrl]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import * as THREE from 'three';
import { createMandarin } from '../src/venture/plants/mandarin.js';
import { createTomato } from '../src/venture/plants/tomato.js';
import { createEggplant } from '../src/venture/plants/eggplant.js';

const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const BASE = process.argv[2] || 'http://127.0.0.1:8815/';
const OUT = process.env.CITRPACK_SHOTS || '/tmp/opencode/plants-citrpack';
mkdirSync(OUT, { recursive: true });
const definitions = [
  { id: 'mandarin', create: createMandarin },
  { id: 'tomato', create: createTomato },
  { id: 'eggplant', create: createEggplant },
];
let failures = 0;
const check = (name, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const signature = group => JSON.stringify(group.children.map(function walk(object) {
  return [object.type, object.position.toArray(), object.quaternion.toArray(), object.scale.toArray(),
    object.instanceMatrix ? Array.from(object.instanceMatrix.array) : null, object.children.map(walk)];
}));
const metrics = new Map();

for (const { id, create } of definitions) {
  const reference = signature(create(7).group);
  check(`${id}: same seed is deterministic`, reference === signature(create(7).group));
  check(`${id}: a new seed varies the model`, reference !== signature(create(8).group));
  let maxWidth = 0, maxHeight = 0, maxDepth = 0, maxCalls = 0, maxTriangles = 0, resourcesDisposed = true;
  for (let seed = 0; seed < 100; seed++) {
    const model = create(seed);
    model.group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    maxWidth = Math.max(maxWidth, size.x); maxHeight = Math.max(maxHeight, size.y); maxDepth = Math.max(maxDepth, size.z);
    const geometries = new Set(), materials = new Set();
    let calls = 0, triangles = 0;
    model.group.traverse(object => {
      if (object.geometry) {
        geometries.add(object.geometry);
        calls++;
        triangles += ((object.geometry.index?.count || object.geometry.attributes.position.count) / 3) * (object.count || 1);
      }
      if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
    });
    maxCalls = Math.max(maxCalls, calls); maxTriangles = Math.max(maxTriangles, triangles);
    let disposedGeometries = 0, disposedMaterials = 0;
    for (const geometry of geometries) geometry.addEventListener('dispose', () => disposedGeometries++);
    for (const mat of materials) mat.addEventListener('dispose', () => disposedMaterials++);
    model.dispose(); model.dispose();
    resourcesDisposed &&= disposedGeometries === geometries.size && disposedMaterials === materials.size;
  }
  check(`${id}: bounds stay within 2.4 × 2.8 × 2.4 over 100 seeds`,
    maxWidth <= 2.4 && maxHeight <= 2.8 && maxDepth <= 2.4,
    `${maxWidth.toFixed(3)} × ${maxHeight.toFixed(3)} × ${maxDepth.toFixed(3)}`);
  check(`${id}: disposal is complete and idempotent`, resourcesDisposed);
  metrics.set(id, { maxCalls, maxTriangles });
  console.log(`--   ${id}: <=${maxCalls} mesh draws before shadow passes; <=${Math.round(maxTriangles)} triangles including leaf instances`);
}

const reviewURL = new URL('__plants-citrpack', BASE).href;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.route(reviewURL, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#edf1e8}canvas{display:block;width:100%;height:100%}
</style></head><body><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import { createMandarin } from '/src/venture/plants/mandarin.js';
import { createTomato } from '/src/venture/plants/tomato.js';
import { createEggplant } from '/src/venture/plants/eggplant.js';
import { mandarinIcon } from '/src/venture/plants/icons/mandarin.ts';
import { tomatoIcon } from '/src/venture/plants/icons/tomato.ts';
import { eggplantIcon } from '/src/venture/plants/icons/eggplant.ts';
const definitions = { mandarin: createMandarin, tomato: createTomato, eggplant: createEggplant };
const icons = { mandarin: mandarinIcon, tomato: tomatoIcon, eggplant: eggplantIcon };
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xedf1e8);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 50);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1.5); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xf8f5e9, 0x66705b, 2.1));
const key = new THREE.DirectionalLight(0xfff1d8, 3.2); key.position.set(-3, 6, 4);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -3; key.shadow.camera.right = 3;
key.shadow.camera.top = 4; key.shadow.camera.bottom = -2; key.shadow.normalBias = 0.025; scene.add(key);
const fill = new THREE.DirectionalLight(0xc8dded, 1.0); fill.position.set(4, 2, -3); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: 0x334332, opacity: 0.15 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.104; floor.receiveShadow = true; scene.add(floor);
let current = null;
window.showPlant = id => {
  if (current) { scene.remove(current.group); current.dispose(); }
  current = definitions[id](7); scene.add(current.group);
  const targetY = id === 'eggplant' ? 0.79 : 1.01;
  camera.position.set(2.8, targetY + 1.3, 4.8); camera.lookAt(0, targetY, 0);
  renderer.render(scene, camera);
  let calls = 0, triangles = 0;
  current.group.traverse(object => { if (object.isMesh) { calls++; triangles += ((object.geometry.index?.count || object.geometry.attributes.position.count) / 3) * (object.count || 1); } });
  return { calls, triangles };
};
window.showIcons = () => {
  current?.dispose(); current = null; renderer.dispose();
  document.body.innerHTML = '<main style="height:100%;display:flex;align-items:center;justify-content:center;gap:34px">' +
    Object.values(icons).map(svg => '<div style="width:240px;height:240px">' + svg + '</div>').join('') + '</main>';
  for (const svg of document.querySelectorAll('svg')) { svg.style.width = '240px'; svg.style.height = '240px'; }
};
window.ready = true;
</script></body></html>` }));
await page.goto(reviewURL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.ready === true);
for (const { id } of definitions) {
  const rendered = await page.evaluate(species => window.showPlant(species), id);
  check(`${id}: isolated render reports non-empty geometry`, rendered.calls > 0 && rendered.triangles > 0, JSON.stringify(rendered));
  await page.screenshot({ path: `${OUT}/${id}.png`, animations: 'disabled' });
}
await page.evaluate(() => window.showIcons());
await page.screenshot({ path: `${OUT}/icons.png`, animations: 'disabled' });
check('isolated browser render has no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`Screenshots: ${OUT}`);
process.exitCode = failures ? 1 : 0;
