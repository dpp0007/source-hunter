// Captures REAL results for every known claim (a fresh fast trace + its finished TinyResearch run) into app/showcase/data.json,
// which the /showcase page renders. Needs the app running locally. Re-run any time to refresh.
//   node scripts/make-showcase.mjs
import fs from "node:fs";

const APP = process.env.APP || "http://localhost:3001";
const known = JSON.parse(fs.readFileSync(new URL("../lib/known-runs.json", import.meta.url), "utf8"));
const OUT = new URL("../app/showcase/data.json", import.meta.url);
// incremental: keep what is already captured unless --all is given
const items = process.argv.includes("--all") || !fs.existsSync(OUT) ? [] : JSON.parse(fs.readFileSync(OUT, "utf8")).items ?? [];

for (const [claim, run] of Object.entries(known)) {
  if (items.some((i) => i.claim === claim)) { console.log("have:", claim); continue; }
  console.log("tracing:", claim);
  let done = null;
  try {
    const r = await fetch(`${APP}/api/trace`, { method: "POST", body: JSON.stringify({ claim, fresh: true }) });
    done = (await r.text()).trim().split("\n").map((l) => JSON.parse(l)).find((m) => m.type === "done");
  } catch (e) { console.log("  trace failed:", e.message); }
  const rr = await (await fetch(`${APP}/api/research?id=${run}`)).json();
  const m = (rr.report || "").match(/```json\s*([\s\S]*?)```/);
  let d = null;
  try { d = m ? JSON.parse(m[1]) : null; } catch { /* unstructured run */ }
  const o = done?.sources?.find((s) => s.url === done.origin);
  items.push({
    claim, run,
    fast: done ? { title: done.verdict.title, kind: done.verdict.kind, detail: done.verdict.detail, confidence: done.confidence, ms: done.ms, usd: done.judge?.usd, ai: !!done.judge?.used, pages: done.sources.length } : null,
    origin: o ? { title: o.title, url: o.url, date: o.date, host: o.host.replace(/^www\./, ""), primary: o.primary } : null,
    trail: done?.trail ?? [],
    deep: d ? { status: d.claim_status, summary: d.summary, origin: d.origin_found ? d.origin : null, changes: d.changes ?? [], steps: (d.steps ?? []).slice(0, 6), sources: rr.progress?.sourceCount ?? null } : null,
  });
  await new Promise((r) => setTimeout(r, 4000)); // stay under the Search rate limit
}

fs.mkdirSync(new URL("../app/showcase/", import.meta.url), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2));
console.log(`wrote ${items.length} items`);
