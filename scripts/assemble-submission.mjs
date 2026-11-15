// Voiceover-gated submission renderer. This script does not synthesize speech or make a demo without real audio.
// Usage:
//   node scripts/assemble-submission.mjs [--voiceover=/absolute/or/project/path.m4a] [--wait-for-voiceover]
//   node scripts/assemble-submission.mjs --voiceover=voiceover.m4a --plan-only
//   node scripts/assemble-submission.mjs --voiceover=voiceover.m4a --timeline=artifacts/demo/submission/timeline.json
//
// Timeline JSON (optional): { "segments": [{ "name": "intro", "clips": ["intro-home"], "weight": 4 }],
//   "outroSeconds": 3, "endOverlaySeconds": 1.2 }. Weights are normalized against the real voiceover duration.
// For exact narration cuts, give every segment numeric start/end seconds, or use --boundaries=0,4.2,9.7,... .
// Segments may reference inventory clip IDs, paths relative to artifacts/demo/submission, or project-relative paths.
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'demo', 'submission');
const DEFAULT_VOICEOVER = path.join(ROOT, 'voiceover.m4a');
const DEFAULT_TIMELINE = path.join(OUT, 'timeline.json');
const DEFAULT_INVENTORY = path.join(OUT, 'inventory.json');
const DEFAULT_OUTPUT = path.join(OUT, 'demo.mp4');
const FPS = 30;
const SIZE = { width: 1920, height: 1080 };
const GROUND = '0xf4f6f3';
const WEBSITE = 'garden.hopeajahti.lol';
const run = promisify(execFile);
const argv = process.argv.slice(2);

function usage() {
  return `Usage: node scripts/assemble-submission.mjs [--voiceover=PATH] [--wait-for-voiceover] [--plan-only]\n` +
    `                  [--timeline=PATH] [--boundaries=0,4.2,9.7,...] [--output=PATH]\n` +
    `Default voiceover: ${DEFAULT_VOICEOVER}\n` +
    `No rendering occurs until that real audio file is present and ffprobe validates an audio stream.`;
}
if (argv.includes('--help') || argv.includes('-h')) { console.log(usage()); process.exit(0); }
const knownFlags = new Set(['--wait-for-voiceover', '--plan-only']);
const valueOptions = ['--voiceover', '--timeline', '--boundaries', '--output'];
for (const [index, arg] of argv.entries()) {
  const takesNextValue = index > 0 && valueOptions.includes(argv[index - 1]);
  if (arg.startsWith('--') && !takesNextValue && !knownFlags.has(arg)
    && !valueOptions.includes(arg) && !valueOptions.some(name => arg.startsWith(`${name}=`))) {
    console.error(`Unknown option: ${arg}\n${usage()}`); process.exit(2);
  }
}
function option(name) {
  const prefix = `--${name}=`;
  const inline = argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return !value || value.startsWith('--') ? '' : value;
}
const waitForVoiceover = argv.includes('--wait-for-voiceover');
const planOnly = argv.includes('--plan-only');
const voiceArgument = option('voiceover');
const voiceover = voiceArgument ? path.resolve(ROOT, voiceArgument) : DEFAULT_VOICEOVER;
const output = option('output') ? path.resolve(ROOT, option('output')) : DEFAULT_OUTPUT;
const timelineArgument = option('timeline');
const boundaryArgument = option('boundaries');
if (voiceArgument === '') { console.error(`The --voiceover option needs a path.\n${usage()}`); process.exit(2); }
if (!['.mp4', '.rendering.mp4'].some(suffix => output.endsWith(suffix)) || !output.endsWith('.mp4')) {
  console.error(`Output must be an .mp4 path; got ${output}`); process.exit(2);
}

