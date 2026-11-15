// Isolated checks and direct renders for the three new presentation-only plant models.
// Does not import or change Venture's application integration.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createServer } from 'vite';
import { createStrawberry } from '../src/venture/plants/strawberry.js';
import { createBlueberry } from '../src/venture/plants/blueberry.js';
import { createPear } from '../src/venture/plants/pear.js';
import { strawberryIcon } from '../src/venture/plants/icons/strawberry.ts';
import { blueberryIcon } from '../src/venture/plants/icons/blueberry.ts';
import { pearIcon } from '../src/venture/plants/icons/pear.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = '/tmp/opencode';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const definitions = [
  { id: 'strawberry', create: createStrawberry, icon: strawberryIcon },
  { id: 'blueberry', create: createBlueberry, icon: blueberryIcon },
  { id: 'pear', create: createPear, icon: pearIcon },
];

function measure(group) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const geometries = new Set();
  const materials = new Set();
  let meshes = 0;
  let triangles = 0;
  let finite = true;
  group.traverse(object => {
    if (!object.geometry) return;
    meshes++;
    geometries.add(object.geometry);
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      if (!Number.isFinite(positions.getX(i)) || !Number.isFinite(positions.getY(i)) || !Number.isFinite(positions.getZ(i))) finite = false;
    }
    const copies = object.isInstancedMesh ? object.count : 1;
    const vertices = object.geometry.index ? object.geometry.index.count : positions.count;
    triangles += vertices / 3 * copies;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  return { bounds, size, geometries, materials, meshes, triangles, finite };
}

function fingerprint(group) {
  group.updateMatrixWorld(true);
  const parts = [];
  group.traverse(object => {
    if (!object.geometry) return;
    parts.push(object.type, ...object.matrixWorld.elements);
    parts.push(...object.geometry.attributes.position.array);
    if (object.isInstancedMesh) parts.push(...object.instanceMatrix.array);
  });
  let hash = 2166136261;
  for (const value of parts) {
    const text = Number.isFinite(value) ? value.toFixed(6) : String(value);
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16);
}

