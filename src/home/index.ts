import * as THREE from 'three';
import { log, save, state, localDate, wateredToday, skipDay } from '../state';
import { createOrchidRig } from './orchidRig';
import type { RigPoint } from './rig';
import { mountMarket, type MarketHandle } from '../market';
import { ORNAMENTS, ornamentName, type OrnamentId } from '../market/model';

const FLOW_MS = 1_000;       // the can is immediate; water starts only after this long
const HOLD_MS = 5_000;       // a complete watering takes the whole five-second hold
const TEXT = {
  help: 'Hold to water. The can appears right away; water starts after 1 second. Keep holding for 5 seconds.',
  guidance: 'Hold to water',
  aria: 'Hold to water your plant. Water starts after 1 second. Keep holding for 5 seconds.',
};

export interface HomeHandle {
  setVisible(v: boolean): void;
  setPageVisible(v: boolean): void;
  cancelHold(): void;
  refresh(): void;
}

export function mountHome(pane: HTMLElement, opts: { onChange(): void; onSkipDay?(): void }): HomeHandle {
  const head = pane.querySelector('.head')!;
  head.insertAdjacentHTML('beforeend', `<p class="sub" id="home-water-help">${TEXT.help}</p>`);
  pane.insertAdjacentHTML('afterbegin', `<div class="watered-status" role="note" tabindex="-1" aria-label="Watered today. No need to water today." hidden>Watered today</div><div class="watered-top-anchor" aria-hidden="true"></div><div class="stage" role="button" tabindex="0" aria-label="${TEXT.aria}" aria-describedby="home-water-help" aria-keyshortcuts="Space Enter"></div>`);
  // Demo control: the calendar only moves when asked, so a day can be skipped from Home as well as from Toolkit.
  pane.insertAdjacentHTML('beforeend', `<button class="home-skip-day" type="button" aria-label="Skip day: advance the demo to the next day">Skip day <span aria-hidden="true">→</span></button>`);
  const skipButton = pane.querySelector<HTMLButtonElement>('.home-skip-day')!;
  for (const type of ['pointerdown', 'pointerup', 'touchstart', 'keydown'] as const) skipButton.addEventListener(type, e => e.stopPropagation());
  skipButton.addEventListener('click', e => { e.stopPropagation(); skipDay(); opts.onSkipDay?.(); });
  const status = pane.querySelector<HTMLElement>('.watered-status')!;
  const statusTopAnchor = pane.querySelector<HTMLElement>('.watered-top-anchor')!;
  pane.insertAdjacentHTML('beforeend', `<div class="water" role="progressbar" aria-label="${TEXT.aria}" aria-describedby="home-water-help" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0" aria-valuetext="0 of 5 seconds. Keep holding."><span class="water-label"></span></div><p class="sr" aria-live="polite"></p>`);
  const stage = pane.querySelector<HTMLElement>('.stage')!;
  const pill = pane.querySelector<HTMLElement>('.water')!;
  const pillLabel = pill.querySelector<HTMLElement>('.water-label')!;
  const live = pane.querySelector<HTMLElement>('p.sr')!;
  pane.insertAdjacentHTML('beforeend', `<div class="home-ornaments"><button class="home-ornament-toggle" type="button" aria-expanded="false" aria-controls="home-ornament-menu"><span class="home-ornament-icon" aria-hidden="true"></span></button><div class="home-ornament-menu" id="home-ornament-menu" role="dialog" aria-modal="false" aria-label="Choose an ornament" hidden inert><span class="home-ornament-status" aria-live="polite"></span><label class="sr" for="home-ornament-choice">Owned ornaments</label><select id="home-ornament-choice" class="home-ornament-choice" aria-label="Choose an owned ornament"></select><button class="home-ornament-place" type="button">Place ornament</button><button class="home-ornament-close" type="button" aria-label="Close ornament chooser">Close</button></div></div>`);
  const ornamentDock = pane.querySelector<HTMLElement>('.home-ornaments')!;
  const ornamentMenu = ornamentDock.querySelector<HTMLElement>('.home-ornament-menu')!;
  const ornamentToggle = ornamentDock.querySelector<HTMLButtonElement>('.home-ornament-toggle')!;
  const ornamentIcon = ornamentToggle.querySelector<HTMLElement>('.home-ornament-icon')!;
  const ornamentStatus = ornamentDock.querySelector<HTMLElement>('.home-ornament-status')!;
  const ornamentChoice = pane.querySelector<HTMLSelectElement>('.home-ornament-choice')!;
  const ornamentPlace = pane.querySelector<HTMLButtonElement>('.home-ornament-place')!;
  const ornamentMenuClose = ornamentMenu.querySelector<HTMLButtonElement>('.home-ornament-close')!;
  // Ornament status and picker actions are scoped to the floating menu dock.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;   // the garden rig's lights are tuned for this (scene fork)
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const rig = createOrchidRig();
  scene.add(rig.group);
  rig.update(0, 0);

  // Frame the plant and its potential can position. The can itself is hidden until a hold starts.
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
    camera.setViewOffset(w, h, w * 0.06, -h * 0.10, w, h); // plant sits a little left and low so the full spray stays in view
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    draw();
  }

  // ---- state and text
  function paintPill(): void {
    // Guidance exists only while today's first watering is needed. Optional repeats use the unlabelled stage.
    pill.hidden = wateredToday();
    pillLabel.textContent = TEXT.guidance;
    pill.setAttribute('aria-label', TEXT.aria);
    pill.setAttribute('aria-valuenow', '0');
    pill.setAttribute('aria-valuetext', '0 of 5 seconds. Keep holding.');
    pill.style.setProperty('--hold-progress', '0');
  }
  function paint(animateStatus = false): void {
    const done = wateredToday();
    status.hidden = !done;
    if (!done || reduced.matches) status.classList.remove('fresh');
    else if (animateStatus) {
      // Measure from the lower guidance slot to the real safe-area-aware arrival point before starting the move.
      const lowerTop = status.getBoundingClientRect().top;
      const travel = statusTopAnchor.getBoundingClientRect().top - lowerTop;
      status.style.setProperty('--status-travel', `${travel}px`);
      status.classList.add('fresh');
    }
    paintPill();
    rig.setWatered(done);
  }

  function acknowledgeWatered(): void {
    live.textContent = 'Watered today. No need to water today.';
  }
  // The completion indicator is passive too; programmatic focus only supplies a sensible keyboard-readback target.

  function complete(via: string, heldMs: number): void {
    if (wateredToday()) { acknowledgeWatered(); return; }
    state.wateredOn = localDate();
    save();
    log('watered', { via, heldMs, date: state.wateredOn });
    rig.celebrate();
    paint(true);
    live.textContent = 'Watered today. Your orchid shows a one-day growth preview.';
    opts.onChange();
  }

  // ---- press and hold
  type Hold = { id: number; t0: number; via: string; repeat: boolean; done: boolean; el: HTMLElement | null; key: string | null; lastSecond: number };
  let hold: Hold | null = null;
  let marketOpen = false;
  let market: MarketHandle;
  let ownedOrnaments: OrnamentId[] = [], equippedOrnament: OrnamentId | null = null, selectedOrnament: OrnamentId | null = null;

  function screenBox(): DOMRect {
    // The entire Home canvas is a hold target. Real controls sit above it and keep their own events/capture.
    const r = stage.getBoundingClientRect();
    return new DOMRect(r.left, r.top, r.width, r.height);
  }
  const horizontal = (x: number) => {
    const r = stage.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  function rigPoint(clientX: number, clientY: number): THREE.Vector3 {
    const r = stage.getBoundingClientRect();
    const p = new THREE.Vector3((clientX - r.left) / r.width * 2 - 1, 1 - (clientY - r.top) / r.height * 2, 0.5).unproject(camera);
    const ray = new THREE.Ray(camera.position, p.sub(camera.position).normalize());
    const at = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.3), new THREE.Vector3());
    return rig.group.worldToLocal(at ?? new THREE.Vector3(0, 1, 0.3));
  }

  function updateHold(elapsed: number, force = false): void {
    if (!hold) return;
    const second = Math.min(5, Math.floor(elapsed / 1000));
    pill.setAttribute('aria-valuenow', Math.min(5, elapsed / 1000).toFixed(2));
    pill.setAttribute('aria-valuetext', `${second} of 5 seconds. Keep holding.`);
    // Updated every visible frame, not once per displayed second: the readout itself is the five-second water fill.
    pill.style.setProperty('--hold-progress', String(Math.max(0, Math.min(1, elapsed / HOLD_MS))));
    if (!force && second === hold.lastSecond) return;
    hold.lastSecond = second;
    const message = elapsed < FLOW_MS ? TEXT.guidance : 'Watering';
    pillLabel.textContent = message;
    // Numeric time remains available to assistive technology through the progressbar, never as a visible counter.
    pill.setAttribute('aria-label', `${message}. Keep holding for five seconds.`);
  }

  function start(id: number, x: number, y: number, via: string, el: HTMLElement | null, key: string | null): boolean {
    if (hold || marketOpen) return false;
    hold = { id, t0: performance.now(), via, repeat: wateredToday(), done: false, el, key, lastSecond: -1 };
    rig.setHolding(true, rigPoint(x, y));
    rig.moveHold(horizontal(x));
    rig.setPouring(false);
    pill.classList.add('holding');
    updateHold(0, true);
    log('hold_start', { via, repeat: hold.repeat });
    kick();
    return true;
  }

  function settle(current: Hold, heldMs: number): void {
    if (current.done) return;                    // rAF and a subsequent release share this idempotent gate
    current.done = true;
    if (current.repeat) {
      // Optional play has the same 1s/5s choreography but cannot write state, growth or a daily completion event.
      live.textContent = 'Watered today.';
      return;
    }
    complete(current.via, Math.max(HOLD_MS, Math.round(heldMs)));
  }

  function end(reason: string, genuineRelease = false): void {
    if (!hold) return;
    const current = hold;
    const ms = Math.max(0, performance.now() - current.t0);
    // A real release is itself an authoritative clock reading. Cancellation, blur, lost capture and navigation
    // deliberately do not take this branch, even when their event arrives after five seconds.
    if (genuineRelease && ms >= HOLD_MS) settle(current, ms);
    hold = null;
    log('hold_end', { via: current.via, ms: Math.round(ms), completed: current.done, repeat: current.repeat, reason });
    rig.setPouring(false);
    rig.setHolding(false);
    pill.classList.remove('holding');
    paintPill();
    if (current.el) {
      try { if (current.el.hasPointerCapture(current.id)) current.el.releasePointerCapture(current.id); } catch { /* capture may already be gone */ }
    }
    if (current.done && current.via === 'key' && wateredToday()) status.focus({ preventScroll: true });
    kick();
  }

  function startPointer(e: PointerEvent, via: string): boolean {
    if (e.button !== 0 || !e.isPrimary) return false;
    const el = e.currentTarget as HTMLElement;
    if (!start(e.pointerId, e.clientX, e.clientY, via, el, null)) return false;
    try { el.setPointerCapture(e.pointerId); } catch { /* pointercancel will still clean up */ }
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  stage.addEventListener('pointerdown', e => {
    // The readout is pointer-transparent, so explicitly exclude its footprint: a tap on guidance must not look
    // like a phantom hold on the canvas underneath. All other visible Home stage points remain generous targets.
    const overReadout = [pill, status].some(el => {
      if (el.hidden) return false;
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (!overReadout) startPointer(e, 'plant');
  });
  // Capture normally retargets these to the stage. Window listeners are also the fallback for browsers or embedded
  // webviews that lose capture while a pointer moves over another element or outside the viewport.
  addEventListener('pointermove', e => {
    if (!hold || e.pointerId !== hold.id || hold.via === 'key') return;
    rig.moveHold(horizontal(e.clientX));
    e.preventDefault();
  }, { passive: false });
  addEventListener('pointerup', e => {
    if (!hold || e.pointerId !== hold.id || hold.via === 'key') return;
    e.preventDefault(); end('released', true);
  });
  addEventListener('pointercancel', e => {
    if (!hold || e.pointerId !== hold.id || hold.via === 'key') return;
    e.preventDefault(); end('cancelled');
  });
  stage.addEventListener('lostpointercapture', e => {
    if (hold && e.pointerId === hold.id) end('capture_lost');
  });
  stage.addEventListener('contextmenu', e => e.preventDefault());

  // The stage's single keyboard affordance mirrors its pointer hold. The passive readout has no focus/key handlers.
  const keyName = (e: KeyboardEvent) => e.key === 'Enter' ? 'Enter' : (e.key === ' ' || e.code === 'Space') ? 'Space' : null;
  stage.addEventListener('keydown', e => {
    const key = keyName(e);
    if (!key) return;
    e.preventDefault();
    if (e.repeat || hold) return;
    const r = stage.getBoundingClientRect();
    start(-1, r.left + r.width / 2, r.top + r.height * 0.55, 'key', null, key);
  });
  stage.addEventListener('keyup', e => {
    const key = keyName(e);
    if (!key) return;
    e.preventDefault();
    if (hold?.via === 'key' && hold.key === key) end('released', true);
  });
  stage.addEventListener('blur', () => { if (hold?.via === 'key') end('focus_lost'); });
  addEventListener('blur', () => end('window_blur'));

  let ornamentMenuOpen = false;
  function closeOrnamentMenu(restoreFocus = true): void {
    if (!ornamentMenuOpen) return;
    ornamentMenuOpen = false;
    ornamentToggle.setAttribute('aria-expanded', 'false');
    ornamentMenu.hidden = true;
    ornamentMenu.inert = true;
    if (restoreFocus) ornamentToggle.focus({ preventScroll: true });
  }

  function paintOrnaments(): void {
    if (marketOpen) closeOrnamentMenu(false);
    ornamentToggle.hidden = marketOpen;
    skipButton.hidden = marketOpen;
    const selected = selectedOrnament, shown = equippedOrnament ?? selected ?? ORNAMENTS[0].id;
    ornamentToggle.dataset.ornament = shown;
    ornamentToggle.setAttribute('aria-label', ownedOrnaments.length ? `Choose ornament. Current: ${ornamentName(shown)}` : 'Choose ornament. No owned ornaments yet');
    ornamentIcon.innerHTML = ORNAMENTS.find(item => item.id === shown)?.icon ?? ORNAMENTS[0].icon;
    ornamentChoice.innerHTML = ownedOrnaments.map(id => `<option value="${id}">${ornamentName(id)}</option>`).join('');
    if (selected && ownedOrnaments.includes(selected)) ornamentChoice.value = selected;
    ornamentChoice.hidden = ownedOrnaments.length === 0;
    ornamentChoice.disabled = ownedOrnaments.length === 0;
    ornamentPlace.hidden = ownedOrnaments.length === 0;
    ornamentPlace.disabled = !selected || selected === equippedOrnament;
    ornamentPlace.textContent = selected ? selected === equippedOrnament ? 'Placed' : 'Place' : 'Place ornament';
    ornamentPlace.setAttribute('aria-label', selected ? `${selected === equippedOrnament ? 'Placed' : 'Place'} ${ornamentName(selected)} on the orchid pot` : 'Place ornament');
    ornamentStatus.textContent = ownedOrnaments.length === 0 ? 'No ornaments owned yet'
      : equippedOrnament ? `${ornamentName(equippedOrnament)} on your pot` : 'Choose an owned ornament, then Place it.';
  }
  ornamentToggle.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (ornamentMenuOpen) { closeOrnamentMenu(); return; }
    if (marketOpen) return;
    ornamentMenuOpen = true;
    ornamentToggle.setAttribute('aria-expanded', 'true');
    ornamentMenu.hidden = false; ornamentMenu.inert = false;
    (ownedOrnaments.length ? ornamentChoice : ornamentMenuClose).focus({ preventScroll: true });
  });
  ornamentMenuClose.addEventListener('click', event => { event.stopPropagation(); closeOrnamentMenu(); });
  ornamentDock.addEventListener('pointerdown', event => event.stopPropagation());
  ornamentDock.addEventListener('pointerup', event => event.stopPropagation());
  document.addEventListener('pointerdown', event => {
    if (!ornamentMenuOpen || ornamentDock.contains(event.target as Node)) return;
    event.preventDefault(); event.stopPropagation();
    closeOrnamentMenu();
  }, true);
  document.addEventListener('keydown', event => {
    if (!ornamentMenuOpen || event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation();
    closeOrnamentMenu();
  });

  ornamentChoice.addEventListener('change', () => {
    selectedOrnament = ornamentChoice.value as OrnamentId;
    paintOrnaments();
  });
  ornamentPlace.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (!selectedOrnament || !ownedOrnaments.includes(selectedOrnament)) return;
    if (market.equip(selectedOrnament)) {
      live.textContent = `${ornamentName(selectedOrnament)} placed on your orchid pot.`;
      closeOrnamentMenu();
    }
  });

  market = mountMarket(pane, {
    onChange: opts.onChange,
    homeScene: scene,
    homeCamera: camera,
    // The Market renderer previews this exact live rig while Home's own renderer is suspended in the expanded world.
    updateHome: (dt, time) => rig.update(dt, time),
    onWorldChange(open) {
      marketOpen = open;
      if (open) end('portal');
      stage.inert = open;
      stage.tabIndex = open ? -1 : 0;
      status.tabIndex = -1; // Home's completed indicator stays passive in either world.
      closeOrnamentMenu(false);
      ornamentToggle.hidden = open;
      if (!open) paintOrnaments();
      kick(); draw();
    },
    onOrnaments(owned, equipped, newest = null) {
      ownedOrnaments = owned;
      equippedOrnament = equipped;
      if (newest) selectedOrnament = newest;
      else if (!selectedOrnament || !owned.includes(selectedOrnament)) selectedOrnament = equipped ?? owned.at(-1) ?? null;
      rig.setOrnament(equipped);
      paintOrnaments();
      kick();
    },
  });

  // ---- render loop: only while Home is the visible pane and the page is visible
  let visible = true, pageVisible = document.visibilityState === 'visible', raf = 0, last = 0, t = 0;
  const running = () => visible && pageVisible && !marketOpen;
  function draw(): void { renderer.render(scene, camera); }
  function frame(now: number): void {
    raf = 0;
    if (!running()) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    if (!reduced.matches) t += dt;
    if (hold) {
      const elapsed = Math.max(0, now - hold.t0);
      if (!hold.done && elapsed >= HOLD_MS) {
        settle(hold, elapsed);
        end('completed');
      } else {
        rig.setPouring(elapsed >= FLOW_MS);
        updateHold(elapsed);
      }
    }
    rig.update(dt, t);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function kick(): void { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } }

  // Focused Home checks use the real rendered rig, not a parallel test implementation.
  (globalThis as any).garden.hitBox = () => screenBox().toJSON();
  (globalThis as any).garden.homeSnapshot = () => {
    const snapshot = rig.snapshot();
    const r = stage.getBoundingClientRect();
    const toScreen = (point: RigPoint): RigPoint => {
      const p = rig.group.localToWorld(new THREE.Vector3(...point)).project(camera);
      return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height, p.z];
    };
    return { ...snapshot, canScreen: toScreen(snapshot.canPosition), originScreen: toScreen(snapshot.canOrigin),
      arcScreen: toScreen(snapshot.arcPosition), spoutScreen: toScreen(snapshot.spoutPosition),
      handleScreen: toScreen(snapshot.handlePosition), waterTargetScreen: toScreen(snapshot.waterTarget),
      holding: !!hold, heldMs: hold ? performance.now() - hold.t0 : 0,
      completed: hold?.done ?? false, reducedMotion: reduced.matches,
      world: market.isOpen() ? 'market' : 'home' };
  };

  new ResizeObserver(fit).observe(stage);
  paint(); fit(); kick();

  return {
    setVisible(v) { visible = v; market.setVisible(v); if (!v) { end('left'); market.cancelHold('left'); } kick(); },
    setPageVisible(v) { pageVisible = v; market.setPageVisible(v); if (!v) { end('hidden'); market.cancelHold('hidden'); } kick(); },
    cancelHold() { end('swipe'); market.cancelHold('swipe'); },
    refresh() { rig.refresh(); paint(); market.refresh(); kick(); },
  };
}