async function exists(file) {
  try { await access(file, constants.R_OK); return true; } catch { return false; }
}
async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,pix_fmt', '-of', 'json', file]);
  return JSON.parse(stdout);
}
async function waitForAudio(file) {
  let announced = false;
  while (true) {
    if (await exists(file)) {
      try {
        const info = await probe(file), audio = info.streams.find(stream => stream.codec_type === 'audio'), duration = Number(info.format.duration);
        if (audio && Number.isFinite(duration) && duration > 0) return { info, audio, duration };
      } catch { /* a still-copying input is retried only in wait mode */ }
      if (!waitForVoiceover) throw new Error(`Voiceover has no readable, non-empty audio stream: ${file}`);
    } else if (!waitForVoiceover) {
      throw new Error(`Missing required voiceover: ${file}\nProvide --voiceover=PATH or put the real file at ${DEFAULT_VOICEOVER}.\n` +
        `Use --wait-for-voiceover to wait explicitly. No video was rendered.`);
    }
    if (!announced) {
      console.error(`Required voiceover is missing or not readable yet: ${file}\nWaiting because --wait-for-voiceover was supplied; no renderer is running.`);
      announced = true;
    }
    await delay(2000);
  }
}
const fmt = value => Number(value).toFixed(3);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function clipCandidates(value) {
  if (path.isAbsolute(value)) return [value];
  if (!value.includes('/')) return [path.join(OUT, value.endsWith('.mp4') ? value : `${value}.mp4`), path.resolve(ROOT, value)];
  return [path.resolve(OUT, value), path.resolve(ROOT, value)];
}

let voice;
try {
  voice = await waitForAudio(voiceover);
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
if (!voice) process.exit();

let inventory = { clips: {} };
try { inventory = JSON.parse(await readFile(DEFAULT_INVENTORY, 'utf8')); } catch { /* exact files can be supplied by a timeline */ }
let config = {};
const timelinePath = timelineArgument ? path.resolve(ROOT, timelineArgument) : DEFAULT_TIMELINE;
if (await exists(timelinePath)) {
  try { config = JSON.parse(await readFile(timelinePath, 'utf8')); }
  catch (error) { console.error(`Could not parse timeline ${timelinePath}: ${error.message}`); process.exit(2); }
} else if (timelineArgument) {
  console.error(`Timeline does not exist: ${timelinePath}`); process.exit(2);
}
if (!config.segments) {
  const order = ['intro-home', 'growth-bloom', 'reflect-photo', 'safety-plan'];
  const available = order.filter(name => inventory.clips?.[name]?.mp4);
  config.segments = available.map(name => ({ name, clips: [name] }));
  if (!available.length) {
    console.error(`No recorded clips found in ${DEFAULT_INVENTORY}. Record the genuine shots or supply --timeline=PATH.`);
    process.exit(2);
  }
}
if (!Array.isArray(config.segments) || !config.segments.length) { console.error('Timeline segments must be a non-empty array.'); process.exit(2); }
for (const [name, value] of [['timeline', timelineArgument], ['output', option('output')], ['boundaries', boundaryArgument]]) {
  if (value === '') { console.error(`--${name} needs a non-empty value.\n${usage()}`); process.exit(2); }
}
const endOverlaySeconds = config.endOverlaySeconds === undefined ? 1.2 : Number(config.endOverlaySeconds);
const outroSeconds = config.outroSeconds === undefined ? 3 : Number(config.outroSeconds);
const outroTitle = typeof config.outroTitle === 'string' && config.outroTitle.trim() ? config.outroTitle.trim() : WEBSITE;
if (!Number.isFinite(endOverlaySeconds) || !Number.isFinite(outroSeconds) || endOverlaySeconds < 0 || outroSeconds < 0) {
  console.error('Overlay/outro seconds must be finite and non-negative.'); process.exit(2);
}

const segments = [];
const sourceCache = new Map();
async function sourceFor(reference, segmentName) {
  const id = typeof reference === 'string' ? reference : '';
  let file = inventory.clips?.[id]?.mp4 || null;
  if (!file || !(await exists(file))) {
    file = null;
    for (const candidate of clipCandidates(id)) {
      if (await exists(candidate)) { file = candidate; break; }
    }
  }
  if (!file) throw new Error(`Segment ${segmentName} references missing MP4: ${reference}`);
  file = path.resolve(file);
  if (!sourceCache.has(file)) {
    const info = await probe(file), stream = info.streams.find(item => item.codec_type === 'video'), duration = Number(info.format.duration);
    if (!stream || !Number.isFinite(duration) || duration <= 0) throw new Error(`No measurable video stream in ${file}`);
    sourceCache.set(file, { file, info, stream, duration });
  }
  return sourceCache.get(file);
}
try {
  for (const [index, entry] of config.segments.entries()) {
    const name = String(entry.name || `segment-${index + 1}`);
    const references = Array.isArray(entry.clips) ? entry.clips : [entry.clip || entry.name];
    if (!references.length || references.some(reference => typeof reference !== 'string' || !reference)) throw new Error(`Segment ${name} has no clip path/ID.`);
    const sources = [];
    for (const reference of references) sources.push(await sourceFor(reference, name));
    const sourceDuration = sources.reduce((sum, source) => sum + source.duration, 0);
    const weight = entry.weight === undefined ? sourceDuration : Number(entry.weight);
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`Segment ${name} must have a finite positive weight.`);
    segments.push({ name, sources, sourceDuration, weight, rawStart: entry.start, rawEnd: entry.end });
  }
} catch (error) {
  console.error(error.message || error); process.exit(1);
}

