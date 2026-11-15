import * as THREE from 'three';
import { createMarketEnvironment } from './environment';
import { createMoss, type MossExpression } from './moss';

interface Options {
  pane: HTMLElement;
  world: HTMLElement;
  portal: HTMLElement;
  aperture: HTMLElement;
  homeScene: THREE.Scene;
  homeCamera: THREE.PerspectiveCamera;
  updateHome(dt: number, t: number): void;
}

export interface MarketVisualHandle {
  setOpen(open: boolean): void;
  setVisible(visible: boolean): void;
  setPageVisible(visible: boolean): void;
  setReduced(reduced: boolean): void;
  kick(): void;
  trade(): void;
  snapshot(): Record<string, unknown>;
}

/**
 * One low-power WebGL renderer draws both the expanded Market and the little destination portal. The destination is
 * copied immediately into a small 2D, arch-clipped canvas; no image assets, second renderer or duplicated orchid rig.
 */
export function createMarketVisual(opts: Options): MarketVisualHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.autoClear = false;
  renderer.domElement.className = 'market-render-layer';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.tabIndex = -1;
  opts.pane.appendChild(renderer.domElement);

  const portalCanvas = document.createElement('canvas');
  portalCanvas.className = 'wormhole-live-preview';
  portalCanvas.setAttribute('aria-hidden', 'true');
  portalCanvas.tabIndex = -1;
  opts.aperture.prepend(portalCanvas);
  const portalContext = portalCanvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;

  const marketScene = new THREE.Scene();
  const environment = createMarketEnvironment();
  const moss = createMoss();
  // Stand Moss in the open foreground beside the cart so the close camera never hides the trader behind its awning.
  moss.group.position.set(2.15, .065, 2.35);
  moss.group.rotation.y = -.20;
  moss.group.scale.multiplyScalar(1.28);
  marketScene.add(environment.group, moss.group);
  environment.group.updateMatrixWorld(true);
  moss.group.updateMatrixWorld(true);
  const cartObject = environment.stalls.getObjectByName('market-produce-cart') ?? environment.stalls;
  const foregroundBounds = new THREE.Box3().setFromObject(cartObject).union(new THREE.Box3().setFromObject(moss.group));
  const foregroundCenter = foregroundBounds.getCenter(new THREE.Vector3());
  const foregroundLookAt = foregroundCenter.clone().add(new THREE.Vector3(0, .15, 0));
  const foregroundSize = foregroundBounds.getSize(new THREE.Vector3());
  const foregroundCorners: THREE.Vector3[] = [];
  for (const x of [foregroundBounds.min.x, foregroundBounds.max.x])
    for (const y of [foregroundBounds.min.y, foregroundBounds.max.y])
      for (const z of [foregroundBounds.min.z, foregroundBounds.max.z]) foregroundCorners.push(new THREE.Vector3(x, y, z));

  // The hand-off itself is geometry, not a CSS illustration. It is rebuilt once and replayed for every allocation.
  const transfer = new THREE.Group();
  transfer.name = 'market-produce-handoff';
  const resources: { dispose(): void }[] = [];
  const material = (color: number, roughness = .85) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
    resources.push(value); return value;
  };
  const wicker = material(0xa67545), rimMat = material(0xd1a269);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(.54, .24, .38), wicker);
  resources.push(basket.geometry);
  basket.position.y = .12;
  transfer.add(basket);
  const basketRim = new THREE.Mesh(new THREE.BoxGeometry(.61, .055, .44), rimMat);
  resources.push(basketRim.geometry);
  basketRim.position.y = .265;
  transfer.add(basketRim);
  const produceColors = [0xe0b840, 0xc7544c, 0x799753, 0xe39338, 0x6c79a7];
  produceColors.forEach((color, index) => {
    const geometry = index % 2 ? new THREE.SphereGeometry(.075, 7, 5) : new THREE.CapsuleGeometry(.035, .12, 2, 6);
    const item = new THREE.Mesh(geometry, material(color));
    resources.push(geometry);
    item.position.set((index - 2) * .087, .32 + (index % 2) * .04, (index % 3 - 1) * .07);
    item.rotation.z = index % 2 ? 0 : .8;
    transfer.add(item);
  });
  transfer.visible = false;
  marketScene.add(transfer);

  const camera = new THREE.PerspectiveCamera(42, 1, .1, 110);
  const previewCamera = new THREE.OrthographicCamera(-7, 7, 5, -5, .1, 100);
  const homePreviewCamera = new THREE.PerspectiveCamera();
  let open = false, visible = true, pageVisible = document.visibilityState === 'visible';
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  let raf = 0, previous = 0, time = 0, tradeTime = -1, transferHideTimer = 0, expressionTimer = 0;
  let renderedFrames = 0, drawnAt = 0;
  let foregroundFit = { minX: -1, maxX: 1, minY: -1, maxY: 1, maxAbsX: 1, maxAbsY: 1,
    spanX: 2, spanY: 2, iterations: 0 };
  let fittedAspect = Number.NaN;

  function poseMain(aspect: number): void {
    if (Number.isFinite(fittedAspect) && Math.abs(aspect - fittedAspect) < .0001) return;
    fittedAspect = aspect;
    camera.aspect = Math.max(.1, aspect);
    camera.fov = 39;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const direction = new THREE.Vector3(.06, .26, 1).normalize();
    let distance = Math.max(.5, foregroundSize.y / (2 * tan) * 1.10,
      foregroundSize.x / (2 * tan * camera.aspect) * 1.20);
    let steps = 0;
    const apply = () => {
      camera.clearViewOffset();
      camera.position.copy(foregroundCenter).addScaledVector(direction, distance);
      camera.lookAt(foregroundLookAt);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    };
    const measure = () => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const corner of foregroundCorners) {
        const point = corner.clone().project(camera);
        if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
      if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
        return { minX: -1, maxX: 1, minY: -1, maxY: 1, maxAbsX: 1, maxAbsY: 1, spanX: 2, spanY: 2, iterations: steps };
      }
      return { minX, maxX, minY, maxY,
        maxAbsX: Math.max(Math.abs(minX), Math.abs(maxX)), maxAbsY: Math.max(Math.abs(minY), Math.abs(maxY)),
        spanX: maxX - minX, spanY: maxY - minY, iterations: steps };
    };
    const recenter = () => {
      foregroundFit = measure();
      if (![foregroundFit.minX, foregroundFit.maxX, foregroundFit.minY, foregroundFit.maxY].every(Number.isFinite)) return;
      // A normalized off-axis crop centers the actual object, rather than leaving Moss clipped at an arbitrary side.
      camera.setViewOffset(camera.aspect * 100, 100,
        (foregroundFit.minX + foregroundFit.maxX) / 2 * camera.aspect * 50,
        -(foregroundFit.minY + foregroundFit.maxY) / 2 * 50,
        camera.aspect * 100, 100);
      camera.updateMatrixWorld();
      foregroundFit = measure();
    };
    const fitSafety = () => {
      for (let iteration = 0; iteration < 4; iteration++) {
        foregroundFit = measure();
        if (foregroundFit.maxAbsX <= .88 && foregroundFit.maxAbsY <= .88) break;
        const scale = Math.max(foregroundFit.maxAbsX / .88, foregroundFit.maxAbsY / .88, 1.025);
        distance = scale > 100 || !Number.isFinite(scale) ? 12 : distance * scale;
        steps++;
        apply();
      }
      recenter();
    };

    apply();
    fitSafety();
    // Use nearly the whole available width but retain a measured best safe fallback if vertical fitting resists it.
    let best = { distance, fit: { ...foregroundFit } };
    for (let attempt = 0; attempt < 3 && foregroundFit.spanX < 1.70; attempt++) {
      const scale = Math.max(.35, foregroundFit.spanX / 1.72);
      if (!Number.isFinite(scale)) break;
      distance *= scale;
      apply(); fitSafety();
      if (foregroundFit.maxAbsX <= .88 && foregroundFit.maxAbsY <= .88 && foregroundFit.spanX > best.fit.spanX) {
        best = { distance, fit: { ...foregroundFit } };
      }
    }
    distance = best.distance;
    apply(); recenter();
    foregroundFit = { ...foregroundFit, iterations: steps };
  }

  function posePreview(aspect: number): void {
    const safeAspect = Math.max(.1, aspect);
    // A closer arch keeps Moss legible at the doubled portal size while retaining the cool plaza context.
    const vertical = Math.max(7.2, 7.8 / safeAspect);
    previewCamera.left = -vertical * safeAspect / 2;
    previewCamera.right = vertical * safeAspect / 2;
    previewCamera.top = vertical / 2;
    previewCamera.bottom = -vertical / 2;
    previewCamera.position.set(-5.2, 4.5, 10.5);
    previewCamera.lookAt(.3, 2.25, -2.6);
    previewCamera.updateProjectionMatrix();
    previewCamera.updateMatrixWorld();
  }

  function renderRegion(scene: THREE.Scene, regionCamera: THREE.Camera, rect: DOMRect, paneRect: DOMRect): void {
    const x = rect.left - paneRect.left, y = paneRect.bottom - rect.bottom;
    renderer.setViewport(x, y, rect.width, rect.height);
    renderer.setScissor(x, y, rect.width, rect.height);
    renderer.setScissorTest(true);
    renderer.render(scene, regionCamera);
  }

  function copyPortal(rect: DOMRect, paneRect: DOMRect): void {
    const ratio = renderer.getPixelRatio();
    const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
    if (portalCanvas.width !== width || portalCanvas.height !== height) {
      portalCanvas.width = width; portalCanvas.height = height;
    }
    const x = (rect.left - paneRect.left) * ratio;
    // Canvas pixel sources are top-left based even though WebGL's scissor viewport was bottom-left based.
    const y = (rect.top - paneRect.top) * ratio;
    portalContext.clearRect(0, 0, width, height);
    portalContext.drawImage(renderer.domElement, x, y, width, height, 0, 0, width, height);
  }

  function draw(): void {
    const paneRect = opts.pane.getBoundingClientRect();
    const width = opts.pane.clientWidth, height = opts.pane.clientHeight;
    if (!width || !height) return;
    const drawingWidth = Math.round(width * renderer.getPixelRatio()), drawingHeight = Math.round(height * renderer.getPixelRatio());
    if (renderer.domElement.width !== drawingWidth || renderer.domElement.height !== drawingHeight) renderer.setSize(width, height, false);
    const aperture = opts.aperture.getBoundingClientRect();
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);

    // Render the other world first, copy it, then replace the temporary scissored pixels with the expanded world.
    if (open) {
      homePreviewCamera.copy(opts.homeCamera);
      homePreviewCamera.clearViewOffset();
      homePreviewCamera.aspect = aperture.width / Math.max(1, aperture.height);
      homePreviewCamera.zoom = 1.55;
      homePreviewCamera.updateProjectionMatrix();
      renderRegion(opts.homeScene, homePreviewCamera, aperture, paneRect);
    } else {
      posePreview(aperture.width / Math.max(1, aperture.height));
      renderRegion(marketScene, previewCamera, aperture, paneRect);
    }
    copyPortal(aperture, paneRect);
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
    renderer.domElement.dataset.visible = String(open);
    if (open) {
      const sceneRect = opts.world.querySelector<HTMLElement>('.market-scene-wrap')!.getBoundingClientRect();
      poseMain(sceneRect.width / Math.max(1, sceneRect.height));
      renderRegion(marketScene, camera, sceneRect, paneRect);
      renderer.setScissorTest(false);
    }
    renderedFrames++;
    portalCanvas.dataset.reducedPreview = String(reduced);
    portalCanvas.dataset.renderedFrame = String(renderedFrames);
  }

  function animateTransfer(dt: number): void {
    if (tradeTime < 0) return;
    tradeTime += dt;
    const k = reduced ? 1 : Math.min(1, tradeTime / .9);
    transfer.visible = true;
    transfer.position.set(THREE.MathUtils.lerp(-1.25, .95, k), 1.0 + Math.sin(k * Math.PI) * .75,
      THREE.MathUtils.lerp(2.4, .85, k));
    transfer.rotation.set(.05, k * .8, -.12 + k * .18);
    transfer.scale.setScalar(1 - k * .18);
    if (k >= 1 && reduced) transfer.position.y = 1.35;
    if (k >= 1 && !reduced && tradeTime > 1.45) { transfer.visible = false; tradeTime = -1; }
  }

  function syncReducedPreference(): void {
    const next = reducedQuery.matches;
    if (reduced === next) return;
    reduced = next;
    previous = 0;
    clearTimeout(expressionTimer); clearTimeout(transferHideTimer);
    if (reduced) { moss.setExpression('calm'); transfer.visible = false; tradeTime = -1; }
    environment.update?.(time); moss.update(time);
  }

  function frame(now: number): void {
    raf = 0;
    syncReducedPreference();
    if (!visible || !pageVisible) return;
    // A tiny live arch never needs a second full-rate 141-draw-call scene. Cap it at 4 fps (30 fps expanded),
    // keeping Home's own precise hold/render loop light even on a software GPU.
    const minFrameMs = open ? 1000 / 30 : 250;
    if (drawnAt && now - drawnAt < minFrameMs) { raf = requestAnimationFrame(frame); return; }
    drawnAt = now;
    const dt = Math.min(.05, previous ? (now - previous) / 1000 : .016);
    previous = now;
    if (!reduced) time += dt;
    environment.update?.(time);
    moss.update(time);
    if (open) opts.updateHome(reduced ? 0 : dt, time);
    animateTransfer(reduced ? 0 : dt);
    draw();
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  function kick(): void {
    if (raf || !visible || !pageVisible) return;
    previous = 0;
    raf = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(kick);
  observer.observe(opts.pane); observer.observe(opts.aperture);
  environment.group.updateMatrixWorld(true);
  moss.group.updateMatrixWorld(true);
  let marketMeshes = 0, marketVertices = 0;
  marketScene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    marketMeshes++;
    marketVertices += mesh.geometry.attributes.position?.count ?? 0;
  });

  kick();
  return {
    setOpen(value) { if (open !== value) { open = value; opts.world.dataset.rendered = String(value); kick(); } },
    setVisible(value) { visible = value; if (!value) { cancelAnimationFrame(raf); raf = 0; } else kick(); },
    setPageVisible(value) { pageVisible = value; if (!value) { cancelAnimationFrame(raf); raf = 0; } else kick(); },
    setReduced(value) {
      reduced = value;
      cancelAnimationFrame(raf); raf = 0; previous = 0;
      clearTimeout(expressionTimer); clearTimeout(transferHideTimer);
      if (value) { moss.setExpression('calm'); transfer.visible = false; tradeTime = -1; }
      environment.update?.(time); moss.update(time);
      kick();
    },
    kick,
    trade() {
      clearTimeout(transferHideTimer);
      tradeTime = 0; transfer.visible = true;
      clearTimeout(expressionTimer);
      moss.setExpression('delighted' satisfies MossExpression);
      expressionTimer = window.setTimeout(() => { moss.setExpression('calm'); kick(); }, 2600);
      if (reduced) {
        animateTransfer(0);
        transferHideTimer = window.setTimeout(() => { transfer.visible = false; tradeTime = -1; kick(); }, 1100);
      }
      kick();
    },
    snapshot: () => {
      const project = (object: THREE.Object3D, local: [number, number, number]) => {
        const point = object.localToWorld(new THREE.Vector3(...local)).project(camera);
        return [(point.x + 1) / 2, (1 - point.y) / 2, point.z];
      };
      const cathedral = environment.cathedral ?? environment.group;
      const dome = cathedral.getObjectByName('central-green-dome') as THREE.Mesh | undefined;
      const domeMaterial = dome?.material as THREE.MeshStandardMaterial | undefined;
      return {
        renderer: 'three-webgl', dpr: renderer.getPixelRatio(), renderedFrames, open, reduced,
        cameraPosition: camera.position.toArray(), cameraTarget: foregroundLookAt.toArray(), cameraDistance: camera.position.distanceTo(foregroundCenter),
        foregroundSize: foregroundSize.toArray(), foregroundFit: { ...foregroundFit }, domeColor: domeMaterial?.color.getHexString() ?? null,
        marketMeshes, marketVertices, transferVisible: transfer.visible,
        portalCanvas: portalCanvas.width > 0 && portalCanvas.height > 0,
        mossMeshes: (() => { let count = 0; moss.group.traverse(object => { if ((object as THREE.Mesh).isMesh) count++; }); return count; })(),
        environmentChildren: environment.group.children.length,
        cathedralPresent: !!environment.cathedral,
        framing: { moss: project(moss.group, [0, .65, 0]), cart: project(environment.group, [0, 1.45, .9]),
          dome: project(cathedral, [0, 5.6, -.56]) },
      };
    },
  };
}
