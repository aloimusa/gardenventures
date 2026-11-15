// Focused live Three.js Market, portal, allocation ledger, reward-cycle and Venture crate checks.
// node scripts/check-market.mjs [url]
import { createRequire, registerHooks } from 'node:module';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

async function factsFromModelSource() {
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL?.endsWith('/src/market/model.ts') && ['../state', '../home/ornamentCatalog'].includes(specifier)) {
        return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map();
  const isolated = { get length() { return store.size; }, clear() { store.clear(); }, getItem(key) { return store.get(key) ?? null; },
    key(index) { return [...store.keys()][index] ?? null; }, removeItem(key) { store.delete(key); },
    setItem(key, value) { store.set(key, String(value)); } };
  const replace = !descriptor || descriptor.configurable;
  if (replace) Object.defineProperty(globalThis, 'localStorage', { configurable: true, enumerable: descriptor?.enumerable ?? true, value: isolated });
  try {
    const model = await import(new URL('../src/market/model.ts', import.meta.url).href);
    const { readLog } = await import(new URL('../src/state.ts', import.meta.url).href);
    const catalog = await import(new URL('../src/home/ornamentCatalog.ts', import.meta.url).href);
    const oldTrade = (index, ornament) => ({ id: `old-${index}`, week: `2026-W${46 + index}`, at: 1000 + index,
      date: `2026-11-${String(16 + index * 7).padStart(2, '0')}`, resultIds: [`raw-${index}`], byPlant: { banana: index + 1 },
      total: index + 1, ornament });
    const old = { v: 1, trades: [oldTrade(0, 'moon-moth'), oldTrade(1, 'golden-token'), oldTrade(2, null)],
      owned: ['moon-moth', 'golden-token'], equipped: 'golden-token' };
    const migrated = model.parseLedger(JSON.stringify(old));
    const blank = () => Array(9).fill(null), pending = (trigger, answers, extra = {}) => ({
      month: '2026-11', trigger, status: 'pending', answers, stage: 'remaining_items', ...extra });
    const checkin = {};
    isolated.clear();
    checkin.belowFirstMonth = {
      weekly: model.savePHQ([0, 1], '2026-11-15'),
      pending: model.savePHQ9(pending('calendar_month', [0, 1, ...blank().slice(2)])),
      answered: model.savePHQ9({ month: '2026-11', trigger: 'calendar_month', status: 'answered',
        answers: [0, 1, 0, 0, 0, 0, 0, 0, 0], stage: 'complete' }),
      duplicateBlocked: !model.savePHQ9(pending('calendar_month', [0, 1, ...blank().slice(2)])),
      total: model.phq9ForMonth(readLog(), '2026-11')?.total,
    };
    isolated.clear();
    checkin.stepUp = {
      weekly: model.savePHQ([2, 1], '2026-11-15'),
      pending: model.savePHQ9(pending('phq2_step_up', [2, 1, ...blank().slice(2)], {
        anchorPhq2Total: 3, anchorPhq2SequenceId: model.phq2SequenceId(model.marketWeek('2026-11-15')) })),
      answered: model.savePHQ9({ month: '2026-11', trigger: 'phq2_step_up', status: 'answered',
        answers: [2, 1, 1, 0, 0, 2, 0, 0, 0], stage: 'complete',
        anchorPhq2Total: 3, anchorPhq2SequenceId: model.phq2SequenceId(model.marketWeek('2026-11-15')) }),
      duplicateBlocked: !model.savePHQ9(pending('phq2_step_up', [2, 1, ...blank().slice(2)])),
      record: model.phq9ForMonth(readLog(), '2026-11'),
      raw: readLog().filter(event => event.type === 'market_phq9').map(event => event.payload),
      secondWeekBlocked: model.savePHQ([0, 0], '2026-11-22') && !model.savePHQ9(pending('calendar_month', [0, 0, ...blank().slice(2)])),
    };
    isolated.clear();
    checkin.monthlySkip = {
      skipped: model.savePHQ9({ month: '2026-11', trigger: 'calendar_month', status: 'skipped',
        answers: [0, 1, ...blank().slice(2)], stage: 'first_two_items' }),
      retryBlocked: !model.savePHQ9(pending('calendar_month', [0, 1, ...blank().slice(2)])),
      nextMonth: model.savePHQ9({ month: '2026-12', trigger: 'calendar_month', status: 'skipped',
        answers: [0, 0, ...blank().slice(2)], stage: 'first_two_items' }),
      nextMonthStatus: model.phq9ForMonth(readLog(), '2026-12')?.status,
    };
    return {
      dayOne: model.marketPresence('2026-11-15', 0), monday: model.marketPresence('2026-11-16', 1),
      tuesday: model.marketPresence('2026-11-17', 2), saturday: model.marketPresence('2026-11-21', 6),
      sunday: model.marketPresence('2026-11-22', 7), sameWeek: model.marketWeek('2026-11-16') === model.marketWeek('2026-11-17'),
      ids: catalog.ORNAMENTS.map(item => item.id), names: catalog.ORNAMENTS.map(item => item.name),
      wraps: [model.ornamentAt(-1), model.ornamentAt(12), model.ornamentAt(13)],
      migrated, checkin,
    };
  } finally {
    hooks.deregister();
    if (replace) {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else delete globalThis.localStorage;
    }
  }
}

