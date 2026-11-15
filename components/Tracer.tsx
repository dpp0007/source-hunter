"use client";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Logo from "./Logo";
import { KNOWN } from "@/lib/known";

type Source = { url: string; title: string; host: string; date?: string; passage: string; score: number; status: string; note: string; primary: boolean; disputed: boolean; hop: number; citedBy?: string; via?: string; drift?: number; flags?: string[]; diff?: { t: string; k: "same" | "del" | "add" }[]; relation?: string; judgeQuote?: string };
type Echo = { copies: number; primaries: number; hosts: number };
type Confidence = { level: "high" | "medium" | "low" | "none"; why: string };
type TStep = { title?: string; url?: string; date?: string; exact_wording?: string; note?: string };
type Structured = { claim_status?: string; origin_found?: boolean; origin?: (TStep & { source_type?: string }) | null; steps?: TStep[]; changes?: string[]; summary?: string };
type Check = { status: "verified" | "close" | "not_found" | "unreachable" | "skipped"; via: "fetch" | "agent" | "none"; passage?: string; date?: string; note?: string };
type ChainItem = { step: TStep; res?: Check };
type Verdict = { kind: string; title: string; detail: string };
type Progress = { iterations: number; sourceCount: number; sources: { url: string; title?: string; date?: string }[]; questions: string[] };
type Deep = { id?: string; status?: string; report?: string | null; citations?: string[]; error?: string; progress?: Progress };
type JudgeInfo = { used: boolean; model?: string; stance?: string; reason?: string; usd?: number };
type Tone = "good" | "bad" | "warn" | "mute";
type Recent = { q: string; label: string; tone: string; run?: string; at: number };

/** TinyResearch ends its report with a fenced json verdict; lift it out so the UI can headline it. */
function splitReport(md: string): { text: string; data: Structured | null } {
  const m = md.match(/```json\s*([\s\S]*?)```/);
  if (!m) return { text: md, data: null };
  try { return { text: md.replace(m[0], "").trim(), data: JSON.parse(m[1]) }; } catch { return { text: md.replace(m[0], "").trim(), data: null }; }
}

const EXAMPLES = [
  "Humans use only 10% of their brains.",
  "The Great Wall of China is visible from space.",
  "Sugar makes children hyperactive.",
  "Humans swallow eight spiders a year in their sleep.",
  "95% of startups fail.",
  "Goldfish have a three-second memory.",
];
const TONE: Record<Tone, { card: string; dot: string; text: string }> = {
  good: { card: "bg-[#e6f6ec] ring-good/25", dot: "bg-good", text: "text-good" },
  bad: { card: "bg-[#ffe6e6] ring-bad/25", dot: "bg-bad", text: "text-bad" },
  warn: { card: "bg-[#fff4cc] ring-warn/25", dot: "bg-warn", text: "text-warn" },
  mute: { card: "bg-white ring-line", dot: "bg-mute", text: "text-mute" },
};
const CONF_TONE: Record<string, string> = { high: "bg-good text-white", medium: "bg-hi text-ink", low: "bg-[#ffd6d6] text-bad", none: "bg-line text-mute" };
const BADGE: Record<string, string> = {
  verbatim: "bg-[#c9f0d6] text-good", match: "bg-[#c9f0d6] text-good", paraphrase: "bg-line text-mute",
  related: "bg-line text-mute", rounded: "bg-hi text-warn", altered: "bg-[#ffd6d6] text-bad",
};
const LABEL: Record<string, string> = { verbatim: "exact wording", match: "figures match", paraphrase: "reworded", rounded: "rounded / drifted", altered: "figures changed", related: "loosely related" };
const CLAIM_LABEL: Record<string, [string, Tone]> = { supported: ["Supported", "good"], refuted: ["Refuted", "bad"], misquoted: ["Misquoted", "warn"], unverifiable: ["Can't be verified", "mute"] };
const FAST_TONE: Record<string, Tone> = { error: "warn", supported: "good", verbatim: "good", match: "good", disputed: "bad", altered: "bad", rounded: "warn", unclear: "warn", paraphrase: "mute", none: "mute" };
const REL: Record<string, [string, string]> = {
  states: ["states the claim", "bg-[#c9f0d6] text-good"], mentions: ["mentions it", "bg-line text-mute"],
  debunks: ["debunks it", "bg-[#ffd6d6] text-bad"], unrelated: ["unrelated", "bg-line text-mute"],
};
// public site: deep verification costs credits, so it is a button by default (set NEXT_PUBLIC_AUTO_DEEP=1 to run it with every trace)
const AUTO_DEFAULT = process.env.NEXT_PUBLIC_AUTO_DEEP === "1";
// finished TinyResearch runs: open instantly, no new spend
const DEMOS = KNOWN.map((k) => ({ label: k.q.length > 40 ? `${k.q.slice(0, 38)}…` : k.q, q: k.q, run: k.run }));
const canon = (u: string) => { try { const x = new URL(u); return x.host.replace(/^www\./, "") + x.pathname.replace(/\/+$/, ""); } catch { return u; } };
const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };
const okRes = (r?: Check) => !!r && (r.status === "verified" || r.status === "close");

