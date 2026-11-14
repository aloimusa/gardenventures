// Copies a SNAPSHOT of the model agent's modules into src/home/lab/. Read-only on the source: it only reads
// /srv/http/garden/js and never writes there. Records each file's source mtime and sha256 in src/home/lab/SOURCE.json.
// usage: npm run sync-lab
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
const SRC = '/srv/http/garden/js', DST = new URL('../src/home/lab/', import.meta.url).pathname;
const FILES = ['style.js', 'plant.js', 'can.js'];
const record = { syncedAt: new Date().toISOString(), source: SRC, files: {} };
for (const f of FILES) {
  const st = statSync(`${SRC}/${f}`);
  copyFileSync(`${SRC}/${f}`, `${DST}${f}`);
  record.files[f] = { mtime: st.mtime.toISOString(), sha256: createHash('sha256').update(readFileSync(`${SRC}/${f}`)).digest('hex') };
}
writeFileSync(`${DST}SOURCE.json`, JSON.stringify(record, null, 2) + '\n');
console.log(`synced ${FILES.length} files from ${SRC} -> src/home/lab/`);