export async function marketChecks({ page, context, check, BASE = 'http://127.0.0.1:8815/' }) {
  const shots = {
    home390: '/tmp/opencode/market-home-portal-390.png', home320: '/tmp/opencode/market-home-portal-320.png',
    trader390: '/tmp/opencode/market-trader-390.png', trader320: '/tmp/opencode/market-trader-320.png',
    trade390: '/tmp/opencode/market-trade-390.png', trade320: '/tmp/opencode/market-trade-320.png',
    ornament390: '/tmp/opencode/market-ornamental-home-390.png', ornament320: '/tmp/opencode/market-ornamental-home-320.png',
    crate390: '/tmp/opencode/market-venture-crate-390.png', reduced390: '/tmp/opencode/market-reduced-390.png',
    arrival390: '/tmp/opencode/market-arrival-390.png', support390: '/tmp/opencode/market-support-390.png',
    fullCheckin390: '/tmp/opencode/market-layout-full-checkin-390.png', fullCheckin320: '/tmp/opencode/market-layout-full-checkin-320.png',
  };
  const snapshot = () => page.evaluate(() => garden.marketSnapshot());
  const home = () => page.evaluate(() => garden.homeSnapshot());
  const events = () => page.evaluate(() => JSON.parse(localStorage.getItem('garden.log') || '[]'));
  const ledger = () => page.evaluate(() => JSON.parse(localStorage.getItem('garden.market.v1') || 'null'));
  const settlePane = async id => {
    await page.waitForFunction(pane => Math.abs(document.querySelector(`.pane[data-pane="${pane}"]`).getBoundingClientRect().left) < .5,
      id, { timeout: 4000 }); await page.waitForTimeout(90);
  };
  const goHome = async () => { await page.click('.tab[data-pane="home"]'); await settlePane('home'); };
  const goVenture = async () => { await page.click('.tab[data-pane="venture"]'); await settlePane('venture'); };
  const enter = async (settleCheckins = true) => {
    if ((await snapshot()).world !== 'market') {
      await page.locator('.wormhole').focus(); await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => garden.marketSnapshot().world === 'market'); await page.waitForTimeout(100);
    if (settleCheckins) {
      // Ordinary trading fixtures explicitly choose Not now at each offered stage; they never manufacture answers.
      for (let i = 0; i < 2 && (await snapshot()).arrivalVisible; i++) {
        if ((await snapshot()).arrival === 'review') await page.locator('.market-arrival-back').click();
        else await page.locator('.market-arrival-skip').click();
        await page.waitForTimeout(60);
      }
    }
  };
  const leave = async () => {
    if ((await snapshot()).world === 'market') await page.locator('.wormhole').click();
    await page.waitForFunction(() => garden.marketSnapshot().world === 'home'); await page.waitForTimeout(80);
  };
  const openPicker = async () => {
    if (await page.locator('.home-ornament-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('.home-ornament-toggle').click();
    await page.waitForFunction(() => !document.querySelector('.home-ornament-menu').hidden);
  };
  const placeOrnament = async () => { await openPicker(); await page.locator('.home-ornament-place').click(); };
  const addResult = async (id, plant, reward, date, version = 3, evidence = {}) => page.evaluate(({ id, plant, reward, date, version, evidence }) => {
    const key = 'garden.log', all = JSON.parse(localStorage.getItem(key) || '[]');
    const day = date || garden.marketSnapshot().date, roundId = `venture-v${version}:${day}:${id}`;
    all.push({ t: Date.now(), d: 0, type: 'venture_harvest_result', payload: {
      v: version, mode: version === 4 ? 'vittala_foraging_adaptation_v1' : 'consumer', date: day, day: 1,
      roundId, plant, actionId: `${roundId}:action:0`,
      decisionId: `${roundId}:decision:0`, occurrenceId: `${roundId}:occurrence:0`, occurrenceIndex: 0,
      reward, lastObservedYield: reward, roundYield: reward, maturedBeforeRoundEnd: true,
      rewardReadyAt: Date.now() - 10, rewardDisplayedAt: Date.now(),
      ...(version === 4 ? { rulesVersion: 'vittala_adaptation_rules_v1', timingVersion: 'vittala_adaptation_timing_v1',
        rngVersion: 'venture-normal-beta-rng-v2', distribution: 'beta_22_3_multiplicative_rounded',
        selectedFactor: .88, previousObservedYield: Math.round(reward / .88), gammaAlpha: 22, gammaShape2: 3,
        initialStandardNormal: null, initialNormalValue: null } : {}),
      ...evidence,
    } });
    localStorage.setItem(key, JSON.stringify(all)); dispatchEvent(new StorageEvent('storage', { key }));
  }, { id, plant, reward, date, version, evidence });
  const waitTradeCount = async n => page.waitForFunction(count =>
    (JSON.parse(localStorage.getItem('garden.market.v1') || '{"trades":[]}').trades || []).length === count, n, { timeout: 6000 });
  const pointerTrade = async (count, locator = '.market-trader-hit') => {
    const box = await page.locator(locator).boundingBox();
    const x = locator === '.market-heading' ? box.x + Math.min(75, box.width / 3) : box.x + box.width * .53;
    const y = locator === '.market-heading' ? box.y + Math.min(35, box.height / 2) : box.y + box.height * .55;
    await page.mouse.move(x, y); await page.mouse.down(); await waitTradeCount(count); await page.mouse.up();
  };
  const keyTrade = async count => {
    await page.focus('.market-trader-hit'); await page.keyboard.down(count % 2 ? 'Space' : 'Enter');
    await waitTradeCount(count); await page.keyboard.up(count % 2 ? 'Space' : 'Enter');
  };
  const touchTrade = async count => {
    const box = await page.locator('.market-trader-hit').boundingBox(), cdp = await context.newCDPSession(page);
    const point = { x: box.x + box.width * .55, y: box.y + box.height * .55, id: 7, radiusX: 7, radiusY: 7, force: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await waitTradeCount(count);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
  };
  const waitDialogue = () => page.waitForFunction(() => garden.marketSnapshot().dialogueHistory.length === 3
    && garden.marketSnapshot().dialogue === "Here's something for your plant", null, { timeout: 4000 });
  const sizes = async path => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(160); await page.screenshot({ path });
    await page.setViewportSize({ width: 320, height: 568 }); await page.waitForTimeout(180);
    const fit = await page.evaluate(() => ({
      viewport: innerWidth, doc: document.documentElement.scrollWidth,
      portal: (() => { const r = document.querySelector('.wormhole').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; })(),
      bar: [...document.querySelectorAll('.tab')].every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width >= 44; }),
      scene: (() => { const r = document.querySelector('.market-scene-wrap')?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, width: r.width } : null; })(),
    }));
    check('Market: 320 has no horizontal overflow; static portal, scene and five tabs fit',
      fit.doc === 320 && fit.portal.left >= 0 && fit.portal.right <= 320 && fit.bar
      && (!fit.scene || fit.scene.left >= 0 && fit.scene.right <= 320), JSON.stringify(fit));
    await page.screenshot({ path: path.replace('-390', '-320') });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(160);
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.garden?.marketSnapshot && window.garden?.homeSnapshot); await page.waitForTimeout(400);

  const facts = await factsFromModelSource();
  check('Market: catalog has twelve distinct real designs with compatible first-three ids and cyclic lookup',
    facts.ids.length === 12 && new Set(facts.ids).size === 12
    && facts.ids.slice(0, 3).join(',') === 'moon-moth,golden-watering-token,tiny-pot-bow'
    && facts.wraps.join(',') === 'snail-friend,moon-moth,golden-watering-token', JSON.stringify(facts.ids));
  check('Market: first-only-week v1 migration preserves all three trades, aliases ids, and never collapses rewards',
    facts.migrated.trades.length === 3 && facts.migrated.owned.length === 3
    && facts.migrated.trades.every((trade, index) => trade.rewardIndex === index && trade.ornament === facts.ids[index])
    && facts.migrated.equipped === 'golden-watering-token', JSON.stringify(facts.migrated));
  check('Market: weekend presence is exact—Sunday open, Monday/Tuesday closed—and Saturday/Sunday reopen without day-one override',
    facts.dayOne.present && !facts.monday.present && !facts.tuesday.present && facts.tuesday.nextDate === '2026-11-21'
    && facts.saturday.present && facts.sunday.present && facts.sameWeek);
  check('Market: below-3 first-month flow completes all nine once at 0–27 and blocks a duplicate monthly sequence',
    Object.values(facts.checkin.belowFirstMonth).every(value => value === true || value === 1)
    && facts.checkin.belowFirstMonth.total === 1, JSON.stringify(facts.checkin.belowFirstMonth));
  check('Market: step-up preserves first-two anchors once, totals remaining seven only when complete, and prevents same-month repeats',
    facts.checkin.stepUp.pending && facts.checkin.stepUp.answered && facts.checkin.stepUp.duplicateBlocked
    && facts.checkin.stepUp.secondWeekBlocked && facts.checkin.stepUp.record.total === 6
    && facts.checkin.stepUp.record.trigger === 'phq2_step_up' && facts.checkin.stepUp.record.anchorPhq2Total === 3
    && facts.checkin.stepUp.record.answers.length === 9 && facts.checkin.stepUp.raw.length === 2
    && facts.checkin.stepUp.raw[0].status === 'pending' && facts.checkin.stepUp.raw[1].answered_at,
    JSON.stringify(facts.checkin.stepUp.record));
  check('Market: explicit monthly skip suppresses that month but allows the next month afresh, with no fabricated score',
    facts.checkin.monthlySkip.skipped && facts.checkin.monthlySkip.retryBlocked && facts.checkin.monthlySkip.nextMonth
    && facts.checkin.monthlySkip.nextMonthStatus === 'skipped', JSON.stringify(facts.checkin.monthlySkip));

  let snap = await snapshot(); const originalHome = await home();
  check('Market: day one opens with an honest empty basket', snap.present && snap.inventory.total === 0
    && await page.locator('.market-empty').count() === 1);
  const pickerGeometry = async () => {
    const toggle = await page.locator('.home-ornament-toggle').boundingBox();
    const menu = await page.locator('.home-ornament-menu').boundingBox();
    const portal = await page.locator('.wormhole').boundingBox();
    const disjoint = (a, b) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    return { toggle, menu, portal, toggleClear: !!toggle && !!portal && disjoint(toggle, portal),
      menuClear: !!portal && (!menu || menu.width === 0 || menu.height === 0 || disjoint(menu, portal)) };
  };
  await openPicker();
  check('Home: top-left circular picker honestly reports zero owned, shows fallback icon, clears wormhole and never starts watering',
    ((await ledger())?.owned.length ?? 0) === 0 && (await page.locator('.home-ornament-toggle').getAttribute('data-ornament')) === 'moon-moth'
    && (await page.locator('.home-ornament-toggle').getAttribute('aria-label')).includes('No owned')
    && (await page.locator('.home-ornament-toggle').getAttribute('aria-expanded')) === 'true'
    && (await page.locator('.home-ornament-toggle').getAttribute('aria-controls')) === 'home-ornament-menu'
    && (await page.locator('.home-ornament-icon svg').count()) === 1 && (await page.locator('.home-ornament-status').textContent()) === 'No ornaments owned yet'
    && await page.locator('.home-ornament-choice').isHidden() && await page.locator('.home-ornament-place').isHidden()
    && (await pickerGeometry()).toggleClear && (await pickerGeometry()).menuClear && !(await home()).holding);
  await page.keyboard.press('Escape');
  check('Home: Escape closes the floating owned menu and restores the circular toggle without a ghost hold',
    (await page.locator('.home-ornament-toggle').getAttribute('aria-expanded')) === 'false'
    && await page.locator('.home-ornament-menu').isHidden()
    && await page.evaluate(() => document.activeElement === document.querySelector('.home-ornament-toggle')) && !(await home()).holding);
  await page.setViewportSize({ width: 320, height: 568 }); await page.waitForTimeout(180); await openPicker();
  await page.mouse.click(160, 320);
  check('Home: outside click closes a compact left picker without watering, ownership fabrication or portal/menu overlap',
    (await pickerGeometry()).menuClear && (await page.locator('.home-ornament-toggle').getAttribute('aria-expanded')) === 'false'
    && ((await ledger())?.owned.length ?? 0) === 0 && !(await home()).holding && !(await home()).canVisible);
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(160);
  check('Market: portal and expanded world use one genuine WebGL Market renderer and real environment/Moss geometry',
    snap.visual.renderer === 'three-webgl' && snap.visual.marketMeshes > 100 && snap.visual.mossMeshes > 40
    && snap.visual.cathedralPresent && await page.locator('.market-render-layer').count() === 1
    && await page.locator('.market-render-layer').evaluate(canvas => !!canvas.getContext('webgl2'))
    && await page.locator('.wormhole-live-preview').count() === 1);
  check('Market: no SVG market illustration or alternate bottom pane was added',
    await page.locator('.market-illustration, .home-scene, .market-moss').count() === 0
    && await page.locator('.pane').count() === 5 && await page.locator('.tab').count() === 5
    && await page.locator('.bar [data-pane="market"]').count() === 0);
  const portalBefore = await page.locator('.wormhole').boundingBox();
  const portalRim = await page.locator('.wormhole-rim').boundingBox();
  check('Market: live aperture is approximately doubled on each axis with responsive compact bounds',
    portalRim.width >= 180 && portalRim.height >= 165 && portalRim.width <= 390 * .5
    && (await page.evaluate(() => document.querySelector('.wormhole-live-preview').width)) >= 350,
    JSON.stringify({ width: portalRim.width, height: portalRim.height }));
  const firstPixels = await page.locator('.wormhole-live-preview').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(420);
  const laterPixels = await page.locator('.wormhole-live-preview').evaluate(canvas => canvas.toDataURL());
  check('Market: shallow arch contains live destination pixels, not a text/asset placeholder',
    firstPixels.length > 5000 && laterPixels.length > 5000 && firstPixels !== laterPixels);
  await sizes(shots.home390);
  const originAfterSmall = await home();
  check('Market: portals and compact layouts do not move orchid watering origins',
    originAfterSmall.canOrigin.every((value, index) => Math.abs(value - originalHome.canOrigin[index]) < .0001)
    && originAfterSmall.waterTarget.every((value, index) => Math.abs(value - originalHome.waterTarget[index]) < .0001));

  await goVenture();
  check('Venture crate: honest empty accessible true table is above selection without a new large button',
    await page.locator('.venture-crate-table').evaluate(table => table.tagName === 'TABLE'
      && !!table.querySelector('caption') && table.querySelectorAll('thead th[scope="col"]').length === 2
      && !!table.querySelector('.venture-crate-empty'))
    && await page.locator('.venture-crate-scroll[tabindex="0"]').count() === 1
    && await page.evaluate(() => document.querySelector('.venture-crate').getBoundingClientRect().top
      <= document.querySelector('.venture-plants').getBoundingClientRect().top));
  await page.screenshot({ path: shots.crate390 }); await goHome();

  await enter(false); snap = await snapshot();
  check('Market: keyboard opening swaps worlds and the same-position portal now renders live Home',
    snap.world === 'market' && snap.portalPreview === 'home' && (await home()).world === 'market'
    && await page.locator('.wormhole-live-preview').evaluate(canvas => canvas.toDataURL().length > 1000));
  const portalAfter = await page.locator('.wormhole').boundingBox();
  check('Market: wormhole remains statically placed across the expansion',
    Math.abs(portalBefore.x - portalAfter.x) < 1 && Math.abs(portalBefore.y - portalAfter.y) < 1
    && Math.abs(portalBefore.width - portalAfter.width) < 1);
  const layout = await page.evaluate(() => {
    const questions = document.querySelector('.market-questions').getBoundingClientRect();
    const subtitle = document.querySelector('.market-presence').getBoundingClientRect();
    const scene = document.querySelector('.market-scene-wrap').getBoundingClientRect();
    const lower = document.querySelector('.market-lower').getBoundingClientRect();
    const shell = document.querySelector('.market-shell').getBoundingClientRect();
    return { questions: questions.toJSON(), subtitle: subtitle.toJSON(), scene: scene.toJSON(), lower: lower.toJSON(),
      gap: shell.bottom - lower.bottom, basketSceneSpace: (document.querySelector('.market-inventory').getBoundingClientRect().top - scene.top) };
  });
  check('Market: Questions sits beneath the subtitle above the world while basket occupies the bottom panel, not the middle',
    layout.questions.top >= layout.subtitle.bottom - 1 && layout.questions.bottom <= layout.scene.top + 1
    && Math.abs(layout.gap) <= 16 && layout.basketSceneSpace > 140, JSON.stringify(layout));
  check('Market: close cart/Moss-bound camera prioritizes trade geometry with cool slate cathedral accents',
    snap.visual.cameraDistance < 14 && snap.visual.domeColor === '304f63'
    && snap.visual.foregroundFit.maxAbsX <= .90 && snap.visual.foregroundFit.maxAbsY <= .90
    && snap.visual.foregroundFit.spanX >= 1.60 && snap.visual.foregroundFit.iterations <= 6 && snap.visual.framing.moss[0] > 0 && snap.visual.framing.moss[0] < 1
    && snap.visual.framing.moss[1] > 0 && snap.visual.framing.moss[1] < 1
    && snap.visual.framing.cart[0] > 0 && snap.visual.framing.cart[0] < 1
    && snap.visual.framing.cart[1] > 0 && snap.visual.framing.cart[1] < 1
    && await page.locator('.market-scene-wrap[role="img"]').count() === 1,
    JSON.stringify({ framing: snap.visual.framing, foreground: snap.visual.foregroundFit,
      position: snap.visual.cameraPosition, distance: snap.visual.cameraDistance }));
  check('Market: Home watering input is suspended without inventing a reward',
    !(await home()).holding && !(await home()).canVisible && (await events()).every(event => event.type !== 'watered')
    && await page.locator('.stage').evaluate(el => getComputedStyle(el).visibility === 'hidden'));
  const sessions = (await events()).filter(event => event.type === 'market_session_start');
  check('Market: selected sessions are local timestamped events with no forwarding fields', sessions.length === 1
    && sessions[0].t > 0 && sessions[0].payload.local === true && !('url' in sessions[0].payload) && !('forward' in sessions[0].payload));

  check('Market: weekly arrival starts with only the two real items, not the old collapsed form',
    snap.arrivalVisible && snap.arrival === 'phq2' && await page.locator('.market-arrival-form fieldset').count() === 2
    && await page.locator('.market-phq, .market-phq-save').count() === 0);
  await page.locator('.market-arrival-back').click();
  check('Market: Back to Market without answers dismisses the separated flow without fabricating PHQ responses',
    (await snapshot()).world === 'market' && !(await snapshot()).arrivalVisible
    && (await snapshot()).phq === null && (await snapshot()).phq9 === null
    && (await events()).every(event => event.type !== 'market_phq2' && event.type !== 'market_phq9'));
  await leave(); await enter(false);
  await page.locator('.market-arrival-skip').click(); snap = await snapshot();
  check('Market: weekly Not now dismisses to the actual Market immediately without a second forced surface',
    snap.world === 'market' && !snap.arrivalVisible && (await events()).filter(event => event.type === 'market_phq2').length === 1
    && (await events()).find(event => event.type === 'market_phq2').payload.status === 'skipped'
    && (await events()).every(event => event.type !== 'market_phq9'));
  await page.locator('.market-questions').click(); snap = await snapshot();
  check('Market: explicit Questions offers the independent monthly form separately',
    snap.arrivalVisible && snap.arrivalTrigger === 'calendar_month'
    && await page.locator('.market-shell').evaluate(shell => shell.inert && getComputedStyle(shell).visibility === 'hidden'));
  await page.screenshot({ path: shots.arrival390 });
  await page.locator('.market-arrival-skip').click(); snap = await snapshot();
  check('Market: monthly Not now also closes without blocking entry or inventing partial answers/score',
    !snap.arrivalVisible && snap.phq9?.status === 'skipped' && snap.phq9.total === null
    && snap.phq9.answers.every(answer => answer === null) && (await events()).filter(event => event.type === 'market_phq9').length === 1
    && (await events()).find(event => event.type === 'market_phq9').payload.answers.every(answer => answer.value === null));

  await leave();
  await addResult('bananas', 'banana', 8); await addResult('berries', 'strawberry', 3);
  await addResult('ignored-negative', 'apple', -4); await addResult('ignored-zero', 'pear', 0);
  await addResult('ignored-future', 'apple', 99, null, 5);
  await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('garden.log') || '[]');
    const banana = all.find(event => event.payload?.actionId?.includes(':bananas:'));
    all.push(JSON.parse(JSON.stringify(banana)));
    all.push({ t: Date.now(), type: 'venture_pick', payload: { v: 2, plant: 'apple', yield: 99, roundId: 'legacy-round' } });
    localStorage.setItem('garden.log', JSON.stringify(all));
  });
  await goVenture();
  const crate = await page.evaluate(() => ({ inventory: garden.venture.crateInventory(),
    rows: [...document.querySelectorAll('.venture-crate-table tbody tr[data-plant]')].map(row => ({ plant: row.dataset.plant,
      icon: !!row.querySelector('.venture-crate-icon svg'),
      count: Number((row.querySelector('.venture-crate-count')?.textContent ?? row.querySelector('td').lastChild.textContent).trim()) })) }));
  check('Venture crate: named positive species/icons/counts exactly match raw-v3-minus-allocation inventory',
    crate.inventory.total === 11 && crate.inventory.byPlant.banana === 8 && crate.inventory.byPlant.strawberry === 3
    && crate.rows.length === 2 && crate.rows.every(row => row.icon && row.count === crate.inventory.byPlant[row.plant])
    && !crate.inventory.byPlant.apple, JSON.stringify(crate));
  await page.screenshot({ path: shots.crate390 }); await goHome(); await enter(); snap = await snapshot();
  const rawBefore = await page.evaluate(() => localStorage.getItem('garden.log'));
  check('Market: inventory de-duplicates positive integer result ids and excludes v2/future-version produce',
    snap.inventory.total === 11 && snap.inventory.resultIds.length === 2 && snap.inventory.byPlant.banana === 8
    && snap.inventory.byPlant.strawberry === 3 && !snap.inventory.byPlant.apple
    && snap.inventory.resultIds.every(id => !id.includes('legacy') && !id.includes('future'))
    && await page.locator('.market-produce[data-plant="apple"]').count() === 0);
  await sizes(shots.trader390);

  const trader = await page.locator('.market-trader-hit').boundingBox();
  await page.mouse.move(trader.x + trader.width / 2, trader.y + trader.height / 2); await page.mouse.down(); await page.waitForTimeout(350);
  await page.evaluate(() => dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, isPrimary: true, clientX: -20, clientY: 200, bubbles: true })));
  await page.mouse.up();
  check('Market: offscreen movement cancels a captured touch/mouse hold without allocation',
    !(await snapshot()).holding && (await snapshot()).inventory.total === 11 && (await ledger()) === null);
  await page.mouse.move(trader.x + 80, trader.y + 100); await page.mouse.down(); await page.waitForTimeout(330); await page.mouse.up();
  await page.focus('.market-trader-hit'); await page.keyboard.down('Enter'); await page.waitForTimeout(280); await page.keyboard.up('Enter');
  check('Market: early pointer and keyboard releases leave every raw result unallocated',
    !(await snapshot()).holding && (await snapshot()).inventory.total === 11 && (await ledger()) === null);

  // This first valid hold starts on the heading, proving that the world—not only a button over Moss—is a hold surface.
  await pointerTrade(1, '.market-heading');
  check('Market: geometry hand-off starts on each valid allocation',
    (await snapshot()).visual.transferVisible && (await snapshot()).gift === 'moon-moth');
  await waitDialogue(); snap = await snapshot(); let saved = await ledger();
  check('Market: one whole-area 1.6 s hold consumes selected raw ids and exact per-species sums once',
    saved.trades.length === 1 && saved.trades[0].total === 11 && saved.trades[0].resultIds.length === 2
    && new Set(saved.trades[0].resultIds).size === 2 && snap.inventory.total === 0
    && saved.trades[0].byPlant.banana === 8 && saved.trades[0].byPlant.strawberry === 3);
  check('Market: every productive trade is rewarded by total rewardIndex/cycle, beginning with Moon moth',
    saved.owned.join(',') === 'moon-moth' && saved.trades[0].ornament === 'moon-moth'
    && saved.trades[0].rewardIndex === 0 && saved.trades[0].cycle === 0
    && !JSON.stringify(saved).toLowerCase().includes('coin'));
  check('Market: Moss repeats the exact intentional three-line dialogue sequence',
    JSON.stringify(snap.dialogueHistory) === JSON.stringify(['Thanks', 'Hey wait!', "Here's something for your plant"])
    && snap.thanks === "Here's something for your plant");
  const clearFeedback = () => page.evaluate(() => {
    const portal = document.querySelector('.wormhole').getBoundingClientRect();
    const bubble = document.querySelector('.market-thanks').getBoundingClientRect();
    const title = document.querySelector('.market-heading h2').getBoundingClientRect();
    const disjoint = rect => rect.right <= portal.left || rect.left >= portal.right || rect.bottom <= portal.top || rect.top >= portal.bottom;
    return { portal: portal.toJSON(), bubble: bubble.toJSON(), title: title.toJSON(), disjoint: disjoint(bubble) && disjoint(title),
      bubbleOnscreen: bubble.left >= 0 && bubble.right <= innerWidth && bubble.top >= 0 && bubble.bottom <= innerHeight,
      textFits: document.querySelector('.market-dialogue-line').scrollWidth <= document.querySelector('.market-dialogue-line').clientWidth + 1 };
  });
  check('Market: complete dialogue and concise title clear the enlarged portal, with no clipping at 390',
    (await clearFeedback()).disjoint && (await clearFeedback()).bubbleOnscreen && (await clearFeedback()).textFits,
    JSON.stringify(await clearFeedback()));
  check('Market: allocation never rewrites append-only raw harvest history', (await page.evaluate(() => localStorage.getItem('garden.log'))) !== rawBefore
    && (await events()).filter(event => event.type === 'venture_harvest_result').length === 6
    && (await events()).filter(event => event.type === 'venture_pick').length === 1);
  await sizes(shots.trade390);
  await page.setViewportSize({ width: 320, height: 568 }); await page.waitForTimeout(220);
  const compactCorners = (await snapshot()).visual.foregroundFit;
  check('Market: projected cart + complete Moss union stays inside safe NDC bounds at 320, and dialogue clears the portal',
    compactCorners.maxAbsX <= .90 && compactCorners.maxAbsY <= .90 && compactCorners.spanX >= 1.60
    && compactCorners.iterations <= 6 && (await clearFeedback()).disjoint && (await clearFeedback()).bubbleOnscreen && (await clearFeedback()).textFits,
    JSON.stringify(compactCorners));
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(160);
  await pointerTrade(1);
  check('Market: pointer spam on an empty basket cannot duplicate allocation or mint another gift',
    (await ledger()).trades.length === 1 && (await snapshot()).inventory.resultIds.length === 0);

  await leave(); await openPicker();
  check('Market: gift waits for an explicit Place/choose action, never silent equipping',
    (await home()).ornament === null && (await home()).ornamentMeshes === 0
    && await page.locator('.home-ornament-place').isVisible()
    && (await page.locator('.home-ornament-choice').inputValue()) === 'moon-moth');
  await placeOrnament();
  check('Market: Place renders real catalog geometry attached to Home',
    (await home()).ornament === 'moon-moth' && (await home()).ornamentMeshes > 0 && (await ledger()).equipped === 'moon-moth');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.garden?.homeSnapshot);
  await openPicker();
  check('Market: placed 3D ornament and ownership survive reload without another trade',
    (await home()).ornament === 'moon-moth' && (await home()).ornamentMeshes > 0
    && (await ledger()).trades.length === 1 && await page.locator('.home-ornament-place').isDisabled());
  await sizes(shots.ornament390);

  await enter(); await addResult('more-berries', 'strawberry', 4); await keyTrade(2);
  check('Market: keyboard hand-off repeats for a fresh later harvest in the same week',
    (await snapshot()).visual.transferVisible && (await snapshot()).gift === 'golden-watering-token');
  await waitDialogue(); saved = await ledger();
  check('Market: second same-week trade grants the next ornament rather than a null weekly duplicate',
    saved.trades.length === 2 && saved.trades[1].total === 4 && saved.trades[1].ornament === 'golden-watering-token'
    && saved.owned.length === 2 && saved.trades[1].rewardIndex === 1 && (await snapshot()).inventory.total === 0);
  check('Market: dialogue is deliberately identical—not first-trade-only',
    JSON.stringify((await snapshot()).dialogueHistory) === JSON.stringify(['Thanks', 'Hey wait!', "Here's something for your plant"]));

  await goVenture();
  check('Venture crate: trading and pane navigation immediately reconcile to an honest empty table',
    (await page.evaluate(() => garden.venture.crateInventory().total)) === 0
    && await page.locator('.venture-crate-empty').count() === 1
    && await page.locator('.venture-crate-table tbody tr[data-plant]').count() === 0);
  await goHome(); await enter();
  await addResult('offline-apples', 'apple', 5, null, 4);
  await goVenture();
  check('Venture crate: v4 normal/beta evidence contributes its exact apple reward without normalization',
    await page.evaluate(() => garden.venture.crateInventory().total === 5
      && garden.venture.crateInventory().byPlant.apple === 5)
    && Number(await page.locator('.venture-crate-table tr[data-plant="apple"] .venture-crate-count').textContent()) === 5
    && (await events()).some(event => event.type === 'venture_harvest_result' && event.payload?.v === 4
      && event.payload.plant === 'apple' && event.payload.reward === 5 && event.payload.gammaAlpha === 22
      && event.payload.gammaShape2 === 3 && event.payload.selectedFactor === .88));
  await goHome(); await context.setOffline(true); await pointerTrade(3);
  await waitDialogue(); await context.setOffline(false); saved = await ledger();
  const rawV4 = (await events()).filter(event => event.type === 'venture_harvest_result' && event.payload?.v === 4);
  check('Market: offline v4 exchange spends its intact ids once and awards the third design, without altering raw evidence',
    saved.trades.length === 3 && saved.trades[2].total === 5 && saved.trades[2].ornament === 'tiny-pot-bow'
    && saved.trades[2].rewardIndex === 2 && saved.owned.length === 3
    && saved.trades[2].resultIds.length === 1 && rawV4.length === 1
    && saved.trades[2].resultIds[0] === rawV4[0].payload.actionId && rawV4[0].payload.roundId.startsWith('venture-v4:')
    && rawV4[0].payload.selectedFactor === .88 && rawV4[0].payload.gammaAlpha === 22 && rawV4[0].payload.gammaShape2 === 3
    && (await events()).filter(event => event.type === 'market_trade').length === 3);
  await goVenture();
  check('Venture crate: the allocated v4 result disappears once leaving no negative or duplicate apple balance',
    await page.evaluate(() => garden.venture.crateInventory().total === 0
      && !garden.venture.crateInventory().byPlant.apple)
    && await page.locator('.venture-crate-table tbody tr[data-plant]').count() === 0);
  await goHome();

  const expected = ['moon-moth', 'golden-watering-token', 'tiny-pot-bow', 'acorn-cap', 'felt-bee', 'paper-crane',
    'glass-leaf', 'pinecone-crown', 'moon-button', 'clover-charm', 'tiny-star', 'snail-friend'];
  const species = ['banana', 'strawberry', 'apple', 'mandarin', 'mango', 'blueberry', 'pear', 'tomato', 'eggplant'];
  for (let index = 3; index < 13; index++) {
    const plant = species[index % species.length], reward = index + 2;
    await addResult(`cycle-${index}`, plant, reward);
    if (index === 3) await touchTrade(index + 1);
    else if (index % 2) await pointerTrade(index + 1); else await keyTrade(index + 1);
    saved = await ledger(); const trade = saved.trades[index];
    check(`Market: trade ${index + 1} uses catalog reward ${expected[index % 12]} and consumes only its raw ids`,
      trade.ornament === expected[index % 12] && trade.rewardIndex === index && trade.cycle === Math.floor(index / 12)
      && trade.resultIds.length === 1 && trade.resultIds[0].includes(`:cycle-${index}:`)
      && trade.byPlant[plant] === reward && trade.total === reward && (await snapshot()).inventory.total === 0);
    await waitDialogue();
  }
  saved = await ledger();
  check('Market: twelve unique designs then a repeated cycle still has only the twelve owned choices',
    saved.trades.length === 13 && saved.trades[12].ornament === 'moon-moth' && saved.trades[12].cycle === 1
    && saved.owned.length === 12 && new Set(saved.owned).size === 12 && saved.trades.every(trade => trade.ornament));
  check('Market: all thirteen raw allocation ids remain unique and no unexchanged/negative dedicated balance appears',
    new Set(saved.trades.flatMap(trade => trade.resultIds)).size === 14
    && (await snapshot()).inventory.total === 0 && Object.values((await snapshot()).inventory.byPlant).every(value => value >= 0));

  await leave(); await openPicker();
  const choices = await page.locator('.home-ornament-choice option').evaluateAll(options => options.map(option => option.value));
  check('Market: Home owned list exposes all twelve actual catalog choices in order',
    choices.length === 12 && choices.join(',') === expected.join(',') && !(await page.locator('.home-ornament-choice').isDisabled()));
  let allRendered = true;
  for (const id of expected) {
    await openPicker(); await page.selectOption('.home-ornament-choice', id);
    if (id === 'golden-watering-token') {
      check('Home: choosing another owned option does not silently replace the equipped mesh before Place',
        (await home()).ornament === 'moon-moth' && (await page.locator('.home-ornament-toggle').getAttribute('aria-expanded')) === 'true');
    }
    if ((await home()).ornament !== id) await page.locator('.home-ornament-place').click();
    else await page.keyboard.press('Escape');
    const placed = await home();
    allRendered &&= placed.ornament === id && placed.ornamentMeshes > 0
      && (await page.locator('.home-ornament-toggle').getAttribute('data-ornament')) === id
      && await page.locator('.home-ornament-icon svg').count() === 1
      && await page.locator('.home-ornament-menu').isHidden()
      && await page.evaluate(() => document.activeElement === document.querySelector('.home-ornament-toggle'));
  }
  check('Market: all twelve selectable ornaments instantiate nonzero Three.js meshes on the Home rig',
    allRendered && (await ledger()).owned.length === 12 && (await ledger()).trades.length === 13);
  await sizes(shots.ornament390);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(); await page.waitForTimeout(200);
  // Remote/software-GPU previews may finish an already queued resize/expansion frame. Require an actually static image
  // across 400 ms rather than treating that one queued frame as recurring reduced-motion animation.
  await page.waitForFunction(() => new Promise(resolve => {
    const canvas = document.querySelector('.wormhole-live-preview');
    let previous = canvas.toDataURL(), stable = 0;
    const inspect = () => {
      const current = canvas.toDataURL(); stable = current === previous ? stable + 1 : 0; previous = current;
      if (stable >= 3) resolve(true); else setTimeout(inspect, 350);
    };
    setTimeout(inspect, 350);
  }), null, { timeout: 5000 });
  const staticBefore = await snapshot();
  const staticPixelsBefore = await page.locator('.wormhole-live-preview').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(240);
  const staticPixels = await page.locator('.wormhole-live-preview').evaluate(canvas => canvas.toDataURL());
  check('Market: reduced motion keeps static geometry visible in both world and same-place portal',
    staticBefore.reducedMotion && staticPixelsBefore === staticPixels
    && staticPixels.length > 1000 && staticBefore.visual.cathedralPresent && staticBefore.visual.mossMeshes > 40
    && await page.locator('.wormhole-rim').evaluate(el => getComputedStyle(el, '::before').animationName === 'none'));
  await page.screenshot({ path: shots.reduced390 }); await leave();

  // Full check-in state machine on isolated storage, including step-up, support, and permission to trade.
  const freshIsolated = async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.garden?.marketSnapshot);
  };
  await freshIsolated(); await addResult('permitted-v4', 'banana', 1, null, 4);
  await enter(false); await page.locator('.market-arrival-skip').click();
  await pointerTrade(1, '.market-heading');
  check('Market: Not now permits an actual trade even while the independent monthly card is offered',
    (await snapshot()).world === 'market' && !(await snapshot()).arrivalVisible
    && (await ledger()).trades.length === 1 && (await snapshot()).inventory.total === 0
    && (await events()).filter(event => event.type === 'market_phq2').at(-1).payload.status === 'skipped'
    && (await events()).every(event => event.type !== 'market_phq9'));

  await freshIsolated(); await enter(false);
  await page.focus('input[name="phq-interest"][value="2"]'); await page.keyboard.press('Space');
  await page.locator('input[name="phq-down"][value="1"]').evaluate(input => input.click());
  check('Market: PHQ-2 total 3 steps into only remaining seven genuine PHQ-9 items, without repeating its anchor items',
    (await snapshot()).arrivalTrigger === 'phq2_step_up'
    && await page.locator('.market-arrival-form fieldset').count() === 7
    && await page.locator('.market-arrival-form fieldset[data-index="0"], .market-arrival-form fieldset[data-index="1"]').count() === 0
    && await page.locator('.market-arrival-form fieldset[data-item="thoughts"]').count() === 1);
  check('Market: check-in is a separated aria-modal surface with underlying Market controls hidden and inert',
    await page.locator('.market-arrival').getAttribute('aria-modal') === 'true'
    && await page.locator('.market-shell').evaluate(shell => shell.inert && getComputedStyle(shell).visibility === 'hidden')
    && await page.locator('.wormhole').evaluate(portal => portal.inert && getComputedStyle(portal).visibility === 'hidden'));
  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    await page.locator('.market-arrival-back').focus(); await page.keyboard.press('Tab');
    const trappedForward = await page.evaluate(() => document.activeElement?.matches('.market-arrival input') && document.querySelector('.market-arrival').contains(document.activeElement));
    await page.keyboard.press('Shift+Tab');
    const trappedBack = await page.evaluate(() => document.activeElement === document.querySelector('.market-arrival-back'));
    const footerTop = await page.locator('.market-arrival-actions').evaluate(element => element.getBoundingClientRect().top);
    await page.locator('.market-arrival-form fieldset[data-item="thoughts"]').scrollIntoViewIfNeeded();
    const footer = await page.evaluate(() => {
      const last = document.querySelector('.market-arrival-form fieldset[data-item="thoughts"]').getBoundingClientRect();
      const skip = document.querySelector('.market-arrival-skip').getBoundingClientRect();
      const pane = document.querySelector('.pane[data-pane="home"]').getBoundingClientRect();
      return { last: last.toJSON(), skip: skip.toJSON(), paneBottom: pane.bottom,
        actionTop: document.querySelector('.market-arrival-actions').getBoundingClientRect().top };
    });
    check(`Market: ninth item and fixed Not now stay fully visible/trappable at ${width}×${height}`,
      trappedForward && trappedBack && footer.last.bottom <= footer.skip.top + 2
      && footer.skip.left >= 0 && footer.skip.right <= width && footer.skip.bottom <= footer.paneBottom + 1
      && Math.abs(footer.actionTop - footerTop) < 1,
      JSON.stringify(footer));
    await page.screenshot({ path: width === 390 ? shots.fullCheckin390 : shots.fullCheckin320 });
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.keyboard.press('Escape');
  check('Market: Escape restores focus without overwriting pending partial answers, while Questions can explicitly resume them',
    await page.evaluate(() => document.activeElement?.classList.contains('wormhole'))
    && (await snapshot()).phq9?.status === 'pending' && (await snapshot()).phq9?.total === null
    && (await snapshot()).phq9?.answers[0] === 2 && (await snapshot()).phq9?.answers[1] === 1);
  await page.locator('.market-questions').click();
  for (const key of ['sleep', 'tired', 'appetite', 'self-worth', 'concentration', 'movement'])
    await page.locator(`input[name="phq-${key}"][value="0"]`).evaluate(input => input.click());
  await page.locator('input[name="phq-thoughts"][value="1"]').evaluate(input => input.click());
  const fullNine = (await events()).filter(event => event.type === 'market_phq9');
  const answeredNine = fullNine.at(-1), supportEvents = (await events()).filter(event => event.type === 'market_support_shown');
  check('Market: full step-up records ordered nine values/0–27 total/anchor chronology and unobstructive local support only',
    fullNine.length === 2 && fullNine[0].payload.status === 'pending' && answeredNine.payload.status === 'answered'
    && answeredNine.payload.trigger === 'phq2_step_up' && answeredNine.payload.answers.length === 9
    && new Set(answeredNine.payload.answers.map(answer => answer.index)).size === 9
    && answeredNine.payload.answers.every((answer, index) => answer.index === index + 1 && answer.key && Number.isInteger(answer.value))
    && answeredNine.payload.answers[0].value === 2 && answeredNine.payload.answers[1].value === 1
    && answeredNine.payload.answers[2].value === 0 && answeredNine.payload.answers[8].value === 1
    && answeredNine.payload.total === 4 && answeredNine.payload.answered_at
    && answeredNine.payload.anchor_phq2_total === 3 && answeredNine.payload.anchor_phq2_sequence_id.includes('W')
    && supportEvents.length === 1 && !('total' in supportEvents[0].payload) && !('value' in supportEvents[0].payload)
    && await page.locator('.market-support[role="note"]').isVisible()
    && !/diagnos|treatment|referral|careteam|care_team|drift/i.test(JSON.stringify(fullNine)));
  await page.screenshot({ path: shots.support390 });
  await page.locator('.market-arrival-back').click();
  await addResult('post-answer-v4', 'apple', 1, null, 4); await pointerTrade(1);
  check('Market: completed PHQ-9 and support never cause a post-trade form or extra gift-dependent prompt',
    !(await snapshot()).arrivalVisible && (await ledger()).trades.length === 1
    && (await events()).filter(event => event.type === 'market_phq9').length === 2);
  await leave(); await enter(false);
  check('Market: later same-week/month entry does not nag after completed full-instrument status',
    !(await snapshot()).arrivalVisible && (await snapshot()).phq9?.status === 'answered'
    && (await events()).filter(event => event.type === 'market_phq9').length === 2);

  await freshIsolated(); await enter(false);
  await page.focus('input[name="phq-interest"][value="1"]'); await page.keyboard.press('Space');
  await page.locator('input[name="phq-down"][value="1"]').evaluate(input => input.click());
  await page.locator('input[name="phq-sleep"][value="1"]').evaluate(input => input.click());
  await page.locator('.market-arrival-skip').click();
  const partialNine = (await events()).filter(event => event.type === 'market_phq9');
  check('Market: partial monthly Not now preserves selected values and null score, never a fabricated healthy 27',
    partialNine.length === 2 && partialNine.at(-1).payload.status === 'skipped'
    && partialNine.at(-1).payload.total === null && partialNine.at(-1).payload.responded_items === 3
    && partialNine.at(-1).payload.answers[0].value === 1 && partialNine.at(-1).payload.answers[1].value === 1
    && partialNine.at(-1).payload.answers[2].value === 1
    && partialNine.at(-1).payload.answers.slice(3).every(answer => answer.value === null)
    && (await events()).filter(event => event.type === 'market_phq9').at(-1).payload.trigger === 'calendar_month');
  await leave(); await enter(false);
  check('Market: a monthly skip does not retry or nag until a new month, and manual trade remains available',
    !(await snapshot()).arrivalVisible && (await events()).filter(event => event.type === 'market_phq9').length === 2);
  await addResult('after-partial-skip', 'banana', 1, null, 4); await pointerTrade(1);
  check('Market: Not now dismisses to a real one-time v4 trade after a monthly skip',
    (await ledger()).trades.length === 1 && (await snapshot()).inventory.total === 0
    && (await events()).filter(event => event.type === 'market_trade').length === 1);

  const weekend = async () => {
    await page.click('.tab[data-pane="toolkit"]'); await page.click('.toolkit-option[data-option="skip-day"]'); await goHome();
  };
  await weekend(); snap = await snapshot();
  check('Market: Monday hides the live Market route and safely closes an expanded world with no stale access',
    snap.date === '2026-11-16' && !snap.present && snap.world === 'home'
    && await page.locator('.wormhole').isHidden() && await page.locator('.market-world').isHidden());
  await page.locator('.wormhole').evaluate(element => element.click());
  check('Market: even synthetic weekday activation cannot reopen a hidden Market or arrival prompt',
    (await snapshot()).world === 'home' && !(await snapshot()).arrivalVisible);
  for (let i = 0; i < 5; i++) await weekend(); snap = await snapshot();
  check('Market: Saturday 2026-11-21 restores weekend discovery',
    snap.date === '2026-11-21' && snap.present && await page.locator('.wormhole').isVisible());
  await weekend(); snap = await snapshot();
  check('Market: Sunday 2026-11-22 is also open and keeps the return portal location',
    snap.date === '2026-11-22' && snap.present && snap.world === 'home' && await page.locator('.wormhole').isVisible());

  await page.click('.tab[data-pane="toolkit"]'); page.once('dialog', dialog => dialog.accept());
  const resetNavigation = page.waitForNavigation({ waitUntil: 'networkidle' });
  await page.click('.toolkit-option[data-option="reset-demo"]'); await resetNavigation;
  await page.waitForFunction(() => window.garden?.marketSnapshot);
  check('Market: explicit demo reset safely clears world/session allocations and equipped geometry',
    (await snapshot()).present && (await snapshot()).inventory.total === 0 && (await ledger()) === null
    && (await home()).ornamentMeshes === 0
    && (await events()).filter(event => event.type === 'market_trade').length === 0);

  return { screenshots: Object.values(shots) };
}

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
  const BASE = process.argv[2] || 'http://127.0.0.1:8815/', ORIGIN = new URL(BASE).origin, results = [];
  const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    const page = await context.newPage(), errors = [], foreign = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { const url = request.url(); if (!url.startsWith('data:') && !url.startsWith('blob:') && new URL(url).origin !== ORIGIN) foreign.push(url); });
    await marketChecks({ page, context, check, BASE });
    check('Market: no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
    check('Market: no runtime request leaves the origin', foreign.length === 0, foreign.slice(0, 4).join(' '));
  } finally { await browser.close(); }
  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} Market checks passed`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
