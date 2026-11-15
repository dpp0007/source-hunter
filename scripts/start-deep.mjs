// Starts TinyResearch runs (about $2 each) for the demo claims and records the run ids in scripts/deep-runs.json.
//   node scripts/start-deep.mjs            -> starts the first 5 not yet started (TinyResearch allows 5 concurrent runs)
// Needs the app running locally (npm run dev -- -p 3001) with TINYFISH_API_KEY set.
import fs from "node:fs";

const APP = process.env.APP || "http://localhost:3001";
const FILE = new URL("./deep-runs.json", import.meta.url);
const CLAIMS = [
  "Humans use only 10% of their brains.",
  "The Great Wall of China is visible from space.",
  "Humans swallow eight spiders a year in their sleep.",
  "Goldfish have a three-second memory.",
  "You need to walk 10,000 steps a day for good health.",
  "Sugar makes children hyperactive.",
  "Let them eat cake. — Marie Antoinette",
];
const runs = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
const limit = Number(process.argv[2] || 5);
let started = 0;
for (const claim of CLAIMS) {
  if (runs[claim] || started >= limit) continue;
  const r = await fetch(`${APP}/api/research`, { method: "POST", body: JSON.stringify({ claim }) });
  const j = await r.json();
  if (!r.ok) { console.log("FAILED", claim, "->", j.error); continue; }
  runs[claim] = { id: j.id, startedAt: new Date().toISOString() };
  started++;
  console.log("started", j.id, claim);
  fs.writeFileSync(FILE, JSON.stringify(runs, null, 2));
}
console.log(`${started} started, ${Object.keys(runs).length}/${CLAIMS.length} total`);
