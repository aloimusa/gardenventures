// Build the framework-free Garden demo gallery from the existing rendered MP4s.
// Run directly with `node scripts/build-video-gallery.mjs`, or let vite.config.ts call it after a build.
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const GROUND = '#f4f6f3';

const clips = [
  {
    slug: 'home', section: 'Demo clips', title: 'Home — a little water, new growth',
    description: 'A continuous home scene: watering, fresh growth, and the live Market portal.',
    source: 'artifacts/demo/home.mp4', destination: 'home.mp4', directory: 'home', depth: 1,
  },
  {
    slug: 'venture', section: 'Demo clips', title: 'Venture — banana harvest to a fresh plant',
    description: 'Banana selection, practice and timed harvests, then the journey to a fresh plant.',
    source: 'artifacts/demo/venture.mp4', destination: 'venture.mp4', directory: 'venture', depth: 1,
  },
  {
    slug: 'market', section: 'Demo clips', title: 'Market — trading a basket with Moss',
    description: 'A full basket exchange, the Moon moth gift, and placing the ornament at Home.',
    source: 'artifacts/demo/market.mp4', destination: 'market.mp4', directory: 'market', depth: 1,
  },
  {
    slug: 'reflect', section: 'Demo clips', title: 'Reflect — a written card and its reply',
    description: 'A rain-and-tea reflection becomes a card with a Good mood and a streamed reply.',
    source: 'artifacts/demo/reflect.mp4', destination: 'reflect.mp4', directory: 'reflect', depth: 1,
  },
  {
    slug: 'winddown', section: 'Demo clips', title: 'Wind down — choosing rain',
    description: 'The timer begins, then the sound and shape change from Nature to Rain.',
    source: 'artifacts/demo/winddown.mp4', destination: 'winddown.mp4', directory: 'winddown', depth: 1,
  },
  {
    slug: 'intro-home', section: 'Submission clips', title: 'Home at rest — the Moon moth ornament',
    description: 'A quiet Home view settling on the attached Moon moth ornament.',
    source: 'artifacts/demo/submission/intro-home.mp4', destination: 'submission/intro-home.mp4', directory: 'submission/intro-home', depth: 2,
  },
  {
    slug: 'growth-bloom', section: 'Submission clips', title: 'Growth — the orchid’s first bloom',
    description: 'The Home orchid moves from its first day to fully open blooms, with a settled final view.',
    source: 'artifacts/demo/submission/growth-bloom.mp4', destination: 'submission/growth-bloom.mp4', directory: 'submission/growth-bloom', depth: 2,
  },
  {
    slug: 'reflect-photo', section: 'Submission clips', title: 'Reflect — making a photo card',
    description: 'A photo invitation, the in-app camera, and the front and back of a new local photo card.',
    source: 'artifacts/demo/submission/reflect-photo.mp4', destination: 'submission/reflect-photo.mp4', directory: 'submission/reflect-photo', depth: 2,
  },
  {
    slug: 'safety-plan', section: 'Submission clips', title: 'Support — opening a personal safety plan',
    description: 'A support card opens the plan with Aino inline, then returns to Toolkit and Reflect.',
    source: 'artifacts/demo/submission/safety-plan.mp4', destination: 'submission/safety-plan.mp4', directory: 'submission/safety-plan', depth: 2,
  },
];

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function probe(source) {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height:format=duration',
    '-of', 'json', source,
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not probe ${source}: ${result.stderr || result.error?.message}`);
  const info = JSON.parse(result.stdout);
  const video = info.streams?.[0];
  const duration = Number(info.format?.duration);
  if (!video || video.width !== 780 || video.height !== 1688 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`${source} is not a measurable 780×1688 video. Only the rendered mobile clips are published.`);
  }
  return { duration, width: video.width, height: video.height, codec: video.codec_name };
}

function head(title, depth, bodyClass = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="${GROUND}">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="color-scheme" content="light">
  <link rel="icon" href="data:,">
  <title>${escapeHTML(title)}</title>
  <link rel="stylesheet" href="${'../'.repeat(depth)}gallery.css">
  ${bodyClass === 'clip-page' ? `<script type="module" src="${'../'.repeat(depth)}player.js"></script>` : ''}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>`;
}

