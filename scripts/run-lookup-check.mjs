// Does the app find an existing deep run for a claim from TinyFish alone (no browser memory)?
//   APP=https://source-hunter.vercel.app node scripts/run-lookup-check.mjs "claim text"
const APP = process.env.APP || "http://localhost:3001";
const claim = process.argv[2];
if (!claim) { console.error('usage: node scripts/run-lookup-check.mjs "claim text"'); process.exit(1); }

// 1) deep verify must reuse the saved run, never start a new paid one
const r = await (await fetch(`${APP}/api/research`, { method: "POST", body: JSON.stringify({ claim }) })).json();
console.log("POST /api/research ->", JSON.stringify(r));
if (r.id) {
  const g = await (await fetch(`${APP}/api/research?id=${r.id}`)).json();
  const m = (g.report || "").match(/```json\s*([\s\S]*?)```/);
  let d = null; try { d = m ? JSON.parse(m[1]) : null; } catch { /* unstructured */ }
  console.log("run status:", g.status, "| sources read:", g.progress?.sourceCount, "| finding:", d ? `${d.claim_status}: ${String(d.summary).slice(0, 90)}…` : "(none)");
}
// 2) a trace must attach it on its own
const t = await fetch(`${APP}/api/trace`, { method: "POST", body: JSON.stringify({ claim }) });
const done = (await t.text()).trim().split("\n").map((l) => JSON.parse(l)).find((m) => m.type === "done" || m.type === "error");
console.log("trace ->", done.type === "done" ? `${done.verdict.title} | attached run: ${done.knownRun ?? "NONE"}` : `error: ${done.message}`);
console.log(done.knownRun && done.knownRun === r.id ? "PASS: the trace attaches the same saved run" : "CHECK: run not attached");
