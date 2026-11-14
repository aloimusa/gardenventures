import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/space-grotesk/latin-600.css';
import './style.css';
import { ICONS, MARK } from './icons';
import { log, wateredToday, type PaneId } from './state';
import { mountHome } from './home';

interface PaneDef { id: PaneId; label: string; title: string; sub?: string; completable: boolean }

const PANES: PaneDef[] = [
  { id: 'winddown', label: 'Wind down', title: 'Wind down', sub: 'A sound for the night.', completable: true },
  { id: 'reflect', label: 'Reflect', title: 'Reflect', sub: 'Words or a photo, and one sentence back.', completable: true },
  { id: 'home', label: 'Home', title: 'Home', completable: true },
  { id: 'venture', label: 'Venture', title: 'Venture', sub: 'The garden. One round a day.', completable: true },
  { id: 'toolkit', label: 'Toolkit', title: 'Toolkit', sub: 'Your plan, your person, your line.', completable: false },
];

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="viewport"><div class="track">${PANES.map(p => `
    <section class="pane" data-pane="${p.id}" aria-label="${p.label}" ${p.id === 'home' ? '' : 'aria-hidden="true"'}>
      <div class="head"><h1>${p.title}</h1>${p.sub ? `<p class="sub">${p.sub}</p>` : ''}</div>
    </section>`).join('')}
  </div></main>
  <nav class="bar" aria-label="Panes">${PANES.map(p => `
    <button class="tab" data-pane="${p.id}" type="button">
      <span class="mark">${p.completable ? MARK : ''}</span>${ICONS[p.id]}<span class="label">${p.label}</span>
    </button>`).join('')}
  </nav>`;

const track = app.querySelector<HTMLElement>('.track')!;
const bar = app.querySelector<HTMLElement>('.bar')!;
const tabs = [...bar.querySelectorAll<HTMLButtonElement>('.tab')];
const panes = [...track.querySelectorAll<HTMLElement>('.pane')];
const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!;

const home = mountHome(panes.find(p => p.dataset.pane === 'home')!, { onChange: refreshMarks });

let index = PANES.findIndex(p => p.id === 'home');

function show(i: number, why: string): void {
  i = Math.max(0, Math.min(PANES.length - 1, i));
  const changed = i !== index;
  index = i;
  const id = PANES[i].id;
  track.style.setProperty('--i', String(i));
  tabs.forEach((t, k) => k === i ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'));
  panes.forEach((p, k) => k === i ? p.removeAttribute('aria-hidden') : p.setAttribute('aria-hidden', 'true'));
  const night = id === 'winddown';
  bar.classList.toggle('night', night);
  document.body.classList.toggle('night', night);
  themeMeta.content = night ? '#07090c' : '#f4f6f3';
  home.setVisible(id === 'home');
  if (changed) log('pane_view', { pane: id, via: why });
}

function refreshMarks(): void {
  tabs.forEach(t => t.classList.toggle('done', t.dataset.pane === 'home' && wateredToday()));
}

tabs.forEach((t, k) => t.addEventListener('click', () => show(k, 'bar')));

// Swipe between panes: a quick, mostly horizontal flick. The bar stays the primary control; a hold on the plant
// that wanders is not a flick (it is slow), so the two do not fight.
let sx = 0, sy = 0, st = 0, sid = -1;
const viewport = app.querySelector<HTMLElement>('.viewport')!;
viewport.addEventListener('pointerdown', e => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; st = performance.now(); });
viewport.addEventListener('pointerup', e => {
  if (e.pointerId !== sid) return;
  sid = -1;
  const dx = e.clientX - sx, dy = e.clientY - sy, dt = performance.now() - st;
  if (Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy) && dt < 600) {
    home.cancelHold();
    show(index + (dx < 0 ? 1 : -1), 'swipe');
  }
});
viewport.addEventListener('pointercancel', () => { sid = -1; });

// the local date can turn while the app is open
setInterval(() => { refreshMarks(); home.refresh(); }, 30_000);
document.addEventListener('visibilitychange', () => {
  home.setPageVisible(document.visibilityState === 'visible');
  if (document.visibilityState === 'visible') { refreshMarks(); home.refresh(); }
});

log('app_open', { standalone: matchMedia('(display-mode: standalone)').matches });
show(index, 'open');
refreshMarks();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
