// Browser and HTTP acceptance checks for a built/deployed static gallery.
// Usage: node scripts/check-video-gallery.mjs --base=http://127.0.0.1:8898
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require(`${homedir()}/olc/tools/playwright/node_modules/playwright`);
const baseArgument = process.argv.find(argument => argument.startsWith('--base='));
const origin = (baseArgument?.slice('--base='.length) || 'http://127.0.0.1:8898').replace(/\/$/, '');
const galleryURL = `${origin}/video`;
const shots = '/tmp/opencode/garden-video-review';
const routes = [
  ['home', 'home.mp4', 9.68],
  ['venture', 'venture.mp4', 21.48],
  ['market', 'market.mp4', 18.8],
  ['reflect', 'reflect.mp4', 15.64],
  ['winddown', 'winddown.mp4', 8.84],
  ['submission/intro-home', 'submission/intro-home.mp4', 4],
  ['submission/growth-bloom', 'submission/growth-bloom.mp4', 7.96],
  ['submission/reflect-photo', 'submission/reflect-photo.mp4', 10.52],
  ['submission/safety-plan', 'submission/safety-plan.mp4', 7.72],
];
let failures = 0;
const check = (name, condition, detail = '') => {
  if (!condition) failures++;
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const request = await browser.newContext({ baseURL: origin }).then(context => context.request);
  const indexResponse = await request.get(galleryURL);
  const index = await indexResponse.text();
  check('gallery directory has a 200 HTML index', indexResponse.ok() && indexResponse.url() === `${galleryURL}/`
    && indexResponse.headers()['content-type']?.includes('text/html') && index.includes('<h1>Demo clips</h1>'), indexResponse.url());
  check('index lists nine player links, nine downloads and all exact durations',
    (index.match(/class="clip-link"/g) || []).length === routes.length
    && (index.match(/class="mp4-link"/g) || []).length === routes.length
    && routes.every(([, , duration]) => index.includes(`${duration.toFixed(2)} seconds`)));
  check('index contains no application scripts, videos or external resources',
    !/<script|<video|https?:\/\//.test(index) && index.includes('name="robots" content="noindex, nofollow, noarchive"'));

  for (const [route, media, duration] of routes) {
    for (const suffix of ['', '/']) {
      const response = await request.get(`${galleryURL}/${route}${suffix}`);
      const html = await response.text();
      check(`/${route || 'video'}${suffix || ' (pretty)'} resolves to its player`,
        response.ok() && response.url() === `${galleryURL}/${route}/`
        && response.headers()['content-type']?.includes('text/html')
        && html.includes('<body class="clip-page">') && html.includes(`data-duration="${duration.toFixed(2)}"`)
        && !/assets\/index-/.test(html) && (html.match(/<script/g) || []).length === 1
        && html.includes('player.js'), `${response.status()} ${response.url()}`);
    }
    const response = await request.get(`${galleryURL}/${media}`, { headers: { Range: 'bytes=0-1023' } });
    const body = await response.body();
    check(`${media} supports typed 1024-byte range requests`, response.status() === 206 && body.length === 1024
      && response.headers()['content-type']?.toLowerCase().startsWith('video/mp4')
      && response.headers()['content-range']?.startsWith('bytes 0-1023/')
      // Cloudflare can omit Accept-Ranges on a 206; Content-Range plus the exact body proves support.
      && (!response.headers()['accept-ranges'] || response.headers()['accept-ranges'].toLowerCase().includes('bytes')),
      `${response.status()} ${response.headers()['content-type']} ${response.headers()['content-range']}`);
  }

  for (const width of [384, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    const unexpected = [];
    const mediaRequests = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', requestFailure => {
      // Metadata loads are intentionally abandoned when the reviewer follows another clip.
      if (requestFailure.failure()?.errorText === 'net::ERR_ABORTED' && requestFailure.resourceType() === 'media') return;
      errors.push(`${requestFailure.url()} ${requestFailure.failure()?.errorText}`);
    });
    page.on('request', requestMade => {
      const url = new URL(requestMade.url());
      if (url.pathname.endsWith('.mp4')) mediaRequests.push(requestMade.url());
      if (url.origin !== origin || url.pathname.startsWith('/api/')
        || (/\.m?js(?:$|\?)/.test(url.pathname) && url.pathname !== '/video/player.js')
        || url.pathname.endsWith('/index.html') || url.pathname.match(/^\/assets\//)) unexpected.push(requestMade.url());
    });

    if (width === 390) {
      await page.goto(`${galleryURL}/`, { waitUntil: 'networkidle' });
      check('mobile gallery shows all nine links without requesting media or app code',
        await page.locator('.clip-link').count() === routes.length
        && !(await page.locator('video').count())
        && mediaRequests.length === 0);
      await page.screenshot({ path: `${shots}/gallery-390.png`, fullPage: true });
    }

    for (const [route, , duration] of routes) {
      // All routes receive a full browser inspection at 390 px; 384 px checks both nesting depths.
      if (width === 384 && !['home', 'submission/intro-home'].includes(route)) continue;
      await page.goto(`${galleryURL}/${route}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
      const state = await page.locator('video').evaluate(video => {
        const box = video.getBoundingClientRect();
        const style = getComputedStyle(video);
        return {
          duration: video.duration, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
          paused: video.paused, currentTime: video.currentTime, controls: video.controls,
          autoplay: video.autoplay, preload: video.preload, ratio: box.width / box.height,
          top: box.top, bottom: box.bottom, left: box.left, right: box.right,
          shadow: style.boxShadow, radius: style.borderRadius,
          controlsVisible: box.bottom <= innerHeight + 1 && box.bottom > innerHeight * .5,
          ground: getComputedStyle(document.body).backgroundColor,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          contextMenuAllowed: video.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
          title: document.querySelector('h1')?.textContent,
        };
      });
      check(`${width}px /${route}: native player is viewport-safe and metadata-only`,
        Math.abs(state.duration - duration) < .05 && state.videoWidth === 780 && state.videoHeight === 1688
        && state.paused && state.currentTime <= .06 && state.controls && !state.autoplay && state.preload === 'metadata'
        && Math.abs(state.ratio - 780 / 1688) < .005 && state.top >= -1 && state.left >= -1 && state.right <= width + 1
        && state.controlsVisible && state.shadow === 'none' && state.radius === '0px'
        && state.ground === 'rgb(244, 246, 243)' && state.reducedMotion && state.contextMenuAllowed && !!state.title,
        JSON.stringify(state));
      if (route === 'home') await page.screenshot({ path: `${shots}/home-${width}.png` });
      if (route === 'submission/intro-home' && width === 390) await page.screenshot({ path: `${shots}/intro-home-390.png` });

      if (width === 390 && route === 'home') {
        const video = page.locator('video');
        await video.focus();
        await page.keyboard.press('Space');
        await page.waitForFunction(() => !document.querySelector('video').paused);
        await page.waitForTimeout(250);
        await page.keyboard.press('Space');
        await page.waitForFunction(() => document.querySelector('video').paused);
        const beforeSeek = await video.evaluate(item => item.currentTime);
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(150);
        const afterSeek = await video.evaluate(item => item.currentTime);
        check('native video keyboard controls play, pause, and seek', beforeSeek > 0 && afterSeek > beforeSeek + 4,
          `played to ${beforeSeek.toFixed(2)}s; seek to ${afterSeek.toFixed(2)}s`);
        await video.evaluate(item => { item.pause(); item.currentTime = 0; });
        await page.screenshot({ path: `${shots}/home-390.png` });
      }
    }
    check(`${width}px gallery creates no browser errors or unexpected app/API requests`, errors.length === 0 && unexpected.length === 0,
      JSON.stringify({ errors, unexpected }));
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`\nScreenshots: ${shots}`);
console.log(failures ? `${failures} gallery check(s) failed` : 'All gallery checks passed');
process.exit(failures ? 1 : 0);
