import type { Metadata } from "next";
import Logo from "@/components/Logo";
import data from "./data.json";

export const metadata: Metadata = { title: "Source Hunter · Showcase", description: "Real traces: where famous claims actually came from." };

type Step = { date?: string; host: string; title?: string; url: string; wording: string; relation?: string; flags?: string[]; isOrigin?: boolean; primary?: boolean };
type Item = {
  claim: string; run: string;
  fast: { title: string; kind: string; detail: string; confidence: { level: string; why: string }; ms: number; usd?: number; ai: boolean; pages: number } | null;
  origin: { title: string; url: string; date?: string; host: string; primary: boolean } | null;
  trail: Step[];
  deep: { status?: string; summary?: string; origin?: { title?: string; url?: string; date?: string; exact_wording?: string; source_type?: string } | null; changes: string[]; steps: { title?: string; url?: string; date?: string; exact_wording?: string; note?: string }[]; sources: number | null } | null;
};

const TONE: Record<string, string> = { supported: "bg-[#e6f6ec] text-good", disputed: "bg-[#ffe6e6] text-bad", unclear: "bg-[#fff4cc] text-warn", error: "bg-[#fff4cc] text-warn", none: "bg-line text-mute" };
const DEEP: Record<string, [string, string]> = { supported: ["Supported", "text-[#7fe3a4]"], refuted: ["Refuted", "text-[#ff9d9d]"], misquoted: ["Misquoted", "text-hi"], unverifiable: ["Can't be verified", "text-paper/70"] };
const REL: Record<string, string> = { states: "states it", mentions: "mentions it", debunks: "debunks it" };
const host = (u?: string) => { try { return new URL(u ?? "").host.replace(/^www\./, ""); } catch { return ""; } };

export default function Showcase() {
  const items = (data.items ?? []) as unknown as Item[];
  const n = items.length;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-5">
      <a href="/" className="inline-flex items-center gap-2 text-sm text-mute hover:text-ink"><Logo size={20} /> Source Hunter</a>
      <h1 className="mt-4 font-display text-5xl leading-none sm:text-6xl">Where famous claims actually came from</h1>
      <p className="mt-4 max-w-xl text-lg text-mute">
        {n} real traces, captured from the live app. Each shows the fast answer (Search, Fetch and a Claude Haiku judge, about 20 seconds) and the deep answer
        (a TinyResearch investigation, 4 to 7 minutes) with every step cited. Nothing here is mocked: the buttons open the same traces interactively.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <a href="/" className="rounded-full bg-ink px-4 py-2 font-medium text-paper">Try your own claim</a>
        <a href="/source-hunter-extension.zip" className="rounded-full border border-line bg-white px-4 py-2 font-medium">Get the extension</a>
      </div>

      <div className="mt-10 space-y-10">
        {items.map((it) => (
          <article key={it.run} className="rounded-3xl border border-line bg-white p-5 shadow-[0_18px_50px_-34px_rgba(60,40,0,.45)] sm:p-6">
            <p className="flex gap-3"><span className="font-display text-4xl leading-none text-hi">“</span><span className="text-xl leading-snug">{it.claim}</span></p>

            {it.deep && (
              <div className="mt-4 rounded-2xl bg-ink p-4 text-paper">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-paper/55">✓ TinyResearch{it.deep.sources ? ` · ${it.deep.sources} sources read` : ""}</p>
                <p className={`mt-1 font-display text-3xl ${(DEEP[it.deep.status ?? ""] ?? DEEP.unverifiable)[1]}`}>{(DEEP[it.deep.status ?? ""] ?? DEEP.unverifiable)[0]}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-paper/85">{it.deep.summary}</p>
                {it.deep.origin?.title && (
                  <p className="mt-3 text-sm text-paper/70">
                    Origin{it.deep.origin.date ? ` (${it.deep.origin.date})` : ""}:{" "}
                    {it.deep.origin.url ? <a href={it.deep.origin.url} target="_blank" rel="noreferrer" className="font-medium text-hi underline">{it.deep.origin.title}</a> : it.deep.origin.title}
                  </p>
                )}
                {it.deep.origin?.exact_wording && !/\[(truncated|reconstructed)/i.test(it.deep.origin.exact_wording) && (
                  <blockquote className="mt-2 border-l-4 border-hi pl-3 text-sm text-paper/90">“{it.deep.origin.exact_wording}”</blockquote>
                )}
                {it.deep.changes.length > 0 && (
                  <ul className="mt-3 space-y-1 text-[13px] text-[#ffc9c9]">{it.deep.changes.slice(0, 4).map((c) => <li key={c} className="flex gap-2"><span>⚑</span><span>{c}</span></li>)}</ul>
                )}
              </div>
            )}

            {it.fast && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Fast pass · {`${it.fast.pages} pages read`} · {Math.round(it.fast.ms / 1000)}s{it.fast.ai ? " · judged by Claude Haiku" : ""}</p>
                <p className={`mt-1.5 inline-block rounded-xl px-3 py-1.5 font-display text-2xl ${TONE[it.fast.kind] ?? "bg-line text-mute"}`}>{it.fast.title}</p>
                <p className="mt-2 text-sm text-ink/80">{it.fast.detail}</p>
                <p className="mt-1.5 text-xs text-mute"><b className="uppercase">{it.fast.confidence.level} confidence</b> · {it.fast.confidence.why}</p>
              </div>
            )}

            {it.trail.length > 1 && (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">Trail · oldest first</p>
                <ol className="mt-2 space-y-3 border-l-2 border-line pl-4">
                  {it.trail.map((s) => (
                    <li key={s.url} className="relative text-sm">
                      <span className={`absolute -left-[22px] top-1.5 size-2.5 rounded-full ${s.isOrigin ? "bg-good" : "bg-line"}`} />
                      <p className="text-xs text-mute"><b className="text-ink">{s.date ?? "undated"}</b> · <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.host}</a>{s.primary ? " · primary source" : ""}{s.isOrigin ? " · earliest match" : ""}</p>
                      <p className="mt-0.5 text-[13px]">“{s.wording}”</p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {s.relation && REL[s.relation] && <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-mute">{REL[s.relation]}</span>}
                        {(s.flags ?? []).map((f) => <span key={f} className="rounded-full bg-[#ffe3e3] px-2 py-0.5 text-[11px] font-medium text-bad">⚑ {f}</span>)}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {it.deep && it.deep.steps.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-mute">TinyResearch's citation chain ({it.deep.steps.length} steps)</summary>
                <ol className="mt-2 space-y-2">
                  {it.deep.steps.map((s, i) => (
                    <li key={i} className="rounded-xl border border-line p-3">
                      <p className="text-xs text-mute">{s.date ?? "undated"} · {host(s.url)}</p>
                      {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">{s.title ?? s.url}</a> : <p className="font-medium">{s.title}</p>}
                      {s.exact_wording && <p className="mt-1 text-[13px]">“{s.exact_wording}”</p>}
                      {s.note && <p className="mt-1 text-xs text-mute">{s.note}</p>}
                    </li>
                  ))}
                </ol>
              </details>
            )}

            <a href={`/?q=${encodeURIComponent(it.claim)}&run=${it.run}#trace`} className="mt-5 inline-block rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper">Open the interactive trace →</a>
          </article>
        ))}
      </div>
      <p className="mt-10 text-xs text-mute">Captured {data.generatedAt ? new Date(data.generatedAt).toUTCString() : "—"}. Fast passes can differ slightly from run to run because live search results change.</p>
    </main>
  );
}
