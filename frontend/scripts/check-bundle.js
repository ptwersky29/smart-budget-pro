/* Bundle budget gate.
 *
 * Fails CI when the initial (entry) JavaScript grows past the budget in gzip
 * terms. Lazy route chunks are reported and warned about, but only the entry
 * bundle is a hard failure so a single heavy optional screen cannot block a
 * release.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const buildDir = path.join(__dirname, "..", "build");
const manifestPath = path.join(buildDir, "asset-manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error("check-bundle: run `npm run build` first (no asset-manifest.json).");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const normalise = (file) => file.replace(/^\/+/, "");
const entrypoints = Array.from(
  new Set((manifest.entrypoints || []).filter((f) => f.endsWith(".js")).map(normalise))
);
const allJs = Array.from(
  new Set(Object.values(manifest.files || {}).filter((f) => f.endsWith(".js")).map(normalise))
);

const MAX_INITIAL_KB = Number(process.env.MAX_INITIAL_KB || 250);
const MAX_CHUNK_KB = Number(process.env.MAX_CHUNK_KB || 150);

function gzipKb(file) {
  const full = path.join(buildDir, file);
  if (!fs.existsSync(full)) return 0;
  return zlib.gzipSync(fs.readFileSync(full)).length / 1024;
}

function rawKb(file) {
  const full = path.join(buildDir, file);
  if (!fs.existsSync(full)) return 0;
  return fs.statSync(full).size / 1024;
}

const rows = allJs
  .map((file) => ({ file, gzip: gzipKb(file), raw: rawKb(file) }))
  .sort((a, b) => b.gzip - a.gzip);

const initialGzip = entrypoints.reduce((sum, file) => sum + gzipKb(file), 0);

console.log("Bundle report (gzip):");
for (const row of rows.slice(0, 15)) {
  const marker = entrypoints.includes(row.file) ? "entry" : "chunk";
  console.log(
    `  ${row.gzip.toFixed(1).padStart(7)} KB  ${row.raw.toFixed(1).padStart(8)} KB  ${marker.padEnd(5)}  ${row.file}`
  );
}
console.log(`\nInitial JS (entry): ${initialGzip.toFixed(1)} KB gzip / budget ${MAX_INITIAL_KB} KB`);

let failed = false;
if (initialGzip > MAX_INITIAL_KB) {
  console.error(`FAIL: initial bundle is ${(initialGzip - MAX_INITIAL_KB).toFixed(1)} KB over budget.`);
  failed = true;
}

const heavyChunks = rows.filter((row) => !entrypoints.includes(row.file) && row.gzip > MAX_CHUNK_KB);
if (heavyChunks.length > 0) {
  console.warn(
    `WARN: ${heavyChunks.length} lazy chunk(s) above ${MAX_CHUNK_KB} KB gzip: ` +
      heavyChunks.map((c) => `${c.file} (${c.gzip.toFixed(0)} KB)`).join(", ")
  );
}

process.exit(failed ? 1 : 0);
