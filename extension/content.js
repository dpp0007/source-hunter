// Source Hunter content script: selection pill -> inline verdict card, plus Claim Radar. All UI lives in a shadow root so page CSS cannot touch it.
(() => {
  if (window.__shLoaded) return;
  window.__shLoaded = true;

  const CSS = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .pill{all:unset;position:fixed;display:flex;align-items:center;gap:6px;background:#2f5bff;color:#fff;font:600 13px system-ui;padding:7px 12px 7px 9px;border-radius:999px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.28);transition:transform .12s}
    .pill:hover{transform:translateY(-1px)}
    .card{position:fixed;width:348px;max-width:calc(100vw - 16px);background:#fffdf8;color:#1b1a17;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.06);font-size:13px;line-height:1.45;overflow:hidden;animation:in .18s ease-out}
    @keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eee6d6;font-size:12px}
    .hd b{flex:1;font-weight:700;letter-spacing:.01em}
    .x{all:unset;cursor:pointer;color:#6f6a5f;padding:2px 6px;border-radius:6px}.x:hover{background:#f1ebdd}
    .claim{padding:10px 12px 0;color:#4a463e;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-style:italic}
    .body{padding:10px 12px 12px}
    .verdict{border-radius:12px;padding:10px 12px}
    .lab{font:700 20px/1.15 Georgia,serif}
    .det{margin-top:4px;color:#2e2b25}
    .good{background:#e6f6ec;color:#17693a}.bad{background:#ffe6e6;color:#a82323}.warn{background:#fff4cc;color:#9c4408}.mute{background:#f4efe3;color:#5b564b}
    .good .det,.bad .det,.warn .det,.mute .det{color:#2e2b25}
    .origin{margin-top:10px;padding:8px 10px;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 1px #eee6d6}
    .k{font:700 10px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#6f6a5f}
    .origin a{color:#2f5bff;font-weight:600;text-decoration:none}.origin a:hover{text-decoration:underline}
    .origin .m{color:#6f6a5f;font-size:12px;margin-top:2px}
    .meta{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin-top:10px;font-size:11px;color:#6f6a5f}
    .chip{font:700 10px system-ui;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:#ffe066;color:#1b1a17}
    .chip.high{background:#1f8a4c;color:#fff}.chip.low,.chip.none{background:#ffd6d6;color:#a82323}
    .acts{display:flex;gap:6px;margin-top:12px}
    .btn{all:unset;cursor:pointer;font:600 12px system-ui;padding:7px 12px;border-radius:999px;box-shadow:inset 0 0 0 1px #d9cfba;color:#1b1a17;text-align:center}
    .btn:hover{background:#f6f0e2}.btn.p{background:#1b1a17;color:#fffdf8;box-shadow:none}.btn.p:hover{background:#34322c}
    .foot{margin-top:8px;font-size:10.5px;color:#8a8576}
    .load{padding:16px 12px 18px;display:flex;flex-direction:column;gap:10px}
    .bar{height:4px;border-radius:99px;background:#eee6d6;overflow:hidden}.bar i{display:block;height:100%;width:40%;background:#2f5bff;border-radius:99px;animation:sl 1.3s ease-in-out infinite}
    @keyframes sl{0%{margin-left:-40%}100%{margin-left:100%}}
    .err{padding:12px;color:#a82323}
    .badge{all:unset;position:fixed;width:24px;height:24px;border-radius:50%;background:#2f5bff;color:#fff;font:700 12px/24px system-ui;text-align:center;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.3);transition:transform .12s}
    .badge:hover{transform:scale(1.15)}
    .banner{position:fixed;top:12px;right:12px;display:flex;align-items:center;gap:10px;background:#1b1a17;color:#fffdf8;padding:9px 12px 9px 14px;border-radius:999px;font:600 12.5px system-ui;box-shadow:0 8px 26px rgba(0,0,0,.3);animation:in .2s ease-out}
    .banner button{all:unset;cursor:pointer;color:#ffe066;font-weight:700}
  `;
  const LOGO = `<svg width="18" height="18" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.3" fill="#2f5bff"/><line x1="14.9" y1="14.9" x2="19.2" y2="19.2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="10.3" cy="10.3" r="5.6" fill="#ffe066" stroke="#fff" stroke-width="1.7"/><line x1="7.8" y1="10.3" x2="12.8" y2="10.3" stroke="#2f5bff" stroke-width="1.3" stroke-linecap="round"/></svg>`;

  const host = document.createElement("div");
  host.id = "source-hunter-root";
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  document.documentElement.appendChild(host);

  const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }; // textContent only: page text is untrusted
  const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
  const TONE = { verbatim: "good", match: "good", disputed: "bad", altered: "bad", rounded: "warn", unclear: "warn", paraphrase: "mute", none: "mute" };

  // Clipboard API first; a hidden textarea + execCommand when the page's permissions policy blocks it
  const copyText = (t) => navigator.clipboard.writeText(t).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    root.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("blocked");
  });

  let pill = null, card = null, hintTimer = null, radar = null;
  const hidePill = () => { pill?.remove(); pill = null; };
  const closeCard = () => { clearInterval(hintTimer); card?.remove(); card = null; };

  function place(node, rect, w, hgt) {
    const left = Math.max(8, Math.min(rect.left, innerWidth - w - 8));
    const below = rect.bottom + 10 + hgt <= innerHeight;
    node.style.left = left + "px";
    node.style.top = Math.max(8, below ? rect.bottom + 10 : rect.top - hgt - 10) + "px";
  }

  function showCard(rect, text) {
    closeCard(); hidePill();
    card = h("div", "card");
    const hd = h("div", "hd");
    const logo = h("span"); logo.innerHTML = LOGO; // static trusted markup
    const x = h("button", "x", "✕"); x.onclick = closeCard;
    hd.append(logo, h("b", "", "Source Hunter"), x);
    const claim = h("div", "claim", `“${text}”`);
    const load = h("div", "load");
    const hint = h("div", "", "Searching for pages that repeat this…");
    const bar = h("div", "bar"); bar.appendChild(h("i"));
    load.append(hint, bar);
    card.append(hd, claim, load);
    root.appendChild(card);
    place(card, rect, 348, 190);
    const hints = ["Searching for pages that repeat this…", "Reading the pages…", "Following the sources they cite…", "Comparing the wording…"];
    let i = 0;
    hintTimer = setInterval(() => { hint.textContent = hints[Math.min(++i, hints.length - 1)]; }, 4500);

    let p;
    try { p = chrome.runtime.sendMessage({ quick: text }); } catch { p = Promise.resolve({ ok: false, error: "Source Hunter was updated. Reload this page and try again." }); }
    Promise.resolve(p).then((res) => render(card, rect, text, res || { ok: false, error: "No response from the extension." }));
  }

  function render(mine, rect, text, res) {
    if (card !== mine) return; // closed or replaced meanwhile
    clearInterval(hintTimer);
    mine.querySelector(".load")?.remove();
    const body = h("div", "body");
    if (!res.ok) {
      body.className = "err";
      body.append(h("div", "", res.error || "Something went wrong."));
      const retry = h("button", "btn", "Try again"); retry.style.marginTop = "10px"; retry.onclick = () => showCard(rect, text);
      body.appendChild(retry);
      mine.appendChild(body);
      return;
    }
    const v = res.verdict, tone = TONE[v.kind] || "mute";
    const verdict = h("div", `verdict ${tone}`);
    verdict.append(h("div", "lab", v.title), h("div", "det", v.detail));
    body.appendChild(verdict);

    const o = res.origin;
    if (o) {
      const box = h("div", "origin");
      box.appendChild(h("div", "k", "Earliest match"));
      const u = safeUrl(o.url);
      const a = h("a", "", o.title || o.host);
      if (u) { a.href = u; a.target = "_blank"; a.rel = "noreferrer noopener"; }
      box.appendChild(a);
      box.appendChild(h("div", "m", [o.date || "undated", o.host].filter(Boolean).join(" · ")));
      body.appendChild(box);
    }
    const meta = h("div", "meta");
    if (res.confidence) {
      const c = h("span", `chip ${res.confidence.level}`, `${res.confidence.level} confidence`);
      c.title = res.confidence.why;
      meta.appendChild(c);
    }
    if (res.echo) meta.appendChild(h("span", "", `${res.echo.copies} page${res.echo.copies === 1 ? "" : "s"} repeat it · ${res.echo.primaries} primary`));
    body.appendChild(meta);

    const acts = h("div", "acts");
    const full = h("button", "btn p", "Full trace + deep verify ↗");
    full.onclick = () => { try { chrome.runtime.sendMessage({ trace: text }); } catch { /* extension reloaded */ } };
    acts.appendChild(full);
    if (o && o.passage) {
      const cp = h("button", "btn", "Copy safe quote");
      cp.onclick = () => {
        const t = `“${o.passage}” — ${[o.title, o.date, o.host].filter(Boolean).join(", ")}${safeUrl(o.url) ? "\n" + safeUrl(o.url) : ""}`;
        copyText(t).then(() => { cp.textContent = "Copied ✓"; setTimeout(() => (cp.textContent = "Copy safe quote"), 1600); }, () => { cp.textContent = "Copy blocked"; });
      };
      acts.appendChild(cp);
    }
    body.appendChild(acts);
    body.appendChild(h("div", "foot", "Fast pass. Open the full trace to verify every cited quote on its live page."));
    mine.appendChild(body);
    place(mine, rect, 348, mine.offsetHeight || 320);
  }

  // ---- selection pill ----
  document.addEventListener("mouseup", (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = getSelection(), text = sel ? sel.toString().trim() : "";
      hidePill();
      if (text.length < 12 || !sel.rangeCount) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      pill = h("button", "pill");
      const l = h("span"); l.innerHTML = LOGO;
      pill.append(l, h("span", "", "Trace it"));
      pill.style.left = Math.min(rect.right, innerWidth - 120) + "px";
      pill.style.top = Math.max(rect.top - 40, 6) + "px";
      pill.onmousedown = (ev) => ev.preventDefault();
      pill.onclick = () => showCard(rect, text);
      root.appendChild(pill);
    }, 10);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCard(); hidePill(); clearRadar(); } });
  document.addEventListener("scroll", hidePill, { passive: true });

  // ---- Claim Radar: flag the checkable claims on the page ----
  function clearRadar() {
    if (!radar) return;
    radar.items.forEach(({ el, prev }) => { el.style.boxShadow = prev; });
    radar.nodes.forEach((n) => n.remove());
    window.removeEventListener("scroll", radar.tick, true);
    window.removeEventListener("resize", radar.tick);
    radar = null;
  }

  function scan() {
    clearRadar(); closeCard();
    const ok = (e) => {
      if (e.closest("nav,header,footer,aside,form,[role=navigation],#source-hunter-root")) return false;
      const r = e.getBoundingClientRect();
      return r.width > 80 && r.height > 8 && getComputedStyle(e).visibility !== "hidden";
    };
    const cands = [];
    for (const e of document.querySelectorAll("p, li, blockquote")) {
      if (e.querySelector("p, li, blockquote") || !ok(e)) continue;
      const t = (e.innerText || "").trim();
      if (t.length < 40 || t.length > 900) continue;
      const c = self.SHClaims.extractClaims(t, 1)[0];
      if (c) cands.push({ e, c });
    }
    const top = cands.sort((a, b) => b.c.score - a.c.score).slice(0, 12).sort((a, b) => (a.e.compareDocumentPosition(b.e) & 4 ? -1 : 1));
    const nodes = [], items = [];
    const banner = h("div", "banner");
    banner.append(h("span", "", top.length ? `Claim Radar: ${top.length} claim${top.length === 1 ? "" : "s"} worth checking` : "Claim Radar: no checkable claims found on this page"));
    const clear = h("button", "", top.length ? "Clear" : "OK"); clear.onclick = clearRadar;
    banner.appendChild(clear);
    root.appendChild(banner); nodes.push(banner);
    const badges = top.map(({ e, c }, i) => {
      const b = h("button", "badge", String(i + 1));
      b.title = `Trace: ${c.text.slice(0, 90)}`;
      b.onclick = () => showCard(e.getBoundingClientRect(), c.text);
      root.appendChild(b); nodes.push(b);
      items.push({ el: e, prev: e.style.boxShadow });
      e.style.boxShadow = "inset 3px 0 0 #ffe066";
      return { b, e };
    });
    const tick = () => requestAnimationFrame(() => badges.forEach(({ b, e }) => {
      const r = e.getBoundingClientRect(), vis = r.bottom > 0 && r.top < innerHeight;
      b.style.display = vis ? "block" : "none";
      b.style.left = Math.max(4, r.left - 30) + "px";
      b.style.top = Math.max(r.top + 4, 4) + "px";
    }));
    window.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    radar = { nodes, items, tick };
    tick();
    if (!top.length) setTimeout(clearRadar, 4500);
  }

  // messages from the background (toolbar button, context menu)
  try {
    chrome.runtime.onMessage.addListener((m) => {
      if (m.radar) scan();
      if (m.quickFromMenu) {
        const sel = getSelection();
        const rect = sel && sel.rangeCount && sel.toString().trim() ? sel.getRangeAt(0).getBoundingClientRect() : { left: innerWidth / 2 - 174, bottom: 80, top: 80, right: 0 };
        showCard(rect, m.quickFromMenu);
      }
    });
  } catch { /* not running as an extension (tests) */ }

  window.__sh = { scan, showCard, clearRadar }; // handle for tests (content scripts run in an isolated world, so pages cannot reach it)
})();
