// Focused Home watering checks: node scripts/check-home.mjs [url]
// Exports homeChecks for scripts/check.mjs. Timing checks use real pointer/keyboard/touch holds and the rendered rig.
// HOME_ISOLATE_VENTURE=1 stubs only the paused, unrelated Venture module so this focused harness can still run.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const near = (a, b, tolerance = 0.001) => Math.abs(a - b) <= tolerance;
const distance = (a, b) => Math.hypot(...b.map((n, i) => n - a[i]));
const normal = a => { const length = Math.hypot(...a); return a.map(n => n / length); };
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const skipDay = async page => {
  await page.click('.tab[data-pane="toolkit"]');
  await page.click('[data-option="skip-day"]');
  await page.click('.tab[data-pane="home"]');
  await page.waitForFunction(() => window.garden?.homeSnapshot);
  await page.waitForTimeout(250);
};

export async function homeChecks({ page, check, BASE = 'http://127.0.0.1:8815/', isolateVenture = false }) {
  if (isolateVenture) {
    await page.route('**/src/venture/index.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
      export function mountVenture() { return { setVisible() {}, setPageVisible() {}, doneToday() { return false }, refresh() {} }; }
    ` }));
  }
  const screenshots = [
    '/tmp/opencode/home-idle-390.png', '/tmp/opencode/home-pour-left-390.png',
    '/tmp/opencode/home-pour-right-390.png', '/tmp/opencode/home-pour-center-390.png',
    '/tmp/opencode/home-reward-390.png', '/tmp/opencode/home-watered-390.png',
    '/tmp/opencode/home-reduced-reward-390.png',
    '/tmp/opencode/home-pill-1s-390.png', '/tmp/opencode/home-pill-2_5s-390.png',
    '/tmp/opencode/home-completion-arrival-390.png', '/tmp/opencode/home-completion-moving-390.png',
    '/tmp/opencode/home-repeat-390.png', '/tmp/opencode/home-fresh-hold-390.png',
  ];
  const snapshot = async () => {
    await page.waitForFunction(() => window.garden?.homeSnapshot);
    return page.evaluate(() => garden.homeSnapshot());
  };
  const events = () => page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]'));
  const count = async type => (await events()).filter(e => e.type === type).length;
  const storedState = () => page.evaluate(() => localStorage.getItem('garden.state'));
  const status = () => page.locator('[data-pane="home"] .watered-status').evaluate(el => ({
    hidden: el.hidden, text: el.textContent, fresh: el.classList.contains('fresh'), animation: getComputedStyle(el).animationName,
    top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom,
    width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
    centered: Math.abs(el.textContent.length ? el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 - innerWidth / 2 : 0) < 1,
  }));
  const bottom = () => page.locator('.water-label').innerText();
  const fill = () => page.locator('.water').evaluate(el => ({
    heldMs: garden.homeSnapshot().heldMs,
    fraction: Number(el.style.getPropertyValue('--hold-progress')),
    seconds: Number(el.getAttribute('aria-valuenow')),
    waterHeight: parseFloat(getComputedStyle(el, '::before').height),
    pillHeight: el.getBoundingClientRect().height,
  }));
  const homeDone = () => page.locator('.tab[data-pane="home"]').evaluate(el => el.classList.contains('done'));
  const visibleHomeButtons = () => page.locator('[data-pane="home"] button').evaluateAll(els => els.filter(el => {
    const r = el.getBoundingClientRect(), style = getComputedStyle(el);
    return !el.hidden && style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }).map(el => el.textContent.trim()));
  const checkAim = (label, s) => {
    const expected = normal(s.waterTarget.map((n, i) => n - s.spoutPosition[i]));
    const alignment = dot(expected, normal(s.outletDirection));
    const spoutDistance = distance(s.waterTarget, s.spoutPosition), handleDistance = distance(s.waterTarget, s.handlePosition);
    check(`Home: ${label} physical rose points at the fixed bark target`, alignment > 0.995 && s.outletAimDot > 0.995,
      `dot=${alignment.toFixed(5)}, spout=${s.spoutPosition.map(n => n.toFixed(2))}`);
    const radial = normal(s.spoutPosition.map((n, i) => n - s.canPosition[i]));
    const radialAlignment = dot(radial, normal(s.outletDirection));
    check(`Home: ${label} spout tube and rose share one forward local axis`, radialAlignment > 0.999 && spoutDistance < handleDistance,
      `tube/outlet dot=${radialAlignment.toFixed(5)}, spout=${spoutDistance.toFixed(3)}, handle=${handleDistance.toFixed(3)}`);
    const tilt = Math.acos(Math.max(-1, Math.min(1, s.bodyUpDirection[1]))) * 180 / Math.PI;
    const handleOffset = s.handlePosition.map((n, i) => n - s.canPosition[i]);
    const outward = handleOffset[0] * (s.canPosition[0] - s.waterTarget[0])
      + handleOffset[2] * (s.canPosition[2] - s.waterTarget[2]);
    const leansIn = s.bodyUpDirection[0] * (s.waterTarget[0] - s.canPosition[0]);
    const tiltRange = label.includes('centre') ? tilt >= 50 && tilt <= 78 : tilt >= 20 && tilt <= 60;
    check(`Home: ${label} body tips in, outer handle lifts, and lid never inverts`, tiltRange && s.canUp > 0.3
      && leansIn > 0 && handleOffset[1] > 0.07 && outward > 0,
      `body tilt=${tilt.toFixed(1)}°, handle rise=${handleOffset[1].toFixed(3)}, outward=${outward.toFixed(3)}, lean=${leansIn.toFixed(3)}`);
    check(`Home: ${label} particles originate at that same rose`, !!s.lastDropOrigin && distance(s.lastDropOrigin, s.spoutPosition) < 0.04,
      s.lastDropOrigin ? `emitter gap=${distance(s.lastDropOrigin, s.spoutPosition).toFixed(4)}` : 'no drop origin');
  };
  const holdPastFiveAndDispatchBeforeFrame = (kind, pointerId = 1) => page.evaluate(({ kind, pointerId }) => {
    // This deterministic focused-harness task occupies one JS turn across the 5s boundary: no intervening rAF is
    // possible. It tests the actual production event handler, without installing a production test clock/global.
    const s = garden.homeSnapshot();
    const deadline = performance.now() + Math.max(0, 5120 - s.heldMs);
    while (performance.now() < deadline) { /* deliberately prevent the next animation frame */ }
    const target = document.querySelector('.stage');
    if (kind === 'key') target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    else {
      const type = kind === 'blur' ? null : kind === 'cancel' ? 'pointercancel' : 'pointerup';
      if (type) target.dispatchEvent(new PointerEvent(type, { pointerId, isPrimary: true, bubbles: true, button: 0 }));
      else dispatchEvent(new Event('blur'));
    }
    return { snapshot: garden.homeSnapshot(), log: JSON.parse(localStorage.getItem('garden.log') || '[]') };
  }, { kind, pointerId });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.garden?.homeSnapshot);
  await page.waitForTimeout(350);

  const idle = await snapshot();
  check('Home: idle has no can, water or active hold', !idle.canVisible && idle.drops === 0 && !idle.flowing && !idle.holding,
    JSON.stringify(idle));
  check('Home: idle shows passive guidance and no hidden Home hold button', (await status()).hidden && await bottom() === 'Hold to water'
    && (await visibleHomeButtons()).join(',') === '');
  check('Home: stage alone carries the accessible keyboard hold route', (await page.getAttribute('.stage', 'role')) === 'button'
    && (await page.getAttribute('.stage', 'tabindex')) === '0' && (await page.getAttribute('.stage', 'aria-keyshortcuts')) === 'Space Enter'
    && (await page.getAttribute('.stage', 'aria-label')).includes('1 second')
    && (await page.locator('#home-water-help').innerText()).includes('5 seconds'));
  check('Home: pill is a named, non-focusable, pointer-inert progress readout', await page.locator('.water').evaluate(el => ({
    pass: el.tagName === 'DIV' && el.getAttribute('role') === 'progressbar' && el.tabIndex === -1
      && getComputedStyle(el).pointerEvents === 'none' && !el.hasAttribute('aria-keyshortcuts')
      && el.getAttribute('aria-describedby') === 'home-water-help' && el.getAttribute('aria-valuemax') === '5',
  })).then(x => x.pass));
  check('Home: guidance is centered and contains no visible counter', await page.locator('.water').evaluate(el => {
    const label = el.querySelector('.water-label'), a = el.getBoundingClientRect(), b = label.getBoundingClientRect();
    return getComputedStyle(el).textAlign === 'center' && Math.abs(a.left + a.width / 2 - b.left - b.width / 2) < 1
      && label.textContent === 'Hold to water' && !/[\d/]/.test(label.textContent);
  }));
  const stage = await page.locator('.stage').boundingBox();
  const readout = await page.locator('.water').boundingBox();
  const inertLogLength = (await events()).length;
  await page.mouse.click(readout.x + readout.width / 2, readout.y + readout.height / 2);
  check('Home: actual click on the passive pill starts no hold, flow or logs', !(await snapshot()).holding
    && !(await snapshot()).canVisible && (await snapshot()).drops === 0 && (await events()).length === inertLogLength);
  const hit = await page.evaluate(() => garden.hitBox());
  check('Home: the whole Home stage accepts a hold, not only the plant bounds', near(hit.x, stage.x) && near(hit.y, stage.y)
    && near(hit.width, stage.width) && near(hit.height, stage.height));
  await page.screenshot({ timeout: 60000, path: screenshots[0] });

  // Start well above and left of the plant's projected hit box, then inspect all three arc positions geometrically.
  const startX = stage.x + 18, startY = stage.y + 105;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const origin = await snapshot();
  check('Home: broad stage hit creates the can at the exact hold point immediately', origin.canVisible && origin.holding
    && origin.canScale > 0 && distance(origin.originScreen, [startX, startY]) < 1.5 && await bottom() === 'Hold to water',
    `origin=${origin.originScreen.map(n => n.toFixed(1))}`);
  check('Home: physical aim is valid even while emerging from the press point', origin.outletAimDot > 0.995 && origin.canUp > 0,
    `dot=${origin.outletAimDot}, up=${origin.canUp}`);
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().heldMs >= 400);
  const beforeFlow = await snapshot();
  check('Home: real hold has no flow during the first second', beforeFlow.heldMs < 1000 && !beforeFlow.flowing
    && beforeFlow.drops === 0 && (await count('watered')) === 0, `${Math.round(beforeFlow.heldMs)}ms, drops=${beforeFlow.drops}`);
  const earlyFill = await fill();
  check('Home: passive pill visibly fills continuously from first contact', earlyFill.fraction > 0.03 && earlyFill.fraction < 0.2
    && Math.abs(earlyFill.fraction - earlyFill.heldMs / 5000) < 0.08 && Math.abs(earlyFill.seconds - earlyFill.fraction * 5) < 0.08
    && earlyFill.waterHeight > 2 && earlyFill.waterHeight < earlyFill.pillHeight * 0.25, JSON.stringify(earlyFill));
  await page.waitForFunction(() => { const s = window.garden?.homeSnapshot?.(); if (!s) return false; return s.heldMs >= 1200 && s.flowing && s.drops > 0; }, null, { timeout: 5000 });
  const leftArc = await snapshot();
  const flowingFill = await fill();
  check('Home: liquid fill tracks authoritative elapsed time, not one-second label jumps', flowingFill.fraction > earlyFill.fraction
    && flowingFill.waterHeight > earlyFill.waterHeight && Math.abs(flowingFill.fraction - flowingFill.heldMs / 5000) < 0.08
    && Math.abs(flowingFill.seconds - flowingFill.fraction * 5) < 0.08, JSON.stringify(flowingFill));
  check('Home: liquid is the only visible progress during watering', await bottom() === 'Watering'
    && !/[\d/]/.test(await bottom()) && !(await page.locator('.water').innerText()).includes('/5'));
  checkAim('left pour', leftArc);
  await page.mouse.move(stage.x + stage.width - 22, startY, { steps: 8 });
  await page.waitForTimeout(300);
  const rightArc = await snapshot();
  check('Home: horizontal hold still maps smoothly to the above-plant arc', rightArc.holding && rightArc.canVisible
    && rightArc.arcScreen[0] > leftArc.arcScreen[0] + 45 && rightArc.canScreen[0] > leftArc.canScreen[0] + 30
    && rightArc.arcScreen[1] < rightArc.waterTargetScreen[1] - 25 && distance(rightArc.canScreen, rightArc.arcScreen) < 15,
    `left x=${leftArc.arcScreen[0].toFixed(1)}, right x=${rightArc.arcScreen[0].toFixed(1)}`);
  checkAim('right pour', rightArc);

  await page.mouse.move(stage.x + stage.width * 0.5, startY, { steps: 8 });
  await page.waitForTimeout(300);
  const centerArc = await snapshot();
  checkAim('centre pour', centerArc);

  // Captured movement crosses the real button and leaves Home without losing the gesture; cancellation never settles.
  const buttonBox = await page.locator('.water').boundingBox();
  await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + 10, { steps: 4 });
  await page.mouse.move(stage.x - 45, startY + 40, { steps: 4 });
  await page.waitForTimeout(100);
  check('Home: captured hold survives stage, button and outside movement', (await snapshot()).holding && (await count('watered')) === 0);
  await page.evaluate(() => document.querySelector('.stage').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.mouse.up();
  const cancelled = await snapshot();
  check('Home: pointer cancel cleans can, particles and liquid fill without a reward', !cancelled.holding && !cancelled.canVisible
    && cancelled.drops === 0 && near(cancelled.age, idle.age) && (await fill()).fraction === 0 && (await count('watered')) === 0);
  check('Home: cancellation records an incomplete hold only', (await events()).filter(e => e.type === 'hold_end')
    .some(e => e.payload?.reason === 'cancelled' && e.payload?.completed === false) && (await count('watered')) === 0);

  // Losing capture is cancellation too, including when the pointer is subsequently released.
  // Do not press the separate Market arch in the upper-right when testing capture loss.
  await page.mouse.move(startX, startY); await page.mouse.down();
  check('Home: capture-loss scenario starts synchronously on the stage', (await snapshot()).holding);
  await page.evaluate(() => {
    const el = document.querySelector('.stage');
    if (el.hasPointerCapture(1)) el.releasePointerCapture(1);
    // Chromium may defer its pending notification until a later pointer event. Deliver that same event directly in
    // this deterministic check so a heavily throttled software-rendered frame cannot win the five-second race first.
    el.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }));
  });
  await page.waitForFunction(() => window.garden?.homeSnapshot ? !garden.homeSnapshot().holding : false);
  await page.mouse.up();
  check('Home: lost pointer capture cleans up without an accidental reward', (await events()).filter(e => e.type === 'hold_end')
    .at(-1)?.payload?.reason === 'capture_lost' && !(await snapshot()).holding && (await count('watered')) === 0);

  await page.mouse.move(startX, startY); await page.mouse.down();
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().heldMs >= 4000);
  const beforeFive = await snapshot();
  check('Home: flowing before five seconds still grants no completion', beforeFive.heldMs < 5000 && beforeFive.drops > 0
    && (await count('watered')) === 0 && (await status()).hidden, `${Math.round(beforeFive.heldMs)}ms`);
  await page.mouse.up();
  check('Home: release before five seconds cleans up fluid without growth', !(await snapshot()).holding && !(await snapshot()).canVisible
    && (await snapshot()).drops === 0 && (await fill()).fraction === 0 && near((await snapshot()).age, idle.age)
    && (await count('watered')) === 0 && (await status()).hidden);

  await page.mouse.move(startX, startY); await page.mouse.down();
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().drops > 0, null, { timeout: 5000 });
  await page.evaluate(() => document.querySelector('.tab[data-pane="toolkit"]').click());
  await page.mouse.up();
  const navigated = await snapshot();
  const navigationEnd = (await events()).filter(e => e.type === 'hold_end').at(-1);
  check('Home: navigation cancels capture, can and flow without another event', !navigated.holding && !navigated.canVisible
    && navigated.drops === 0 && (await count('watered')) === 0 && navigationEnd?.payload?.reason === 'left'
    && navigationEnd?.payload?.completed === false);
  await page.click('.tab[data-pane="home"]'); await page.waitForTimeout(400);

  // First daily reward: a normal, real pointer hold can settle in rAF; a later release must not duplicate it.
  await page.mouse.move(startX, startY); await page.mouse.down();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('garden.log') || '[]').some(e => e.type === 'watered'), null, { timeout: 8000 });
  await page.mouse.up();
  const wateredEvents = (await events()).filter(e => e.type === 'watered');
  const rewardStart = await snapshot();
  check('Home: full real pointer hold logs one event at five seconds', wateredEvents.length === 1
    && wateredEvents[0].payload.heldMs >= 5000 && wateredEvents[0].payload.via === 'plant', JSON.stringify(wateredEvents[0]?.payload));
  check('Home: success cleans active can state and starts +1-day growth', !rewardStart.holding && !rewardStart.canVisible
    && rewardStart.drops === 0 && near(rewardStart.targetAge, idle.age + 1)
    && rewardStart.age >= idle.age && rewardStart.age <= rewardStart.targetAge
    && (rewardStart.growing || near(rewardStart.age, rewardStart.targetAge)),
    JSON.stringify({ age: rewardStart.age, target: rewardStart.targetAge, growing: rewardStart.growing }));
  const freshStatus = await status();
  check('Home: fresh completion immediately replaces guidance with the settling status', !freshStatus.hidden
    && freshStatus.text === 'Watered today' && freshStatus.width > 0 && freshStatus.fresh
    && freshStatus.animation === 'home-watered-settle' && await page.locator('.water').isHidden()
    && (await fill()).fraction === 0 && Number(await page.getAttribute('.water', 'aria-valuenow')) === 0
    && (await visibleHomeButtons()).join(',') === '');
  // Pause only the test's current animation clock to inspect the real top arrival, midpoint and final guidance slot.
  const arrivalTop = await page.locator('.watered-status').evaluate(el => {
    const a = el.getAnimations()[0], duration = a.effect.getComputedTiming().duration;
    a.pause(); a.currentTime = duration * 0.2;
    return el.getBoundingClientRect().top;
  });
  await page.screenshot({ timeout: 60000, path: screenshots[9] });
  const movingTop = await page.locator('.watered-status').evaluate(el => {
    const a = el.getAnimations()[0], duration = a.effect.getComputedTiming().duration;
    a.currentTime = duration * 0.62;
    return el.getBoundingClientRect().top;
  });
  await page.screenshot({ timeout: 60000, path: screenshots[10] });
  check('Home: Watered today actually travels from top arrival down the settling animation', arrivalTop < 100
    && movingTop > arrivalTop + 80, `arrival=${arrivalTop.toFixed(1)}, midpoint=${movingTop.toFixed(1)}`);
  await page.locator('.watered-status').evaluate(async el => { const a = el.getAnimations()[0]; a.play(); await a.finished; });
  const settledStatus = await status();
  check('Home: completed status settles exactly into the former guidance slot with mutual exclusion', near(settledStatus.top, readout.y, 0.8)
    && near(settledStatus.height, readout.height, 0.8) && settledStatus.centered && await page.locator('.water').isHidden()
    && !(await page.locator('.watered-status').isHidden()), JSON.stringify({ settledStatus, readout }));
  await page.waitForFunction(() => { const s = window.garden?.homeSnapshot?.(); if (!s) return false; return !s.growing && Math.abs(s.age - s.targetAge) < 0.001; }, null, { timeout: 15000 });
  const rewarded = await snapshot();
  check('Home: growth animation reaches and keeps the next calendar-day form', near(rewarded.age, idle.age + 1)
    && near(rewarded.targetAge, idle.age + 1) && !rewarded.growing);
  await page.screenshot({ timeout: 60000, path: screenshots[4] });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.garden?.homeSnapshot);
  const persisted = await snapshot();
  const persistedStatus = await status();
  check('Home: reload persists only the static lower status and exactly one daily event', near(persisted.age, rewarded.age)
    && !persisted.growing && !persisted.canVisible && !persistedStatus.hidden && !persistedStatus.fresh
    && persistedStatus.animation === 'none' && near(persistedStatus.top, readout.y, 0.8)
    && await page.locator('.water').isHidden() && (await visibleHomeButtons()).join(',') === '' && (await count('watered')) === 1,
    JSON.stringify({ persistedStatus, readoutTop: readout.y, persisted }));
  await page.screenshot({ timeout: 60000, path: screenshots[5] });
  check('Home: lower completed indicator is passive and non-focusable', await page.locator('.watered-status').evaluate(el =>
    el.getAttribute('role') === 'note' && el.tabIndex === -1 && getComputedStyle(el).pointerEvents === 'none'));
  const inertStatusLogLength = (await events()).length, statusBox = await page.locator('.watered-status').boundingBox();
  await page.mouse.click(statusBox.x + statusBox.width / 2, statusBox.y + statusBox.height / 2);
  check('Home: clicking the completed indicator starts no optional hold', !(await snapshot()).holding
    && !(await snapshot()).canVisible && (await events()).length === inertStatusLogLength);

  // Optional pointer play has the identical dry second, can and flow, but no visible guidance/progress panel.
  const optionalState = await storedState();
  await page.mouse.move(startX, startY); await page.mouse.down(); await page.waitForTimeout(400);
  const optionalDry = await snapshot();
  check('Home: optional hold has a dry second without reviving a label or progress panel', optionalDry.holding && optionalDry.canVisible
    && optionalDry.drops === 0 && !(await status()).hidden && !(await status()).fresh && (await status()).animation === 'none'
    && near((await status()).top, readout.y, 0.8) && await page.locator('.water').isHidden(),
    JSON.stringify({ optionalDry, status: await status(), readoutTop: readout.y }));
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().drops > 0 && garden.homeSnapshot().heldMs >= 1100, null, { timeout: 5000 });
  const optionalFlow = await snapshot();
  await page.screenshot({ timeout: 60000, path: screenshots[11] });
  await page.mouse.up();
  checkAim('optional repeat pour', optionalFlow);
  const optionalEnd = (await events()).filter(e => e.type === 'hold_end').at(-1);
  check('Home: optional repeat flow leaves state, age, done mark and daily event unchanged', (await count('watered')) === 1
    && await storedState() === optionalState && near((await snapshot()).age, rewarded.age) && near((await snapshot()).targetAge, rewarded.age)
    && !(await snapshot()).growing && await homeDone() && optionalEnd?.payload?.repeat === true
    && optionalEnd?.payload?.completed === false && optionalEnd?.payload?.ms >= 1000);
  check('Home: no water-again wording is introduced', !(await page.locator('.pane[data-pane="home"]').textContent()).toLowerCase().includes('water again')
    && !(await page.locator('.pane[data-pane="home"]').textContent()).includes('Hold to water again'));

  // A full optional keyboard hold also ends at five seconds, returns focus sensibly, and grants nothing.
  await page.focus('.stage'); await page.keyboard.down('Space');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('garden.log') || '[]').some(e => e.type === 'hold_end' && e.payload?.repeat && e.payload?.completed), null, { timeout: 8000 });
  await page.keyboard.up('Space');
  const optionalKeyboardEnd = (await events()).filter(e => e.type === 'hold_end').at(-1);
  check('Home: full optional keyboard hold flows and finishes without a second reward', optionalKeyboardEnd?.payload?.via === 'key'
    && optionalKeyboardEnd?.payload?.repeat === true && optionalKeyboardEnd?.payload?.completed === true
    && optionalKeyboardEnd?.payload?.ms >= 5000 && (await count('watered')) === 1 && await storedState() === optionalState
    && near((await snapshot()).targetAge, rewarded.age) && !(await snapshot()).growing && await homeDone(),
    JSON.stringify(optionalKeyboardEnd?.payload));
  check('Home: optional keyboard completion keeps status immediate and returns focus', !(await status()).hidden
    && !(await status()).fresh && await page.locator('.water').isHidden()
    && await page.locator('.watered-status').evaluate(el => el === document.activeElement),
    JSON.stringify({ status: await status(), focus: await page.evaluate(() => document.activeElement?.className) }));

  // Next-day first reward is real again. This release occurs after 5s but before any possible next rAF.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipDay(page);
  const pointerDay = await snapshot();
  check('Home: next day restores passive guidance, fresh stage control and the prior visual', near(pointerDay.age, rewarded.age)
    && near(pointerDay.targetAge, rewarded.age) && !pointerDay.growing && (await status()).hidden
    && await bottom() === 'Hold to water' && await page.locator('.water').isVisible()
    && (await visibleHomeButtons()).join(',') === '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(startX, startY); await page.mouse.down();
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().heldMs >= 1100 && garden.homeSnapshot().drops > 0, null, { timeout: 5000 });
  const pointerBeforeFrame = await holdPastFiveAndDispatchBeforeFrame('release');
  await page.mouse.up();
  const pointerEvent = pointerBeforeFrame.log.filter(e => e.type === 'watered').at(-1);
  const pointerEnd = pointerBeforeFrame.log.filter(e => e.type === 'hold_end').at(-1);
  check('Home: pointer release after five seconds completes synchronously without waiting for rAF', pointerBeforeFrame.log.filter(e => e.type === 'watered').length === 2
    && pointerEvent?.payload?.heldMs >= 5000 && pointerEnd?.payload?.reason === 'released' && pointerEnd?.payload?.completed === true
    && !pointerBeforeFrame.snapshot.holding && !pointerBeforeFrame.snapshot.canVisible);
  check('Home: release-path reward is exactly once and advances only that new day', (await count('watered')) === 2
    && near((await snapshot()).targetAge, pointerDay.age + 1) && near((await snapshot()).age, pointerDay.age + 1)
    && !(await snapshot()).growing && await homeDone());
  await page.waitForTimeout(100);
  check('Home: actual pointer up after deterministic release adds no duplicate', (await count('watered')) === 2);

  // Keyboard keyup has the same no-next-frame guarantee and reduced-motion success stays immediate.
  await skipDay(page);
  const keyDay = await snapshot();
  await page.focus('.stage'); await page.keyboard.down('Enter');
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().heldMs >= 400);
  check('Home: Enter respects the dry first second under reduced motion', (await snapshot()).heldMs < 1000
    && (await snapshot()).drops === 0 && (await count('watered')) === 2);
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().drops > 0 && garden.homeSnapshot().heldMs >= 1100, null, { timeout: 5000 });
  check('Home: fresh Enter exposes flow and accessible hold progress', (await snapshot()).flowing && (await count('watered')) === 2
    && Number(await page.getAttribute('.water', 'aria-valuenow')) >= 1
    && (await page.getAttribute('.water', 'aria-label')).includes('Watering') && await bottom() === 'Watering'
    && !/[\d/]/.test(await bottom()));
  const keyBeforeFrame = await holdPastFiveAndDispatchBeforeFrame('key');
  await page.keyboard.up('Enter');
  const keyEnd = keyBeforeFrame.log.filter(e => e.type === 'hold_end').at(-1);
  check('Home: Enter release after five seconds completes synchronously without rAF', keyBeforeFrame.log.filter(e => e.type === 'watered').length === 3
    && keyBeforeFrame.log.filter(e => e.type === 'watered').at(-1)?.payload?.heldMs >= 5000
    && keyEnd?.payload?.reason === 'released' && keyEnd?.payload?.completed === true);
  const reducedReward = await snapshot(), reducedStatus = await status();
  check('Home: keyboard release rewards exactly one additional day with reduced motion', (await count('watered')) === 3
    && near(reducedReward.targetAge, keyDay.age + 1) && near(reducedReward.age, keyDay.age + 1)
    && !reducedReward.growing && !reducedReward.canVisible && !reducedStatus.hidden && !reducedStatus.fresh
    && reducedStatus.animation === 'none' && near(reducedStatus.top, readout.y, 0.8) && reducedStatus.centered
    && await page.locator('.water').isHidden() && (await visibleHomeButtons()).join(',') === '',
    JSON.stringify({ reducedStatus, reducedReward, keyDay, readoutTop: readout.y }));
  await page.screenshot({ timeout: 60000, path: screenshots[6] });

  // After five seconds, blur still must not masquerade as a genuine release on an optional repeat.
  await page.mouse.move(startX, startY); await page.mouse.down();
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().heldMs >= 1100);
  const blurredBeforeFrame = await holdPastFiveAndDispatchBeforeFrame('blur');
  await page.mouse.up();
  check('Home: late blur cancels optional play without reward or duplicate completion', !(await snapshot()).holding
    && blurredBeforeFrame.log.filter(e => e.type === 'watered').length === 3 && (await count('watered')) === 3
    && blurredBeforeFrame.log.filter(e => e.type === 'hold_end').at(-1)?.payload?.reason === 'window_blur'
    && blurredBeforeFrame.log.filter(e => e.type === 'hold_end').at(-1)?.payload?.completed === false
    && near((await snapshot()).targetAge, reducedReward.targetAge));

  // Real Chromium touch input, including moves over the passive readout/nav, verifies this is not a mouse-only fix.
  await page.evaluate(() => {
    window.homeTouchTypes = [];
    document.querySelector('.stage').addEventListener('pointerdown', e => { if (e.pointerType === 'touch') window.homeTouchTypes.push(e.pointerType); });
  });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x = startX, y = startY) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7, radiusX: 8, radiusY: 8, force: 1 }],
  });
  const currentReadout = await page.locator('.watered-status').boundingBox();
  const inertTouchLogLength = (await events()).length;
  await touch('touchStart', currentReadout.x + currentReadout.width / 2, currentReadout.y + currentReadout.height / 2);
  await touch('touchEnd');
  check('Home: real touch on the completed indicator starts no optional hold', !(await snapshot()).holding
    && !(await snapshot()).canVisible && (await snapshot()).drops === 0 && (await events()).length === inertTouchLogLength);
  await touch('touchStart');
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().holding);
  await page.waitForTimeout(400);
  check('Home: real touch starts on the broad stage with the same dry second', (await snapshot()).drops === 0
    && (await page.evaluate(() => window.homeTouchTypes)).includes('touch'));
  await page.waitForFunction(() => window.garden?.homeSnapshot?.().drops > 0 && garden.homeSnapshot().heldMs >= 1100, null, { timeout: 5000 });
  await touch('touchMove', stage.x + stage.width - 24, startY);
  await page.waitForTimeout(250);
  checkAim('touch pour', await snapshot());
  await touch('touchMove', currentReadout.x + currentReadout.width / 2, currentReadout.y + 10);
  await touch('touchMove', stage.x + stage.width - 35, stage.y + stage.height + 25);
  check('Home: real touch survives crossing controls and leaving Home', (await snapshot()).holding);
  await touch('touchEnd');
  await cdp.detach();
  const touchEnd = (await events()).filter(e => e.type === 'hold_end').at(-1);
  check('Home: touch release cleans optional play without a daily event or growth', !(await snapshot()).holding
    && !(await snapshot()).canVisible && touchEnd?.payload?.reason === 'released' && touchEnd?.payload?.repeat === true
    && (await count('watered')) === 3 && near((await snapshot()).targetAge, reducedReward.targetAge)
    && !(await snapshot()).growing && await homeDone());

  // Dedicated optional holds make visual capture independent of the five-second test timer. Each image is taken
  // only after real flow and geometric emitter/target alignment; no first-day reward can be consumed by a slow PNG.
  const pourViews = [
    ['left', stage.x + 18, screenshots[1]], ['right', stage.x + stage.width - 22, screenshots[2]],
    ['centre', stage.x + stage.width * 0.5, screenshots[3]],
  ];
  for (const [label, x, path] of pourViews) {
    // Capture from a safe part of the stage before dragging right; a fresh press on the Market arch is a real
    // competing navigation action, not a watering hold.
    await page.mouse.move(startX, startY); await page.mouse.down();
    if (x !== startX) await page.mouse.move(x, startY, { steps: 6 });
    await page.waitForFunction(() => window.garden?.homeSnapshot?.().drops > 0 && garden.homeSnapshot().heldMs >= 1100, null, { timeout: 5000 });
    const pour = await snapshot();
    check(`Home: ${label} screenshot is of an aligned naturally tipped can`, pour.flowing && pour.drops > 0
      && pour.outletAimDot > 0.995 && (label !== 'centre' ? pour.canUp < 0.95 : pour.canUp < 0.6));
    await page.screenshot({ timeout: 60000, path });
    await page.mouse.up();
  }
  // Fresh-state visual holds live in their own reload, so passive-pill PNGs can never trigger or consume the first
  // daily reward tested above. Repeat views above intentionally have only the static lower status and the can.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.garden?.homeSnapshot);
  await page.waitForTimeout(250);
  check('Home: fresh visual state has guidance and no completed indicator', (await status()).hidden && await page.locator('.water').isVisible());
  const freshReadout = await page.locator('.water').boundingBox(), freshLogLength = (await events()).length;
  await page.touchscreen.tap(freshReadout.x + freshReadout.width / 2, freshReadout.y + freshReadout.height / 2);
  check('Home: real touch tap on fresh passive guidance never creates a phantom hold', !(await snapshot()).holding
    && !(await snapshot()).canVisible && (await events()).length === freshLogLength);
  for (const [label, at, low, high, path] of [
    ['one-second', 1000, 0.16, 0.4, screenshots[7]], ['2.5-second', 2500, 0.4, 0.65, screenshots[8]],
  ]) {
    await page.mouse.move(startX, startY); await page.mouse.down();
    await page.waitForFunction(ms => {
      const s = window.garden?.homeSnapshot?.();
      return !!s && s.heldMs >= ms && (ms < 1000 || s.drops > 0);
    }, at, { timeout: 5000 });
    const state = await fill();
    check(`Home: ${label} visual fill matches real elapsed hold time`, state.fraction >= low && state.fraction <= high
      && Math.abs(state.seconds - state.fraction * 5) < 0.08, JSON.stringify(state));
    await page.screenshot({ timeout: 60000, path });
    if (at === 2500) await page.screenshot({ timeout: 60000, path: screenshots[12] });
    await page.mouse.up();
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { screenshots };
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
    const isolateVenture = process.env.HOME_ISOLATE_VENTURE === '1';
    if (isolateVenture) console.log('Home: focused harness isolates only the unrelated paused Venture module.');
    await homeChecks({ page, check, BASE, isolateVenture });
    check('Home: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('Home: no request leaves the origin', foreign.length === 0, foreign.slice(0, 3).join(' '));
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} Home checks passed`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
