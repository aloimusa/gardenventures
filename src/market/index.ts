import * as THREE from 'three';
import { daysSinceFirstOpen, localDate, log, readLog } from '../state';
import {
  equipOrnament, exchangeProduce, inventoryFrom, marketPresence, marketSessionPayload, ornamentName,
  phqForWeek, phq9ForMonth, phq2SequenceId, readMarketLedger, savePHQ, savePHQ9, PHQ9_ITEMS, PRODUCE,
  type Inventory, type OrnamentId, type PlantId, type TradeResult, type PHQ9Trigger, type PHQValues,
} from './model';
import { createMarketVisual, type MarketVisualHandle } from './visual';
import { bananaIcon } from '../venture/plants/icons/banana';
import { strawberryIcon } from '../venture/plants/icons/strawberry';
import { appleIcon } from '../venture/plants/icons/apple';
import { mandarinIcon } from '../venture/plants/icons/mandarin';
import { mangoIcon } from '../venture/plants/icons/mango';
import { blueberryIcon } from '../venture/plants/icons/blueberry';
import { pearIcon } from '../venture/plants/icons/pear';
import { tomatoIcon } from '../venture/plants/icons/tomato';
import { eggplantIcon } from '../venture/plants/icons/eggplant';

const HOLD_MS = 1_600;
const DIALOGUE = ['Thanks', 'Hey wait!', "Here's something for your plant"] as const;
const ICONS: Record<PlantId, string> = {
  banana: bananaIcon, strawberry: strawberryIcon, apple: appleIcon, mandarin: mandarinIcon, mango: mangoIcon,
  blueberry: blueberryIcon, pear: pearIcon, tomato: tomatoIcon, eggplant: eggplantIcon,
};

export interface MarketHandle {
  setVisible(visible: boolean): void;
  setPageVisible(visible: boolean): void;
  cancelHold(reason?: string): void;
  refresh(): void;
  isOpen(): boolean;
  equip(id: OrnamentId): boolean;
}

interface Options {
  onChange(): void;
  onWorldChange(open: boolean): void;
  onOrnaments(owned: OrnamentId[], equipped: OrnamentId | null, newest?: OrnamentId | null): void;
  homeScene: THREE.Scene;
  homeCamera: THREE.PerspectiveCamera;
  updateHome(dt: number, t: number): void;
}

interface Hold {
  t0: number;
  pointerId: number | null;
  key: string | null;
  via: 'pointer' | 'key';
  done: boolean;
}

interface CheckinFlow {
  stage: 'phq2' | 'phq9' | 'review';
  trigger: PHQ9Trigger | null;
  answers: PHQValues;
  pendingLogged: boolean;
  review: boolean;
  supportLogged: boolean;
}

