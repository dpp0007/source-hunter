// Drives extension/background.js with stubbed chrome.* APIs against the RUNNING app (npm run dev -- -p 3001).
import fs from "node:fs";
import assert from "node:assert";

const dir = new URL("../extension/", import.meta.url);
const opened = [], sent = [];
let onMsg, onClick, onMenu, menus = [];
globalThis.self = globalThis;
globalThis.importScripts = (f) => (0, eval)(fs.readFileSync(new URL(f, dir), "utf8"));
globalThis.chrome = {
  windows: { create: (o) => opened.push(o) },
  runtime: { onInstalled: { addListener: (f) => f() }, onMessage: { addListener: (f) => (onMsg = f) } },
  contextMenus: { create: (o) => menus.push(o), onClicked: { addListener: (f) => (onMenu = f) } },
  action: { onClicked: { addListener: (f) => (onClick = f) } },
  tabs: { sendMessage: (id, m) => { sent.push([id, m]); return Promise.resolve(); } },
  scripting: { executeScript: async (o) => (o.func ? [{ result: globalThis.__selection }] : []) },
};
(0, eval)(fs.readFileSync(new URL("background.js", dir), "utf8"));

// 1. context menu registered
assert.equal(menus[0].title, "Trace with Source Hunter");

// 2. inline quick trace round-trip through the real API
const claim = process.argv[2] || "Humans swallow eight spiders a year in their sleep.";
const t = Date.now();
const reply = await new Promise((ok) => { const keep = onMsg({ quick: claim }, {}, ok); assert.equal(keep, true, "async reply must return true"); });
console.log(`quick trace: ${Math.round((Date.now() - t) / 1000)}s ok=${reply.ok}`);
assert.ok(reply.ok, reply.error);
console.log(" verdict:", reply.verdict.title, "| confidence:", reply.confidence.level, "| echo:", JSON.stringify(reply.echo));
console.log(" origin :", reply.origin && `${reply.origin.date} ${reply.origin.host} "${reply.origin.passage.slice(0, 70)}"`);
assert.ok(reply.verdict.title && reply.origin && reply.origin.url.startsWith("http"));

// 3. "Full trace" opens a popup with the claim URL-encoded
onMsg({ trace: "95% of startups fail & more?" }, {}, () => {});
assert.match(opened[0].url, /\?q=95%25%20of%20startups%20fail%20%26%20more%3F#trace$/);
assert.equal(opened[0].type, "popup");

// 4. toolbar click: selection -> inline card; no selection -> Claim Radar
globalThis.__selection = "A long enough highlighted sentence to trace.";
await onClick({ id: 7 });
globalThis.__selection = "";
await onClick({ id: 7 });
assert.deepEqual(sent.map((s) => Object.keys(s[1])[0]), ["quickFromMenu", "radar"]);

// 5. app unreachable -> a human-readable error, not a hang
const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.reject(new Error("ECONNREFUSED"));
const bad = await new Promise((ok) => onMsg({ quick: claim }, {}, ok));
globalThis.fetch = realFetch;
assert.equal(bad.ok, false);
assert.match(bad.error, /Can't reach the Source Hunter app/);
console.log("extension background: all assertions passed");
