import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/space-grotesk/latin-600.css';
import './style.css';
import { ICONS, MARK } from './icons';
import { log, wateredToday, type PaneId } from './state';
import { mountHome } from './home';
import { mountReflect } from './reflect';
import { mountVenture } from './venture';
import { mountToolkit } from './toolkit';
import { mountWinddown } from './winddown';

interface PaneDef { id: PaneId; label: string; title: string; sub?: string; completable: boolean }

const PANES: PaneDef[] = [
  { id: 'winddown', label: 'Wind down', title: 'Wind down', sub: 'A sound for a little while.', completable: true },
  { id: 'reflect', label: 'Reflect', title: 'Reflect', sub: 'Tap a card to turn it. Hold it to rewrite or remove. Older cards are above.', completable: true },
  { id: 'home', label: 'Home', title: 'Home', completable: true },
  { id: 'venture', label: 'Venture', title: 'Venture', sub: 'The garden. One round a day.', completable: true },
  { id: 'toolkit', label: 'Toolkit', title: 'Toolkit', sub: 'Your plan, your person, your line.', completable: false },
];

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="viewport"><div class="track">${PANES.map(p => `
    <section class="pane" data-pane="${p.id}" aria-label="${p.label}" ${p.id === 'home' ? '' : 'aria-hidden="true"'}>
      <div class="head sr"><h1>${p.title}</h1>${p.sub ? `<p class="sub">${p.sub}</p>` : ''}</div>
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

const home = mountHome(panes.find(p => p.dataset.pane === 'home')!, { onChange: refreshMarks, onSkipDay: () => refreshAll() });
const reflect = mountReflect(panes.find(p => p.dataset.pane === 'reflect')!, {
  onChange: refreshMarks,
  navigate: id => {
    if (id === 'toolkit') toolkit.openPlan();
    show(PANES.findIndex(p => p.id === id), 'link');
  },
});
const venture = mountVenture(panes.find(p => p.dataset.pane === 'venture')!, { onChange: refreshMarks });
const toolkit = mountToolkit(panes.find(p => p.dataset.pane === 'toolkit')!, { onDayChange: refreshAll, onPlanChange: reflect.refresh });
const winddown = mountWinddown(panes.find(p => p.dataset.pane === 'winddown')!, { onChange: refreshMarks });

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
  reflect.setVisible(id === 'reflect');
  venture.setVisible(id === 'venture');
  if (changed) log('pane_view', { pane: id, via: why });
}

function refreshMarks(): void {
  const done: Record<string, boolean> = { home: wateredToday(), reflect: reflect.doneToday(), venture: venture.doneToday(), winddown: winddown.doneToday() };
  tabs.forEach(t => t.classList.toggle('done', !!done[t.dataset.pane!]));
}

tabs.forEach((t, k) => t.addEventListener('click', () => show(k, 'bar')));

function refreshAll(): void {
  refreshMarks();
  home.refresh();
  reflect.refresh();
  venture.refresh();
  toolkit.refresh();
  winddown.refresh();
}

// the local date can turn while the app is open
setInterval(refreshAll, 30_000);
document.addEventListener('visibilitychange', () => {
  home.setPageVisible(document.visibilityState === 'visible');
  venture.setPageVisible(document.visibilityState === 'visible');
  if (document.visibilityState === 'visible') refreshAll();
});

log('app_open', { standalone: matchMedia('(display-mode: standalone)').matches });
show(index, 'open');
refreshMarks();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
