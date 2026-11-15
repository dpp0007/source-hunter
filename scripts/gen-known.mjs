// Registers finished TinyResearch runs (scripts/deep-runs.json) as "known claims": tracing one attaches its deep result for free.
//   node scripts/gen-known.mjs        (needs the app running; only COMPLETED runs with a structured verdict are added)
import fs from "node:fs";

const APP = process.env.APP || "http://localhost:3001";
const runsFile = new URL("./deep-runs.json", import.meta.url), outFile = new URL("../lib/known-runs.json", import.meta.url);
const runs = JSON.parse(fs.readFileSync(runsFile, "utf8"));
const known = JSON.parse(fs.readFileSync(outFile, "utf8"));
for (const [claim, { id }] of Object.entries(runs)) {
  const j = await (await fetch(`${APP}/api/research?id=${id}`)).json();
  const ok = j.status === "COMPLETED" && /```json/.test(j.report || "");
  console.log(`${ok ? "added   " : "waiting "} ${j.status} ${claim}`);
  if (ok) known[claim] = id;
}
fs.writeFileSync(outFile, JSON.stringify(known, null, 2) + "\n");
console.log(Object.keys(known).length, "known claims");
