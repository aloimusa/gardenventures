// Standalone visual harness only. The application does not import this module.
import * as THREE from 'three';
import {
  createMarketEnvironment,
  MARKET_ENVIRONMENT_BOUNDS,
  MARKET_ENVIRONMENT_CAMERAS,
} from './environment';

const params = new URLSearchParams(location.search);
const requestedView = params.get('view');
const view = requestedView === 'portal' || requestedView === 'mobile' ? requestedView : 'fullscreen';
const canvas = document.querySelector<HTMLCanvasElement>('#market-preview')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8ede3);
scene.fog = new THREE.Fog(0xe8ede3, 34, 70);
const environment = createMarketEnvironment();
scene.add(environment.group);

let camera: THREE.Camera;
function configureCamera(): void {
  const aspect = innerWidth / innerHeight;
  if (view === 'portal') {
    const setup = MARKET_ENVIRONMENT_CAMERAS.portal;
    const height = Math.max(setup.verticalSize, setup.minHorizontalSize / aspect);
    const result = new THREE.OrthographicCamera(-height * aspect / 2, height * aspect / 2,
      height / 2, -height / 2, setup.near, setup.far);
    result.position.set(setup.position[0], setup.position[1], setup.position[2]);
    result.lookAt(setup.target[0], setup.target[1], setup.target[2]);
    camera = result;
  } else {
    const setup = MARKET_ENVIRONMENT_CAMERAS[view];
    const result = new THREE.PerspectiveCamera(setup.fov, aspect, setup.near, setup.far);
    result.position.set(setup.position[0], setup.position[1], setup.position[2]);
    result.lookAt(setup.target[0], setup.target[1], setup.target[2]);
    camera = result;
  }
}

let meshDraws = 0;
let triangles = 0;
const usedGeometries = new Set<THREE.BufferGeometry>();
const usedMaterials = new Set<THREE.Material>();
environment.group.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  meshDraws++;
  const count = object instanceof THREE.InstancedMesh ? object.count : 1;
  triangles += (object.geometry.index ? object.geometry.index.count : object.geometry.getAttribute('position').count) / 3 * count;
  usedGeometries.add(object.geometry);
  const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
  objectMaterials.forEach((material) => usedMaterials.add(material));
});
environment.group.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(environment.group);
const stats = {
  view,
  meshDraws,
  triangles,
  geometries: usedGeometries.size,
  materials: usedMaterials.size,
  measuredBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  exportedBounds: MARKET_ENVIRONMENT_BOUNDS,
  renderCalls: 0,
  renderedTriangles: 0,
  instances: 0,
};
environment.group.traverse((object) => {
  if (object instanceof THREE.InstancedMesh) stats.instances += object.count;
});

function render(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  } else if (camera instanceof THREE.OrthographicCamera) {
    const aspect = innerWidth / innerHeight;
    const setup = MARKET_ENVIRONMENT_CAMERAS.portal;
    const height = Math.max(setup.verticalSize, setup.minHorizontalSize / aspect);
    camera.left = -height * aspect / 2;
    camera.right = height * aspect / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
  }
  environment.update?.(1.25);
  renderer.render(scene, camera);
  stats.renderCalls = renderer.info.render.calls;
  stats.renderedTriangles = renderer.info.render.triangles;
  document.documentElement.dataset.marketPreviewReady = 'true';
}

configureCamera();
render();
addEventListener('resize', () => {
  configureCamera();
  render();
});

Object.assign(window, { marketEnvironmentPreview: { environment, scene, renderer, stats, render } });
console.log('[market-environment]', JSON.stringify(stats));
