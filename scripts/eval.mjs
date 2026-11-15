// Measured eval: does Source Hunter reach the right verdict? Compares the rule-based baseline with the Haiku-judged verdict
// on claims with a known answer. Needs the app running (npm run dev -- -p 3001). One trace yields both verdicts.
//   node scripts/eval.mjs            -> runs all claims, writes scripts/eval-results.json
import fs from "node:fs";

const APP = process.env.APP || "http://localhost:3001";
// accept = which verdicts count as correct
const SET = [
  // myths: the claim is false
  ["Humans use only 10% of their brains.", "false", ["false"]],
  ["The Great Wall of China is visible from space.", "false", ["false"]],
  ["Sugar makes children hyperactive.", "false", ["false"]],
  ["Humans swallow eight spiders a year in their sleep.", "false", ["false"]],
  ["Goldfish have a three-second memory.", "false", ["false"]],
  ["Bats are blind.", "false", ["false"]],
  ["Lightning never strikes the same place twice.", "false", ["false"]],
  ["You lose most of your body heat through your head.", "false", ["false"]],
  ["Napoleon Bonaparte was extremely short.", "false", ["false"]],
  ["Einstein failed math in school.", "false", ["false"]],
  ["Cracking your knuckles causes arthritis.", "false", ["false"]],
  // misattributed quotes: the words are real, the speaker is wrong
  ["Insanity is doing the same thing over and over again and expecting different results. — Albert Einstein", "misattributed", ["false"]],
  ["Let them eat cake. — Marie Antoinette", "misattributed", ["false"]],
  ["Be the change you wish to see in the world. — Mahatma Gandhi", "misattributed", ["false"]],
  // true claims: a good tool must NOT call these wrong
  ["The Earth is about 4.5 billion years old.", "true", ["supported", "unclear"]],
  ["Water boils at 100 degrees Celsius at sea level.", "true", ["supported", "unclear"]],
  ["The adult human body has 206 bones.", "true", ["supported", "unclear"]],
  ["Mount Everest is the highest mountain above sea level.", "true", ["supported", "unclear"]],
  // murky stats: "supported as stated" would be wrong
  ["95% of startups fail.", "murky", ["false", "unclear"]],
  ["You need to walk 10,000 steps a day for good health.", "murky", ["false", "unclear"]],
];

const map = (v, base) => (v.kind === "disputed" ? "false" : v.kind === "supported" || (base && (v.kind === "verbatim" || v.kind === "match")) ? "supported" : "unclear");
const rows = [];
let usd = 0, ms = 0;

for (const [claim, kind, ok] of SET) {
  const t = Date.now();
  let d;
  try {
    const r = await fetch(`${APP}/api/trace`, { method: "POST", body: JSON.stringify({ claim, fresh: true }) });
    d = (await r.text()).trim().split("\n").map((l) => JSON.parse(l)).find((m) => m.type === "done");
  } catch (e) { console.log("ERR", claim, e.message); }
  if (!d) { rows.push({ claim, kind, error: true }); continue; }
  const hk = map(d.verdict, false), bs = map((d.baseline ?? d).verdict, true);
  const o = d.sources.find((s) => s.url === d.origin);
  usd += d.judge?.usd ?? 0; ms += Date.now() - t;
  rows.push({ claim, kind, accept: ok, baseline: bs, haiku: hk, baseOk: ok.includes(bs), haikuOk: ok.includes(hk), conf: d.confidence.level, judged: !!d.judge?.used, origin: o ? `${o.date ?? "undated"} ${o.host}` : null, usd: d.judge?.usd ?? 0, sec: Math.round((Date.now() - t) / 1000) });
  const x = rows[rows.length - 1];
  console.log(`${x.haikuOk ? "✓" : "✗"} haiku=${hk.padEnd(9)} ${x.baseOk ? "✓" : "✗"} base=${bs.padEnd(9)} [${kind}] ${claim.slice(0, 60)}  (${x.sec}s, conf ${x.conf})`);
  await new Promise((r) => setTimeout(r, 6000)); // stay under TinyFish Search's 30 requests/min
}

const done = rows.filter((r) => !r.error);
const acc = (k) => `${done.filter((r) => r[k]).length}/${done.length} = ${Math.round((100 * done.filter((r) => r[k]).length) / Math.max(1, done.length))}%`;
const trueRows = done.filter((r) => r.kind === "true");
const fp = (f) => trueRows.filter((r) => r[f] === "false").length;
const hi = done.filter((r) => r.conf === "high");
console.log("\n=== RESULTS ===");
console.log("verdict accuracy  baseline:", acc("baseOk"), "| haiku:", acc("haikuOk"));
console.log("false alarms on TRUE claims  baseline:", fp("baseline") + "/" + trueRows.length, "| haiku:", fp("haiku") + "/" + trueRows.length);
console.log("high-confidence answers:", hi.length, "| correct:", hi.filter((r) => r.haikuOk).length);
console.log(`haiku spend for ${done.length} traces: $${usd.toFixed(4)} ($${(usd / Math.max(1, done.length)).toFixed(5)} each) | avg ${Math.round(ms / Math.max(1, done.length) / 1000)}s`);
fs.writeFileSync(new URL("./eval-results.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
