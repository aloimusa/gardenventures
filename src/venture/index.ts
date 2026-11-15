import * as THREE from 'three';
import { daysSinceFirstOpen, localDate, log, readLog, save, state, ventureDoneToday } from '../state';
import { VENTURE_PLANTS, type VenturePlantId, type VenturePlantModel } from './plants/index.js';
import { bananaIcon } from './plants/icons/banana';
import { strawberryIcon } from './plants/icons/strawberry';
import { appleIcon } from './plants/icons/apple';
import { mandarinIcon } from './plants/icons/mandarin';
import { mangoIcon } from './plants/icons/mango';
import { blueberryIcon } from './plants/icons/blueberry';
import { pearIcon } from './plants/icons/pear';
import { tomatoIcon } from './plants/icons/tomato';
import { eggplantIcon } from './plants/icons/eggplant';
import {
  BACKGROUND_LEAVE_THRESHOLD_MS, VENTURE_FORMAT, VENTURE_HARVEST_INTERACTION, VENTURE_MODE,
  VENTURE_RULES_VERSION, VENTURE_TIMING_VERSION, VENTURE_TRAVEL_CONDITION,
  DEFAULT_HARVEST_MS, DEFAULT_MOVE_MS, DEFAULT_ROUND_MS,
  actionMaturesBeforeRoundEnd, backgroundInvalid, formatVentureTime, harvestReadyAt, inputAcceptedAt,
  makeActionId, makeDecisionId, makeOccurrenceId, makeRoundId, makeTravelId,
  scheduledReadyAt, timingProfileFromQuery, type VentureTimingProfile, type VenturePhase, type DecisionInput,
} from './rules';
import { REWARD_CONFIG, VENTURE_RNG_VERSION, fnv1a, occurrenceChainSeed, occurrenceVisualSeed, sampleVentureReward } from './rng';
import {
  backgroundAnnotation, completedLegacyDates, integerValue, numberValue, replayVentureRound, unfinishedV2Starts,
  venturePlantHistory, type ActionReplay, type RoundInfo, type RoundReplay, type VentureRawEvent,
} from './events';
import { inventoryFrom, readMarketLedger, PRODUCE } from '../market/model';
import './venture.css';

interface OccurrenceView {
  index: number;
  plant: VenturePlantId;
  visualSeed: number;
  model: VenturePlantModel;
  bounds: THREE.Box3;
}

const VENTURE_ICONS: Record<VenturePlantId, string> = {
  banana: bananaIcon,
  strawberry: strawberryIcon,
  apple: appleIcon,
  mandarin: mandarinIcon,
  mango: mangoIcon,
  blueberry: blueberryIcon,
  pear: pearIcon,
  tomato: tomatoIcon,
  eggplant: eggplantIcon,
};

interface CameraPose {
  left: number; right: number; top: number; bottom: number;
  position: THREE.Vector3;
  centre: THREE.Vector3;
}

export interface VentureHandle {
  setVisible(visible: boolean): void;
  setPageVisible(visible: boolean): void;
  refresh(): void;
  doneToday(): boolean;
}

interface Presentation { yaw: number; pitch: number; zoom: number; lift?: number }
const PRESENTATION: Record<VenturePlantId, Presentation> = {
  banana: { yaw: -0.31, pitch: 0.20, zoom: 1.00 },
  strawberry: { yaw: 0.31, pitch: 0.34, zoom: 1.02, lift: 0.01 },
  apple: { yaw: -0.38, pitch: 0.20, zoom: 1.02 },
  mandarin: { yaw: 0.43, pitch: 0.16, zoom: 1.00, lift: 0.02 },
  mango: { yaw: 0.51, pitch: 0.19, zoom: 0.98, lift: 0.03 },
  blueberry: { yaw: -0.34, pitch: 0.25, zoom: 1.01 },
  pear: { yaw: -0.27, pitch: 0.14, zoom: 1.04 },
  tomato: { yaw: -0.46, pitch: 0.22, zoom: 1.03 },
  eggplant: { yaw: 0.39, pitch: 0.17, zoom: 1.03 },
};