// Exact, monotonically increasing boundaries. Exact start/end values are respected to the nearest 30 fps frame;
// the last main-video frame uses ceil so narration is never truncated. Weighted defaults also derive from real duration.
let rawBoundaries;
if (boundaryArgument !== undefined) {
  rawBoundaries = boundaryArgument.split(',').map(value => Number(value.trim()));
  if (rawBoundaries.length !== segments.length + 1 || rawBoundaries.some(value => !Number.isFinite(value))) {
    console.error(`--boundaries needs ${segments.length + 1} finite comma-separated timestamps for ${segments.length} segments.`); process.exit(2);
  }
} else if (segments.every(segment => segment.rawStart !== undefined || segment.rawEnd !== undefined)) {
  if (segments.some(segment => !Number.isFinite(Number(segment.rawStart)) || !Number.isFinite(Number(segment.rawEnd)))) {
    console.error('If one segment uses start/end, every segment needs finite numeric start and end seconds.'); process.exit(2);
  }
  rawBoundaries = [Number(segments[0].rawStart), ...segments.map(segment => Number(segment.rawEnd))];
  segments.forEach((segment, index) => {
    if (index > 0 && Math.abs(Number(segment.rawStart) - rawBoundaries[index]) > .001) {
      console.error(`Segment ${segment.name} starts at ${segment.rawStart}, but the preceding segment ends at ${rawBoundaries[index]}.`); process.exit(2);
    }
  });
} else {
  const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
  let elapsedWeight = 0;
  rawBoundaries = [0, ...segments.map(segment => {
    elapsedWeight += segment.weight;
    return voice.duration * elapsedWeight / totalWeight;
  })];
}
if (Math.abs(rawBoundaries[0]) > .001 || rawBoundaries.at(-1) < voice.duration - .04 || rawBoundaries.at(-1) > voice.duration + .04) {
  console.error(`Boundaries must begin at 0 and finish at the actual voiceover duration (${fmt(voice.duration)}s ± one frame).`); process.exit(2);
}
for (let index = 1; index < rawBoundaries.length; index++) if (!(rawBoundaries[index] > rawBoundaries[index - 1])) {
  console.error(`Boundaries must be strictly increasing: ${rawBoundaries.join(', ')}`); process.exit(2);
}
const frameBoundaries = rawBoundaries.map((value, index) => index === 0 ? 0 : index === rawBoundaries.length - 1 ? Math.ceil((value - 0.000001) * FPS) : Math.round(value * FPS));
for (let index = 1; index < frameBoundaries.length; index++) if (frameBoundaries[index] <= frameBoundaries[index - 1]) {
  console.error('Two boundaries collapse onto the same 30 fps frame; allow at least 1/30 second per segment.'); process.exit(2);
}
const mainFrames = frameBoundaries.at(-1);
const outroFrames = Math.round(outroSeconds * FPS);
const totalFrames = mainFrames + outroFrames;
const mainSeconds = mainFrames / FPS, totalSeconds = totalFrames / FPS;
const plan = {
  voiceover, voiceoverDuration: voice.duration, voiceoverCodec: voice.audio.codec_name,
  renderer: { width: SIZE.width, height: SIZE.height, fps: FPS, background: '#f4f6f3', portrait: 'centred, full-height 1080px, aspect-preserving, no blur/device frame',
    speedLimit: 2, loops: false, tailPolicy: 'clone last frame via tpad, never loop', endOverlayText: WEBSITE,
    outboundTitle: outroTitle, outboundTitleSeconds: outroFrames / FPS, videoCodec: 'h264', audioCodec: 'aac' },
  boundaries: [], totalSeconds,
};
let totalSpeedWarnings = 0;
segments.forEach((segment, index) => {
  const startFrame = frameBoundaries[index], endFrame = frameBoundaries[index + 1], frames = endFrame - startFrame;
  const targetDuration = frames / FPS;
  const speed = clamp(segment.sourceDuration / targetDuration, 1, 2);
  const durationAfterSpeed = segment.sourceDuration / speed;
  const tailHold = Math.max(0, targetDuration - durationAfterSpeed);
  const trimmed = Math.max(0, durationAfterSpeed - targetDuration);
  if (trimmed > .001) totalSpeedWarnings++;
  Object.assign(segment, { startFrame, endFrame, frames, start: startFrame / FPS, end: endFrame / FPS,
    targetDuration, speed, durationAfterSpeed, tailHold, trimmed });
  plan.boundaries.push({ index, name: segment.name, start: segment.start, end: segment.end, duration: targetDuration,
    sources: segment.sources.map(source => ({ file: source.file, duration: source.duration, fps: source.stream.avg_frame_rate })),
    sourceDuration: segment.sourceDuration, speed, holdLastFrames: tailHold, trimmedAtSpeedLimit: trimmed });
});