function playerPage(clip, indexedClips) {
  const index = indexedClips.indexOf(clip);
  const previous = indexedClips[(index + indexedClips.length - 1) % indexedClips.length];
  const next = indexedClips[(index + 1) % indexedClips.length];
  const prefix = '../'.repeat(clip.depth);
  const media = `${prefix}${clip.destination}`;
  const clipTime = clip.duration.toFixed(2);
  const title = clip.title.replace(' — ', ': ');
  return `${head(`${clip.title} · Garden video`, clip.depth, 'clip-page')}
  <header class="clip-header">
    <div class="clip-copy">
      <p class="eyebrow">Garden ${clip.section === 'Submission clips' ? 'submission clip' : 'demo'} · <time datetime="PT${clipTime}S">${clipTime} seconds</time> · silent</p>
      <h1>${escapeHTML(title)}</h1>
      <p class="clip-description">${escapeHTML(clip.description)}</p>
    </div>
    <nav class="clip-nav" aria-label="Video navigation">
      <a href="${prefix}" rel="up">← All clips</a>
      <a href="${prefix}${previous.directory}/" rel="prev" aria-label="Previous clip: ${escapeHTML(previous.title)}">Previous</a>
      <a href="${prefix}${next.directory}/" rel="next" aria-label="Next clip: ${escapeHTML(next.title)}">Next</a>
      <a href="${media}" type="video/mp4" download="garden-${clip.slug}.mp4">Download MP4</a>
    </nav>
  </header>
  <main class="clip-stage">
    <video class="clip-video" controls playsinline preload="metadata" tabindex="0" aria-keyshortcuts="Space K ArrowLeft ArrowRight Home End" width="780" height="1688" aria-label="${escapeHTML(clip.title)}" data-duration="${clipTime}">
      <source src="${media}" type="video/mp4">
      Your browser cannot play this clip. <a href="${media}" download="garden-${clip.slug}.mp4">Download the MP4</a> instead.
    </video>
  </main>
</body>
</html>
`;
}

function indexPage(indexedClips) {
  const sections = ['Demo clips', 'Submission clips'].map(section => {
    const items = indexedClips.filter(clip => clip.section === section);
    const id = section === 'Demo clips' ? 'demo-clips' : 'submission-clips';
    const list = items.map(clip => {
      const clipTime = clip.duration.toFixed(2);
      return `        <li class="clip-item">
          <div class="clip-item-copy">
            <h3><a class="clip-link" href="./${clip.directory}/">${escapeHTML(clip.title)}</a></h3>
            <p>${escapeHTML(clip.description)}</p>
            <p class="clip-meta"><time datetime="PT${clipTime}S">${clipTime} seconds</time><span aria-hidden="true"> · </span>silent portrait MP4<span aria-hidden="true"> · </span>780 × 1688</p>
          </div>
          <a class="mp4-link" href="./${clip.destination}" type="video/mp4" download="garden-${clip.slug}.mp4" aria-label="Download ${escapeHTML(clip.title)} as MP4">MP4 <span aria-hidden="true">↓</span></a>
        </li>`;
    }).join('\n');
    return `    <section class="clip-group" aria-labelledby="${id}">
      <div class="section-heading"><h2 id="${id}">${section}</h2><span>${items.length} clips</span></div>
      <ul class="clip-list">
${list}
      </ul>
    </section>`;
  }).join('\n');

  return `${head('Garden demo clips · playable mobile videos', 0)}
  <main class="gallery">
    <header class="gallery-heading">
      <p class="eyebrow">Garden · rendered mobile demos</p>
      <h1>Demo clips</h1>
      <p>Nine quiet, real app recordings. Each clip opens in a simple browser player; nothing plays automatically.</p>
      <nav class="gallery-sections" aria-label="Clip groups"><a href="#demo-clips">Demo clips</a><a href="#submission-clips">Submission clips</a></nav>
    </header>
${sections}
    <footer class="gallery-footer"><p>Silent H.264 MP4 · 25 fps · 780 × 1688 portrait<br>Media playback starts only when you choose Play.</p></footer>
  </main>
</body>
</html>
`;
}

