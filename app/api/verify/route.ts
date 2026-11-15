import { createHash } from "node:crypto";
import { fetchPages, runAgent } from "@/lib/tinyfish";
import { quoteMatch, findDate, type QuoteCheck } from "@/lib/analyze";
import { rateLimit, dailyBudget } from "@/lib/guard";

export const maxDuration = 60;
export const runtime = "nodejs";

type Step = { url: string; wording: string };
type Result = Omit<QuoteCheck, "status"> & { status: QuoteCheck["status"] | "unreachable" | "skipped"; url: string; via: "fetch" | "agent" | "none"; date?: string; note?: string };

// the Agent's structured output only allows plain types (no descriptions)
const SCHEMA = {
  type: "object",
  properties: { readable: { type: "boolean" }, found: { type: "boolean" }, passage: { type: "string" }, published: { type: "string" } },
  required: ["readable", "found", "passage"],
};
// a placeholder such as "[truncated in source]" or "reconstructed from aggregators" is not a quote: do not fail it, skip it
const PLACEHOLDER = /\[(?:truncated|reconstructed|paraphras|not (?:directly )?retriev|omitted|redacted)[^\]]*\]|reconstructed from|full text not|not directly retrieved/i;

const cache = new Map<string, { at: number; r: Result }>();
const TTL = 24 * 3600e3;
const ck = (s: Step, agent: boolean) => createHash("sha1").update(`${s.url}|${s.wording}|${agent}`).digest("hex");

/**
 * Re-checks every step TinyResearch cites against the LIVE page, so no quote is taken on trust.
 * TinyFish Fetch reads the pages (fast). TinyFish Agent, a real browser, is OPT-IN (`useAgent`) for pages Fetch
 * cannot read: it is slow (45s+) and billed, so the user asks for it explicitly.
 */
export async function POST(req: Request) {
  if (process.env.VERCEL) { const lim = rateLimit(req, "verify", 10, 10 * 60_000); if (lim) return lim; }
  const { steps: raw, useAgent } = (await req.json().catch(() => ({}))) as { steps?: Step[]; useAgent?: boolean };
  const steps = (raw ?? []).filter((s) => s?.url && s?.wording && /^https?:\/\//.test(s.url)).slice(0, 8);
  if (!steps.length) return Response.json({ results: [] });
  const agent = useAgent === true;

  const out: (Result | undefined)[] = steps.map(() => undefined); // by step index: two steps can cite the same URL
  steps.forEach((s, i) => {
    if (PLACEHOLDER.test(s.wording)) { out[i] = { status: "skipped", url: s.url, via: "none", note: "TinyResearch marked this wording as reconstructed, so there is no verbatim quote to check." }; return; }
    const hit = cache.get(ck(s, agent));
    if (hit && Date.now() - hit.at < TTL) out[i] = hit.r;
  });

  const need = steps.map((s, i) => ({ s, i })).filter(({ i }) => !out[i]);
  if (need.length) {
    try {
      const pages = await fetchPages([...new Set(need.map(({ s }) => s.url))]);
      for (const { s, i } of need) {
        const p = pages.find((x) => x.url === s.url || x.final_url === s.url);
        // a real article is long; a short body is usually a cookie wall or bot check
        if (p && p.text.length > 800) out[i] = { ...quoteMatch(s.wording, p.text), url: s.url, via: "fetch", date: findDate(p.text) };
        else out[i] = { status: "unreachable", url: s.url, via: "fetch", note: "the page could not be read by TinyFish Fetch (bot check, paywall or error)" };
      }
    } catch (e) {
      for (const { s, i } of need) out[i] = { status: "unreachable", url: s.url, via: "none", note: `could not be read: ${(e as Error).message.slice(0, 100)}` };
    }
  }

  // Agent (opt-in): pages Fetch could not read, plus a second opinion on a missing origin quote; at most 2, one per URL
  if (agent) {
    const todo = steps.map((s, i) => ({ s, i })).filter(({ i }) => out[i] && (out[i]!.status === "unreachable" || (i === 0 && out[i]!.status === "not_found")));
    const seenUrl = new Set<string>();
    const picks = todo.filter(({ s }) => (seenUrl.has(s.url) ? false : seenUrl.add(s.url))).slice(0, 2);
    await Promise.all(picks.map(async ({ s, i }) => {
      if (!dailyBudget("agent", Number(process.env.AGENT_DAILY_MAX ?? 20))) { out[i] = { ...out[i]!, note: "The daily limit for Agent browser checks was reached." }; return; }
      try {
        const r = await runAgent(
          s.url,
          `Dismiss any cookie or consent banner. Find this wording on the page, or the closest passage: "${s.wording.slice(0, 400)}". Report: readable = false if the page shows a bot check, paywall, login or error instead of the article; found = whether the page itself contains the wording; the verbatim passage; and the publication date. Do not summarise.`,
          SCHEMA, 40,
        );
        const passage = String(r?.passage ?? "");
        if (r && r.readable === false) { out[i] = { status: "unreachable", url: s.url, via: "agent", note: passage || "page is behind a bot check or paywall even for a real browser" }; return; }
        const q: QuoteCheck = r?.found && passage ? quoteMatch(s.wording, passage) : { status: "not_found" };
        out[i] = { ...q, passage: q.passage ?? (passage || undefined), url: s.url, via: "agent", date: String(r?.published || "") || out[i]?.date };
      } catch (e) {
        out[i] = { ...out[i]!, note: `Agent check failed: ${(e as Error).message.slice(0, 100)}` };
      }
    }));
  }

  steps.forEach((s, i) => { const r = out[i]; if (r && r.status !== "skipped" && r.status !== "unreachable") cache.set(ck(s, agent), { at: Date.now(), r }); });
  return Response.json({ results: steps.map((s, i) => out[i] ?? { status: "unreachable", url: s.url, via: "none", note: "could not be read" }) });
}