console.log(`Voiceover: ${voiceover}`);
console.log(`Real narration duration: ${fmt(voice.duration)}s (${voice.audio.codec_name})`);
console.log(`Exact 30 fps segment boundaries:`);
for (const segment of segments) {
  const notes = [`speed ${segment.speed.toFixed(4)}x`];
  if (segment.tailHold > .001) notes.push(`hold last ${fmt(segment.tailHold)}s`);
  if (segment.trimmed > .001) notes.push(`2x cap trims ${fmt(segment.trimmed)}s`);
  console.log(`  ${fmt(segment.start).padStart(8)} -> ${fmt(segment.end).padStart(8)}  ${segment.name} (${segment.frames} frames; ${notes.join(', ')})`);
}
if (outroFrames) console.log(`  ${fmt(mainSeconds).padStart(8)} -> ${fmt(totalSeconds).padStart(8)}  static outbound title: ${outroTitle}`);
if (totalSpeedWarnings) console.warn(`WARNING: ${totalSpeedWarnings} segment(s) need more than 2x to fit and will therefore be trimmed at the mandated 2x cap. Adjust the timing/timeline before using this cut if that loses required content.`);
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'assembly-plan.json'), JSON.stringify(plan, null, 2));
if (planOnly) {
  console.log(`Plan written to ${path.join(OUT, 'assembly-plan.json')}; --plan-only prevented rendering.`);
  process.exit(0);
}

