// Focused Wind down checks: node scripts/check-winddown.mjs [url]
// Also exports winddownChecks for scripts/check.mjs. Audio is judged by media state, never by audible output.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

// Every cubic join, including closure, must have the same incoming and outgoing tangent.
function hasSmoothContour(contour) {
  const from = contour.match(/^shape\(from (-?[\d.]+)% (-?[\d.]+)%/);
  const curves = [...contour.matchAll(/curve to (-?[\d.]+)% (-?[\d.]+)% with (-?[\d.]+)% (-?[\d.]+)% \/ (-?[\d.]+)% (-?[\d.]+)%/g)]
    .map(match => match.slice(1).map(Number));
  if (!from || curves.length < 6 || !contour.endsWith('close)')
    || curves.length !== (contour.match(/curve to/g) || []).length) return false;
  return curves.every((curve, index) => {
    const previous = curves[(index + curves.length - 1) % curves.length];
    const origin = index === 0 ? from.slice(1).map(Number) : curves[index - 1].slice(0, 2);
    const incoming = [origin[0] - previous[4], origin[1] - previous[5]];
    const outgoing = [curve[2] - origin[0], curve[3] - origin[1]];
    return Math.hypot(incoming[0] - outgoing[0], incoming[1] - outgoing[1]) < .05;
  });
}

export async function winddownChecks({ page, check, BASE = 'http://127.0.0.1:8815/' }) {
  const url = new URL(BASE);
  url.searchParams.set('winddown-test', '1');
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('garden.winddown'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.tab[data-pane="winddown"]');
  await page.waitForTimeout(400);

  const snapshot = () => page.evaluate(() => window.__winddownTest.snapshot());
  const track = async id => (await snapshot()).tracks.find(t => t.id === id);
  const activeCount = async () => (await snapshot()).tracks.filter(t => !t.paused).length;
  const events = () => page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]'));
  const waitPlaying = id => page.waitForFunction(expected => {
    const s = window.__winddownTest.snapshot();
    return s.playing && !s.pending && s.sound === expected && !s.tracks.find(t => t.id === expected).paused;
  }, id);
  const shapeStyle = () => page.locator('.wd-shape').evaluate(el => {
    const style = getComputedStyle(el);
    return { width: el.offsetWidth, height: el.offsetHeight, overflow: style.overflow, radius: style.borderRadius,
      contour: style.clipPath, transform: style.transform, transition: style.transitionDuration,
      gas: [...el.children].map(gas => ({ filter: getComputedStyle(gas).filter, animation: getComputedStyle(gas).animationName })) };
  });

  const initial = await snapshot();
  check('Wind down: starts at zero with no autoplay', !initial.playing && !initial.pending && !initial.timerRunning
    && initial.remainingMs === 0 && initial.tracks.every(t => t.paused));
  check('Wind down: no visible header, Done today element, or source disclosure',
    await page.locator('.pane[data-pane="winddown"] .head:not(.sr), .wd-app [data-wd-done], .wd-app .wd-sources').count() === 0
      && !/Done today|Source & attribution/.test(await page.locator('.wd-app').innerText()));
  const transportLabels = await page.locator('.wd-transport button').allTextContents();
  check('Wind down: only the four simple timer transport controls', transportLabels.join(',') === '+5 min,+30 min,Pause,Stop'
    && await page.locator('.wd-app input, .wd-app select, .wd-app [data-volume], .wd-app .wd-master').count() === 0);
  const controlOrder = await page.evaluate(() => {
    const controls = document.querySelector('.wd-transport');
    const picker = document.querySelector('.wd-picker');
    const controlRect = controls.getBoundingClientRect();
    const pickerRect = picker.getBoundingClientRect();
    return { follows: Boolean(controls.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING),
      controlsBottom: controlRect.bottom, pickerTop: pickerRect.top };
  });
  check('Wind down: transport precedes the selector in DOM and visual order', controlOrder.follows
    && controlOrder.controlsBottom <= controlOrder.pickerTop + 1, JSON.stringify(controlOrder));
  check('Wind down: media volume is untouched and left to the device', initial.tracks.every(t => t.volume === 1));
  check('Wind down: Static and Nature each expose a simple two-option list',
    await page.locator('[data-category]').allTextContents().then(a => a.join(',') === 'Static,Nature')
      && await page.locator('[data-category-panel="static"] [data-sound]').count() === 2,
    'Static');

  check('Wind down: requested Canton track is the selected local asset', initial.selectedSound === 'canton'
    && initial.sound === 'canton' && (await track('canton')).src.endsWith('/audio/canton-white-noise-and-heartbeat.mp3')
    && (await track('canton')).src.startsWith(new URL(BASE).origin));
  const audioResponse = await page.request.head(new URL('audio/canton-white-noise-and-heartbeat.mp3', BASE).href);
  check('Wind down: actual Canton MP3 is available locally', audioResponse.ok() && Number(audioResponse.headers()['content-length']) === 14813276,
    `${audioResponse.status()} ${audioResponse.headers()['content-length'] || ''}`);

  const staticShape = await shapeStyle();
  check('Wind down: Canton is a broad tangent-smooth botanical form clipping three blurred drifting fills',
    await page.locator('.wd-shape').count() === 1 && staticShape.gas.length === 3
      && staticShape.width === 232 && staticShape.height === 202 && hasSmoothContour(staticShape.contour)
      && staticShape.radius !== '50%'
      && staticShape.overflow === 'hidden' && staticShape.gas.every(g => g.filter.includes('blur') && g.animation.startsWith('wd-drift-')),
    JSON.stringify(staticShape));
  check('Wind down: the selected sound marker is a tiny dash, not a circle', await page.locator('.wd-option[aria-pressed="true"] .wd-selected').evaluate(el => {
    const style = getComputedStyle(el);
    return el.offsetWidth === 9 && el.offsetHeight === 2 && style.borderRadius === '0px';
  }));
  const cantonPalette = await page.locator('.wd-shape').evaluate(el => {
    const style = getComputedStyle(el);
    return { variables: ['--wd-base', '--wd-a', '--wd-b', '--wd-c'].map(name => style.getPropertyValue(name).trim()),
      base: style.backgroundColor, fills: [...el.children].map(gas => getComputedStyle(gas).backgroundColor) };
  });
  check('Wind down: Canton resolves to garden green, pale yellow and pale pink rather than cyan',
    JSON.stringify(cantonPalette.variables) === JSON.stringify(['#b7c6a8', '#527b5d', '#efe3b5', '#d9aebc'])
      && cantonPalette.base === 'rgb(183, 198, 168)'
      && JSON.stringify(cantonPalette.fills) === JSON.stringify(['rgb(82, 123, 93)', 'rgb(239, 227, 181)', 'rgb(217, 174, 188)']),
    JSON.stringify(cantonPalette));
  check('Wind down: pane uses the original flat #07090c night color', await page.locator('.pane[data-pane="winddown"]')
    .evaluate(el => getComputedStyle(el).backgroundColor === 'rgb(7, 9, 12)'));
  await page.screenshot({ path: '/tmp/opencode/winddown-canton-390x844.png' });

  await page.click('[data-sound="soft-static"]');
  await page.waitForTimeout(300);
  const softShape = await shapeStyle();
  check('Wind down: Soft static is a tall tangent-smooth pebble with its own contour', softShape.width === 194 && softShape.height === 218
    && hasSmoothContour(softShape.contour)
    && softShape.contour !== staticShape.contour && softShape.overflow === 'hidden'
    && softShape.gas.every(g => g.filter.includes('blur') && g.animation.startsWith('wd-drift-')), JSON.stringify(softShape));
  await page.screenshot({ path: '/tmp/opencode/winddown-soft-static-390x844.png' });
  await page.click('[data-sound="canton"]');
  await page.waitForTimeout(300);

  await page.click('[data-category="nature"]');
  const natureOptions = await page.locator('[data-category-panel="nature"] [data-sound]').allTextContents();
  check('Wind down: Nature contains only Rain and Stream', natureOptions.map(text => text.trim()).join(',') === 'Rain,Stream');
  await page.click('[data-sound="rain"]');
  await page.waitForTimeout(300);
  const dropShape = await shapeStyle();
  check('Wind down: Rain keeps the gas inside a rounded tangent-smooth asymmetric droplet', await page.locator('.wd-visual').getAttribute('data-shape') === 'drop'
    && dropShape.width === 188 && dropShape.height === 218 && hasSmoothContour(dropShape.contour)
    && dropShape.contour !== softShape.contour && dropShape.transform !== 'none' && dropShape.overflow === 'hidden'
    && dropShape.gas.every(g => g.filter.includes('blur') && g.animation.startsWith('wd-drift-')), JSON.stringify(dropShape));
  check('Wind down: choosing a sound while stopped does not start it', !(await snapshot()).playing && (await activeCount()) === 0
    && (await snapshot()).remainingMs === 0);
  await page.screenshot({ path: '/tmp/opencode/winddown-rain-390x844.png' });
  await page.click('[data-sound="stream"]');
  await page.waitForTimeout(300);
  const streamShape = await shapeStyle();
  check('Wind down: Stream is a broad tangent-smooth undulating river stone distinct from the other contours',
    await page.locator('.wd-visual').getAttribute('data-shape') === 'oval'
    && streamShape.width === 246 && streamShape.height === 146 && hasSmoothContour(streamShape.contour)
    && streamShape.contour !== dropShape.contour
    && streamShape.contour !== softShape.contour && streamShape.overflow === 'hidden' && streamShape.gas.length === 3
    && streamShape.gas.every(g => g.filter.includes('blur') && g.animation.startsWith('wd-drift-')), JSON.stringify(streamShape));
  await page.screenshot({ path: '/tmp/opencode/winddown-stream-390x844.png' });
  await page.click('[data-sound="rain"]');
  await page.click('[data-category="static"]');
  await page.click('[data-sound="canton"]');

  const completionsBefore = (await events()).filter(e => e.type === 'winddown_done').length;
  await page.click('[data-add="5"]');
  await waitPlaying('canton');
  let now = await snapshot();
  check('Wind down: +5 min starts playback and sets five real minutes', now.remainingMs > 295000 && now.remainingMs <= 300000
    && now.timerRunning && (await activeCount()) === 1, `${Math.round(now.remainingMs)}ms`);
  check('Wind down: first successful play records daily completion once without a Done label', now.completedOn
    && await page.locator('[data-wd-done]').count() === 0
    && await page.locator('.tab[data-pane="winddown"]').evaluate(el => el.classList.contains('done'))
    && (await events()).filter(e => e.type === 'winddown_done').length === completionsBefore + 1);
  await page.waitForTimeout(450);
  const beforeThirty = (await snapshot()).remainingMs;
  await page.click('[data-add="30"]');
  now = await snapshot();
  const thirtyDelta = beforeThirty + 30 * 60000 - now.remainingMs;
  check('Wind down: +30 min increments the existing absolute deadline', thirtyDelta >= 0 && thirtyDelta < 2000
    && now.remainingMs > 2000000 && (await activeCount()) === 1, `elapsed allowance=${Math.round(thirtyDelta)}ms`);

  await page.click('.wd-pause');
  const paused = await snapshot();
  await page.waitForTimeout(350);
  now = await snapshot();
  check('Wind down: Pause freezes remaining time and media position', !now.playing && !now.timerRunning
    && now.remainingMs === paused.remainingMs && now.tracks.every(t => t.paused)
    && (await track('canton')).currentTime === paused.tracks.find(t => t.id === 'canton').currentTime
    && await page.locator('.wd-pause').innerText() === 'Resume');
  const pausedPosition = (await track('canton')).currentTime;
  const pausedRemaining = (await snapshot()).remainingMs;
  await page.click('.wd-pause');
  await waitPlaying('canton');
  await page.waitForTimeout(250);
  now = await snapshot();
  check('Wind down: Resume continues the same recording and remaining time', now.timerRunning
    && now.remainingMs <= pausedRemaining && now.remainingMs > pausedRemaining - 2000
    && (await track('canton')).currentTime >= pausedPosition
    && (await events()).filter(e => e.type === 'winddown_done').length === completionsBefore + 1);

  await page.click('[data-category="nature"]');
  check('Wind down: changing category alone preserves the playing sound', (await snapshot()).selectedSound === 'canton'
    && (await snapshot()).sound === 'canton' && !(await track('canton')).paused);
  await page.click('[data-sound="rain"]');
  await waitPlaying('rain');
  check('Wind down: selecting another sound during playback switches one active audio', (await activeCount()) === 1
    && (await track('canton')).paused && !(await track('rain')).paused && (await snapshot()).selectedSound === 'rain');
  await page.click('.wd-pause');
  const rainPausedTime = (await snapshot()).remainingMs;
  await page.click('[data-sound="stream"]');
  now = await snapshot();
  check('Wind down: selecting while paused changes only the selection', now.selectedSound === 'stream' && !now.playing
    && now.remainingMs === rainPausedTime && now.tracks.every(t => t.paused));
  await page.click('.wd-stop');
  now = await snapshot();
  check('Wind down: Stop resets time, every media position, and controls', now.remainingMs === 0 && !now.playing && !now.timerRunning
    && now.tracks.every(t => t.paused && t.currentTime === 0) && await page.locator('.wd-clock').innerText() === '0:00'
    && await page.locator('.wd-pause').isDisabled() && await page.locator('.wd-stop').isDisabled());

  // A browser policy or device failure must leave a retryable paused timer, never a false playing state.
  await page.evaluate(() => {
    window.__wdOriginalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Test policy rejection', 'NotAllowedError'));
  });
  await page.click('[data-add="5"]');
  await page.waitForFunction(() => !window.__winddownTest.snapshot().pending);
  now = await snapshot();
  check('Wind down: audio play rejection is honest, paused, and retryable', !now.playing && now.tracks.every(t => t.paused)
    && now.remainingMs > 295000 && (await page.locator('[data-wd-state]').innerText()).includes('Audio could not start'));
  await page.evaluate(() => { HTMLMediaElement.prototype.play = window.__wdOriginalPlay; delete window.__wdOriginalPlay; });
  await page.click('.wd-pause');
  await waitPlaying('stream');
  check('Wind down: Resume recovers after a rejected audio play', (await activeCount()) === 1 && (await snapshot()).selectedSound === 'stream');
  await page.click('.wd-stop');

  await page.evaluate(() => window.__winddownTest.setTimerSeconds(1));
  await waitPlaying('stream');
  check('Wind down: query-only test hook creates a short absolute timer', (await snapshot()).remainingMs > 0
    && (await snapshot()).remainingMs <= 1000 && (await snapshot()).timerRunning);
  await page.waitForFunction(() => {
    const s = window.__winddownTest.snapshot();
    return s.remainingMs === 0 && !s.playing && s.tracks.every(t => t.paused);
  }, undefined, { timeout: 5000 });
  check('Wind down: expiry deterministically stops and resets to zero', await page.locator('.wd-clock').innerText() === '0:00'
    && (await page.locator('[data-wd-state]').innerText()).includes('Time is up') && (await activeCount()) === 0);

  await page.click('[data-category="nature"]');
  await page.click('[data-sound="rain"]');
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.tab[data-pane="winddown"]');
  await page.waitForTimeout(400);
  now = await snapshot();
  check('Wind down: reload persists selection and completion but never resumes audio', now.selectedSound === 'rain' && now.category === 'nature'
    && now.completedOn && now.remainingMs === 0 && !now.playing && !now.timerRunning && now.tracks.every(t => t.paused)
    && await page.locator('[data-sound="rain"]').getAttribute('aria-pressed') === 'true'
    && await page.locator('[data-wd-done]').count() === 0);

  await page.focus('[data-category="static"]');
  await page.keyboard.press('Enter');
  await page.focus('[data-sound="soft-static"]');
  await page.keyboard.press('Space');
  check('Wind down: categories and single-choice options work by keyboard', now && (await snapshot()).selectedSound === 'soft-static'
    && await page.locator('[data-category="static"]').getAttribute('aria-pressed') === 'true'
    && await page.locator('[data-sound="soft-static"]').getAttribute('aria-pressed') === 'true' && (await activeCount()) === 0);
  await page.focus('[data-add="5"]');
  await page.keyboard.press('Enter');
  await waitPlaying('soft-static');
  await page.focus('.wd-pause');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !window.__winddownTest.snapshot().playing && window.__winddownTest.snapshot().remainingMs > 0);
  await page.focus('.wd-stop');
  await page.keyboard.press('Enter');
  check('Wind down: +5, Pause and Stop are fully keyboard operable', (await snapshot()).remainingMs === 0
    && (await snapshot()).tracks.every(t => t.paused && t.currentTime === 0));

  // Repeated additions remain bounded; this is still an absolute timer, never an indefinite mode.
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('[data-add="30"]').click(); });
  now = await snapshot();
  check('Wind down: repeated additions are capped at a bounded 24 hours', now.remainingMs <= 86400000 && now.remainingMs > 86390000
    && await page.locator('.wd-clock').innerText() === '1440:00', `${Math.round(now.remainingMs)}ms`);
  await page.click('.wd-stop');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await shapeStyle();
  check('Wind down: reduced motion retains the organic contour while disabling gas animation and shape transitions',
    reduced.gas.every(g => g.animation === 'none') && reduced.transition === '0s'
      && reduced.contour === softShape.contour && reduced.width === 194 && reduced.height === 218, JSON.stringify(reduced));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.waitForFunction(async () => {
    const cache = await caches.open('garden-winddown-audio-v1');
    return (await cache.keys()).length >= 4;
  });
  const cached = await page.evaluate(async () => {
    const cache = await caches.open('garden-winddown-audio-v1');
    return (await cache.keys()).map(request => request.url);
  });
  check('Wind down: all four audio assets are precached locally', ['canton-white-noise-and-heartbeat', 'soft-static-generated', 'rain-generated', 'stream-generated']
    .every(name => cached.some(url => url.includes(`/audio/${name}.mp3`))), `${cached.length} cached`);

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    const readLayout = () => page.evaluate(() => {
      const app = document.querySelector('.wd-app');
      const controls = [...document.querySelectorAll('.wd-app button')]
        .filter(el => el.getClientRects().length && !el.closest('[hidden]')).map(el => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent.trim(), left: r.left, right: r.right, width: r.width,
            fits: r.left >= -1 && r.right <= innerWidth + 1 && r.width >= 32 };
        });
      const pane = document.querySelector('.pane[data-pane="winddown"]').getBoundingClientRect();
      const viewportEl = document.querySelector('.viewport');
      const track = document.querySelector('.track');
      return {
        width: innerWidth,
        height: innerHeight,
        pageWidth: document.documentElement.scrollWidth,
        appWidth: app.scrollWidth,
        appClientWidth: app.clientWidth,
        appHeight: app.scrollHeight,
        appClientHeight: app.clientHeight,
        controlsFit: controls.every(control => control.fits),
        controls,
        pane: { left: pane.left, right: pane.right, width: pane.width },
        viewportScrollLeft: viewportEl.scrollLeft,
        trackTransform: getComputedStyle(track).transform,
        trackVariable: track.style.getPropertyValue('--i'),
      };
    });
    // Preserve the former fixed-delay sample before synchronizing, so a load-only slide cannot disappear
    // without leaving evidence of its actual rectangles and transform.
    let layout = await readLayout();
    if (!layout.controlsFit) {
      const stem = `/tmp/opencode/winddown-layout-${viewport.width}x${viewport.height}-before-wait`;
      await writeFile(`${stem}.json`, JSON.stringify(layout, null, 2));
      await page.screenshot({ path: `${stem}.png` });
    }
    // A timer alone can finish before the compositor has completed the pane slide/resize under load.
    // Measure only after the actual Wind down pane occupies the requested viewport. If it never does,
    // retain the original fit assertion below and persist the geometry that caused the failure.
    await page.waitForFunction(expected => {
      const pane = document.querySelector('.pane[data-pane="winddown"]');
      const r = pane.getBoundingClientRect();
      return innerWidth === expected.width && innerHeight === expected.height
        && Math.abs(r.left) < .5 && Math.abs(r.right - innerWidth) < .5;
    }, viewport, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    layout = await readLayout();
    const fits = layout.pageWidth <= layout.width && layout.appWidth <= layout.appClientWidth
      && layout.appHeight <= layout.appClientHeight + 1 && layout.controlsFit;
    if (!fits) {
      const stem = `/tmp/opencode/winddown-layout-${viewport.width}x${viewport.height}-FAIL`;
      await writeFile(`${stem}.json`, JSON.stringify(layout, null, 2));
      await page.screenshot({ path: `${stem}.png` });
    }
    check(`Wind down: ${viewport.width}x${viewport.height} layout fits without overflow`, fits, JSON.stringify(fits ? {
      width: layout.width, height: layout.height, pageWidth: layout.pageWidth, appWidth: layout.appWidth,
      appClientWidth: layout.appClientWidth, appHeight: layout.appHeight, appClientHeight: layout.appClientHeight,
      controlsFit: layout.controlsFit,
    } : layout));
    for (const [sound, category] of [['canton', 'static'], ['soft-static', 'static'], ['rain', 'nature'], ['stream', 'nature']]) {
      await page.click(`[data-category="${category}"]`);
      await page.click(`[data-sound="${sound}"]`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `/tmp/opencode/winddown-${sound}-${viewport.width}x${viewport.height}.png` });
    }
  }

  const sourceDoc = await readFile(new URL('../docs/winddown.md', import.meta.url), 'utf8');
  check('Wind down: source documentation retains attribution and unversioned CC BY honestly', sourceDoc.includes('White Noise and Heartbeat')
    && sourceDoc.includes('canton') && sourceDoc.includes('CC BY (license version not specified)')
    && sourceDoc.includes('synthesized placeholders') && sourceDoc.includes('Soft static, Rain and Stream')
    && sourceDoc.includes('../public/audio/SOURCES.md'));

  const controlled = await page.evaluate(() => 'serviceWorker' in navigator && !!navigator.serviceWorker.controller);
  if (controlled) {
    await page.click('[data-category="static"]');
    await page.click('[data-sound="soft-static"]');
    const shellAssets = await page.evaluate(() => ({
      script: document.querySelector('script[type="module"]')?.src,
      style: document.querySelector('link[rel="stylesheet"]')?.href,
    }));
    const context = page.context();
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__winddownTest);
      const offlineShell = await page.evaluate(expected => ({
        sameScript: document.querySelector('script[type="module"]')?.src === expected.script,
        sameStyle: document.querySelector('link[rel="stylesheet"]')?.href === expected.style,
        styleLoaded: [...document.styleSheets].some(sheet => {
          try { return sheet.href === expected.style && sheet.cssRules.length > 0; } catch { return false; }
        }),
      }), shellAssets);
      check('Wind down: offline reload loads the current hashed JS and CSS despite Vary Origin', offlineShell.sameScript
        && offlineShell.sameStyle && offlineShell.styleLoaded && await page.locator('#app .wd-app').count() === 1);
      await page.click('.tab[data-pane="winddown"]');
      const offlineInitial = await snapshot();
      check('Wind down: offline reload preserves the shell without autoplay', offlineInitial.selectedSound === 'soft-static'
        && offlineInitial.remainingMs === 0 && offlineInitial.tracks.every(t => t.paused));
      await page.click('[data-add="5"]');
      await waitPlaying('soft-static');
      check('Wind down: cached selected audio plays offline with one active track', (await activeCount()) === 1
        && (await snapshot()).remainingMs > 0 && !(await track('soft-static')).paused);
      await page.click('.wd-stop');
    } finally {
      await context.setOffline(false);
    }

    // Re-registering at a new script URL drives a real install/activate cycle without changing the build.
    const activation = await page.evaluate(async () => {
      const legacyName = 'garden-legacytest';
      const legacy = await caches.open(legacyName);
      await legacy.put(new URL('legacy-sentinel', document.baseURI).href, new Response('old shell'));
      const registration = await navigator.serviceWorker.register('./sw.js?winddown-update-test=1');
      const worker = registration.installing || registration.waiting;
      if (worker && worker.state !== 'activated') {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Service worker update did not activate')), 10000);
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') { clearTimeout(timeout); resolve(); }
            if (worker.state === 'redundant') { clearTimeout(timeout); reject(new Error('Service worker update became redundant')); }
          });
        });
      }
      const audio = await caches.open('garden-winddown-audio-v1');
      return { legacyExists: (await caches.keys()).includes(legacyName), audioCount: (await audio.keys()).length };
    });
    check('Wind down: activation clears an old shell but preserves the custom audio cache', !activation.legacyExists
      && activation.audioCount === 4, JSON.stringify(activation));
  } else console.log('--   Wind down: offline playback skipped (development server has no service worker)');

  // Exported suites may share a page. Do not leak the compact layout or reduced-motion fixture onward.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
}

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
  const BASE = process.argv[2] || 'http://127.0.0.1:8815/';
  const ORIGIN = new URL(BASE).origin;
  const results = [];
  const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`); };
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    const page = await context.newPage();
    const errors = [], foreign = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== ORIGIN) foreign.push(u); });
    await winddownChecks({ page, check, BASE });
    check('Wind down: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('Wind down: no request leaves the origin', foreign.length === 0, foreign.slice(0, 3).join(' '));
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} Wind down checks passed`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