function visualUnit(seed: number, salt: number): number {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function presentationFor(plant: VenturePlantId, seed: number | null): Presentation {
  const base = PRESENTATION[plant];
  if (seed === null) return { ...base };
  return { ...base,
    yaw: base.yaw + (visualUnit(seed, 0x9e3779b9) - 0.5) * 0.12,
    pitch: Math.max(0.10, base.pitch + (visualUnit(seed, 0x85ebca6b) - 0.5) * 0.045) };
}

const FRAME_WIDTH = 0.86;
const FRAME_HEIGHT = 0.82;
const PRACTICE_KEY = 'garden.venture.practice.v4';
const PLANT_IDS = VENTURE_PLANTS.map(plant => plant.id);
const startupProfile = timingProfileFromQuery(location.search, localStorage.getItem('garden.test.ventureSeconds'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

interface PracticeView {
  id: string;
  plant: VenturePlantId;
  status: 'ready' | 'waiting' | 'result';
  selectedAt: number;
  choiceAt: number | null;
  dueAt: number | null;
  chainSeed: number;
  reward: number | null;
}

interface BackgroundStart {
  id: string;
  startedAt: number;
}

interface AdministrativeCompletion {
  roundId: string;
  date: string;
  day: number;
  plant: VenturePlantId;
  startedAt: number;
  endsAt: number;
  durationMs: number;
  totalCollected: number;
}

const isPlant = (value: unknown): value is VenturePlantId => PLANT_IDS.includes(value as VenturePlantId);
const plantName = (id: VenturePlantId) => VENTURE_PLANTS.find(plant => plant.id === id)!.name.replace(' tree', '');
// Repeated produce icons must not resolve gradients through a same-id SVG in a hidden pane.
const crateIcon = (id: VenturePlantId) => VENTURE_ICONS[id]
  .replace(/id="([^"]+)"/g, `id="venture-crate-${id}-$1"`)
  .replace(/url\(#([^\)]+)\)/g, `url(#venture-crate-${id}-$1)`);
const actionSeconds = (ms: number) => `${Number((ms / 1000).toFixed(2))} s`;

function randomSeed(): number {
  if (startupProfile.seedOverride !== null) return startupProfile.seedOverride;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] >>> 0;
}

function basePayload(round: RoundInfo): Record<string, unknown> {
  return {
    v: VENTURE_FORMAT,
    mode: VENTURE_MODE,
    date: round.date,
    day: round.day,
    roundId: round.id,
    plant: round.plant,
    rulesVersion: VENTURE_RULES_VERSION,
    timingVersion: VENTURE_TIMING_VERSION,
  };
}

export function mountVenture(pane: HTMLElement, opts: { onChange(): void }): VentureHandle {
  pane.insertAdjacentHTML('beforeend', `
    <div class="venture-shell" data-phase="selection" data-noswipe>
      <div class="venture-top">
        <section class="venture-crate" aria-label="Your crate">
          <div class="venture-crate-scroll" tabindex="0" role="region" aria-label="Unexchanged harvest inventory">
            <table class="venture-crate-table">
              <caption>Your crate</caption>
              <thead><tr><th scope="col">Plant</th><th scope="col">Unexchanged</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </section>
        <div class="venture-heading-row">
          <div class="venture-heading-copy">
            <p class="venture-setup" tabindex="-1">Choose a plant for today</p>
            <p class="venture-rules">Tap the plant · Harvest 2 s · Move 10 s · One 3-minute round today.</p>
          </div>
          <div class="venture-hud">
            <div class="venture-count" aria-label="Round produce"><strong>0</strong><span>Collected</span></div>
            <div class="venture-time" role="timer" aria-live="off">3:00</div>
          </div>
        </div>
      </div>
      <div class="venture-select">
        <div class="venture-plants" role="list" aria-label="Your unlocked plants"></div>
      </div>
      <div class="venture-stage" role="button" tabindex="0" aria-keyshortcuts="Enter Space" aria-label="Tap the plant to start a 2 second harvest" hidden>
        <div class="venture-model-frame" aria-hidden="true"></div>
        <div class="venture-travel-scenery" aria-hidden="true" hidden><i></i><i></i><i></i><i></i><span>Following the garden path</span></div>
        <div class="venture-harvest-status" hidden>Harvesting…</div>
        <div class="venture-last-result" hidden>Last harvest <strong>+0</strong></div>
        <div class="venture-reward-flash" aria-hidden="true" hidden><span class="venture-reward-icon" data-species-icon hidden></span><span class="venture-reward-value"></span></div>
        <p class="venture-complete-note" hidden>Round complete · Your daily mark is set.</p>
        <div class="venture-actions">
          <button class="venture-practice-start" type="button" disabled hidden>Start today’s round</button>
          <button class="venture-move" type="button" aria-keyshortcuts="M" aria-label="Move to fresh plant · 10 s">
            <span class="venture-move-wide">Move to fresh plant · 10 s</span><span class="venture-move-narrow">Move · 10 s</span>
          </button>
        </div>
      </div>
      <p class="sr" aria-live="polite" aria-atomic="true"></p>
    </div>`);

  const shell = pane.querySelector<HTMLElement>('.venture-shell')!;
  const crate = pane.querySelector<HTMLElement>('.venture-crate')!;
  const crateBody = pane.querySelector<HTMLTableSectionElement>('.venture-crate-table tbody')!;
  const plants = pane.querySelector<HTMLElement>('.venture-plants')!;
  const setup = pane.querySelector<HTMLElement>('.venture-setup')!;
  const selection = pane.querySelector<HTMLElement>('.venture-select')!;
  const rulesCopy = pane.querySelector<HTMLElement>('.venture-rules')!;
  const stage = pane.querySelector<HTMLElement>('.venture-stage')!;
  const modelFrame = pane.querySelector<HTMLElement>('.venture-model-frame')!;
  const rewardFlash = pane.querySelector<HTMLElement>('.venture-reward-flash')!;
  const rewardValue = pane.querySelector<HTMLElement>('.venture-reward-value')!;
  const rewardIcon = pane.querySelector<HTMLElement>('.venture-reward-icon')!;
  const harvestStatus = pane.querySelector<HTMLElement>('.venture-harvest-status')!;
  const travelScenery = pane.querySelector<HTMLElement>('.venture-travel-scenery')!;
  const lastResult = pane.querySelector<HTMLElement>('.venture-last-result')!;
  const lastResultValue = pane.querySelector<HTMLElement>('.venture-last-result strong')!;
  const practiceStart = pane.querySelector<HTMLButtonElement>('.venture-practice-start')!;
  const completionNote = pane.querySelector<HTMLElement>('.venture-complete-note')!;
  const count = pane.querySelector<HTMLElement>('.venture-count')!;
  const countValue = pane.querySelector<HTMLElement>('.venture-count strong')!;
  const time = pane.querySelector<HTMLElement>('.venture-time')!;
  const moveButton = pane.querySelector<HTMLButtonElement>('.venture-move')!;
  const moveWide = pane.querySelector<HTMLElement>('.venture-move-wide')!;
  const moveNarrow = pane.querySelector<HTMLElement>('.venture-move-narrow')!;
  const live = pane.querySelector<HTMLElement>('.venture-shell > .sr')!;
  const sub = pane.querySelector<HTMLElement>('.head .sub')!;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.tabIndex = -1;
  modelFrame.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf2f8ee, 0xe8d8bc, 2.0));
  const key = new THREE.DirectionalLight(0xfff0da, 2.4); key.position.set(-3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8eaff, 1.1); rim.position.set(3, 3, -4); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);

  let date = localDate();
  let elapsed = daysSinceFirstOpen();
  let replay: RoundReplay | null = null;
  let administrative: AdministrativeCompletion | null = null;
  let view: OccurrenceView | null = null;
  let visible = false;
  let pageVisible = document.visibilityState === 'visible';
  let choiceSignature = '';
  let practice: PracticeView | null = null;
  let activeBackground: BackgroundStart | null = null;
  let travelAnimation: { actionId: string; fromIndex: number; toIndex: number; incomingAt: number } | null = null;
  let travelArrivalFrame = 0;
  let rewardTimer = 0;
  let restoring = false;
  let announcementRevision = 0;
  let crateSignature = '';

  function announce(text: string): void {
    const revision = ++announcementRevision;
    live.textContent = '';
    queueMicrotask(() => { if (revision === announcementRevision) live.textContent = text; });
  }

  const unlockedCount = () => Math.min(elapsed + 1, VENTURE_PLANTS.length);
  const unlocked = (id: VenturePlantId) => PLANT_IDS.indexOf(id) < unlockedCount();
  const dailyPlant = () => VENTURE_PLANTS[elapsed % VENTURE_PLANTS.length].id;
  const currentRound = () => replay?.round ?? null;
  const currentOccurrence = () => replay?.currentOccurrence ?? null;
  const selectedPlant = (): VenturePlantId => practice?.plant ?? replay?.round.plant ?? administrative?.plant ?? dailyPlant();
  const phase = (): VenturePhase => practice ? 'practice' : replayPhase();
  const replayPhase = () => replay?.phase ?? (administrative ? 'complete' as const : 'selection' as const);
  const roundYield = () => replay?.roundYield ?? administrative?.totalCollected ?? 0;
  const remainingMs = () => currentRound() && phase() !== 'complete'
    ? Math.max(0, currentRound()!.endsAt - Date.now()) : 0;
  const canDecide = () => !practice && replayPhase() === 'decision' && !!replay?.decision && !replay.invalidReason
    && inputAcceptedAt(Date.now(), replay.round.endsAt);
  const canTap = () => canDecide() && visible && pageVisible;

  function profileForPaint(): VentureTimingProfile {
    const round = currentRound();
    return round ? { durationMs: round.durationMs, harvestDurationMs: round.harvestDurationMs,
      moveDurationMs: round.moveDurationMs, seedOverride: null, testOverride: false } : startupProfile;
  }

  function poseFor(occurrence: OccurrenceView, plant: VenturePlantId): CameraPose {
    const width = modelFrame.clientWidth || 350, height = modelFrame.clientHeight || 300, aspect = width / height;
    const { yaw, pitch, zoom, lift } = presentationFor(plant, occurrence.visualSeed);
    const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const centre = occurrence.bounds.getCenter(new THREE.Vector3());
    centre.y += lift ?? 0;
    let extentX = 0, extentY = 0;
    for (let corner = 0; corner < 8; corner++) {
      const point = new THREE.Vector3(corner & 1 ? occurrence.bounds.max.x : occurrence.bounds.min.x,
        corner & 2 ? occurrence.bounds.max.y : occurrence.bounds.min.y,
        corner & 4 ? occurrence.bounds.max.z : occurrence.bounds.min.z).sub(centre);
      extentX = Math.max(extentX, Math.abs(point.dot(right)));
      extentY = Math.max(extentY, Math.abs(point.dot(up)));
    }
    const vertical = Math.max(extentY * 2 / FRAME_HEIGHT, extentX * 2 / (aspect * FRAME_WIDTH)) / zoom;
    return { left: -vertical * aspect / 2, right: vertical * aspect / 2, top: vertical / 2, bottom: -vertical / 2,
      position: centre.clone().addScaledVector(direction, 10), centre };
  }

  function applyPose(pose: CameraPose): void {
    camera.left = pose.left; camera.right = pose.right; camera.top = pose.top; camera.bottom = pose.bottom;
    camera.position.copy(pose.position); camera.lookAt(pose.centre); camera.updateProjectionMatrix();
  }

  function fit(): void {
    const width = modelFrame.clientWidth || 350, height = modelFrame.clientHeight || 300;
    renderer.setSize(width, height, false);
    if (view) applyPose(poseFor(view, view.plant));
    renderer.render(scene, camera);
  }

  function clearView(): void {
    view?.model.dispose();
    view = null;
  }

  function replaceView(index: number, visualSeed: number): void {
    const plant = currentRound()?.plant ?? practice?.plant;
    if (!plant) { clearView(); fit(); return; }
    clearView();
    const model = VENTURE_PLANTS[PLANT_IDS.indexOf(plant)].create(visualSeed);
    scene.add(model.group);
    model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.group);
    const coordinates = bounds.isEmpty() ? [] : [...bounds.min.toArray(), ...bounds.max.toArray()];
    if (bounds.isEmpty() || coordinates.some(value => !Number.isFinite(value))) {
      model.dispose(); view = null; fit(); return;
    }
    view = { index, plant, visualSeed, model, bounds };
    fit();
  }

  function syncView(): void {
    if (practice) {
      const visualSeed = fnv1a('venture-practice-visual-v1');
      if (view?.plant !== practice.plant || view.visualSeed !== visualSeed) replaceView(0, visualSeed);
      else fit();
      return;
    }
    const round = currentRound(), occurrence = currentOccurrence();
    if (!round || !occurrence || replay?.invalidReason && !occurrence.chainSeed) { clearView(); fit(); return; }
    if (view?.index === occurrence.index && view.visualSeed === occurrence.visualSeed) { fit(); return; }
    replaceView(occurrence.index, occurrence.visualSeed);
  }

  function renderChoices(): void {
    const history = venturePlantHistory(readLog(), PLANT_IDS);
    const summaries = VENTURE_PLANTS.slice(0, unlockedCount()).map((plant, index) => {
      const item = history.get(plant.id)!;
      return { plant, index, visits: item.visits, isNew: !item.picked, newToday: index === elapsed };
    });
    const signature = `${date}:${summaries.map(item =>
      `${item.plant.id}:${item.visits}:${item.isNew}:${item.newToday}`).join('|')}`;
    if (signature === choiceSignature) return;
    choiceSignature = signature;
    plants.innerHTML = summaries.map(({ plant, index, visits, isNew, newToday }) => {
      const name = plantName(plant.id);
      const times = `${visits} ${visits === 1 ? 'time' : 'times'}`;
      const newLabel = newToday ? 'New today' : 'New';
      const label = `${name}. Harvested ${times}${isNew ? `. ${newLabel}; no produce picked yet` : ''}. Start today's daily harvest round.`;
      return `<div class="venture-plant-item" role="listitem">
        <button class="venture-choice${isNew ? ' is-new' : ''}" type="button" data-plant="${plant.id}"
          data-visits="${visits}" data-new="${isNew}" data-unlock-day="${index + 1}" aria-label="${label}">
          <span class="venture-card-mark" aria-hidden="true"><span class="venture-card-icon">${VENTURE_ICONS[plant.id]}</span><span class="venture-card-sparkle">✦</span></span>
          <span class="venture-card-copy">
            <span class="venture-card-heading"><strong>${name}</strong><span class="venture-new"${isNew ? '' : ' hidden'}><span aria-hidden="true">✦</span>${newLabel}</span></span>
            <span class="venture-visits">Harvested ${times}</span>
          </span><span class="venture-card-arrow" aria-hidden="true">›</span>
        </button>
      </div>`;
    }).join('');
  }

  function practiceBase(): Record<string, unknown> {
    if (!practice) return {};
    return { v: VENTURE_FORMAT, classification: 'practice', practiceVersion: 'first_run_single_harvest_v1',
      practiceId: practice.id, plant: practice.plant, harvestInteraction: VENTURE_HARVEST_INTERACTION };
  }

  function practiceDone(): boolean {
    return localStorage.getItem(PRACTICE_KEY) === 'complete'
      || readLog().some(event => event.type === 'venture_practice_complete' && event.payload?.v === VENTURE_FORMAT);
  }

  function beginPractice(plant: VenturePlantId, via: DecisionInput): void {
    if (practice || practiceDone() || phase() !== 'selection') return;
    const selectedAt = Date.now(), id = `practice-v4:${selectedAt.toString(36)}`;
    practice = { id, plant, status: 'ready', selectedAt, choiceAt: null, dueAt: null,
      chainSeed: fnv1a('venture-practice-reward-v1'), reward: null };
    log('venture_practice_start', { ...practiceBase(), selectedAt, via });
    replaceView(0, fnv1a('venture-practice-visual-v1'));
    paint();
    announce(`Practice with ${plantName(plant)}. Tap the plant once.`);
    setup.focus({ preventScroll: true });
  }

  function tapPractice(via: 'pointer' | 'keyboard' | 'check'): void {
    if (!practice || practice.status !== 'ready' || !visible || !pageVisible) return;
    const choiceAt = Date.now(), dueAt = choiceAt + DEFAULT_HARVEST_MS;
    practice.status = 'waiting'; practice.choiceAt = choiceAt; practice.dueAt = dueAt;
    log('venture_practice_action', { ...practiceBase(), requestedAction: 'harvest', chosenAction: 'harvest',
      via, choiceAt, selectedAt: practice.selectedAt, rewardDueAt: dueAt });
    paint();
    announce('Practice harvest started.');
  }

  function settlePractice(now = Date.now()): void {
    if (!practice || practice.status !== 'waiting' || practice.dueAt === null || now < practice.dueAt || !pageVisible) return;
    const sample = sampleVentureReward(practice.chainSeed, practice.chainSeed, 0, null);
    practice.status = 'result'; practice.reward = sample.reward;
    log('venture_practice_result', { ...practiceBase(), choiceAt: practice.choiceAt, rewardDueAt: practice.dueAt,
      rewardDisplayedAt: now, reward: sample.reward, rngVersion: sample.rngVersion,
      occurrenceChainSeed: sample.occurrenceChainSeed, drawIndex: 0, rngStateBefore: sample.rngStateBefore,
      rngStateAfter: sample.rngStateAfter, rngValue: sample.rngValue, uniformValues: sample.uniformValues,
      distribution: sample.distribution, initialNormalValue: sample.initialNormalValue,
      negativeNormalObserved: sample.negativeNormalObserved, negativeRewardPrevented: sample.negativeRewardPrevented });
    showReward(sample.reward);
    lastResult.hidden = false; lastResultValue.textContent = `+${sample.reward}`;
    practiceStart.disabled = false;
    paint();
    announce(`Practice harvest +${sample.reward}. Start today’s round when ready.`);
  }

  function finishPractice(): void {
    if (!practice || practice.status !== 'result') return;
    const plant = practice.plant, practiceId = practice.id, completedAt = Date.now();
    log('venture_practice_complete', { ...practiceBase(), completedAt, startedNext: 'daily_round' });
    try { localStorage.setItem(PRACTICE_KEY, 'complete'); } catch { /* The append-only completion event is authoritative. */ }
    practice = null;
    clearView(); resetTravelEffects(); rewardFlash.hidden = true; lastResult.hidden = true;
    startRound(plant, 'practice');
    announce(`Practice ${practiceId} complete. ${plantName(plant)} round started.`);
  }

  function resetTravelEffects(): void {
    cancelAnimationFrame(travelArrivalFrame);
    travelAnimation = null;
    modelFrame.style.transition = '';
    modelFrame.style.transform = '';
    modelFrame.style.opacity = '';
    delete stage.dataset.travel;
  }

  function updateTravelEffects(): void {
    const action = replay?.pendingAction;
    if (!action || action.chosenAction !== 'move') return;
    const round = replay!.round;
    if (reducedMotion.matches) {
      resetTravelEffects();
      stage.dataset.travel = 'static';
      syncView();
      return;
    }
    if (!travelAnimation || travelAnimation.actionId !== action.id) {
      resetTravelEffects();
      const postChoiceWait = action.scheduledReadyAt - action.choiceAt;
      if (postChoiceWait < 240) { stage.dataset.travel = 'static'; return; }
      const transitionMs = Math.min(2400, Math.max(120, postChoiceWait * 0.30));
      travelAnimation = { actionId: action.id, fromIndex: action.fromOccurrenceIndex,
        toIndex: action.toOccurrenceIndex!, incomingAt: action.scheduledReadyAt - transitionMs };
      modelFrame.style.transition = `transform ${transitionMs}ms cubic-bezier(.55,.08,.72,.36)`;
      modelFrame.style.transform = 'translateX(-112%)';
      stage.dataset.travel = 'outgoing';
    }
    if (travelAnimation && view?.index === travelAnimation.fromIndex && Date.now() < travelAnimation.incomingAt) {
      const postChoiceWait = action.scheduledReadyAt - action.choiceAt;
      const transitionMs = Math.min(2400, Math.max(120, postChoiceWait * 0.30));
      if (Date.now() >= action.choiceAt + transitionMs) stage.dataset.travel = 'transit';
    }
    if (travelAnimation && view?.index === travelAnimation.fromIndex && Date.now() >= travelAnimation.incomingAt) {
      const animation = travelAnimation;
      const remaining = Math.max(120, action.scheduledReadyAt - Date.now());
      modelFrame.style.transition = 'none';
      modelFrame.style.transform = 'translateX(112%)';
      replaceView(animation.toIndex, occurrenceVisualSeed(round.roundSeed, animation.toIndex));
      stage.dataset.travel = 'incoming';
      void modelFrame.offsetWidth;
      travelArrivalFrame = requestAnimationFrame(() => {
        modelFrame.style.transition = `transform ${remaining}ms cubic-bezier(.18,.82,.24,1)`;
        modelFrame.style.transform = 'translateX(0%)';
      });
    }
  }

  function paintTime(): void {
    const selectionPhase = phase() === 'selection';
    const ms = selectionPhase ? startupProfile.durationMs : remainingMs();
    const text = formatVentureTime(selectionPhase && !startupProfile.testOverride ? DEFAULT_ROUND_MS : ms);
    if (time.textContent !== text) time.textContent = text;
    time.setAttribute('aria-label', selectionPhase ? `${text} round` : phase() === 'complete' ? 'Round complete' : `${text} remaining`);
  }

  function paintCrate(currentPhase: string): void {
    crate.hidden = currentPhase !== 'selection' && currentPhase !== 'complete';
    const inventory = inventoryFrom(readLog(), readMarketLedger());
    const rows = PRODUCE.filter(([id]) => (inventory.byPlant[id] ?? 0) > 0);
    const signature = JSON.stringify(rows.map(([id]) => [id, inventory.byPlant[id]]));
    if (signature === crateSignature) return;
    crateSignature = signature;
    crateBody.innerHTML = rows.length ? rows.map(([id, name]) => `<tr data-plant="${id}">
      <th scope="row"><span class="venture-crate-icon" aria-hidden="true">${crateIcon(id)}</span><span>${name}</span></th>
      <td><span class="sr">${name}: </span><span class="venture-crate-count">${inventory.byPlant[id]}</span></td>
    </tr>`).join('') : '<tr class="venture-crate-empty"><td colspan="2">Your crate is empty · Harvested plants will wait here for Market.</td></tr>';
    crate.setAttribute('aria-label', inventory.total ? `Your crate. ${inventory.total} unexchanged produce` : 'Your crate is empty');
  }

  function paint(): void {
    const currentPhase = phase(), occurrence = currentOccurrence();
    const profile = profileForPaint(), name = plantName(selectedPlant());
    const last = practice ? practice.reward : occurrence?.lastObservedYield ?? null;
    const pending = replay?.pendingAction ?? null;
    const moving = currentPhase === 'move_wait' && pending?.chosenAction === 'move';
    const harvesting = currentPhase === 'harvest_wait' && pending?.chosenAction === 'harvest';
    const practiceWaiting = currentPhase === 'practice' && practice?.status === 'waiting';
    shell.dataset.phase = currentPhase;
    paintCrate(currentPhase);
    stage.dataset.moving = String(moving);
    stage.dataset.harvesting = String(harvesting || practiceWaiting);
    stage.hidden = currentPhase === 'selection' || (!view && currentPhase !== 'complete');
    selection.hidden = currentPhase !== 'selection';
    plants.hidden = currentPhase !== 'selection';
    count.hidden = currentPhase === 'selection' || currentPhase === 'practice';
    time.hidden = currentPhase === 'practice';
    countValue.textContent = String(roundYield());
    setup.textContent = currentPhase === 'practice' ? `A quick practice · ${name}`
      : currentPhase === 'selection' ? 'Choose a plant for today'
      : `${name} · Fresh\u00a0plant\u00a0${(occurrence?.index ?? 0) + 1}`;
    sub.textContent = currentPhase === 'complete' ? 'Today’s round is complete. Come back tomorrow.'
      : currentPhase === 'practice' ? 'One tap, then Start.'
      : currentPhase === 'selection' ? `Day ${elapsed + 1} · A quiet foraging game.`
      : `Day ${elapsed + 1} · Tap to harvest, or Move when you choose.`;
    rulesCopy.textContent = currentPhase === 'practice' ? 'Tap the plant once, then Start.'
      : `Tap the plant · Harvest ${actionSeconds(profile.harvestDurationMs)} · Move ${actionSeconds(profile.moveDurationMs)} · One ${profile.durationMs === DEFAULT_ROUND_MS ? '3-minute' : `${actionSeconds(profile.durationMs)}`} round today.`;
    completionNote.hidden = currentPhase !== 'complete';
    if (currentPhase === 'complete') {
      count.style.top = `${stage.offsetTop + stage.clientHeight / 2}px`;
      count.style.left = `${stage.offsetLeft + stage.clientWidth / 2}px`;
    } else {
      count.style.top = ''; count.style.left = '';
    }
    stage.setAttribute('aria-busy', String(harvesting || practiceWaiting || moving));
    harvestStatus.hidden = !harvesting && !practiceWaiting;
    travelScenery.hidden = !moving;
    lastResult.hidden = last === null || currentPhase === 'complete';
    if (last !== null) lastResultValue.textContent = `+${last}`;
    updateTravelEffects();
    practiceStart.hidden = currentPhase !== 'practice';
    practiceStart.disabled = practice?.status !== 'result';
    moveButton.hidden = currentPhase === 'selection' || currentPhase === 'complete' || currentPhase === 'practice';
    moveButton.disabled = !canDecide();
    moveWide.textContent = moving ? `Moving… · ${actionSeconds(profile.moveDurationMs)}` : `Move to fresh plant · ${actionSeconds(profile.moveDurationMs)}`;
    moveNarrow.textContent = moving ? 'Moving… · 10 s' : `Move · ${actionSeconds(profile.moveDurationMs)}`;
    moveButton.setAttribute('aria-label', moving ? `Moving to a fresh ${name} · ${actionSeconds(profile.moveDurationMs)}` : `Move to fresh plant · ${actionSeconds(profile.moveDurationMs)}`);
    const offeringPracticeStart = currentPhase === 'practice' && practice?.status === 'result';
    stage.setAttribute('role',offeringPracticeStart ? 'group' : 'button');
    stage.tabIndex = currentPhase === 'selection' || currentPhase === 'complete' || offeringPracticeStart ? -1 : 0;
    stage.setAttribute('aria-disabled', String(currentPhase === 'selection' || currentPhase === 'complete'
      || harvesting || practiceWaiting || moving));
    stage.setAttribute('aria-label', currentPhase === 'complete' ? `${name}. Round complete. ${roundYield()} collected. Your daily mark is set.`
      : moving ? `Moving to a fresh ${name} · ${actionSeconds(profile.moveDurationMs)}.`
      : currentPhase === 'practice' ? practice?.status === 'result' ? `Practice ${name}. Last harvest ${last}. Use Start today’s round.`
        : practiceWaiting ? `Practice ${name}. Harvesting.` : `Practice ${name}. Tap once to harvest.`
      : harvesting ? `${name}. Harvesting.`
      : `${name}. Tap once to harvest in ${actionSeconds(profile.harvestDurationMs)}. ${last === null ? 'No harvest yet on this plant.' : `Last harvest ${last}.`}`);
    renderChoices();
    plants.querySelectorAll<HTMLButtonElement>('.venture-choice').forEach(button => { button.disabled = currentPhase !== 'selection'; });
    paintTime();
  }

  function occurrencePayload(round: RoundInfo, index: number, revealedAt: number, arrivalTravelId: string | null) {
    return {
      ...basePayload(round),
      occurrenceId: makeOccurrenceId(round.id, index),
      occurrenceIndex: index,
      occurrenceChainSeed: occurrenceChainSeed(round.roundSeed, index),
      visualSeed: occurrenceVisualSeed(round.roundSeed, index),
      revealedAt,
      arrivalTravelId,
    };
  }

  function emitDecision(round: RoundInfo, promptedAt: number): void {
    const latest = readRound(round.id);
    if (!latest || latest.invalidReason && latest.invalidReason !== 'active round missing decision'
      || latest.end || latest.pendingAction || latest.decision) return;
    const occurrence = latest.currentOccurrence;
    const decisionIndex = new Set(readLog().filter(event => event.type === 'venture_decision_prompt'
      && event.payload?.roundId === round.id).map(event => event.payload?.decisionId)).size;
    log('venture_decision_prompt', {
      ...basePayload(round),
      decisionId: makeDecisionId(round.id, decisionIndex),
      decisionIndex,
      occurrenceId: occurrence.id,
      occurrenceIndex: occurrence.index,
      promptedAt,
      harvestDurationMs: round.harvestDurationMs,
      moveDurationMs: round.moveDurationMs,
      harvestsDisplayed: occurrence.results.length,
      lastObservedYield: occurrence.lastObservedYield,
    });
  }

  function readRound(roundId: string): RoundReplay | null {
    const own = readLog().filter(event => event.payload?.v === VENTURE_FORMAT && event.payload.roundId === roundId);
    if (!own.some(event => event.type === 'venture_round_start')) return null;
    try { return replayVentureRound(own, PLANT_IDS, Date.now()); }
    catch { return null; }
  }

  function loadRound(roundId: string): RoundReplay | null {
    replay = readRound(roundId);
    if (replay) administrative = null;
    syncView();
    renderChoices();
    return replay;
  }

  function beginBackground(source: 'visibility_hidden' | 'pagehide', now = Date.now()): void {
    if (!replay || replay.end || replay.invalidReason || now >= replay.round.endsAt) return;
    const existing = replay.backgroundIntervals.find(interval => !interval.ended);
    if (existing) { activeBackground = { id: existing.id, startedAt: existing.startedAt }; return; }
    if (activeBackground) return;
    const round = replay.round;
    const starts = new Set(readLog().filter(event => event.type === 'venture_background_interval'
      && event.payload?.roundId === round.id && event.payload?.lifecycle === 'start')
      .map(event => String(event.payload?.intervalId)));
    activeBackground = { id: `${round.id}:background:${starts.size}`, startedAt: now };
    log('venture_background_interval', { ...basePayload(round), intervalId: activeBackground.id,
      lifecycle: 'start', visibility: 'hidden', source, startedAt: now, endedAt: null, durationMs: null,
      openAtLastSession: false, ended: false });
    loadRound(round.id);
  }

  function endBackground(source: 'visibility_revealed' | 'pageshow' | 'app_lifecycle' | 'round_end',
    openAtLastSession = false, now = Date.now()): void {
    if (!replay) { activeBackground = null; return; }
    const existing = replay.backgroundIntervals.find(interval => !interval.ended);
    if (!activeBackground && existing) activeBackground = { id: existing.id, startedAt: existing.startedAt };
    if (!activeBackground || replay.end) { activeBackground = null; return; }
    if (now >= replay.round.endsAt) openAtLastSession = true;
    const current = activeBackground, round = replay.round;
    const endedAt = openAtLastSession ? null : now, durationMs = openAtLastSession ? null : now - current.startedAt;
    log('venture_background_interval', { ...basePayload(round), intervalId: current.id,
      lifecycle: 'end', visibility: openAtLastSession ? 'hidden' : 'revealed',
      source: openAtLastSession ? 'round_end' : source, startedAt: current.startedAt,
      endedAt, durationMs, openAtLastSession, ended: true });
    activeBackground = null;
    loadRound(round.id);
  }

  function roundEndPayload(round: RoundInfo, reason: 'time_expired' | 'day_changed' | 'invalid_state', now: number,
    endContext: string, pendingActionId: string | null, summary?: RoundReplay): Record<string, unknown> {
    const background = backgroundAnnotation(summary?.backgroundIntervals ?? []);
    return {
      ...basePayload(round),
      startedAt: round.startedAt,
      endsAt: round.endsAt,
      endedAt: reason === 'time_expired' ? round.endsAt : Math.min(now, reason === 'day_changed' ? round.endsAt : now),
      endRecordedAt: now,
      durationMs: round.durationMs,
      reason,
      endCategory: reason === 'time_expired' ? 'time_exhausted' : 'administrative',
      endContext,
      pendingActionId,
      displayedHarvestCount: summary?.displayedHarvestCount ?? 0,
      totalCollected: summary?.roundYield ?? 0,
      arrivedOccurrenceCount: summary?.occurrences.length ?? 0,
      lastObservedYield: summary?.currentOccurrence.lastObservedYield ?? null,
      backgroundIntervalCount: summary?.backgroundIntervals.length ?? 0,
      backgroundDurationMs: background.durationMs,
      backgroundOpenAtEnd: background.open,
      backgroundInvalid: background.invalid,
      backgroundInvalidReason: background.reason,
      leave_threshold: BACKGROUND_LEAVE_THRESHOLD_MS,
    };
  }

  function emitTravelEnd(action: ActionReplay, arrived: boolean, reason: string, restored: boolean, now: number): void {
    const round = replay!.round;
    log('venture_travel_end', {
      ...basePayload(round),
      travelId: action.travelId!,
      actionId: action.id,
      decisionId: action.decisionId,
      fromOccurrenceId: action.fromOccurrenceId,
      fromOccurrenceIndex: action.fromOccurrenceIndex,
      toOccurrenceId: action.toOccurrenceId!,
      toOccurrenceIndex: action.toOccurrenceIndex!,
      decisionPromptAt: action.decisionPromptAt,
      travelStartedAt: action.choiceAt,
      scheduledArrivalAt: action.scheduledReadyAt,
      finishedAt: now,
      arrivedAt: arrived ? now : null,
      arrived,
      reason,
      scheduledConditionMs: action.scheduledConditionMs,
      actualConditionDelayMs: now - action.decisionPromptAt,
      scheduledPostChoiceWaitMs: action.scheduledPostChoiceWaitMs,
      actualPostChoiceWaitMs: now - action.choiceAt,
      travelCondition: VENTURE_TRAVEL_CONDITION,
      restored,
    });
  }

  function finishRound(reason: 'time_expired' | 'day_changed' | 'invalid_state', restored = false, now = Date.now()): void {
    // A pending tap remains an accepted action; only its already-due result may settle before this end.
    endBackground('round_end', true, now);
    resetTravelEffects();
    if (!replay || replay.end) return;
    const rawEnd = readLog().some(event => event.type === 'venture_round_end'
      && event.payload?.roundId === replay!.round.id);
    if (rawEnd) { loadRound(replay.round.id); paint(); return; }
    const round = replay.round, pending = replay.pendingAction;
    const originalPhase = replay.phase, originalResolution = replay.resolution;
    if (pending?.chosenAction === 'move') emitTravelEnd(pending, false, reason, restored, now);
    const context = pending ? originalPhase : originalResolution ?? originalPhase;
    log('venture_round_end', roundEndPayload(round, reason, now, context, pending?.id ?? null, replay));
    loadRound(round.id);
    if (round.date === localDate() && state.venturedOn !== round.date) { state.venturedOn = round.date; save(); }
    clearTimeout(rewardTimer); rewardFlash.hidden = true;
    paint(); fit();
    announce(`Round complete. ${roundYield()} collected. Your daily mark is set.`);
    queueMicrotask(opts.onChange);
  }

  function showReward(reward: number): void {
    clearTimeout(rewardTimer);
    rewardValue.textContent = `+${reward}`;
    rewardIcon.dataset.plant = selectedPlant();
    rewardIcon.innerHTML = VENTURE_ICONS[selectedPlant()];
    rewardIcon.hidden = false;
    rewardFlash.hidden = false;
    stage.dataset.reward = 'true';
    rewardTimer = window.setTimeout(() => { rewardFlash.hidden = true; delete stage.dataset.reward; }, reducedMotion.matches ? 900 : 650);
  }

  function settleHarvest(restored: boolean, now: number): void {
    if (!replay?.pendingAction || replay.pendingAction.chosenAction !== 'harvest') return;
    const action = replay.pendingAction, round = replay.round;
    if (now < action.scheduledReadyAt || !actionMaturesBeforeRoundEnd(action.scheduledReadyAt, round.endsAt)) return;
    const occurrence = replay.currentOccurrence;
    const sample = sampleVentureReward(occurrence.chainSeed, occurrence.rngState, occurrence.results.length,
      occurrence.lastObservedYield);
    const rewardDueAt = harvestReadyAt(action.choiceAt, action.scheduledConditionMs);
    log('venture_harvest_result', {
      ...basePayload(round),
      actionId: action.id,
      decisionId: action.decisionId,
      occurrenceId: occurrence.id,
      occurrenceIndex: occurrence.index,
      decisionPromptAt: action.decisionPromptAt,
      choiceAt: action.choiceAt,
      scheduledConditionMs: action.scheduledConditionMs,
      scheduledReadyAt: action.scheduledReadyAt,
      scheduledPostChoiceWaitMs: action.scheduledPostChoiceWaitMs,
      travelCondition: VENTURE_TRAVEL_CONDITION,
      harvestInteraction: VENTURE_HARVEST_INTERACTION,
      rewardDueAt,
      rewardReadyAt: action.scheduledReadyAt,
      rewardDisplayedAt: now,
      actualConditionDelayMs: now - action.decisionPromptAt,
      actualPostChoiceWaitMs: now - action.choiceAt,
      restored,
      maturedBeforeRoundEnd: true,
      harvestIndex: occurrence.results.length,
      harvestsDisplayed: occurrence.results.length + 1,
      previousObservedYield: sample.previousObservedYield,
      reward: sample.reward,
      lastObservedYield: sample.reward,
      roundYield: replay.roundYield + sample.reward,
      rngVersion: sample.rngVersion,
      occurrenceChainSeed: sample.occurrenceChainSeed,
      drawIndex: sample.drawIndex,
      rngDrawIndex: occurrence.rngTransitionCount,
      rngDrawCount: sample.rngDrawCount,
      rngStateBefore: sample.rngStateBefore,
      rngStateAfter: sample.rngStateAfter,
      rngValue: sample.rngValue,
      uniformValues: sample.uniformValues,
      distribution: sample.distribution,
      initialStandardNormal: sample.initialStandardNormal,
      initialNormalValue: sample.initialNormalValue,
      negativeNormalObserved: sample.negativeNormalObserved,
      negativeRewardPrevented: sample.negativeRewardPrevented,
      gammaAlpha: sample.gammaAlpha,
      gammaShape2: sample.gammaShape2,
      selectedFactor: sample.selectedFactor,
    });
    if (now < round.endsAt) emitDecision(round, now);
    loadRound(round.id);
    showReward(sample.reward);
    announce(`Last harvest +${sample.reward}. Collected ${replay?.roundYield ?? sample.reward}.`);
    if (now >= round.endsAt) finishRound('time_expired', restored, now);
    paint();
  }

  function settleMove(restored: boolean, now: number): void {
    if (!replay?.pendingAction || replay.pendingAction.chosenAction !== 'move') return;
    const action = replay.pendingAction, round = replay.round;
    if (now < action.scheduledReadyAt || !actionMaturesBeforeRoundEnd(action.scheduledReadyAt, round.endsAt)) return;
    emitTravelEnd(action, true, 'arrived', restored, now);
    log('venture_occurrence', occurrencePayload(round, action.toOccurrenceIndex!, now, action.travelId));
    if (now < round.endsAt) emitDecision(round, now);
    loadRound(round.id);
    resetTravelEffects();
    announce(`Arrived at a fresh ${plantName(round.plant)}. Harvest or Move.`);
    if (now >= round.endsAt) finishRound('time_expired', restored, now);
    paint(); fit();
  }

  function chooseHarvest(via: 'pointer' | 'keyboard' | 'check'): boolean {
    if (!canTap() || !replay?.decision) return false;
    const choiceAt = Date.now(), decision = replay.decision, round = replay.round;
    if (!inputAcceptedAt(choiceAt, round.endsAt)) { reconcile(); return false; }
    const occurrence = replay.currentOccurrence, actionIndex = replay.actionCount;
    const actionId = makeActionId(round.id, actionIndex), readyAt = harvestReadyAt(choiceAt, round.harvestDurationMs);
    moveButton.disabled = true;
    // The accepted action is durable immediately. Release, blur, pane changes and reload cannot cancel it.
    log('venture_action', {
      ...basePayload(round), actionId, actionIndex, decisionId: decision.id,
      requestedAction: 'harvest', chosenAction: 'harvest', requestAccepted: true, via, choiceAt,
      decisionPromptAt: decision.promptedAt, fromPhase: 'decision', toPhase: 'harvest_wait',
      occurrenceId: occurrence.id, occurrenceIndex: occurrence.index,
      scheduledConditionMs: round.harvestDurationMs, scheduledReadyAt: readyAt,
      scheduledPostChoiceWaitMs: readyAt - choiceAt,
      travelCondition: VENTURE_TRAVEL_CONDITION, harvestInteraction: VENTURE_HARVEST_INTERACTION,
    });
    loadRound(round.id);
    paint();
    return true;
  }

  function chooseMove(via: DecisionInput): void {
    if (!canDecide() || !replay?.decision) return;
    const choiceAt = Date.now();
    if (!inputAcceptedAt(choiceAt, replay.round.endsAt)) { reconcile(); return; }
    const decision = replay.decision, round = replay.round, occurrence = replay.currentOccurrence;
    const duration = round.moveDurationMs, readyAt = scheduledReadyAt(decision.promptedAt, choiceAt, duration);
    const actionId = makeActionId(round.id, replay.actionCount), travelId = makeTravelId(round.id, occurrence.index + 1);
    replay.decision = null;
    replay.pendingAction = { id: actionId, travelId, decisionId: decision.id, chosenAction: 'move', via, choiceAt,
      decisionPromptAt: decision.promptedAt, fromOccurrenceId: occurrence.id, fromOccurrenceIndex: occurrence.index,
      toOccurrenceId: makeOccurrenceId(round.id, occurrence.index + 1), toOccurrenceIndex: occurrence.index + 1,
      scheduledConditionMs: duration, scheduledReadyAt: readyAt, scheduledPostChoiceWaitMs: readyAt - choiceAt,
      harvestsDisplayed: occurrence.results.length, lastObservedYield: occurrence.lastObservedYield,
      harvestInteraction: null };
    moveButton.disabled = true;
    log('venture_action', {
      ...basePayload(round), actionId, actionIndex: replay.actionCount, decisionId: decision.id,
      requestedAction: 'move', chosenAction: 'move', requestAccepted: true, via, choiceAt,
      decisionPromptAt: decision.promptedAt, fromPhase: 'decision', toPhase: 'move_wait', occurrenceId: occurrence.id,
      occurrenceIndex: occurrence.index, scheduledConditionMs: duration, scheduledReadyAt: readyAt,
      scheduledPostChoiceWaitMs: readyAt - choiceAt, travelCondition: VENTURE_TRAVEL_CONDITION,
      travelId, fromOccurrenceId: occurrence.id, fromOccurrenceIndex: occurrence.index,
      toOccurrenceId: makeOccurrenceId(round.id, occurrence.index + 1), toOccurrenceIndex: occurrence.index + 1,
      harvestsDisplayed: occurrence.results.length, lastObservedYield: occurrence.lastObservedYield,
      voluntaryLeave: true, leaveKind: occurrence.results.length ? 'after_observed_harvest' : 'before_first_harvest',
    });
    loadRound(round.id); paint();
    if (choiceAt >= readyAt) reconcile();
  }

  function reconcile(restored = false): void {
    if (practice) { settlePractice(); paintTime(); return; }
    if (!replay || replay.end || replay.invalidReason) { paintTime(); return; }
    const now = Date.now(), round = replay.round;
    if (!pageVisible) { paintTime(); return; }
    if (replay.backgroundIntervals.some(interval => !interval.ended)) {
      endBackground(restored ? 'app_lifecycle' : 'visibility_revealed', now >= round.endsAt, now);
    }
    const pending = replay.pendingAction;
    if (pending && now >= pending.scheduledReadyAt && actionMaturesBeforeRoundEnd(pending.scheduledReadyAt, round.endsAt)) {
      if (pending.chosenAction === 'harvest') settleHarvest(restored, now);
      else settleMove(restored, now);
      return;
    }
    if (now >= round.endsAt) { finishRound('time_expired', restored, now); return; }
    paint();
  }

  function startRound(plant: VenturePlantId, via: DecisionInput = 'choice'): void {
    if (phase() !== 'selection' || administrative || !unlocked(plant)) return;
    // A raw start/end on this date is authoritative even if the completion mirror was manually cleared.
    const todaysActivity = readLog().filter(event => (event.payload?.v === VENTURE_FORMAT
      || event.payload?.v === 2 || event.payload?.v === 3) && event.payload?.date === date);
    if (todaysActivity.some(event => event.type === 'venture_round_start' || event.type === 'venture_legacy_close')) return;
    const startedAt = Date.now(), roundSeed = randomSeed();
    const round: RoundInfo = { id: makeRoundId(date, startedAt, roundSeed), date, day: elapsed + 1, plant,
      roundSeed, startedAt, durationMs: startupProfile.durationMs, endsAt: startedAt + startupProfile.durationMs,
      harvestDurationMs: startupProfile.harvestDurationMs, moveDurationMs: startupProfile.moveDurationMs,
      harvestInteraction: VENTURE_HARVEST_INTERACTION };
    const base = basePayload(round);
    log('venture_selection', { ...base, selectedAt: startedAt, via, unlockedCount: unlockedCount() });
    log('venture_round_start', {
      ...base,
      roundSeed,
      startedAt,
      durationMs: round.durationMs,
      endsAt: round.endsAt,
      harvestDurationMs: round.harvestDurationMs,
      moveDurationMs: round.moveDurationMs,
      harvestInteraction: VENTURE_HARVEST_INTERACTION,
      travelCondition: VENTURE_TRAVEL_CONDITION,
      rngVersion: VENTURE_RNG_VERSION,
      rewardConfig: { ...REWARD_CONFIG },
      leave_threshold: BACKGROUND_LEAVE_THRESHOLD_MS,
      timingProfile: startupProfile.testOverride ? 'explicit_test_override' : 'adaptation_default',
      durationOverrideMs: startupProfile.durationMs === DEFAULT_ROUND_MS ? null : startupProfile.durationMs,
      harvestDurationOverrideMs: startupProfile.harvestDurationMs === DEFAULT_HARVEST_MS ? null : startupProfile.harvestDurationMs,
      moveDurationOverrideMs: startupProfile.moveDurationMs === DEFAULT_MOVE_MS ? null : startupProfile.moveDurationMs,
      seedOverride: startupProfile.seedOverride,
    });
    log('venture_occurrence', occurrencePayload(round, 0, startedAt, null));
    log('venture_decision_prompt', {
      ...base,
      decisionId: makeDecisionId(round.id, 0),
      decisionIndex: 0,
      occurrenceId: makeOccurrenceId(round.id, 0),
      occurrenceIndex: 0,
      promptedAt: startedAt,
      harvestDurationMs: round.harvestDurationMs,
      moveDurationMs: round.moveDurationMs,
      harvestsDisplayed: 0,
      lastObservedYield: null,
    });
    loadRound(round.id);
    if (replay?.invalidReason) { finishRound('invalid_state'); return; }
    paint(); fit();
    announce(`${plantName(plant)} round started. Harvest or Move.`);
    setup.focus({ preventScroll: true });
  }

  function closeInvalidRound(startEvent: VentureRawEvent): void {
    const roundId = String(startEvent.payload?.roundId ?? '');
    if (!roundId || readLog().some(event => event.type === 'venture_round_end' && event.payload?.roundId === roundId)) return;
    let parsed: RoundReplay | null = null;
    try { parsed = replayVentureRound(readLog().filter(event => event.payload?.roundId === roundId), PLANT_IDS, Date.now()); }
    catch { /* use only safe scalar fields from the malformed start below */ }
    const p = startEvent.payload ?? {};
    const startedAt = numberValue(p.startedAt) ?? startEvent.t;
    const durationMs = Math.max(0, numberValue(p.durationMs) ?? 0);
    const round: RoundInfo = { id: roundId, date: typeof p.date === 'string' ? p.date : date,
      day: integerValue(p.day) ?? elapsed + 1, plant: isPlant(p.plant) ? p.plant : 'apple',
      roundSeed: numberValue(p.roundSeed) ?? 0, startedAt, durationMs, endsAt: numberValue(p.endsAt) ?? startedAt + durationMs,
      harvestDurationMs: numberValue(p.harvestDurationMs) ?? DEFAULT_HARVEST_MS,
      moveDurationMs: numberValue(p.moveDurationMs) ?? DEFAULT_MOVE_MS,
      harvestInteraction: VENTURE_HARVEST_INTERACTION };
    const now = Date.now();
    log('venture_round_end', roundEndPayload(round, 'invalid_state', now, 'invalid_state', parsed?.pendingAction?.id ?? null, parsed ?? undefined));
    if (round.date === localDate()) { state.venturedOn = round.date; save(); }
  }

  function closeOrphan(event: VentureRawEvent): void {
    const p = event.payload ?? {}, roundId = String(p.roundId ?? '');
    if (!roundId || readLog().some(item => item.type === 'venture_round_end' && item.payload?.roundId === roundId)) return;
    const own = readLog().filter(item => item.payload?.roundId === roundId && item.payload?.v === VENTURE_FORMAT);
    const startedAt = numberValue(p.startedAt) ?? Math.min(...own.map(item => numberValue(item.t) ?? Date.now()));
    const durationMs = Math.max(0, numberValue(p.durationMs) ?? 0);
    const round: RoundInfo = { id: roundId, date: typeof p.date === 'string' ? p.date : date,
      day: integerValue(p.day) ?? elapsed + 1, plant: isPlant(p.plant) ? p.plant : 'apple',
      roundSeed: numberValue(p.roundSeed) ?? 0, startedAt, durationMs, endsAt: numberValue(p.endsAt) ?? startedAt + durationMs,
      harvestDurationMs: DEFAULT_HARVEST_MS, moveDurationMs: DEFAULT_MOVE_MS,
      harvestInteraction: VENTURE_HARVEST_INTERACTION };
    const resultIds = new Set<string>(); let totalCollected = 0, lastObservedYield: number | null = null;
    for (const item of own) if (item.type === 'venture_harvest_result' && typeof item.payload?.actionId === 'string'
      && !resultIds.has(item.payload.actionId) && integerValue(item.payload.reward) !== null) {
      resultIds.add(item.payload.actionId); totalCollected += item.payload.reward as number;
      lastObservedYield = item.payload.reward as number;
    }
    const now = Date.now();
    log('venture_round_end', { ...roundEndPayload(round, 'invalid_state', now, 'invalid_state', null),
      displayedHarvestCount: resultIds.size, totalCollected, lastObservedYield,
      arrivedOccurrenceCount: new Set(own.filter(item => item.type === 'venture_occurrence')
        .map(item => item.payload?.occurrenceId).filter(Boolean)).size });
    state.venturedOn = date; save();
  }

  function migrateV2(): void {
    for (const start of unfinishedV2Starts(readLog())) {
      const p = start.payload!;
      const now = Date.now(), originalEndsAt = numberValue(p.endsAt) ?? numberValue(p.startedAt) ?? start.t;
      const roundId = String(p.roundId);
      log('venture_legacy_close', {
        v: VENTURE_FORMAT,
        mode: VENTURE_MODE,
        date: typeof p.date === 'string' ? p.date : date,
        day: integerValue(p.day) ?? elapsed + 1,
        roundId,
        legacyRoundId: roundId,
        plant: typeof p.plant === 'string' && p.plant ? p.plant : 'apple',
        rulesVersion: VENTURE_RULES_VERSION,
        timingVersion: VENTURE_TIMING_VERSION,
        legacyVersion: 2,
        originalStartedAt: numberValue(p.startedAt) ?? start.t,
        originalEndsAt,
        closedAt: now,
        reason: now >= originalEndsAt ? 'time_expired' : 'schema_migration',
      });
    }
  }

  function showLegacyCompletion(): boolean {
    if (!completedLegacyDates(readLog()).has(date)) return false;
    const starts = readLog().filter(event => event.type === 'venture_round_start'
      && (event.payload?.v === 2 || event.payload?.v === 3)
      && event.payload.date === date && typeof event.payload.roundId === 'string');
    const start = starts.at(-1);
    const close = readLog().find(event => event.type === 'venture_legacy_close' && event.payload?.date === date);
    const p = close?.payload ?? start?.payload;
    if (!p || typeof p.plant !== 'string' || typeof p.roundId !== 'string') return false;
    const roundId = p.roundId;
    const totalCollected = p.v === 3
      ? readLog().filter(event => event.type === 'venture_harvest_result' && event.payload?.v === 3
        && event.payload.roundId === roundId).reduce((sum, event) => sum + (integerValue(event.payload?.reward) ?? 0), 0)
      : readLog().filter(event => event.type === 'venture_pick' && event.payload?.v === 2
        && event.payload.roundId === roundId).reduce((sum, event) => sum + (numberValue(event.payload?.yield) ?? 0), 0);
    administrative = { roundId, date, day: integerValue(p.day) ?? elapsed + 1,
      plant: isPlant(p.plant) ? p.plant : 'apple',
      startedAt: numberValue(p.originalStartedAt ?? p.startedAt) ?? Date.now(),
      endsAt: numberValue(p.originalEndsAt ?? p.endsAt) ?? Date.now(), durationMs: numberValue(p.durationMs) ?? DEFAULT_ROUND_MS,
      totalCollected };
    replay = null; clearView();
    if (state.venturedOn !== date) { state.venturedOn = date; save(); }
    return true;
  }

  function restoreDay(): void {
    if (restoring) return;
    restoring = true;
    practice = null; activeBackground = null;
    resetTravelEffects();
    try {
      migrateV2();
      administrative = null; replay = null;
      const all = readLog();
      const starts = all.filter(event => event.type === 'venture_round_start' && event.payload?.v === VENTURE_FORMAT
        && event.payload.date === date && typeof event.payload.roundId === 'string');
      if (starts.length) {
        const primary = starts[0], roundId = primary.payload!.roundId as string;
        let parsed: RoundReplay | null = null;
        try { parsed = replayVentureRound(all.filter(event => event.payload?.roundId === roundId), PLANT_IDS, Date.now()); }
        catch { /* closeInvalidRound below */ }
        if (!parsed || parsed.invalidReason && !parsed.end) closeInvalidRound(primary);
        for (const extra of starts.slice(1)) closeInvalidRound(extra);
        const loaded = loadRound(roundId);
        if (!loaded || loaded.invalidReason && !loaded.end) {
          const end = readLog().find(event => event.type === 'venture_round_end' && event.payload?.roundId === roundId);
          const p = { ...primary.payload, ...end?.payload };
          administrative = { roundId, date, day: integerValue(p.day) ?? elapsed + 1,
            plant: isPlant(p.plant) ? p.plant : 'apple', startedAt: numberValue(p.startedAt) ?? primary.t,
            endsAt: numberValue(p.endsAt) ?? primary.t, durationMs: numberValue(p.durationMs) ?? 0,
            totalCollected: numberValue(p.totalCollected) ?? 0 };
          replay = null; clearView();
          state.venturedOn = date; save();
        } else if (loaded.end) {
          if (state.venturedOn !== date) { state.venturedOn = date; save(); }
        } else if (Date.now() >= loaded.round.endsAt || loaded.backgroundOpen
          || loaded.pendingAction && Date.now() >= loaded.pendingAction.scheduledReadyAt) {
          reconcile(true);
        }
      } else {
        const orphan = all.find(event => event.payload?.v === VENTURE_FORMAT && event.payload.mode === VENTURE_MODE
          && event.payload.date === date && event.type !== 'venture_legacy_close' && typeof event.payload.roundId === 'string');
        if (orphan) {
          closeOrphan(orphan);
          administrative = { roundId: String(orphan.payload!.roundId), date, day: elapsed + 1,
            plant: isPlant(orphan.payload!.plant) ? orphan.payload!.plant : 'apple', startedAt: orphan.t,
            endsAt: orphan.t, durationMs: 0, totalCollected: 0 };
          clearView();
        } else if (!showLegacyCompletion()) {
          clearView();
          if (state.venturedOn === date) { state.venturedOn = null; save(); }
        }
      }
      choiceSignature = '';
      syncView(); paint();
    } finally { restoring = false; }
  }

  function modelSnapshot(): { index: number; visualSeed: number; vertices: number; meshes: number; bounds: number[] } | null {
    if (!view || phase() === 'selection') return null;
    let vertices = 0, meshes = 0;
    view.model.group.traverse(object => {
      if (object instanceof THREE.Mesh) {
        meshes++;
        vertices += object.geometry.getAttribute('position')?.count ?? 0;
      }
    });
    return { index: view.index, visualSeed: view.visualSeed, vertices, meshes,
      bounds: [...view.bounds.min.toArray(), ...view.bounds.max.toArray()] };
  }

  plants.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('.venture-choice');
    if (button && plants.contains(button) && isPlant(button.dataset.plant)) {
      const via = event.detail === 0 ? 'keyboard' : 'choice';
      if (practiceDone()) startRound(button.dataset.plant, via);
      else beginPractice(button.dataset.plant, via);
    }
  });
  practiceStart.addEventListener('click', finishPractice);
  moveButton.addEventListener('click', event => chooseMove(event.detail === 0 ? 'keyboard' : 'button'));
  stage.addEventListener('pointerdown', event => {
    if (event.target instanceof Element && event.target.closest('.venture-actions')) return;
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    if (practice) tapPractice('pointer');
    else chooseHarvest('pointer');
  });
  // Pointer movement, release, cancellation and focus changes never cancel a queued harvest.
  // There is intentionally no pointerup/pointercancel decision handler.
  stage.addEventListener('contextmenu', event => event.preventDefault());
  stage.addEventListener('keydown', event => {
    if (event.target instanceof Element && event.target.closest('.venture-actions')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (practice) tapPractice('keyboard');
    else chooseHarvest('keyboard');
  });
  shell.addEventListener('keydown', event => {
    if (!(event.target instanceof Element) || !event.target.classList.contains('venture-choice') || phase() !== 'selection'
      || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    const choices = [...plants.querySelectorAll<HTMLButtonElement>('.venture-choice')];
    const focused = choices.indexOf(event.target as HTMLButtonElement);
    if (focused >= 0) choices[(focused + direction + choices.length) % choices.length].focus();
  });
  window.addEventListener('keydown', event => {
    if (!visible || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if (event.key.toLowerCase() === 'm') { event.preventDefault(); chooseMove('keyboard'); }
  });
  window.addEventListener('pagehide', () => { pageVisible = false; beginBackground('pagehide'); });
  window.addEventListener('pageshow', () => {
    pageVisible = true;
    if (replay) endBackground('pageshow', Date.now() >= replay.round.endsAt);
    reconcile(true);
    if (visible) fit();
  });
  window.addEventListener('storage', event => {
    if (event.key !== 'garden.log' && event.key !== 'garden.market.v1') return;
    crateSignature = '';
    paintCrate(phase());
  });

  function refresh(): void {
    const today = localDate(), days = daysSinceFirstOpen();
    if (today === date && days === elapsed) { reconcile(); opts.onChange(); return; }
    if (replay && !replay.end) finishRound('day_changed');
    date = today; elapsed = days;
    practice = null; activeBackground = null;
    replay = null; administrative = null; clearView();
    restoreDay(); opts.onChange();
  }

  new ResizeObserver(fit).observe(stage);
  restoreDay();
  window.setInterval(() => {
    const today = localDate(), days = daysSinceFirstOpen();
    if (today !== date || days !== elapsed) refresh();
    else reconcile();
  }, 100);
  reducedMotion.addEventListener('change', () => {
    resetTravelEffects(); syncView(); paint();
  });

  Object.assign((globalThis as any).garden, { venture: {
    get plant() { return selectedPlant(); },
    get date() { return currentRound()?.date ?? administrative?.date ?? null; },
    get day() { return elapsed + 1; },
    get dailyPlant() { return dailyPlant(); },
    get unlocked() { return unlockedCount(); },
    get phase() { return phase(); },
    get playable() { return canDecide(); },
    get walking() { return phase() === 'move_wait'; },
    get harvesting() { return phase() === 'harvest_wait'; },
    get occurrenceIndex() { return currentOccurrence()?.index ?? -1; },
    get occurrenceId() { return currentOccurrence()?.id ?? null; },
    get harvests() { return currentOccurrence()?.results.length ?? 0; },
    get displayedHarvestCount() { return replay?.displayedHarvestCount ?? 0; },
    get lastObservedYield() { return currentOccurrence()?.lastObservedYield ?? null; },
    get lastYield() { return currentOccurrence()?.lastObservedYield ?? null; },
    get roundYield() { return roundYield(); },
    get roundId() { return currentRound()?.id ?? administrative?.roundId ?? null; },
    get roundSeed() { return currentRound()?.roundSeed ?? null; },
    get startedAt() { return currentRound()?.startedAt ?? administrative?.startedAt ?? null; },
    get durationMs() { return currentRound()?.durationMs ?? startupProfile.durationMs; },
    get harvestDurationMs() { return currentRound()?.harvestDurationMs ?? startupProfile.harvestDurationMs; },
    get moveDurationMs() { return currentRound()?.moveDurationMs ?? startupProfile.moveDurationMs; },
    get endsAt() { return currentRound()?.endsAt ?? administrative?.endsAt ?? null; },
    get remainingMs() { return phase() === 'selection' ? startupProfile.durationMs : remainingMs(); },
    get decisionId() { return replay?.decision?.id ?? null; },
    get decisionPromptAt() { return replay?.decision?.promptedAt ?? null; },
    get actionId() { return replay?.pendingAction?.id ?? null; },
    get scheduledReadyAt() { return replay?.pendingAction?.scheduledReadyAt ?? null; },
    get harvestInteraction() { return VENTURE_HARVEST_INTERACTION; },
    get rngDrawIndex() { return currentOccurrence()?.rngTransitionCount ?? 0; },
    get practiceStatus() { return practice?.status ?? null; },
    get practiceCompleted() { return practiceDone(); },
    get practiceReward() { return practice?.reward ?? null; },
    get backgroundDurationMs() { return replay?.backgroundDurationMs ?? 0; },
    get backgroundInvalid() { return backgroundInvalid(replay?.backgroundDurationMs ?? 0, replay?.backgroundOpen ?? false); },
    backgroundIntervals() { return (replay?.backgroundIntervals ?? []).map(interval => ({ ...interval })); },
    rewardConfig() { return { ...REWARD_CONFIG }; },
    crateInventory() {
      const value = inventoryFrom(readLog(), readMarketLedger());
      return { total: value.total, byPlant: { ...value.byPlant }, resultIds: value.units.map(unit => unit.id) };
    },
    model: () => modelSnapshot(),
    framing: (model = false) => {
      const rect = modelFrame.getBoundingClientRect(), points: THREE.Vector3[] = [];
      if (!view) return { left: 0, top: 0, right: 0, bottom: 0 };
      const bounds = view.bounds;
      for (let corner = 0; corner < 8; corner++) points.push(new THREE.Vector3(
        corner & 1 ? bounds.max.x : bounds.min.x, corner & 2 ? bounds.max.y : bounds.min.y,
        corner & 4 ? bounds.max.z : bounds.min.z).project(camera));
      const xs = points.map(point => (point.x + 1) * rect.width / 2), ys = points.map(point => (1 - point.y) * rect.height / 2);
      return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    },
    presentation: () => presentationFor(selectedPlant(), view?.visualSeed ?? null),
    get travelPhase() { return stage.dataset.travel ?? null; },
    select(id: VenturePlantId) { if (isPlant(id)) practiceDone() ? startRound(id, 'check') : beginPractice(id, 'check'); },
    tap() { if (practice) tapPractice('check'); else return chooseHarvest('check'); },
    move() { chooseMove('check'); },
    finishPractice,
    reconcile() { reconcile(); },
  } });

  return {
    setVisible(value) { visible = value;
      if (value) { crateSignature = ''; paintCrate(phase()); }
      if (value && pageVisible) { reconcile(); fit(); } },
    setPageVisible(value) {
      if (!value) beginBackground('visibility_hidden');
      pageVisible = value;
      if (value) {
        if (replay) endBackground('visibility_revealed', Date.now() >= replay.round.endsAt);
        reconcile(true); if (visible) fit();
      }
    },
    refresh,
    doneToday: ventureDoneToday,
  };
}