const STYLES = `/* Garden's current ground colour, without application scripts or decorative device framing. */
:root {
  color-scheme: light;
  --ground: ${GROUND};
  --ink: #1c2422;
  --ink-2: #4f5b57;
  --line: #d9dedb;
  --link: #205b3b;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--ground);
  color: var(--ink);
}
* { box-sizing: border-box; }
html { min-width: 280px; background: var(--ground); }
body { margin: 0; min-height: 100vh; min-height: 100dvh; background: var(--ground); }
a { color: var(--link); text-decoration-thickness: .09em; text-underline-offset: .2em; }
a:hover { text-decoration-thickness: .14em; }
a:focus-visible, video:focus-visible { outline: 3px solid #2f6fb0; outline-offset: 3px; }
h1, h2, h3, p { margin-top: 0; }
.eyebrow { margin-bottom: .55rem; color: var(--ink-2); font-size: .75rem; font-weight: 600; line-height: 1.5; letter-spacing: .035em; }
.gallery { width: min(100% - 2rem, 58rem); margin-inline: auto; padding: clamp(1.5rem, 5vw, 4.5rem) 0 2rem; }
.gallery-heading { max-width: 43rem; margin-bottom: clamp(2rem, 5vw, 3.5rem); }
.gallery-heading h1 { margin-bottom: .65rem; font-size: clamp(2rem, 7vw, 3.6rem); line-height: 1.04; letter-spacing: -.035em; }
.gallery-heading > p:not(.eyebrow) { max-width: 38rem; margin-bottom: 1.25rem; color: var(--ink-2); font-size: 1rem; line-height: 1.65; }
.gallery-sections { display: flex; flex-wrap: wrap; gap: .75rem 1.5rem; font-size: .875rem; font-weight: 600; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding-bottom: .75rem; border-bottom: 1px solid var(--ink-2); }
.section-heading h2 { margin: 0; font-size: 1.15rem; line-height: 1.3; }
.section-heading span { color: var(--ink-2); font-size: .75rem; white-space: nowrap; }
.clip-group + .clip-group { margin-top: 3rem; }
.clip-list { margin: 0; padding: 0; list-style: none; }
.clip-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: 1.25rem .125rem; border-bottom: 1px solid var(--line); }
.clip-item h3 { margin-bottom: .4rem; font-size: 1.06rem; line-height: 1.35; }
.clip-item p { margin-bottom: .5rem; color: var(--ink-2); font-size: .875rem; line-height: 1.55; }
.clip-item .clip-meta { margin: 0; font-size: .75rem; font-variant-numeric: tabular-nums; }
.clip-link { color: var(--ink); }
.clip-link:hover { color: var(--link); }
.mp4-link { min-width: 4.5rem; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 650; }
.gallery-footer { margin-top: 2.5rem; color: var(--ink-2); font-size: .75rem; line-height: 1.7; }

/* On wide screens the clip fills the available height beside a quiet text column. */
.clip-page { height: 100vh; height: 100dvh; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
.clip-header { position: relative; z-index: 1; padding: max(.75rem, env(safe-area-inset-top)) max(.875rem, env(safe-area-inset-right)) .65rem max(.875rem, env(safe-area-inset-left)); }
.clip-header h1 { margin-bottom: .4rem; font-size: clamp(1.1rem, 4.6vw, 1.65rem); line-height: 1.16; letter-spacing: -.015em; }
.clip-header .eyebrow { margin-bottom: .4rem; font-size: .69rem; }
.clip-description { max-width: 29rem; margin-bottom: .45rem; color: var(--ink-2); font-size: .78rem; line-height: 1.45; }
.clip-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0 .95rem; font-size: .75rem; font-weight: 600; }
.clip-nav a { min-height: 38px; display: inline-flex; align-items: center; white-space: nowrap; }
.clip-stage { min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; padding-bottom: env(safe-area-inset-bottom); background: var(--ground); }
.clip-video { display: block; flex: none; width: auto; height: auto; max-width: 100%; max-height: 100%; margin: 0; border: 0; border-radius: 0; background: var(--ground); object-fit: contain; box-shadow: none; }
.clip-video:fullscreen { width: 100%; height: 100%; max-width: none; max-height: none; }
@media (min-width: 760px) and (min-height: 600px) {
  .clip-page { grid-template: minmax(0, 1fr) / minmax(17rem, 22rem) minmax(0, 1fr); }
  .clip-header { align-self: center; padding: 2rem; }
  .clip-header h1 { font-size: 1.65rem; }
  .clip-header .eyebrow { font-size: .75rem; }
  .clip-description { margin: .85rem 0 1rem; font-size: .875rem; line-height: 1.6; }
  .clip-nav { gap: 0 1rem; font-size: .8rem; }
  .clip-stage { height: 100vh; height: 100dvh; }
}
@media (max-width: 420px) {
  .gallery { width: min(100% - 1.5rem, 58rem); }
  .clip-item { gap: .5rem; padding-block: 1rem; }
  .clip-item h3 { font-size: 1rem; }
  .mp4-link { min-width: 3.5rem; }
}
@media (max-height: 700px) and (max-width: 759px) {
  .clip-description { display: none; }
  .clip-header { padding-bottom: .25rem; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

export async function buildVideoGallery({ root = PROJECT_ROOT, outDir = join(root, 'dist') } = {}) {
  const indexedClips = clips.map(clip => ({ ...clip, ...probe(join(root, clip.source)) }));
  const videoRoot = join(outDir, 'video');
  await rm(videoRoot, { recursive: true, force: true });
  await mkdir(videoRoot, { recursive: true });

  await Promise.all(indexedClips.map(async clip => {
    const destination = join(videoRoot, clip.destination);
    const pageDirectory = join(videoRoot, clip.directory);
    await Promise.all([
      mkdir(dirname(destination), { recursive: true }),
      mkdir(pageDirectory, { recursive: true }),
    ]);
    await Promise.all([
      copyFile(join(root, clip.source), destination),
      writeFile(join(pageDirectory, 'index.html'), playerPage(clip, indexedClips)),
    ]);
  }));
  await Promise.all([
    writeFile(join(videoRoot, 'index.html'), indexPage(indexedClips)),
    writeFile(join(videoRoot, 'gallery.css'), STYLES),
    copyFile(fileURLToPath(new URL('video-player.js', import.meta.url)), join(videoRoot, 'player.js')),
  ]);

  return {
    videoRoot,
    clips: indexedClips.map(clip => ({ slug: clip.slug, duration: clip.duration, page: join(videoRoot, clip.directory, 'index.html'), media: join(videoRoot, clip.destination) })),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await buildVideoGallery();
  console.log(`Published ${result.clips.length} clips in ${result.videoRoot}`);
  for (const clip of result.clips) console.log(`${clip.slug}: ${clip.duration.toFixed(2)}s`);
}