export function mountMarket(pane: HTMLElement, opts: Options): MarketHandle {
  pane.insertAdjacentHTML('beforeend', `
    <div class="wormhole" role="button" tabindex="0" aria-keyshortcuts="Enter Space" data-world="home">
      <span class="wormhole-rim" aria-hidden="true"><span class="wormhole-aperture"><span class="wormhole-shine"></span></span></span>
      <span class="wormhole-caption">Market</span>
    </div>
    <section class="market-world" aria-label="Moss’s live Market world" hidden>
      <div class="market-shell" data-noswipe>
        <header class="market-heading"><p class="market-kicker">The little plaza</p><h2>Moss’s</h2><p class="market-presence"></p><button class="market-questions" type="button">Questions</button></header>
        <div class="market-scene-wrap" role="img" aria-label="A live three-dimensional cobbled plaza, Helsinki cathedral, a produce cart and Moss the trader">
          <div class="market-trader-hit" role="button" tabindex="0" aria-keyshortcuts="Space Enter" aria-describedby="market-trade-copy market-inventory"></div>
          <div class="market-thanks" role="status" aria-live="polite" aria-atomic="true" hidden><span class="market-dialogue-line"></span><small class="market-gift-name"></small></div>
          <div class="market-trade-control" id="market-trade-copy"><span class="market-trade-label">Hold to trade · 1.6 s</span></div>
        </div>
        <div class="market-lower">
          <div class="market-inventory" id="market-inventory" aria-label="Produce ready to trade"></div>
          <div class="market-week-total" aria-live="polite"></div>
        </div>
      </div>
      <section class="market-arrival" role="dialog" aria-modal="true" aria-labelledby="market-arrival-title" aria-describedby="market-arrival-intro" hidden>
        <p class="market-arrival-kicker">Optional · saved only on this device</p>
        <h2 id="market-arrival-title">Two quick questions</h2>
        <p class="market-arrival-intro" id="market-arrival-intro">Over the last 2 weeks, how often have you been bothered by:</p>
        <form class="market-arrival-form"></form>
        <div class="market-support" role="note" hidden><span>You can use your safety plan and your chosen contacts in Toolkit.</span><button class="market-support-plan" type="button">Open safety plan</button></div>
        <p class="market-arrival-status" role="status"></p>
        <div class="market-arrival-actions"><button class="market-arrival-skip" type="button">Not now</button><button class="market-arrival-back" type="button">Back to Market</button></div>
      </section>
    </section>`);

  const portal = pane.querySelector<HTMLElement>('.wormhole')!;
  const aperture = portal.querySelector<HTMLElement>('.wormhole-aperture')!;
  const portalCaption = portal.querySelector<HTMLElement>('.wormhole-caption')!;
  const world = pane.querySelector<HTMLElement>('.market-world')!;
  const marketShell = world.querySelector<HTMLElement>('.market-shell')!;
  const presenceCopy = world.querySelector<HTMLElement>('.market-presence')!;
  const sceneWrap = world.querySelector<HTMLElement>('.market-scene-wrap')!;
  const trader = world.querySelector<HTMLElement>('.market-trader-hit')!;
  const tradeControl = world.querySelector<HTMLElement>('.market-trade-control')!;
  const tradeLabel = world.querySelector<HTMLElement>('.market-trade-label')!;
  const inventoryElement = world.querySelector<HTMLElement>('.market-inventory')!;
  const weekTotal = world.querySelector<HTMLElement>('.market-week-total')!;
  const thanks = world.querySelector<HTMLElement>('.market-thanks')!;
  const dialogueLine = thanks.querySelector<HTMLElement>('.market-dialogue-line')!;
  const giftName = thanks.querySelector<HTMLElement>('.market-gift-name')!;
  const questionsButton = world.querySelector<HTMLButtonElement>('.market-questions')!;
  const arrival = world.querySelector<HTMLElement>('.market-arrival')!;
  const arrivalTitle = arrival.querySelector<HTMLElement>('#market-arrival-title')!;
  const arrivalIntro = arrival.querySelector<HTMLElement>('#market-arrival-intro')!;
  const arrivalForm = arrival.querySelector<HTMLFormElement>('.market-arrival-form')!;
  const arrivalStatus = arrival.querySelector<HTMLElement>('.market-arrival-status')!;
  const arrivalSkip = arrival.querySelector<HTMLButtonElement>('.market-arrival-skip')!;
  const arrivalBack = arrival.querySelector<HTMLButtonElement>('.market-arrival-back')!;
  const support = arrival.querySelector<HTMLElement>('.market-support')!;
  const supportPlan = arrival.querySelector<HTMLButtonElement>('.market-support-plan')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let open = false, visible = true, pageVisible = document.visibilityState === 'visible';
  let date = localDate(), day = daysSinceFirstOpen(), presence = marketPresence(date, day);
  let inventory: Inventory = { units: [], byPlant: {}, total: 0 };
  let hold: Hold | null = null, frame = 0, completedPointer: number | null = null, completedKey: string | null = null;
  let result: TradeResult | null = null, resultWeek: string | null = null;
  let dialogueRevision = 0, dialogueTimers: number[] = [];
  let checkin: CheckinFlow | null = null;
  const dialogueHistory: string[] = [];

  const visual: MarketVisualHandle = createMarketVisual({
    pane, world, portal, aperture, homeScene: opts.homeScene, homeCamera: opts.homeCamera, updateHome: opts.updateHome,
  });

  function syncOrnaments(newest: OrnamentId | null = null): void {
    const ledger = readMarketLedger();
    opts.onOrnaments([...ledger.owned], ledger.equipped, newest);
    visual.kick();
  }

  function portalPaint(): void {
    portal.dataset.world = open ? 'market' : 'home';
    portalCaption.textContent = open ? 'Home' : 'Market';
    portal.setAttribute('aria-label', open ? 'Return through the live wormhole preview to your orchid at Home'
      : 'Open the live wormhole preview to visit Moss’s Market plaza');
    portal.setAttribute('aria-pressed', String(open));
  }

  function expandWorld(): void {
    if (reduced.matches || !world.animate) return;
    const box = portal.getBoundingClientRect(), paneBox = pane.getBoundingClientRect();
    const x = box.left - paneBox.left + box.width / 2, y = box.top - paneBox.top + 38;
    world.getAnimations().forEach(animation => animation.cancel());
    world.animate([
      { clipPath: `circle(30px at ${x}px ${y}px)`, opacity: .72 },
      { clipPath: `circle(${Math.max(innerWidth, innerHeight) * 1.45}px at ${x}px ${y}px)`, opacity: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'none' });
  }

  function setWorld(next: boolean, via: string): void {
    if (open === next || next && !presence.present) return;
    cancelHold('world_changed');
    closeArrival(false);
    open = next;
    world.hidden = !open;
    world.inert = !open;
    pane.classList.toggle('market-open', open);
    portalPaint();
    visual.setOpen(open);
    if (open) expandWorld();
    opts.onWorldChange(open);
    if (open) {
      refresh();
      log('market_session_start', { ...marketSessionPayload(), present: presence.present, via });
      beginArrival();
    } else if (presence.present) {
      portal.focus({ preventScroll: true });
    }
  }

  function paintInventory(): void {
    const rows = PRODUCE.filter(([id]) => (inventory.byPlant[id] ?? 0) > 0);
    inventoryElement.innerHTML = rows.length ? `<div class="market-basket-heading"><strong>Your basket</strong><span>${inventory.total} produce</span></div><div class="market-produce-list">${rows.map(([id, name]) => `
      <div class="market-produce" data-plant="${id}" aria-label="${name}: ${inventory.byPlant[id]}"><span class="market-produce-icon">${ICONS[id]}</span><span class="market-produce-name">${name}</span><strong>×${inventory.byPlant[id]}</strong></div>`).join('')}</div>`
      : '<div class="market-empty"><span aria-hidden="true">🧺</span><span>Basket empty · Harvest in Venture</span></div>';
    inventoryElement.setAttribute('aria-label', inventory.total ? `${inventory.total} produce ready to trade` : 'No produce to trade yet');
  }

  const calendarMonth = () => date.slice(0, 7);
  const firstTwoComplete = (answers: PHQValues) => [answers[0], answers[1]].every(value =>
    Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3);

  let arrivalFocusReturn: HTMLElement | null = null;
  const arrivalFocusable = () => [...arrival.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex="0"]')]
    .filter(element => !element.hidden && element.getClientRects().length);
  function activateArrival(): void {
    if (!checkin) return;
    if (arrival.hidden) arrivalFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pane.classList.add('market-checkin-open');
    marketShell.inert = true;
    portal.inert = true;
    arrival.hidden = false;
    queueMicrotask(() => {
      if (!checkin || arrival.hidden) return;
      const first = arrivalFocusable()[0] ?? arrivalBack;
      first.focus({ preventScroll: true });
    });
  }

  function closeArrival(restoreFocus = true): void {
    const wasOpen = !!checkin || !arrival.hidden, previous = arrivalFocusReturn;
    checkin = null;
    pane.classList.remove('market-checkin-open');
    marketShell.inert = false;
    portal.inert = false;
    arrival.hidden = true;
    support.hidden = true;
    arrivalFocusReturn = null;
    if (restoreFocus && wasOpen) {
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
      else if (open && presence.present) portal.focus({ preventScroll: true });
    }
  }

  function logPHQ9(status: 'pending' | 'answered' | 'skipped'): boolean {
    if (!checkin?.trigger) return false;
    const complete = status === 'answered';
    const saved = savePHQ9({
      month: calendarMonth(), trigger: checkin.trigger, status, answers: checkin.answers,
      stage: complete ? 'complete' : firstTwoComplete(checkin.answers) ? 'remaining_items' : 'first_two_items',
      anchorPhq2Total: checkin.trigger === 'phq2_step_up' ? Number(checkin.answers[0]) + Number(checkin.answers[1]) : null,
      anchorPhq2SequenceId: checkin.trigger === 'phq2_step_up' ? phq2SequenceId(presence.week) : null,
    });
    if (saved && status === 'pending') checkin.pendingLogged = true;
    return saved;
  }

  function renderArrival(): void {
    if (!checkin) { arrival.hidden = true; return; }
    const monthly = phq9ForMonth(readLog(), calendarMonth());
    const reviewingMonth = checkin.stage === 'review' && !!monthly;
    const remainingOnly = checkin.stage === 'phq9' && firstTwoComplete(checkin.answers);
    const indices = checkin.stage === 'phq2' ? [0, 1]
      : reviewingMonth ? PHQ9_ITEMS.map((_, index) => index)
        : checkin.stage === 'review' ? [0, 1]
          : remainingOnly ? PHQ9_ITEMS.map((_, index) => index).slice(2) : PHQ9_ITEMS.map((_, index) => index);
    arrivalForm.innerHTML = indices.map(actualIndex => {
      const actual = PHQ9_ITEMS[actualIndex];
      return `<fieldset data-item="${actual.key}" data-index="${actualIndex}"><legend>${actual.text}</legend><div class="market-phq-options">${[0, 1, 2, 3].map(value =>
        `<label><input type="radio" name="phq-${actual.key}" value="${value}" ${checkin!.answers[actualIndex] === value ? 'checked' : ''} ${checkin!.review ? 'disabled' : ''}><span>${['Not at all', 'Several days', 'More than half', 'Nearly every day'][value]}</span></label>`).join('')}</div></fieldset>`;
    }).join('');
    arrivalTitle.textContent = checkin.review ? 'Your saved questions'
      : checkin.stage === 'phq2' ? 'Two quick questions' : checkin.trigger === 'phq2_step_up' ? 'Seven more questions' : 'Monthly questions';
    arrivalIntro.textContent = checkin.review ? 'Your recorded choices stay unchanged.'
      : 'Over the last 2 weeks, how often have you been bothered by:';
    arrivalStatus.textContent = checkin.review
      ? monthly?.status === 'answered' ? `Full PHQ-9 · ${monthly.total} / 27`
        : monthly ? 'Monthly questions · Not now'
          : phqForWeek(readLog(), presence.week)?.status === 'answered' ? 'Weekly questions saved on this device.'
            : 'PHQ-2 · Not now'
      : checkin.stage === 'phq2' ? 'One answer in each row, or choose Not now.'
        : checkin.stage === 'phq9' ? 'Not now still lets you trade.' : '';
    arrivalSkip.hidden = checkin.review;
    arrivalSkip.textContent = 'Not now';
    arrivalBack.textContent = checkin.review ? 'Close' : 'Back to Market';
    support.hidden = !checkin.supportLogged;
    activateArrival();
  }

  function startPHQ9(trigger: PHQ9Trigger, answers: PHQValues, fromPending = false): void {
    if (!fromPending && phq9ForMonth(readLog(), calendarMonth())) return;
    checkin = { stage: 'phq9', trigger, answers: [...answers], pendingLogged: fromPending, review: false, supportLogged: false };
    if (firstTwoComplete(checkin.answers) && !checkin.pendingLogged) logPHQ9('pending');
    renderArrival();
  }

  function beginArrival(): void {
    closeArrival(false);
    if (!presence.present) return;
    const weekly = phqForWeek(readLog(), presence.week), monthly = phq9ForMonth(readLog(), calendarMonth());
    if (!weekly) {
      checkin = { stage: 'phq2', trigger: null, answers: Array(9).fill(null), pendingLogged: false, review: false, supportLogged: false };
      renderArrival();
    } else if (!monthly && weekly.status === 'answered') {
      const answers = [...weekly.answers!, ...Array(7).fill(null)];
      startPHQ9(weekly.answers![0] + weekly.answers![1] >= 3 ? 'phq2_step_up' : 'calendar_month', answers);
    }
    // A weekly Not now ends this section immediately. The separate monthly instrument remains optional through Questions.
  }

  function openReview(): void {
    if (!presence.present) return;
    cancelHold('questions');
    const monthly = phq9ForMonth(readLog(), calendarMonth());
    if (monthly?.status === 'pending') { startPHQ9(monthly.trigger, monthly.answers, true); return; }
    const weekly = phqForWeek(readLog(), presence.week);
    if (!monthly && !weekly) { beginArrival(); return; }
    if (!monthly && weekly) {
      const answers = weekly.answers ? [...weekly.answers, ...Array(7).fill(null)] : Array(9).fill(null);
      startPHQ9(weekly.status === 'answered' && weekly.answers![0] + weekly.answers![1] >= 3 ? 'phq2_step_up' : 'calendar_month', answers);
      return;
    }
    checkin = { stage: 'review', trigger: monthly?.trigger ?? null,
      answers: monthly?.answers ?? (weekly?.answers ? [...weekly.answers, ...Array(7).fill(null)] : Array(9).fill(null)),
      pendingLogged: false, review: true, supportLogged: false };
    arrivalStatus.textContent = monthly?.status === 'answered' ? `Full PHQ-9 · ${monthly.total} / 27`
      : monthly ? 'Monthly questions · Not now'
        : weekly?.status === 'answered' ? `PHQ-2 · ${weekly.answers![0] + weekly.answers![1]} / 6` : 'PHQ-2 · Not now';
    renderArrival();
  }

  function finishPHQ2(): void {
    if (!checkin || !firstTwoComplete(checkin.answers)) return;
    const [a, b] = [Number(checkin.answers[0]), Number(checkin.answers[1])];
    if (!savePHQ([a, b], date)) { closeArrival(); return; }
    const total = a + b, answers = [a, b, ...Array(7).fill(null)];
    if (total >= 3) startPHQ9('phq2_step_up', answers);
    else if (!phq9ForMonth(readLog(), calendarMonth())) startPHQ9('calendar_month', answers);
    else closeArrival();
  }

  function paint(): void {
    inventory = inventoryFrom(readLog(), readMarketLedger());
    if (resultWeek && resultWeek !== presence.week) {
      result = null; resultWeek = null; clearDialogue();
    }
    paintInventory();
    const ledger = readMarketLedger();
    const weekly = ledger.trades.filter(trade => trade.week === presence.week).reduce((sum, trade) => sum + trade.total, 0);
    weekTotal.textContent = weekly ? `${weekly} produce traded this week` : '';
    thanks.hidden = !result || !dialogueLine.textContent;
    if (result) giftName.textContent = `${ornamentName(result.trade.ornament)} · cycle ${result.trade.cycle + 1}`;
    else giftName.textContent = '';
    world.dataset.present = String(presence.present);
    world.dataset.holding = String(!!hold);
    world.dataset.traded = String(!!result);
    tradeControl.style.setProperty('--trade-progress', hold ? tradeControl.style.getPropertyValue('--trade-progress') : '0');
    trader.setAttribute('aria-disabled', String(!presence.present || inventory.total <= 0 || !!hold || completedPointer !== null || completedKey !== null));
    trader.tabIndex = open && visible ? 0 : -1;
    trader.setAttribute('aria-label', !presence.present ? 'Market truck is away until its next weekly visit'
      : inventory.total <= 0 ? 'Moss’s market. No produce to trade yet. Your basket stays safe.'
        : hold ? 'Trading produce. Keep holding.'
          : `Hold anywhere in the market to trade ${inventory.total} produce with Moss for 1.6 seconds`);
    tradeLabel.textContent = !presence.present ? 'Truck away · next weekly visit'
      : inventory.total <= 0 ? 'Nothing to trade yet'
        : hold ? 'Sharing your basket…' : 'Hold to trade · 1.6 s';
    if (!presence.present) {
      const next = presence.nextDate ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        .format(new Date(`${presence.nextDate}T12:00:00`)) : 'Saturday';
      presenceCopy.textContent = `Away today · returns ${next}`;
    } else presenceCopy.textContent = inventory.total ? 'A cosy trade for something little.' : 'Come by with your harvest.';
    questionsButton.hidden = !presence.present;
    portal.hidden = !presence.present;
    portal.tabIndex = visible && presence.present ? 0 : -1;
  }

  function updateProgress(now: number): void {
    if (!hold) return;
    const progress = Math.max(0, Math.min(1, (now - hold.t0) / HOLD_MS));
    tradeControl.style.setProperty('--trade-progress', String(reduced.matches ? Math.round(progress * 20) / 20 : progress));
    tradeControl.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  }

  function releaseCapture(current: Hold): void {
    if (current.pointerId === null) return;
    try { if (trader.hasPointerCapture(current.pointerId)) trader.releasePointerCapture(current.pointerId); } catch { /* already lost */ }
  }

  function cleanHoldVisual(): void {
    cancelAnimationFrame(frame); frame = 0;
    world.dataset.holding = 'false';
    tradeControl.style.setProperty('--trade-progress', '0');
    for (const name of ['role', 'aria-label', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow']) tradeControl.removeAttribute(name);
  }

  function clearDialogue(): void {
    dialogueRevision++;
    dialogueTimers.forEach(clearTimeout); dialogueTimers = [];
    dialogueHistory.length = 0;
    dialogueLine.textContent = '';
  }

  function showDialogue(currentResult: TradeResult): void {
    clearDialogue();
    const revision = dialogueRevision;
    const show = (line: string) => {
      if (revision !== dialogueRevision || result !== currentResult) return;
      dialogueLine.textContent = line;
      thanks.hidden = false;
      dialogueHistory.push(line);
    };
    if (reduced.matches) {
      // Static geometry remains visible under reduced motion; all three intentional lines progress without movement.
      DIALOGUE.forEach((line, index) => {
        dialogueTimers.push(window.setTimeout(() => show(line), index * 420));
      });
    } else {
      show(DIALOGUE[0]);
      dialogueTimers.push(window.setTimeout(() => show(DIALOGUE[1]), 720));
      dialogueTimers.push(window.setTimeout(() => show(DIALOGUE[2]), 1500));
    }
  }

  function settle(current: Hold, heldMs: number): void {
    if (hold !== current || current.done || heldMs < HOLD_MS) return;
    current.done = true;
    hold = null;
    if (current.pointerId !== null) completedPointer = current.pointerId;
    if (current.key !== null) completedKey = current.key;
    releaseCapture(current);
    log('market_hold_end', { via: current.via, heldMs: Math.round(heldMs), completed: true, reason: 'completed' });
    cleanHoldVisual();
    result = exchangeProduce();
    resultWeek = result ? presence.week : null;
    if (result && !result.duplicate) {
      world.classList.remove('market-just-traded');
      void sceneWrap.offsetWidth;
      world.classList.add('market-just-traded');
      visual.trade();
      clearDialogue();
      if (reduced.matches) showDialogue(result);
      else dialogueTimers.push(window.setTimeout(() => { if (result) showDialogue(result); }, 900));
      syncOrnaments(result.newOrnament);
      opts.onChange();
    }
    paint();
  }

  function cancelHold(reason = 'cancelled'): void {
    if (!hold) return;
    const current = hold;
    const heldMs = performance.now() - current.t0;
    hold = null;
    releaseCapture(current);
    log('market_hold_end', { via: current.via, heldMs: Math.round(heldMs), completed: false, reason });
    cleanHoldVisual();
    paint();
  }

  function endHold(reason: string, genuineRelease = false): void {
    if (!hold) return;
    const current = hold, elapsed = performance.now() - current.t0;
    if (genuineRelease && elapsed >= HOLD_MS) settle(current, elapsed);
    else cancelHold(reason);
  }

  function startHold(via: Hold['via'], pointerId: number | null, key: string | null): boolean {
    refresh();
    if (!open || !visible || !pageVisible || !presence.present || inventory.total <= 0 || hold
      || completedPointer !== null || completedKey !== null) return false;
    closeArrival(false); // Trading never leaves a check-in over the ritual, and never re-prompts after a gift.
    hold = { t0: performance.now(), via, pointerId, key, done: false };
    world.dataset.holding = 'true';
    tradeControl.setAttribute('role', 'progressbar');
    tradeControl.setAttribute('aria-label', 'Trade hold progress');
    tradeControl.setAttribute('aria-valuemin', '0'); tradeControl.setAttribute('aria-valuemax', '100');
    updateProgress(hold.t0);
    log('market_hold_start', { via, week: presence.week, available: inventory.total });
    paint();
    const tick = (now: number) => {
      frame = 0;
      if (!hold || !open || !visible || !pageVisible || document.visibilityState !== 'visible') { cancelHold('offscreen'); return; }
      const elapsed = now - hold.t0;
      if (elapsed >= HOLD_MS) settle(hold, elapsed);
      else { updateProgress(now); frame = requestAnimationFrame(tick); }
    };
    frame = requestAnimationFrame(tick);
    return true;
  }

  world.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, select, textarea, summary, a, .market-arrival, .market-produce, .market-empty')) return;
    if (!startHold('pointer', event.pointerId, null)) return;
    try { trader.setPointerCapture(event.pointerId); } catch { /* cancellation remains authoritative */ }
    event.preventDefault(); event.stopPropagation();
  });
  addEventListener('pointermove', event => {
    if (!hold || hold.pointerId !== event.pointerId) return;
    if (event.clientX < 0 || event.clientY < 0 || event.clientX > innerWidth || event.clientY > innerHeight) cancelHold('offscreen');
    event.preventDefault();
  }, { passive: false });
  addEventListener('pointerup', event => {
    if (completedPointer === event.pointerId) completedPointer = null;
    if (!hold || hold.pointerId !== event.pointerId) { if (open) paint(); return; }
    event.preventDefault(); completedPointer = null; endHold('released', true);
  });
  addEventListener('pointercancel', event => {
    if (completedPointer === event.pointerId) completedPointer = null;
    if (hold?.pointerId === event.pointerId) cancelHold('pointer_cancelled');
  });
  trader.addEventListener('lostpointercapture', event => { if (hold?.pointerId === event.pointerId) cancelHold('capture_lost'); });
  world.addEventListener('contextmenu', event => event.preventDefault());

  const keyName = (event: KeyboardEvent): string | null => event.key === 'Enter' ? 'Enter'
    : event.key === ' ' || event.code === 'Space' ? 'Space' : null;
  trader.addEventListener('keydown', event => {
    const key = keyName(event); if (!key) return;
    event.preventDefault();
    if (!event.repeat) startHold('key', null, key);
  });
  trader.addEventListener('keyup', event => {
    const key = keyName(event); if (!key) return;
    event.preventDefault();
    if (completedKey === key) completedKey = null;
    if (hold?.via === 'key' && hold.key === key) endHold('released', true);
  });
  trader.addEventListener('blur', () => { if (hold?.via === 'key') cancelHold('focus_lost'); });
  addEventListener('blur', () => cancelHold('window_blur'));

  portal.addEventListener('click', () => setWorld(!open, 'pointer'));
  portal.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') return;
    event.preventDefault();
    if (!event.repeat) setWorld(!open, 'keyboard');
  });

  arrivalForm.addEventListener('submit', event => event.preventDefault());
  arrivalForm.addEventListener('change', event => {
    if (!checkin || checkin.review) return;
    const input = event.target as HTMLInputElement;
    const field = input.closest<HTMLElement>('fieldset[data-index]');
    if (!field || input.type !== 'radio') return;
    const index = Number(field.dataset.index), value = Number(input.value);
    if (!Number.isInteger(index) || !Number.isInteger(value) || value < 0 || value > 3) return;
    checkin.answers[index] = value;
    if (checkin.stage === 'phq2') { finishPHQ2(); return; }
    if (!checkin.pendingLogged && firstTwoComplete(checkin.answers)) logPHQ9('pending');
    if (index === 8 && value > 0 && !checkin.supportLogged) {
      checkin.supportLogged = true;
      support.hidden = false;
      log('market_support_shown', { instrument: 'PHQ-9', trigger: checkin.trigger, month: calendarMonth(), count: 1,
        resource: 'existing_safety_plan_and_contacts', shownAt: new Date().toISOString() });
    }
    if (checkin.answers.every(answer => Number.isInteger(answer) && Number(answer) >= 0 && Number(answer) <= 3)) {
      if (logPHQ9('answered')) {
        if (checkin.supportLogged) {
          // Keep support visible as a quiet review card, while Market/trade remains usable behind it.
          checkin = { ...checkin, stage: 'review', review: true };
          renderArrival();
        } else closeArrival();
      }
    }
  });
  arrivalSkip.addEventListener('click', () => {
    if (!checkin || checkin.review) { closeArrival(); return; }
    if (checkin.stage === 'phq2') {
      savePHQ(null, date);
      closeArrival();
    } else {
      logPHQ9('skipped');
      closeArrival();
    }
  });
  arrivalBack.addEventListener('click', () => closeArrival());
  questionsButton.addEventListener('click', openReview);
  supportPlan.addEventListener('click', event => {
    event.stopPropagation();
    document.querySelector<HTMLButtonElement>('.tab[data-pane="toolkit"]')?.click();
    document.querySelector<HTMLButtonElement>('.toolkit-option[data-option="safety-plan"]')?.click();
  });

  document.addEventListener('keydown', event => {
    if (!checkin || arrival.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeArrival(); return; }
    if (event.key !== 'Tab') return;
    const items = arrivalFocusable();
    if (!items.length) { event.preventDefault(); arrivalBack.focus({ preventScroll: true }); return; }
    const first = items[0], last = items.at(-1)!, active = document.activeElement;
    if (event.shiftKey && (active === first || !arrival.contains(active))) {
      event.preventDefault(); last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !arrival.contains(active))) {
      event.preventDefault(); first.focus({ preventScroll: true });
    }
  });
  document.addEventListener('focusin', event => {
    if (!checkin || arrival.hidden || arrival.contains(event.target as Node)) return;
    (arrivalFocusable()[0] ?? arrivalBack).focus({ preventScroll: true });
  });

  function refresh(): void {
    const nextDate = localDate(), nextDay = daysSinceFirstOpen();
    if (nextDate !== date || nextDay !== day) { date = nextDate; day = nextDay; closeArrival(false); }
    presence = marketPresence(date, day);
    if (hold && !presence.present) cancelHold('truck_left');
    if (!presence.present) { closeArrival(false); setWorld(false, 'calendar'); }
    paint();
  }

  addEventListener('storage', event => {
    if (event.key === 'garden.log' || event.key === 'garden.market.v1') { refresh(); syncOrnaments(); }
  });
  reduced.addEventListener('change', () => {
    world.getAnimations().forEach(animation => animation.cancel());
    visual.setReduced(reduced.matches);
    paint();
  });

  world.inert = true;
  portalPaint(); refresh();
  queueMicrotask(() => syncOrnaments());

  const snapshot = () => ({
    world: open ? 'market' : 'home', present: presence.present, week: presence.week, date,
    inventory: { total: inventory.total, byPlant: { ...inventory.byPlant }, resultIds: inventory.units.map(unit => unit.id) },
    holding: !!hold, heldMs: hold ? performance.now() - hold.t0 : 0,
    ledger: readMarketLedger(), reducedMotion: reduced.matches,
    portalPreview: open ? 'home' : 'market',
    thanks: result && !thanks.hidden ? dialogueLine.textContent : null,
    dialogue: dialogueLine.textContent || null, dialogueHistory: [...dialogueHistory],
    gift: result ? result.trade.ornament : null,
    visual: visual.snapshot(),
    phq: phqForWeek(readLog(), presence.week),
    phq9: phq9ForMonth(readLog(), calendarMonth()),
    arrival: checkin?.stage ?? null,
    arrivalTrigger: checkin?.trigger ?? null,
    arrivalVisible: !arrival.hidden,
  });
  (globalThis as any).garden.marketSnapshot = snapshot;

  return {
    setVisible(value) {
      visible = value; visual.setVisible(value);
      if (!value) { closeArrival(false); cancelHold('pane_hidden'); }
      paint();
    },
    setPageVisible(value) {
      pageVisible = value; visual.setPageVisible(value);
      if (!value) { closeArrival(false); cancelHold('page_hidden'); }
    },
    cancelHold(reason = 'cancelled') { cancelHold(reason); },
    refresh() { refresh(); visual.kick(); },
    isOpen() { return open; },
    equip(id) { const changed = equipOrnament(id); if (changed) { syncOrnaments(); visual.kick(); } return changed; },
  };
}
