import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Read existing artifacts only; never builds, deploys, loads env files or calls services.
const root = process.cwd();
const normalize = value => value.split(path.sep).join("/");
async function walk(directory, suffix) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const nested = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file, suffix) : file.endsWith(suffix) ? [file] : [];
  }));
  return nested.flat();
}
const sizes = new Map();
const missing = new Set();
async function bytes(file) {
  if (!sizes.has(file)) sizes.set(file, stat(file).then(value => value.size).catch(error => {
    if (error.code !== "ENOENT") throw error;
    missing.add(file); return 0;
  }));
  return sizes.get(file);
}
const traces = [];
const unique = new Map();
for (const trace of await walk(path.join(root, ".next"), ".nft.json")) {
  const { files } = JSON.parse(await readFile(trace, "utf8"));
  let total = 0;
  for (const relative of files) {
    const file = path.resolve(path.dirname(trace), relative), size = await bytes(file);
    total += size;
    unique.set(normalize(path.relative(root, file)), size);
  }
  traces.push({ trace: normalize(path.relative(root, trace)), bytes: total, files: files.length });
}
const groups = {};
for (const [file, size] of unique) {
  const parts = file.split("/");
  const group = parts[0] === "node_modules" ? parts.slice(0, parts[1]?.startsWith("@") ? 3 : 2).join("/") : parts[0];
  groups[group] = (groups[group] ?? 0) + size;
}
// .func aliases may be symlinks. Count unique real function directories, not routes.
const functions = await walk(path.join(root, ".vercel/output/functions"), ".vc-config.json");
const report = {
  note: "Next traces are inputs to the platform packager, NOT a deployed function count. Windows traces are not Linux bundle sizes.",
  uniqueTracedBytes: [...unique.values()].reduce((sum, value) => sum + value, 0),
  summedTraceBytes: traces.reduce((sum, trace) => sum + trace.bytes, 0),
  missingTracedFiles: missing.size,
  largestTraces: traces.sort((a, b) => b.bytes - a.bytes).slice(0, 12),
  tracedGroups: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1] - a[1])),
  vercelFunctionCount: functions.length || null,
};
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
