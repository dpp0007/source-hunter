// Traces one claim against the running app and prints verdict, origin, upstream walk and trail.
//   node scripts/trace-one.mjs "95% of startups fail."        (APP=https://... to target a deployment)
const APP = process.env.APP || "http://localhost:3001";
const claim = process.argv[2];
if (!claim) { console.error('usage: node scripts/trace-one.mjs "claim text"'); process.exit(1); }
const t = Date.now();
const r = await fetch(`${APP}/api/trace`, { method: "POST", body: JSON.stringify({ claim, fresh: true }) });
const lines = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
for (const m of lines) if (m.type === "step") console.log(" step:", m.msg.slice(0, 110));
const d = lines.find((m) => m.type === "done"), e = lines.find((m) => m.type === "error");
if (e) { console.log("ERR", e.message); process.exit(1); }
const o = d.sources.find((s) => s.url === d.origin);
console.log(`\nVERDICT: ${d.verdict.title} [${d.confidence.level}] (${Math.round((Date.now() - t) / 1000)}s, judge $${d.judge.usd})`);
console.log(`ORIGIN : ${o?.date ?? "undated"} ${o?.host} primary=${o?.primary} hop=${o?.hop} via=${o?.via ?? "-"} (${o?.relation})`);
console.log(`WALK   : ${JSON.stringify(d.judge.walk)}`);
console.log("TRAIL  :");
for (const x of d.trail) console.log(`   ${x.isOrigin ? "★" : " "} ${x.date ?? "undated"} ${x.host} [${x.relation}] ${x.primary ? "(primary)" : ""} “${x.wording.slice(0, 70)}”`);
console.log("knownRun:", d.knownRun);