for (const definition of definitions) {
  const source = await readFile(new URL(`../src/venture/plants/${definition.id}.js`, import.meta.url), 'utf8');
  check(`${definition.id}: independent Three module with no unseeded randomness`,
    source.includes("import * as THREE from 'three'") && !source.includes('Math.random') && !source.includes('./shared'));
  const boundsReports = [];
  let sameSeed = true;
  let variedSeeds = true;
  let cleanDisposal = true;
  let lastStats = null;
  for (const seed of [0, 1, 7, 42, 999, 4294967295]) {
    const model = definition.create(seed);
    const stats = measure(model.group);
    lastStats = stats;
    const exactKeys = Object.keys(model).sort().join(',') === 'dispose,group';
    sameSeed &&= exactKeys && model.group.isGroup && typeof model.dispose === 'function';
    boundsReports.push({ seed, x: stats.size.x, y: stats.size.y, z: stats.size.z });
    sameSeed &&= stats.finite && stats.size.x <= 2.4 && stats.size.y <= 2.8 && stats.size.z <= 2.4;

    const repeated = definition.create(seed);
    sameSeed &&= fingerprint(model.group) === fingerprint(repeated.group);
    const different = definition.create(seed + 101);
    variedSeeds &&= fingerprint(model.group) !== fingerprint(different.group);
    repeated.dispose();
    different.dispose();

    const scene = new THREE.Scene();
    scene.add(model.group);
    let geometryDisposals = 0;
    let materialDisposals = 0;
    for (const geometry of stats.geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
    for (const material of stats.materials) material.addEventListener('dispose', () => materialDisposals++);
    model.dispose();
    model.dispose();
    cleanDisposal &&= geometryDisposals === stats.geometries.size && materialDisposals === stats.materials.size && !model.group.parent;
  }
  check(`${definition.id}: exact API, finite deterministic geometry and tasteful per-seed variation`, sameSeed && variedSeeds,
    `meshes=${lastStats.meshes}, geometries=${lastStats.geometries.size}, materials=${lastStats.materials.size}`);
  check(`${definition.id}: bounds <= 2.4 × 2.8 × 2.4 across six seeds`, boundsReports.every(r => r.x <= 2.4 && r.y <= 2.8 && r.z <= 2.4),
    boundsReports.map(r => `${r.seed}:${r.x.toFixed(2)}/${r.y.toFixed(2)}/${r.z.toFixed(2)}`).join(' '));
  check(`${definition.id}: all owned resources disposed exactly once, detached and idempotent`, cleanDisposal);
  console.log(`     ${definition.id} complexity: ${lastStats.meshes} mesh draws, ${lastStats.triangles.toLocaleString()} triangles (including instances)`);
  check(`${definition.id}: inline standalone 64 × 64 fruit SVG`,
    definition.icon.includes('viewBox="0 0 64 64"') && definition.icon.trim().startsWith('<svg')
      && !/<title|<text|aria-label|role=/.test(definition.icon));
}

const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No isolated review server port');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 650 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__berrypack-review', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:#f2eee4;color:#3e4c3c;font-family:system-ui,sans-serif}main{padding:12px}
      .plant-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.plant-card{overflow:hidden;border:1px solid #d9ddcd;border-radius:18px;background:linear-gradient(#f9f7ef,#e4ead7);text-align:center;box-shadow:0 4px 14px #46533b12}
      .plant-card h2{font-size:12px;margin:11px 0 0}.plant-card canvas{display:block;width:100%;height:230px}.closeup canvas{height:370px}.closeup h2{font-size:17px}
      .icon-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.icon-card{padding:14px 6px;border-radius:18px;background:#fffdfa;border:1px solid #e3e0d6;text-align:center}.icon-card h2{font-size:13px;margin:0 0 12px}.harvest{display:flex;align-items:center;justify-content:center;gap:5px;margin:7px 0;font-weight:750;font-size:18px}.harvest.small{font-size:13px}.harvest.medium{font-size:16px}.harvest svg{display:block;width:24px;height:24px}.medium svg{width:32px;height:32px}.large svg{width:48px;height:48px}.note{text-align:center;font-size:11px;color:#78816f;margin:10px 0 0}
    </style></head><body><main><div id="content"></div></main></body></html>`,
  }));
  await page.goto(`${origin}/__berrypack-review`);
  await page.evaluate(async () => {
    const [three, strawberry, blueberry, pear, strawberryIcon, blueberryIcon, pearIcon] = await Promise.all([
      import('/node_modules/three/build/three.module.js'),
      import('/src/venture/plants/strawberry.js'),
      import('/src/venture/plants/blueberry.js'),
      import('/src/venture/plants/pear.js'),
      import('/src/venture/plants/icons/strawberry.ts'),
      import('/src/venture/plants/icons/blueberry.ts'),
      import('/src/venture/plants/icons/pear.ts'),
    ]);
    window.review = {
      THREE: three,
      models: { strawberry: strawberry.createStrawberry, blueberry: blueberry.createBlueberry, pear: pear.createPear },
      icons: { strawberry: strawberryIcon.strawberryIcon, blueberry: blueberryIcon.blueberryIcon, pear: pearIcon.pearIcon },
    };

    window.drawPlant = (parent, id, seed, closeup = false) => {
      const { THREE: T, models } = window.review;
      const card = document.createElement('section');
      card.className = `plant-card${closeup ? ' closeup' : ''}`;
      const title = document.createElement('h2');
      title.textContent = id[0].toUpperCase() + id.slice(1);
      card.append(title);
      parent.append(card);
      const model = models[id](seed);
      const scene = new T.Scene();
      scene.add(model.group);
      const width = card.clientWidth || (closeup ? 360 : 116);
      const height = closeup ? 370 : 230;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(2);
      renderer.setSize(width, height, false);
      renderer.setClearColor(0xffffff, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      card.append(renderer.domElement);
      scene.add(new T.HemisphereLight(0xfff9e9, 0x607056, 2.25));
      const key = new T.DirectionalLight(0xfff4d6, 3.25);
      key.position.set(-3, 5, 4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -3;
      key.shadow.camera.right = 3;
      key.shadow.camera.top = 4;
      key.shadow.camera.bottom = -1;
      key.shadow.normalBias = 0.018;
      scene.add(key);
      const fill = new T.DirectionalLight(0xcadcf2, 0.85);
      fill.position.set(4, 2, -3);
      scene.add(fill);

      const bounds = new T.Box3().setFromObject(model.group);
      const centre = bounds.getCenter(new T.Vector3());
      const size = bounds.getSize(new T.Vector3());
      const direction = new T.Vector3(3.4, id === 'strawberry' ? 2.6 : 2.15, 5).normalize();
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
      camera.position.copy(centre).addScaledVector(direction, 6);
      camera.lookAt(centre);
      camera.updateMatrixWorld(true);
      let maxX = 0;
      let maxY = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        maxX = Math.max(maxX, Math.abs(point.x));
        maxY = Math.max(maxY, Math.abs(point.y));
      }
      const aspect = width / height;
      const halfHeight = Math.max(maxY, maxX / aspect) * (closeup ? 1.08 : 1.13);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      // Preserve a static direct render; only the temporary review rig has a shadow receiver.
      window.reviewResources ||= [];
      window.reviewResources.push({ model, renderer, key, size });
      return card;
    };

    window.showPlants = closeup => {
      document.querySelector('#content').innerHTML = '';
      const grid = document.createElement('div');
      grid.className = closeup ? '' : 'plant-grid';
      document.querySelector('#content').append(grid);
      for (const id of ['strawberry', 'blueberry', 'pear']) window.drawPlant(grid, id, 7, closeup);
    };
    window.showIcons = () => {
      document.querySelector('#content').innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'icon-grid';
      document.querySelector('#content').append(grid);
      for (const id of ['strawberry', 'blueberry', 'pear']) {
        const card = document.createElement('section');
        card.className = 'icon-card';
        const title = document.createElement('h2');
        title.textContent = id[0].toUpperCase() + id.slice(1);
        card.append(title);
        for (const [className, amount] of [['small', 3], ['medium', 8], ['large', 12]]) {
          const row = document.createElement('div');
          row.className = `harvest ${className}`;
          row.innerHTML = `${window.review.icons[id]}<span>+${amount}</span>`;
          card.append(row);
        }
        grid.append(card);
      }
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = '24 px · 32 px · 48 px';
      document.querySelector('#content').append(note);
    };
  });

  await page.evaluate(() => window.showPlants(false));
  await page.screenshot({ path: `${OUT}/berrypack-plants-mobile.png`, fullPage: true });
  await page.evaluate(() => window.showIcons());
  await page.screenshot({ path: `${OUT}/berrypack-icons-mobile.png`, fullPage: true });
  for (const id of ['strawberry', 'blueberry', 'pear']) {
    await page.setViewportSize({ width: 390, height: 510 });
    await page.evaluate(species => {
      document.querySelector('#content').innerHTML = '';
      window.drawPlant(document.querySelector('#content'), species, 7, true);
    }, id);
    await page.locator('.plant-card').screenshot({ path: `${OUT}/berrypack-${id}.png` });
  }
  check('isolated Vite imports and direct WebGL renders complete without browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`screenshots: ${OUT}/berrypack-{plants-mobile,icons-mobile,strawberry,blueberry,pear}.png`);
} finally {
  if (browser) await browser.close();
  await server.close();
}

const failed = results.filter(ok => !ok).length;
console.log(`\n${results.length - failed}/${results.length} berry-pack checks passed`);
process.exit(failed ? 1 : 0);
