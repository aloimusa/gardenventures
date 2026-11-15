// Copies a SNAPSHOT of the model agent's modules into src/home/lab/. Read-only on the source: it only reads
// /srv/http/garden/js and never writes there. Records each file's source mtime and sha256 in src/home/lab/SOURCE.json.
// Since 2026-11-14 20:10 the model agent is retired and our copies are ours to adapt: a file whose content no longer
// matches the sha recorded at its last sync has been edited here, and is NOT overwritten unless --force is given.
// usage: npm run sync-lab [-- --force]
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const SRC = '/srv/http/garden/js', DST = new URL('../src/home/lab/', import.meta.url).pathname;
const FILES = ['style.js', 'plants/orchid.js', 'plants/organs.js'];
const force = process.argv.includes('--force');
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const prev = existsSync(`${DST}SOURCE.json`) ? JSON.parse(readFileSync(`${DST}SOURCE.json`, 'utf8')) : { files: {} };
const record = { syncedAt: new Date().toISOString(), source: SRC, files: {} };
let copied = 0;
for (const f of FILES) {
  const dst = `${DST}${f}`;
  const was = prev.files[f];
  if (!force && existsSync(dst) && was && sha(dst) !== was.sha256) {
    console.log(`kept ${f}: edited here since its last sync (use --force to overwrite)`);
    record.files[f] = { ...was, editedHere: true };
    continue;
  }
  const st = statSync(`${SRC}/${f}`);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(`${SRC}/${f}`, dst);
  record.files[f] = { mtime: st.mtime.toISOString(), sha256: sha(`${SRC}/${f}`) };
  copied++;
}
writeFileSync(`${DST}SOURCE.json`, JSON.stringify(record, null, 2) + '\n');
console.log(`synced ${copied} of ${FILES.length} files from ${SRC} -> src/home/lab/`);