// Build each source at the final canvas size before concat so mixed base/submission clips are safe. setpts/speed is
// capped above at 2; tpad clones only terminal frames; trim/end_frame produces exact segment lengths without loops.
const inputs = [], filters = [], concatLabels = [];
let inputIndex = 0;
segments.forEach((segment, segmentIndex) => {
  const local = [];
  segment.sources.forEach((source, sourceIndex) => {
    const label = `s${segmentIndex}_${sourceIndex}`;
    inputs.push('-i', source.file);
    filters.push(`[${inputIndex}:v]scale=-2:${SIZE.height}:flags=lanczos,setsar=1,pad=${SIZE.width}:${SIZE.height}:(ow-iw)/2:0:color=${GROUND},setpts=PTS-STARTPTS,fps=${FPS}[${label}]`);
    local.push(`[${label}]`); inputIndex++;
  });
  const base = `base${segmentIndex}`;
  if (local.length > 1) filters.push(`${local.join('')}concat=n=${local.length}:v=1:a=0[${base}]`);
  else filters.push(`${local[0]}null[${base}]`);
  const overlayStart = Math.max(0, segment.targetDuration - Math.min(endOverlaySeconds, segment.targetDuration));
  const fadeIn = Math.min(.12, segment.targetDuration / 4), fadeOut = Math.min(.18, segment.targetDuration / 4);
  filters.push(`[${base}]setpts=PTS/${segment.speed.toFixed(8)},fps=${FPS},tpad=stop_mode=clone:stop_duration=${fmt(segment.targetDuration + 1)},` +
    `trim=start_frame=0:end_frame=${segment.frames},setpts=N/(${FPS}*TB),` +
    `fade=t=in:st=0:d=${fmt(fadeIn)}:color=${GROUND},fade=t=out:st=${fmt(segment.targetDuration - fadeOut)}:d=${fmt(fadeOut)}:color=${GROUND},` +
    `drawtext=font='DejaVu Sans':text='${WEBSITE}':fontsize=28:fontcolor=0x1f5c45:box=1:boxcolor=${GROUND}@0.94:boxborderw=10:` +
    `x=(w-text_w)/2:y=h-64:enable='gte(t,${fmt(overlayStart)})'[seg${segmentIndex}]`);
  concatLabels.push(`[seg${segmentIndex}]`);
});
filters.push(`${concatLabels.join('')}concat=n=${segments.length}:v=1:a=0[main]`);
const outroFilters = [`[main]tpad=stop_mode=clone:stop_duration=${fmt(outroFrames / FPS)},trim=start_frame=0:end_frame=${totalFrames},setpts=N/(${FPS}*TB)`];
if (outroFrames) outroFilters.push(`drawtext=font='DejaVu Sans':text='${outroTitle}':fontsize=58:fontcolor=0x1f4937:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(t,${fmt(mainSeconds)})'`);
outroFilters.push(`fade=t=out:st=${fmt(totalSeconds - Math.min(.25, totalSeconds / 4))}:d=${fmt(Math.min(.25, totalSeconds / 4))}:color=${GROUND}`);
filters.push(`${outroFilters.join(',')}[vout]`);
const voiceIndex = inputIndex;
inputs.push('-i', voiceover);
const audioOutStart = Math.max(0, mainSeconds - .25);
filters.push(`[${voiceIndex}:a]atrim=duration=${fmt(voice.duration)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.080,` +
  `afade=t=out:st=${fmt(audioOutStart)}:d=0.250,apad=whole_dur=${fmt(totalSeconds)},atrim=duration=${fmt(totalSeconds)}[aout]`);

await mkdir(path.dirname(output), { recursive: true });
const partial = output.endsWith('.rendering.mp4') ? output : output.replace(/\.mp4$/, '.rendering.mp4');
console.log(`Rendering H.264/AAC to temporary ${partial}`);
try {
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', ...inputs, '-filter_complex', filters.join(';'),
    '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', fmt(totalSeconds), partial],
    { timeout: 0, maxBuffer: 4 * 1024 * 1024 });
  const result = await probe(partial), video = result.streams.find(stream => stream.codec_type === 'video'), audio = result.streams.find(stream => stream.codec_type === 'audio');
  if (!video || video.codec_name !== 'h264' || video.width !== SIZE.width || video.height !== SIZE.height || video.avg_frame_rate !== `${FPS}/1`
    || !audio || audio.codec_name !== 'aac' || Math.abs(Number(result.format.duration) - totalSeconds) > .05) {
    throw new Error(`Output validation failed: ${JSON.stringify(result)}`);
  }
  await rename(partial, output);
  const bytes = (await stat(output)).size;
  console.log(`Validated final demo: ${output} (${bytes} bytes, ${result.format.duration}s, H.264/AAC, 1920x1080, 30 fps)`);
} catch (error) {
  console.error(`Render failed; ${output} was not published. ${error.stderr || error.message || error}`);
  process.exitCode = 1;
}
