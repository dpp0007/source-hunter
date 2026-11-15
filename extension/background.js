importScripts("config.js");

// full trace in a small popup window beside the page (no tab switch)
const open = (text) =>
  chrome.windows.create({ url: `${APP}/?q=${encodeURIComponent(text.slice(0, 600))}#trace`, type: "popup", width: 520, height: 800 });

/** Fast trace for the inline card: runs the app's /api/trace and keeps just what the card needs. */
async function quickTrace(text) {
  let r;
  try {
    r = await fetch(`${APP}/api/trace`, { method: "POST", body: JSON.stringify({ claim: text.slice(0, 600) }), signal: AbortSignal.timeout(110000) });
  } catch {
    throw new Error(`Can't reach the Source Hunter app at ${APP}. Is it running (npm run dev)?`);
  }
  if (!r.ok || !r.body) throw new Error(`Source Hunter app returned ${r.status}`);
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
  return {
    verdict: done.verdict, confidence: done.confidence, echo: done.echo, checked: done.checked,
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
