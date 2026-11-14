import * as THREE from 'three';
import { log, save, state, localDate, wateredToday } from '../state';
import type { PlantRig } from './rig';
import { createPlaceholderRig } from './placeholder';

// THE one line that picks the rig (the scene fork swaps it).
const createRig: () => PlantRig = createPlaceholderRig;

const HOLD_MS = 600;        // a hold this long waters
const WANDER_PX = 56;       // a hold may wander this far from where it started...
const HIT_PAD_PX = 36;      // ...or anywhere inside the plant/can's screen box grown by this much
const TEXT = {
  before: 'Hold on your plant to tip the can. Once a day is all it takes.',
  after: 'Watered today.',
  btnBefore: 'Hold to water', btnAfter: 'Watered today',
  ariaBefore: 'Your plant. Not watered yet today. Press to water it.',
  ariaAfter: 'Your plant. Watered today, and doing well.',
};

export interface HomeHandle {
  setVisible(v: boolean): void;
  setPageVisible(v: boolean): void;
  cancelHold(): void;
  refresh(): void;
}

export function mountHome(pane: HTMLElement, opts: { onChange(): void }): HomeHandle {
  const head = pane.querySelector('.head')!;
  head.insertAdjacentHTML('beforeend', `<p class="sub"></p>`);
  const sub = head.querySelector<HTMLElement>('.sub')!;
  pane.insertAdjacentHTML('afterbegin', `<div class="stage" aria-hidden="true"></div>`);
  pane.insertAdjacentHTML('beforeend', `<button class="water" type="button"></button><p class="sr" aria-live="polite"></p>`);
  const stage = pane.querySelector<HTMLElement>('.stage')!;
  const btn = pane.querySelector<HTMLButtonElement>('.water')!;
  const live = pane.querySelector<HTMLElement>('.sr')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const rig = createRig();
  scene.add(rig.group);
  rig.update(0, 0);

  // frame the plant and can: fit their box, then nudge the view so the plant sits a little below the middle
  const box = new THREE.Box3();
  rig.hitTargets.forEach(o => box.expandByObject(o));
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  function fit(): void {
    const w = stage.clientWidth || 390, h = stage.clientHeight || 748;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(size.y / 2 / tan / 0.62, size.x / 2 / (tan * camera.aspect) / 0.78) + size.z;
    camera.position.set(centre.x, centre.y + d * 0.12, centre.z + d);
    camera.lookAt(centre);
    camera.setViewOffset(w, h, 0, -h * 0.07, w, h);
    camera.updateProjectionMatrix();
    draw();
  }

  // ---- state and text
  function paint(): void {
    const done = wateredToday();
    sub.textContent = done ? TEXT.after : TEXT.before;
    btn.textContent = done ? TEXT.btnAfter : TEXT.btnBefore;
    btn.setAttribute('aria-label', done ? TEXT.ariaAfter : TEXT.ariaBefore);
    rig.setWatered(done);
  }

  function complete(via: string, heldMs: number): void {
    if (wateredToday()) { log('water_again', { via, heldMs }); return; }   // plays, changes nothing, says nothing
    state.wateredOn = localDate();
    save();
    log('watered', { via, heldMs, date: state.wateredOn });
    rig.celebrate();
    paint();
    live.textContent = 'Watered today.';
    opts.onChange();
  }

  // ---- press and hold
  let hold: { id: number; x: number; y: number; t0: number; via: string; done: boolean } | null = null;

  function screenBox(): DOMRect {
    const r = stage.getBoundingClientRect();
    const b = new THREE.Box3(); rig.hitTargets.forEach(o => b.expandByObject(o));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < 8; k++) {
      const v = new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).project(camera);
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return new DOMRect(x0 - HIT_PAD_PX, y0 - HIT_PAD_PX, x1 - x0 + 2 * HIT_PAD_PX, y1 - y0 + 2 * HIT_PAD_PX);
  }
  const inside = (r: DOMRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  function start(e: PointerEvent, via: string): void {
    if (hold || e.button > 0) return;
    hold = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), via, done: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    rig.setPouring(true);
    btn.classList.add('holding');
    log('hold_start', { via });
    kick();
  }
  function end(reason: string): void {
    if (!hold) return;
    const ms = Math.round(performance.now() - hold.t0);
    log('hold_end', { via: hold.via, ms, completed: hold.done, reason });
    hold = null;
    rig.setPouring(false);
    btn.classList.remove('holding');
  }

  stage.addEventListener('pointerdown', e => { if (inside(screenBox(), e.clientX, e.clientY)) start(e, 'plant'); });
  btn.addEventListener('pointerdown', e => start(e, 'button'));
  for (const el of [stage, btn]) {
    el.addEventListener('pointermove', e => {
      if (!hold || e.pointerId !== hold.id) return;
      const far = Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > WANDER_PX;
      if (far && !(hold.via === 'plant' && inside(screenBox(), e.clientX, e.clientY))) end('wandered');
    });
    el.addEventListener('pointerup', e => { if (hold && e.pointerId === hold.id) end('released'); });
    el.addEventListener('pointercancel', e => { if (hold && e.pointerId === hold.id) end('cancelled'); });
  }
  btn.addEventListener('contextmenu', e => e.preventDefault());
  stage.addEventListener('contextmenu', e => e.preventDefault());

  // keyboard and assistive tech: Enter/Space (a click with detail 0) waters at once, with the can's pour shown
  btn.addEventListener('click', e => {
    if (e.detail !== 0) return;               // a pointer click is a hold, handled above
    complete('key', 0);
    rig.setPouring(true); kick();
    setTimeout(() => rig.setPouring(false), 900);
  });

  // ---- render loop: only while Home is the visible pane and the page is visible
  let visible = true, pageVisible = document.visibilityState === 'visible', raf = 0, last = 0, t = 0;
  const running = () => visible && pageVisible;
  function draw(): void { renderer.render(scene, camera); }
  function frame(now: number): void {
    raf = 0;
    if (!running()) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    if (!reduced.matches) t += dt;
    if (hold && !hold.done && now - hold.t0 >= HOLD_MS) { hold.done = true; complete(hold.via, Math.round(now - hold.t0)); }
    rig.update(dt, t);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function kick(): void { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } }

  new ResizeObserver(fit).observe(stage);
  paint(); fit(); kick();

  return {
    setVisible(v) { visible = v; if (!v) end('left'); kick(); },
    setPageVisible(v) { pageVisible = v; if (!v) end('hidden'); kick(); },
    cancelHold() { if (hold && !hold.done) end('swipe'); },
    refresh: paint,
  };
}