/** Long quotes stay readable: three lines, then expand. */
function Clamp({ children, lines = 3 }: { children: ReactNode; lines?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className={open ? "" : lines === 3 ? "line-clamp-3" : "line-clamp-2"}>{children}</div>
      <button onClick={() => setOpen(!open)} className="mt-0.5 text-xs font-medium text-blue hover:underline">{open ? "Show less" : "Show more"}</button>
    </div>
  );
}

export default function Tracer({ compact = false }: { compact?: boolean }) {
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [origin, setOrigin] = useState<string>();
  const [echo, setEcho] = useState<Echo>();
  const [conf, setConf] = useState<Confidence>();
  const [error, setError] = useState("");
  const [ran, setRan] = useState("");
  const [deep, setDeep] = useState<Deep>({});
  const [auto, setAuto] = useState(AUTO_DEFAULT);
  const [judge, setJudge] = useState<JudgeInfo>();
  const [agentBusy, setAgentBusy] = useState(false);
  const [chain, setChain] = useState<ChainItem[]>([]);
  const [vstate, setVstate] = useState<"idle" | "running" | "done">("idle");
  const [tab, setTab] = useState<"chain" | "pages" | "drift" | "report">("pages");
  const [editing, setEditing] = useState(!compact);
  const [mode, setMode] = useState<"claim" | "article">("claim");
  const [artUrl, setArtUrl] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [auditErr, setAuditErr] = useState("");
  const [audit, setAudit] = useState<{ title: string; host: string; claims: { text: string; score: number; kind: string }[] } | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [copied, setCopied] = useState("");
  const [now, setNow] = useState(0);
  const t0 = useRef(0);
  const verifiedFor = useRef("");
  const tabTouched = useRef(false);
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  async function trace(text = claim, skipDeep = false) {
    text = text.trim();
    if (!text || busy) return;
    setClaim(text); setRan(text); setBusy(true); setSteps([]); setSources([]); setVerdict(null); setError(""); setDeep({}); setOrigin(undefined); setEcho(undefined); setConf(undefined); setJudge(undefined);
    setChain([]); setVstate("idle"); verifiedFor.current = ""; tabTouched.current = false; setTab("pages"); setEditing(false);
    clearInterval(poll.current);
    if (auto && !skipDeep) deepVerify(text); // TinyResearch starts at once, in parallel with the fast trace
    try {
      const res = await fetch("/api/trace", { method: "POST", body: JSON.stringify({ claim: text }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? `The trace could not start (${res.status}).`); setBusy(false); return; }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const l of lines) {
          if (!l) continue;
          const m = JSON.parse(l);
          if (m.type === "step") setSteps((s) => [...s, m.msg]);
          else if (m.type === "source") setSources((s) => [...s, m.source]);
          else if (m.type === "error") setError(m.message);
          else if (m.type === "done") { setSources(m.sources); setVerdict(m.verdict); setOrigin(m.origin); setEcho(m.echo); setConf(m.confidence); setJudge(m.judge); if (m.knownRun) watch(m.knownRun); /* a finished TinyResearch run exists: attach it free */ }
        }
      }
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function runAudit() {
    setAuditing(true); setAuditErr(""); setAudit(null);
    try {
      const r = await fetch("/api/claims", { method: "POST", body: JSON.stringify({ url: artUrl }) });
      const j = await r.json();
      if (!r.ok) setAuditErr(j.error ?? "Could not read that page.");
      else setAudit(j);
    } catch (e) { setAuditErr((e as Error).message); }
    setAuditing(false);
  }

  async function deepVerify(text = ran) {
    setDeep({ status: "STARTING" });
    t0.current = Date.now();
    const r = await fetch("/api/research", { method: "POST", body: JSON.stringify({ claim: text }) });
    const j = await r.json();
    if (!r.ok) return setDeep({ error: j.error });
    history.replaceState(null, "", `${location.pathname}${location.search.replace(/[?&]run=[^&]*/, "")}${location.search.includes("?") ? "&" : "?"}run=${j.id}${location.hash}`);
    watch(j.id);
  }

  /** Re-check every step TinyResearch cites against the live page (TinyFish Fetch, Agent as fallback). */
  async function verifyChain(id: string, report: string) {
    if (verifiedFor.current === id) return;
    verifiedFor.current = id;
    const d = splitReport(report).data;
    if (!d) return;
    const items: TStep[] = [...(d.steps ?? [])];
    if (d.origin?.url && d.origin.exact_wording && !items.some((s) => s.url === d.origin!.url)) items.unshift({ ...d.origin });
    const usable = items.filter((s) => s.url && s.exact_wording).slice(0, 8);
    setChain(usable.map((step) => ({ step })));
    if (!usable.length) return;
    if (!tabTouched.current) setTab("chain");
    setVstate("running");
    try {
      const res = await fetch("/api/verify", { method: "POST", body: JSON.stringify({ steps: usable.map((s) => ({ url: s.url, wording: s.exact_wording })) }) });
      const j = await res.json();
      setChain(usable.map((step, i) => ({ step, res: j.results?.[i] })));
    } catch { /* leave unverified */ }
    setVstate("done");
  }

  /** Opt-in: a TinyFish Agent (real browser) reads the pages Fetch could not. Slow and billed, so the user asks for it. */
  async function agentRecheck() {
    setAgentBusy(true);
    try {
      const usable = chain.map((c) => c.step);
      const res = await fetch("/api/verify", { method: "POST", body: JSON.stringify({ useAgent: true, steps: usable.map((s) => ({ url: s.url, wording: s.exact_wording })) }) });
      const j = await res.json();
      if (j.results) setChain(usable.map((step, i) => ({ step, res: j.results[i] })));
    } catch { /* keep the Fetch results */ }
    setAgentBusy(false);
  }

  function watch(id: string) {
    if (!t0.current) t0.current = Date.now();
    setDeep({ id, status: "RUNNING" });
    const tick = async () => {
      const p = await (await fetch(`/api/research?id=${id}`)).json();
      if (p.error && !p.status) { clearInterval(poll.current); return setDeep({ id, error: p.error }); }
      setDeep({ id, status: p.status, report: p.report, citations: p.citations, error: p.error?.message, progress: p.progress });
      if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(p.status)) {
        clearInterval(poll.current);
        if (p.status === "COMPLETED" && p.report) verifyChain(id, p.report);
      }
    };
    tick();
    poll.current = setInterval(tick, 10000);
  }

  useEffect(() => {
    try { setRecents(JSON.parse(localStorage.getItem("sh_hist") || "[]")); } catch { /* no history */ }
    const saved = localStorage.getItem("sh_auto");
    const a = saved === null ? AUTO_DEFAULT : saved === "1";
    setAuto(a);
    const sp = new URLSearchParams(location.search);
    const q = sp.get("q"), run = sp.get("run");
    if (q) { setClaim(q); setRan(q); }
    if (q) trace(q, !!run || !a);
    if (run) watch(run); // resume a TinyResearch run after reload (runs after trace's reset, so it wins)
    const tickTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll.current); clearInterval(tickTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsed = t0.current && now ? Math.max(0, Math.round((now - t0.current) / 1000)) : 0;
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const running = !!deep.status && !["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(deep.status) && !deep.error;
  const sr = deep.report ? splitReport(deep.report) : null;
  const sd = sr?.data;

  // ---- one synthesized answer: TinyResearch's finding when it exists, otherwise the fast pass ----
  const oc = chain[0]?.res;
  let finalConf: Confidence | undefined = conf;
  if (oc) {
    if (okRes(oc)) finalConf = { level: "high", why: `origin quote re-found on its live page via TinyFish ${oc.via === "agent" ? "Agent" : "Fetch"}` };
    else if (oc.status === "not_found") finalConf = { level: "low", why: "the origin quote was not found on its live page" };
    else finalConf = { level: "medium", why: oc.status === "skipped" ? "traced by TinyResearch; the origin wording is only a reconstruction" : "traced by TinyResearch; the origin page blocks checking" };
  } else if (sd && !finalConf) finalConf = { level: "medium", why: "traced by TinyResearch; quotes are being re-checked" };
  else if (sd && vstate !== "done" && finalConf?.level === "none") finalConf = { level: "medium", why: "traced by TinyResearch; quotes are being re-checked" };

  const fastOrigin = sources.find((s) => s.url === origin);
  const final = sd?.summary
    ? (() => {
        const [label, tone] = CLAIM_LABEL[sd.claim_status ?? "unverifiable"] ?? CLAIM_LABEL.unverifiable;
        return { by: "Verified by TinyResearch", label, tone, summary: sd.summary!, originTitle: sd.origin_found ? sd.origin?.title : undefined, originUrl: sd.origin_found ? sd.origin?.url : undefined, originDate: sd.origin?.date ?? undefined, originCheck: oc };
      })()
    : verdict
      ? { by: running ? "Fast pass · deep verification running" : "Fast pass", label: verdict.title, tone: FAST_TONE[verdict.kind] ?? "mute", summary: verdict.detail, originTitle: fastOrigin?.title, originUrl: fastOrigin?.url, originDate: fastOrigin?.date, originCheck: undefined as Check | undefined }
      : null;

  // ---- share: the original wording, ready to paste into an article, plus a citation block and raw JSON ----
  const bestWording = sd?.origin_found && sd.origin?.exact_wording && !/\[(?:truncated|reconstructed)/i.test(sd.origin.exact_wording) ? sd.origin.exact_wording : fastOrigin?.passage;
  const originMeta = final ? [final.originTitle, final.originDate, final.originUrl && host(final.originUrl)].filter(Boolean).join(", ") : "";
  const safeQuote = final && bestWording ? `“${bestWording}” — ${originMeta}${final.originUrl ? `\n${final.originUrl}` : ""}` : "";
  const citation = final
    ? [
        `**Claim:** ${ran}`,
        `**Verdict:** ${final.label}${finalConf ? ` (${finalConf.level} confidence: ${finalConf.why})` : ""}`,
        `**Summary:** ${final.summary}`,
        final.originTitle ? `**Origin:** ${originMeta}${final.originUrl ? ` — ${final.originUrl}` : ""}` : "",
        bestWording ? `**Original wording:** “${bestWording}”` : "",
        ...(sd?.changes?.length ? ["**How it changed:**", ...sd.changes.map((c) => `- ${c}`)] : []),
        "",
        "_Traced with Source Hunter (TinyFish Search, Fetch, TinyResearch and Agent)._",
      ].filter((l, i, a) => l !== "" || i === a.length - 2).join("\n")
    : "";
  function copy(text: string, what: string) {
    const done = () => { setCopied(what); setTimeout(() => setCopied(""), 1800); };
    navigator.clipboard.writeText(text).then(done, () => {
      // fallback for browsers/contexts that block the async clipboard API
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) done(); else setCopied("Copy blocked by the browser");
    });
  }
  function downloadJson() {
    const blob = new Blob([JSON.stringify({ claim: ran, verdict: final, confidence: finalConf, tinyresearch: sd, verifiedChain: chain, pages: sources }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "source-hunter-trace.json"; a.click();
    URL.revokeObjectURL(a.href);
  }
  const finalLabel = final?.label;
  useEffect(() => {
    if (!finalLabel || !ran) return;
    const tone = final?.tone ?? "mute";
    setRecents((prev) => {
      const next = [{ q: ran, label: finalLabel, tone, run: deep.id, at: Date.now() }, ...prev.filter((r) => r.q !== ran)].slice(0, 8);
      try { localStorage.setItem("sh_hist", JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalLabel, ran, deep.id]);

  const chainSet = new Set(chain.map((c) => (c.step.url ? canon(c.step.url) : "")));
  const stage = {
    search: steps.some((s) => /Search/.test(s)),
    read: steps.some((s) => /Fetch|Found \d+ candidate/.test(s)),
    follow: steps.some((s) => /Following|Hop/.test(s)),
    done: !!verdict,
  };
  const tabs = [
    chain.length ? { id: "chain" as const, label: "Chain", n: vstate === "running" ? "…" : chain.filter((c) => okRes(c.res)).length + "/" + chain.length } : null,
    sources.length ? { id: "pages" as const, label: "Pages", n: String(sources.length) } : null,
    sources.length > 1 ? { id: "drift" as const, label: "Drift" } : null,
    sr ? { id: "report" as const, label: "Report" } : null,
  ].filter(Boolean) as { id: "chain" | "pages" | "drift" | "report"; label: string; n?: string }[];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  return (
    <section id="trace" className={`mx-auto max-w-3xl scroll-mt-6 px-4 sm:px-5 ${compact ? "py-4" : "py-12"}`}>
      {compact ? (
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 font-display text-2xl"><Logo size={26} />Source Hunter</p>
          <a href={ran ? `/?q=${encodeURIComponent(ran)}${deep.id ? `&run=${deep.id}` : ""}&full=1#trace` : "/"} target="_blank" className="text-xs text-mute hover:underline" title="Opens the full app with this claim and its deep research">Open full app ↗</a>
        </div>
      ) : (
        <>
          <h2 className="font-display text-4xl">Trace a claim</h2>
          <p className="mt-1 text-mute">Paste or type a number, claim or quote. Or use the extension to highlight one on any page.</p>
        </>
      )}

      {editing ? (
        <>
          <div className="mt-4 inline-flex rounded-full border border-line bg-white p-1 text-sm" role="tablist" aria-label="What to check">
            {([["claim", "A claim"], ["article", "An article"]] as const).map(([m, l]) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-full px-4 py-1.5 transition ${mode === m ? "bg-ink text-paper" : "text-mute hover:text-ink"}`}>{l}</button>
            ))}
          </div>
          {mode === "article" ? (
            <div className="mt-3">
              <p className="text-sm text-mute">Paste an article URL. TinyFish Fetch reads it and pulls out the statistics, quotes and attributed claims worth checking.</p>
              <div className="mt-2 flex gap-2">
                <input value={artUrl} onChange={(e) => setArtUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAudit()} placeholder="https://news-site.com/story"
                  className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/10" />
                <button onClick={runAudit} disabled={auditing || !artUrl.trim()} className="shrink-0 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper disabled:opacity-40">{auditing ? "Reading…" : "Find claims"}</button>
              </div>
              {auditErr && <p className="mt-3 rounded-xl bg-[#ffd6d6] p-3 text-sm text-bad">{auditErr}</p>}
              {audit && (
                <div className="mt-4">
                  <p className="text-xs text-mute">{audit.claims.length} claim{audit.claims.length === 1 ? "" : "s"} worth checking in <b className="text-ink">{audit.title}</b> · {audit.host}</p>
                  {audit.claims.length === 0 && <p className="mt-2 text-sm text-mute">No statistics, quotes or attributed claims found on that page.</p>}
                  <ol className="mt-2 space-y-2">
                    {audit.claims.map((c) => (
                      <li key={c.text} className="rounded-2xl border border-line bg-white p-3 text-sm">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="rounded-full bg-hi px-2 py-0.5 font-semibold uppercase tracking-wide text-ink">{c.kind}</span>
                          <span className="text-mute">worth-checking score {c.score}</span>
                        </div>
                        <p className="mt-1.5 leading-snug">{c.text}</p>
                        <button onClick={() => { setMode("claim"); trace(c.text); }} className="mt-2 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition hover:-translate-y-0.5">Trace this claim →</button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : (
          <>
          <textarea
            value={claim} onChange={(e) => setClaim(e.target.value)} rows={compact ? 2 : 3} maxLength={600} placeholder="e.g. 95% of startups fail."
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && trace()}
            className="mt-4 w-full resize-none rounded-2xl border border-line bg-white p-4 text-lg outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/10"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => trace()} disabled={busy || claim.trim().length < 12}
              className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition enabled:hover:-translate-y-0.5 disabled:opacity-40">{busy ? "Tracing…" : "Trace it"}</button>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-xs text-mute" title="Starts a TinyResearch run (about $2, 4-7 min) with every trace; the same claim reuses a recent run">
              <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); localStorage.setItem("sh_auto", e.target.checked ? "1" : "0"); }} />
              Auto deep-verify
            </label>
          </div>
          {!compact && (
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => trace(e)} disabled={busy} className="rounded-full border border-line px-3 py-1.5 text-xs text-mute transition hover:bg-white hover:text-ink disabled:opacity-40">{e}</button>
              ))}
            </div>
          )}
          {!compact && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Finished deep traces · open instantly <a href="/showcase" className="ml-1 normal-case tracking-normal text-blue underline">see them all</a></p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {DEMOS.map((d) => (
                  <a key={d.run} href={`/?q=${encodeURIComponent(d.q)}&run=${d.run}#trace`} className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper transition hover:-translate-y-0.5">▶ {d.label}</a>
                ))}
              </div>
            </div>
          )}
          {!compact && recents.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Recent traces</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {recents.map((r) => (
                  <button key={r.q} onClick={() => (r.run ? (location.href = `/?q=${encodeURIComponent(r.q)}&run=${r.run}#trace`) : trace(r.q))} title={r.q}
                    className="flex max-w-[16rem] items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs transition hover:-translate-y-0.5">
                    <span className={`size-2 shrink-0 rounded-full ${TONE[r.tone as Tone]?.dot ?? "bg-mute"}`} /><span className="truncate">{r.q}</span><span className="shrink-0 text-mute">· {r.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </>
      ) : (
        <div className="mt-2 flex items-start gap-3 rounded-2xl border border-line bg-white p-4">
          <span className="font-display text-3xl leading-none text-hi">“</span>
          <p className="flex-1 text-[17px] leading-snug">{ran}</p>
          <button onClick={() => setEditing(true)} disabled={busy} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-mute hover:bg-paper disabled:opacity-40">Edit</button>
        </div>
      )}

      {/* progress: where the trace is, at a glance */}
      {(busy || running) && (
        <div className="mt-4 rounded-2xl border border-line bg-white p-4" aria-live="polite">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {([["Search", stage.search, stage.read], ["Read pages", stage.read, stage.follow || stage.done], ["Follow citations", stage.follow, stage.done], ["Fast verdict", stage.done, stage.done]] as const).map(([label, started, finished], i) => (
              <li key={label} className="flex items-center gap-2">
                {i > 0 && <span className="text-line">—</span>}
                <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${finished ? "bg-[#c9f0d6] text-good" : started ? "bg-hi text-ink" : "bg-paper text-mute"}`}>
                  {finished ? "✓" : started ? <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>●</motion.span> : "○"} {label}
                </span>
              </li>
            ))}
          </ol>
          {busy && steps.length > 0 && <p className="mt-2 text-xs text-mute">{steps[steps.length - 1]}{sources.length > 0 && ` · ${sources.length} matching page${sources.length > 1 ? "s" : ""} so far`}</p>}
          {running && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs"><span className="font-medium">TinyResearch deep verification</span><span className="tabular-nums text-mute">{mmss} · usually 4–7 min</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper"><motion.div className="h-full rounded-full bg-ink" animate={{ width: `${Math.min(95, (elapsed / 360) * 100)}%` }} transition={{ ease: "linear" }} /></div>
              {deep.progress && deep.progress.sourceCount > 0 ? (
                <div className="mt-2 text-xs text-mute">
                  <p><b className="text-ink">Round {deep.progress.iterations}</b> · read <b className="text-ink">{deep.progress.sourceCount}</b> sources so far{deep.progress.sources.length > 0 && <> · latest: {[...new Set(deep.progress.sources.slice(-4).map((x) => host(x.url)))].join(", ")}</>}</p>
                  {deep.progress.questions[0] && <p className="mt-0.5 line-clamp-2">Asking: {deep.progress.questions[0]}</p>}
                </div>
              ) : null}
              <p className="mt-1.5 text-xs text-mute">You can keep reading. The answer below upgrades itself and every cited quote gets re-checked on its live page.</p>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-4 rounded-2xl bg-[#ffd6d6] p-4 text-sm text-bad">{error}</p>}
      {deep.error && <p className="mt-3 rounded-2xl bg-hi/60 p-3 text-xs text-ink">Deep verification could not run: {deep.error}</p>}

      <AnimatePresence>
        {final && (
          <motion.div key="answer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="mt-5">
            {/* THE answer: one card, one verdict */}
            <div className={`rounded-3xl p-5 ring-1 ${TONE[final.tone].card}`}>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-mute">
                <span className={`size-2 rounded-full ${TONE[final.tone].dot}`} />{final.by}
              </p>
              <p className="mt-1.5 font-display text-4xl leading-none sm:text-5xl">{final.label}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/85">{final.summary}</p>

              {final.originTitle && (
                <div className="mt-4 rounded-2xl bg-white/70 p-3 text-sm ring-1 ring-black/5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Where it began</p>
                  {final.originUrl ? <a href={final.originUrl} target="_blank" rel="noreferrer" className="mt-0.5 block font-medium leading-snug text-blue underline-offset-2 hover:underline">{final.originTitle}</a> : <p className="mt-0.5 font-medium">{final.originTitle}</p>}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
                    {final.originDate && <span>{final.originDate}</span>}
                    {final.originUrl && <span>{host(final.originUrl)}</span>}
                    {final.originCheck && (okRes(final.originCheck) ? <span className="rounded-full bg-[#c9f0d6] px-2 py-0.5 font-medium text-good">✓ quote re-found on live page</span>
                      : final.originCheck.status === "not_found" ? <span className="rounded-full bg-[#ffd6d6] px-2 py-0.5 font-medium text-bad">✗ quote not found on live page</span>
                      : <span className="rounded-full bg-line px-2 py-0.5 font-medium text-mute">page could not be checked</span>)}
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                {finalConf && <span className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${CONF_TONE[finalConf.level]}`}>{finalConf.level} confidence</span><span className="text-ink/65">{finalConf.why}</span></span>}
                {!deep.id && !deep.status && !deep.error && (
                  <button onClick={() => deepVerify()} title="Runs TinyResearch: an agentic, cited investigation (about 4 to 7 minutes and about $2 of TinyFish credits)" className="rounded-full bg-ink px-3.5 py-1.5 font-medium text-paper transition hover:-translate-y-0.5">Deep verify with TinyResearch →</button>
                )}
              </div>
              {judge?.used && <p className="mt-3 text-[11px] leading-snug text-ink/55">✦ Each page was judged by Claude Haiku (states / mentions / debunks) from its matched passage. Every quote it cites is checked against the page text, so it cannot invent evidence.</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 pt-4 text-xs">
                {safeQuote && <button onClick={() => copy(safeQuote, "Safe-to-quote text copied")} className="rounded-full bg-white px-3.5 py-1.5 font-medium ring-1 ring-black/10 transition hover:-translate-y-0.5" title="The original wording with its source, ready to paste into your article">❝ Copy safe-to-quote</button>}
                <button onClick={() => copy(citation, "Citation copied")} className="rounded-full bg-white px-3.5 py-1.5 font-medium ring-1 ring-black/10 transition hover:-translate-y-0.5">Copy citation</button>
                <button onClick={downloadJson} className="rounded-full bg-white px-3.5 py-1.5 font-medium ring-1 ring-black/10 transition hover:-translate-y-0.5">Download JSON</button>
                <AnimatePresence>{copied && <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="font-medium text-good" role="status">✓ {copied}</motion.span>}</AnimatePresence>
              </div>
              {sd?.changes && sd.changes.length > 0 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-mute">How the claim changed ({sd.changes.length})</summary>
                  <ul className="mt-2 space-y-1.5">{sd.changes.map((c) => <li key={c} className="flex gap-2"><span className="text-bad">⚑</span><span>{c}</span></li>)}</ul>
                </details>
              )}
            </div>

            {/* details live in tabs so the page stays calm */}
            {tabs.length > 0 && (
              <div className="mt-5">
                <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
                  {tabs.map((t) => (
                    <button key={t.id} role="tab" aria-selected={activeTab === t.id} onClick={() => { tabTouched.current = true; setTab(t.id); }}
                      className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition ${activeTab === t.id ? "border-ink font-medium text-ink" : "border-transparent text-mute hover:text-ink"}`}>
                      {t.label}{t.n && <span className="ml-1.5 rounded-full bg-paper px-1.5 py-0.5 text-[11px] tabular-nums text-mute">{t.n}</span>}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  {activeTab === "chain" && (
                    <div>
                      <p className="text-xs text-mute">
                        {vstate === "running" ? `Re-checking ${chain.length} cited quotes on their live pages…` : `${chain.filter((c) => okRes(c.res)).length} of ${chain.length} cited quotes found on their live pages`}
                        {chain.some((c) => c.res?.via === "agent") && ` · ${chain.filter((c) => c.res?.via === "agent").length} read by a TinyFish Agent browser`}
                        {chain.some((c) => c.res?.status === "skipped") && " · reconstructed wording is skipped, not failed"}
                      </p>
                      {vstate === "done" && chain.some((c) => c.res?.status === "unreachable") && (
                        <div className="mt-3 rounded-xl bg-white p-3 text-xs ring-1 ring-line">
                          <p>Some pages block automated readers. A <b>TinyFish Agent</b> drives a real browser and may get through (about 45 seconds).</p>
                          <button onClick={agentRecheck} disabled={agentBusy} className="mt-2 rounded-full bg-ink px-3.5 py-1.5 font-medium text-paper disabled:opacity-50">{agentBusy ? "Agent browser working…" : "Try blocked pages with the Agent browser"}</button>
                        </div>
                      )}
                      <ol className="mt-3 space-y-3">
                        {chain.map(({ step, res }, i) => (
                          <li key={i} className="rounded-2xl border border-line bg-white p-3.5 text-sm">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              {i === 0 && <span className="rounded-full bg-ink px-2 py-0.5 font-medium text-paper">★ Origin</span>}
                              {!res ? <span className="rounded-full bg-line px-2 py-0.5 text-mute">checking…</span>
                                : res.status === "verified" ? <span className="rounded-full bg-[#c9f0d6] px-2 py-0.5 font-medium text-good">✓ exact quote found</span>
                                : res.status === "close" ? <span className="rounded-full bg-[#c9f0d6] px-2 py-0.5 font-medium text-good">≈ close wording found</span>
                                : res.status === "skipped" ? <span className="rounded-full bg-line px-2 py-0.5 font-medium text-mute">reconstructed wording · not checked</span>
                                : res.status === "unreachable" ? <span className="rounded-full bg-hi px-2 py-0.5 font-medium text-warn">⚠ page blocked · not checked</span>
                                : <span className="rounded-full bg-[#ffd6d6] px-2 py-0.5 font-medium text-bad">✗ quote not found on page</span>}
                              {res?.via === "agent" && <span className="rounded-full bg-blue/10 px-2 py-0.5 font-medium text-blue">Agent browser</span>}
                              <span className="text-mute">{res?.date && res.date !== "Not available" ? res.date : step.date || "undated"} · {host(step.url!)}</span>
                            </div>
                            <a href={step.url} target="_blank" rel="noreferrer" className="mt-1.5 block font-medium leading-snug underline-offset-2 hover:underline">{step.title || step.url}</a>
                            <div className="mt-1.5 border-l-4 border-hi pl-3"><Clamp>“{step.exact_wording}”</Clamp></div>
                            {step.note && <p className="mt-1.5 text-xs text-mute">{step.note}</p>}
                            {res && res.status === "close" && res.passage && <p className="mt-1 text-xs text-mute">On the page: “{res.passage}”</p>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {activeTab === "pages" && (
                    <div>
                      {echo && echo.copies > 0 && (
                        <p className="rounded-xl bg-white p-3 text-sm ring-1 ring-line"><b>Echo check:</b> {echo.copies} page{echo.copies > 1 ? "s" : ""} on {echo.hosts} site{echo.hosts > 1 ? "s" : ""} repeat this; <b className={echo.primaries ? "text-good" : "text-bad"}>{echo.primaries} trace to a primary source</b>.</p>
                      )}
                      <ol className="mt-3 space-y-3">
                        {sources.map((s) => (
                          <li key={s.url} className="rounded-2xl border border-line bg-white p-3.5 text-sm">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              {s.url === origin && <span className="rounded-full bg-ink px-2 py-0.5 font-medium text-paper">★ Earliest match</span>}
                              {s.primary && <span className="rounded-full bg-blue/10 px-2 py-0.5 font-medium text-blue">primary source</span>}
                              {s.relation && REL[s.relation] ? <span className={`rounded-full px-2 py-0.5 font-medium ${REL[s.relation][1]}`}>{REL[s.relation][0]}</span>
                                : s.disputed && <span className="rounded-full bg-[#ffd6d6] px-2 py-0.5 font-medium text-bad">calls it false</span>}
                              {chainSet.has(canon(s.url)) && <span className="rounded-full bg-ink px-2 py-0.5 font-medium text-paper" title="TinyResearch independently cited this page">✓ on TinyResearch's chain</span>}
                              <span className={`rounded-full px-2 py-0.5 font-medium ${BADGE[s.status] ?? "bg-line text-mute"}`}>{LABEL[s.status] ?? s.status}</span>
                              <span className="text-mute">{s.date ?? "undated"} · {s.host.replace(/^www\./, "")}</span>
                            </div>
                            <a href={s.url} target="_blank" rel="noreferrer" className="mt-1.5 block font-medium leading-snug underline-offset-2 hover:underline">{s.title}</a>
                            {s.flags && s.flags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{s.flags.map((f) => <span key={f} className="rounded-full bg-[#ffd6d6] px-2 py-0.5 text-xs font-medium text-bad">⚑ {f}</span>)}</div>}
                            <div className="mt-1.5 border-l-4 border-hi pl-3 leading-relaxed">
                              <Clamp>
                                {s.diff
                                  ? s.diff.map((d, k) => d.k === "same" ? <span key={k}>{d.t} </span> : d.k === "add" ? <span key={k} className="rounded bg-[#c9f0d6] px-0.5">{d.t} </span> : <del key={k} className="rounded bg-[#ffd6d6] px-0.5 text-bad/80">{d.t} </del>)
                                  : `“${s.passage}”`}
                              </Clamp>
                            </div>
                            {s.drift !== undefined && <p className="mt-1 text-[11px] text-mute">{s.drift}% of the earliest match's wording kept · green = added, red strike = dropped</p>}
                            {s.citedBy && s.via && <p className="mt-1 text-[11px] text-mute">Found by following “{s.via}” cited on {host(s.citedBy)}</p>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {activeTab === "drift" && (
                    <div className="rounded-2xl border border-line bg-white p-4">
                      <p className="text-sm font-medium">Telephone game</p>
                      <p className="text-xs text-mute">How much of the earliest match's wording each later page kept, oldest to newest. Taller is closer to the original.</p>
                      <div className="mt-3 flex h-28 items-end gap-1.5" aria-label="Similarity of each repeat to the origin wording">
                        {sources.map((s) => {
                          const v = s.url === origin ? 100 : s.drift ?? 0;
                          return (
                            <motion.div key={s.url} initial={{ height: 0 }} animate={{ height: `${Math.max(6, v)}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                              title={`${s.date ?? "undated"} · ${host(s.url)} · ${v}%`}
                              className={`flex-1 rounded-t ${s.url === origin ? "bg-good" : v >= 70 ? "bg-blue/70" : v >= 40 ? "bg-hi" : "bg-bad/60"}`} />
                          );
                        })}
                      </div>
                      <p className="mt-1 flex justify-between text-[11px] text-mute"><span>{sources[0]?.date ?? "oldest"}</span><span>newest →</span></p>
                      <p className="mt-3 flex flex-wrap gap-3 text-[11px] text-mute"><span><i className="mr-1 inline-block size-2 rounded-sm bg-good" />earliest</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-blue/70" />close</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-hi" />drifted</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-bad/60" />far from the original</span></p>
                    </div>
                  )}

                  {activeTab === "report" && sr && (
                    <article className="max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-white p-4 pr-3 text-[15px] leading-relaxed [&_a]:break-all [&_a]:text-blue [&_a]:underline [&_h1]:mb-2 [&_h1]:font-display [&_h1]:text-3xl [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-2xl [&_h3]:mb-1 [&_h3]:mt-5 [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-line [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2 [&_table]:my-3 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-sm [&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:border-line [&_th]:bg-paper [&_th]:p-2 [&_th]:text-left">
                      <Markdown remarkPlugins={[remarkGfm]}>{sr.text}</Markdown>
                      {deep.citations && deep.citations.length > 0 && (
                        <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">{deep.citations.length} citations</summary>
                          <ul className="mt-2 list-disc pl-5 text-sm">{deep.citations.map((c) => <li key={c}><a href={c} target="_blank" rel="noreferrer">{c}</a></li>)}</ul>
                        </details>
                      )}
                    </article>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!compact && (
        <div id="extension" className="mt-16 rounded-2xl bg-ink p-6 text-paper">
          <p className="font-display text-3xl">Use it while you read</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-paper/80">
            <li><a href="/source-hunter-extension.zip" download className="font-semibold text-hi underline">Download the extension (.zip)</a> and unzip it. Open <code>chrome://extensions</code>, turn on Developer mode, click <b>Load unpacked</b> and choose the unzipped folder.</li>
            <li>Highlight any claim on any page. A “Trace it” button appears next to it. Or right-click → <b>Trace with Source Hunter</b>, or click the toolbar icon.</li>
          </ol>
        </div>
      )}
    </section>
  );
}
