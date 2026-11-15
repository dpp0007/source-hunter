importScripts("config.js");

// full trace in a small popup window beside the page (no tab switch)
const open = (text) =>
  chrome.windows.create({ url: `${APP}/?q=${encodeURIComponent(text.slice(0, 600))}#trace`, type: "popup", width: 520, height: 800 });

/** A finished TinyResearch run for a known claim: its verdict, origin and "how it changed", ready for the card (free: the run is already paid for). */
async function deepSummary(id) {
  try {
    const r = await fetch(`${APP}/api/research?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (j.status !== "COMPLETED" || !j.report) return null;
    const m = j.report.match(/```json\s*([\s\S]*?)```/);
    const d = m ? JSON.parse(m[1]) : null;
    if (!d || !d.summary) return null;
    return {
      status: d.claim_status, summary: d.summary,
      origin: d.origin_found && d.origin ? { title: d.origin.title, url: d.origin.url, date: d.origin.date } : null,
      changes: (d.changes || []).slice(0, 3), sources: j.progress ? j.progress.sourceCount : null,
    };
  } catch { return null; }
}

/** Fast trace for the inline card: runs the app's /api/trace and keeps just what the card needs. */
async function quickTrace(text) {
  let r;
  try {
    r = await fetch(`${APP}/api/trace`, { method: "POST", body: JSON.stringify({ claim: text.slice(0, 600) }), signal: AbortSignal.timeout(110000) });
  } catch {
    throw new Error(`Can't reach the Source Hunter app at ${APP}. Is it running (npm run dev)?`);
  }
  if (r.status === 429) throw new Error("Too many traces in a short time. Wait a minute and try again.");
  if (!r.ok || !r.body) {
    const local = /localhost|127\.0\.0\.1/.test(APP);
    throw new Error(`The Source Hunter app returned an error (${r.status}). ${local ? "You are using the local app: restart it with npm run dev." : "Please try again in a moment."}`);
  }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "", done = null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const l of lines) {
      if (!l) continue;
      const m = JSON.parse(l);
      if (m.type === "error") throw new Error(m.message);
      if (m.type === "done") done = m;
    }
  }
  if (!done) throw new Error("The trace ended without a result.");
  const o = done.sources.find((s) => s.url === done.origin);
  const deep = done.knownRun ? await deepSummary(done.knownRun) : null;
  return {
    verdict: done.verdict, confidence: done.confidence, echo: done.echo, checked: done.checked, trail: done.trail || [], deep, ai: !!(done.judge && done.judge.used),
    origin: o ? { title: o.title, url: o.url, date: o.date, host: o.host, passage: o.passage } : null,
  };
}
self.quickTrace = quickTrace; // exposed for tests

chrome.runtime.onInstalled.addListener(() =>
  chrome.contextMenus.create({ id: "trace", title: "Trace with Source Hunter", contexts: ["selection"] }));
chrome.contextMenus.onClicked.addListener((i, tab) => {
  if (i.selectionText && tab?.id) chrome.tabs.sendMessage(tab.id, { quickFromMenu: i.selectionText }).catch(() => open(i.selectionText));
  else if (i.selectionText) open(i.selectionText);
});

chrome.runtime.onMessage.addListener((m, _sender, send) => {
  if (m.trace) { open(m.trace); return; }
  if (m.quick) {
    quickTrace(m.quick).then((r) => send({ ok: true, ...r }), (e) => send({ ok: false, error: e.message }));
    return true; // async reply
  }
});

// toolbar button: highlighted text -> inline trace; nothing highlighted -> Claim Radar scans the page
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["claims.js", "content.js"] }); // idempotent; covers tabs opened before install
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => getSelection().toString().trim() });
    chrome.tabs.sendMessage(tab.id, result && result.length >= 12 ? { quickFromMenu: result } : { radar: true });
  } catch { /* restricted page (chrome://, web store): nothing to read */ }
});
