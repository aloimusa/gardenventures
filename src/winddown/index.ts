import { localDate, log } from '../state';
import { WinddownAudio } from './audio';
import { loadWinddown, saveWinddown, SOUNDS, type WinddownCategory } from './model';

export const WINDDOWN_AUDIO_CACHE = 'garden-winddown-audio-v1';
const MINUTE = 60_000;
const MAX_TIME = 24 * 60 * MINUTE;
const timeText = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Cache local audio once; playback itself never contacts a third-party origin. */
function precacheAudio(): void {
  if (!('caches' in window)) return;
  const ready = import.meta.env.PROD && 'serviceWorker' in navigator ? navigator.serviceWorker.ready : Promise.resolve();
  void ready.then(() => caches.open(WINDDOWN_AUDIO_CACHE))
    .then(cache => cache.addAll(SOUNDS.map(sound => new URL(sound.file, document.baseURI).href)))
    .catch(() => { /* Local media remains available when Cache Storage is not. */ });
}

export function mountWinddown(pane: HTMLElement, options: { onChange: () => void }) {
  const state = loadWinddown();
  pane.insertAdjacentHTML('beforeend', `
    <div class="wd-app" data-noswipe>
      <div class="wd-stage">
        <div class="wd-visual" data-shape="bubbles" data-tone="canton" aria-hidden="true">
          <div class="wd-shape"><i></i><i></i><i></i></div>
        </div>
        <div class="wd-clock" role="timer" aria-live="off">0:00</div>
        <p class="wd-state" data-wd-state role="status">Add time to begin</p>
      </div>
      <div class="wd-transport" role="group" aria-label="Playback timer controls">
        <button type="button" data-add="5">+5 min</button>
        <button type="button" data-add="30">+30 min</button>
        <button type="button" class="wd-pause" disabled>Pause</button>
        <button type="button" class="wd-stop" disabled>Stop</button>
      </div>
      <div class="wd-picker">
        <div class="wd-categories" role="group" aria-label="Sound category">
          <button type="button" data-category="static" aria-pressed="true">Static</button>
          <button type="button" data-category="nature" aria-pressed="false">Nature</button>
        </div>
        <div class="wd-list" role="group" aria-label="Sounds" data-category-panel="static"></div>
      </div>
      <div class="wd-media" hidden></div>
    </div>`);

  const root = pane.querySelector<HTMLElement>('.wd-app')!;
  const engine = new WinddownAudio(root.querySelector<HTMLElement>('.wd-media')!);
  const visual = root.querySelector<HTMLElement>('.wd-visual')!;
  const clock = root.querySelector<HTMLElement>('.wd-clock')!;
  const status = root.querySelector<HTMLElement>('[data-wd-state]')!;
  const pauseButton = root.querySelector<HTMLButtonElement>('.wd-pause')!;
  const stopButton = root.querySelector<HTMLButtonElement>('.wd-stop')!;
  engine.sound = state.sound;

  let remaining = 0;
  let deadline = 0;
  let ticker: number | undefined;
  let playPending = false;
  let revision = 0;
  let error = '';

  const sound = () => SOUNDS.find(item => item.id === state.sound) || SOUNDS[0];
  const persist = () => saveWinddown(state);
  const remainingNow = () => deadline ? Math.max(0, deadline - Date.now()) : remaining;

  function renderList(): void {
    root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
    });
    const list = root.querySelector<HTMLElement>('.wd-list')!;
    list.dataset.categoryPanel = state.category;
    list.setAttribute('aria-label', state.category === 'static' ? 'Static sounds' : 'Nature sounds');
    list.innerHTML = SOUNDS.filter(item => item.category === state.category).map(item => `
      <button class="wd-option" type="button" data-sound="${item.id}" aria-pressed="${item.id === state.sound}">
        <strong>${item.name}</strong><span class="wd-selected" aria-hidden="true"></span>
      </button>`).join('');
    list.querySelectorAll<HTMLButtonElement>('[data-sound]').forEach(button => {
      button.addEventListener('click', () => selectSound(button.dataset.sound!));
    });
  }

  function render(): void {
    if (deadline && remainingNow() <= 0) { resetSession('Time is up'); return; }
    const left = remainingNow();
    const current = sound();
    root.classList.toggle('playing', engine.playing);
    visual.dataset.shape = current.shape;
    visual.dataset.tone = current.id;
    clock.textContent = timeText(left);
    clock.setAttribute('aria-label', `${timeText(left)} remaining`);
    pauseButton.textContent = engine.playing || playPending ? 'Pause' : left > 0 ? 'Resume' : 'Pause';
    pauseButton.disabled = left <= 0;
    pauseButton.setAttribute('aria-label', engine.playing || playPending ? 'Pause and keep the remaining time' : 'Resume with the remaining time');
    stopButton.disabled = left <= 0 && !engine.playing && !playPending;
    status.textContent = error || (playPending ? 'Starting…' : engine.playing ? current.name : left > 0 ? 'Paused' : 'Add time to begin');
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sound]')) {
      button.setAttribute('aria-pressed', String(button.dataset.sound === state.sound));
    }
  }

  function clearTicker(): void {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
  }

  function pauseSession(message = ''): void {
    revision++;
    playPending = false;
    remaining = remainingNow();
    deadline = 0;
    clearTicker();
    engine.pause();
    error = message;
    render();
  }

  function resetSession(message = ''): void {
    revision++;
    playPending = false;
    remaining = 0;
    deadline = 0;
    clearTicker();
    engine.stop();
    error = message;
    render();
  }

  function update(): void {
    if (deadline && remainingNow() <= 0) { resetSession('Time is up'); return; }
    const text = timeText(remainingNow());
    if (clock.textContent !== text) {
      clock.textContent = text;
      clock.setAttribute('aria-label', `${text} remaining`);
    }
  }

  function ensureTicker(): void {
    if (ticker === undefined) ticker = window.setInterval(update, 200);
  }

  async function startPlayback(force = false): Promise<void> {
    if (remainingNow() <= 0) { resetSession(); return; }
    if (!force && (engine.playing || playPending)) return;
    const own = ++revision;
    playPending = true;
    error = '';
    render();
    try {
      if (!await engine.play(state.sound) || own !== revision) return;
      playPending = false;
      if (remainingNow() <= 0) { resetSession('Time is up'); return; }
      const today = localDate();
      const firstToday = state.completedOn !== today;
      state.completedOn = today;
      persist();
      log('winddown_played', { sound: state.sound, remainingMs: Math.round(remainingNow()) });
      if (firstToday) log('winddown_done', { date: today });
      options.onChange();
      render();
    } catch {
      if (own !== revision) return;
      playPending = false;
      pauseSession('Audio could not start. Try again.');
    }
  }

  function addTime(minutes: number): void {
    const left = Math.min(MAX_TIME, remainingNow() + minutes * MINUTE);
    remaining = left;
    deadline = Date.now() + left;
    ensureTicker();
    log('winddown_time_added', { minutes, remainingMs: Math.round(left) });
    void startPlayback();
    render();
  }

  function togglePause(): void {
    if (engine.playing || playPending) {
      pauseSession();
      log('winddown_paused', { remainingMs: Math.round(remaining) });
    } else if (remaining > 0) {
      deadline = Date.now() + remaining;
      ensureTicker();
      void startPlayback();
    }
    render();
  }

  function selectSound(id: string): void {
    if (!SOUNDS.some(item => item.id === id)) return;
    const changed = state.sound !== id;
    state.sound = id;
    persist();
    error = '';
    render();
    if (changed && (engine.playing || playPending)) {
      void startPlayback(true);
      log('winddown_sound_changed', { sound: id });
    }
  }

  root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => {
    button.addEventListener('click', () => {
      state.category = button.dataset.category as WinddownCategory;
      persist();
      renderList();
      render();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-add]').forEach(button => {
    button.addEventListener('click', () => addTime(Number(button.dataset.add)));
  });
  pauseButton.addEventListener('click', togglePause);
  stopButton.addEventListener('click', () => {
    log('winddown_stopped', { remainingMs: Math.round(remainingNow()) });
    resetSession();
  });

  if (new URLSearchParams(location.search).has('winddown-test')) {
    (globalThis as typeof globalThis & { __winddownTest?: unknown }).__winddownTest = {
      snapshot: () => ({ ...engine.snapshot(), pending: playPending, remainingMs: remainingNow(), completedOn: state.completedOn,
        selectedSound: state.sound, category: state.category, timerRunning: deadline > 0 }),
      setTimerSeconds: (seconds: number) => {
        const duration = Math.max(0.3, Math.min(5, seconds)) * 1000;
        remaining = duration;
        deadline = Date.now() + duration;
        ensureTicker();
        void startPlayback(true);
        render();
      },
    };
  }

  renderList();
  render();
  precacheAudio();

  return {
    doneToday: () => state.completedOn === localDate(),
    refresh: render,
  };
}
