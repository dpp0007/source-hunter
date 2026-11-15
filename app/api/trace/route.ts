import { search, fetchPages, type SearchHit } from "@/lib/tinyfish";
import claimsLib from "@/extension/claims.js";
import { wordDiff, driftFlags, type Tok } from "@/lib/diff";
import { judge, judgeEnabled, JUDGE_MODEL, type JudgeInput, type Judgement, type Relation } from "@/lib/judge";
import { rateLimit } from "@/lib/guard";
import { bestPassage, compare, findDate, normDate, isPrimary, isDisputed, isTight, links, attributions, strip, norm, type Match } from "@/lib/analyze";

export const maxDuration = 60; // fits Vercel Hobby; the trace budgets its own time below
export const runtime = "nodejs";

type Source = {
  url: string; title: string; host: string; date?: string; passage: string; score: number;
  status: Match; note: string; primary: boolean; disputed: boolean; hop: number; citedBy?: string; via?: string; drift?: number; diff?: Tok[]; flags?: string[];
  relation?: Relation; judgeQuote?: string; ctx?: string;
};
type Verdict = { kind: string; title: string; detail: string };
type Conf = { level: string; why: string };

const MAX_HOPS = 3;
const SOFT_DEADLINE = 30_000; // after this, stop following citations and answer with what we have
// where primary sources live: used to make TinyFish Search return studies, filings and datasets, not just popular copies
const PRIMARY = "nih.gov,ncbi.nlm.nih.gov,cdc.gov,nasa.gov,noaa.gov,census.gov,bls.gov,sec.gov,who.int,arxiv.org,nber.org,ssrn.com,nature.com,science.org,jamanetwork.com,nejm.org,pnas.org,thelancet.com,oecd.org,worldbank.org,un.org,europa.eu,harvard.edu,mit.edu,stanford.edu";
const JUNK_SITE = /crossword|wordle|scrabble|word ?finder|quizlet|jeopardy|trivia ?answers|lyrics|clue[s]?\b/i;
const STRONG = 0.66; // below this, a sentence is only loosely about the claim
const yr = (d?: string) => +(d ?? "9999").slice(0, 4);

const cache = new Map<string, { at: number; done: Record<string, unknown> }>();
const TTL = 6 * 3600e3;

/** the matched sentence plus a little surrounding text: what the judge reads */
function around(paragraph: string, sentence: string): string {
  const p = strip(paragraph), i = p.indexOf(sentence.slice(0, 40));
  if (i < 0) return sentence.slice(0, 420);
  return p.slice(Math.max(0, i - 110), Math.min(p.length, i + sentence.length + 110)).slice(0, 440);
}

/** the deterministic judgement (no model): kept as the fallback and as a measured baseline */
function decide(claim: string, sources: Source[], checked: number) {
  // only direct repeats (strong matches) may be the origin or count toward a verdict; loose matches are shown but not trusted
  const strong = sources.filter((s) => s.score >= STRONG && s.status !== "related");
  // the origin must state the claim tightly, not merely mention it inside a long sentence (e.g. a page that cites "the 10% myth")
  const tight = strong.filter((s) => isTight(claim, s.passage));
  // ...but never at the price of losing every dated source (an undated tight match is a weak origin)
  const hasDate = (l: Source[]) => l.some((s) => s.date);
  const base = tight.length && (hasDate(tight) || !hasDate(strong)) ? tight : strong.length ? strong : sources;
  // earliest dated wins; a primary-domain or citation-followed source may take over only if it is within 3 years of that
  const first = base.find((s) => s.date);
  const near = base.filter((s) => s.date && first && yr(s.date) <= yr(first.date) + 3 && (s.primary || s.hop > 0));
  let origin = near[0] ?? first ?? base.find((s) => s.primary) ?? base[0];
  // a tight statement is preferred, but not if a direct repeat is >5 years older (the tight one is then a late copy)
  const oldest = (strong.length ? strong : sources).find((s) => s.date);
  if (origin?.date && oldest && yr(oldest.date) + 5 < yr(origin.date)) origin = oldest;
  const pool = strong.length ? strong : sources;
  const disputed = pool.filter((s) => s.disputed);
  const confidence: Conf = !origin ? { level: "none", why: "no page contained the claim's wording" }
    : origin.primary && origin.date && origin.score >= STRONG && origin.status !== "paraphrase" && isTight(claim, origin.passage) ? { level: "high", why: "origin is on a primary-source domain, dated, and its wording can be compared" }
    : origin.score >= STRONG && (origin.hop > 0 || origin.date) ? { level: "medium", why: origin.hop > 0 ? "origin was reached by following a named citation, but is not a primary-source domain" : "origin is dated but not a primary-source domain" }
    : { level: "low", why: "no primary source reached; origin is only the oldest matching page" };
  let verdict: Verdict;
  if (origin && (origin.disputed || disputed.length >= 2))
    verdict = { kind: "disputed", title: "Likely wrong: sources call it false", detail: `${disputed.length} of ${pool.length} matching pages describe this claim as a myth, fact-check or debunk (e.g. ${disputed[0].host}). The wording exists widely, but it is not backed.` };
  else if (!origin) verdict = { kind: "none", title: "No original source found", detail: `Checked ${checked} pages; none contained wording close to this claim. Treat it as unverified.` };
  else if (!origin.primary || !origin.date || origin.status === "related")
    verdict = { kind: "unclear", title: "Origin unclear", detail: `${origin.via ? `Traced upstream via “${origin.via}” to` : "Earliest match is"} ${origin.host}${origin.date ? " (" + origin.date + ")" : " (undated)"}, which does not look like a primary source. ${origin.note}` };
  else verdict = {
    kind: origin.status, title: { verbatim: "Matches the original", match: "Matches the original", paraphrase: "Paraphrased from the original", rounded: "Changed: rounded or drifted", altered: "Changed: figures differ from the original" }[origin.status as Exclude<Match, "related">],
    detail: origin.note,
  };
  return { origin, verdict, confidence };
}

/** the Haiku-assisted judgement: same evidence, but it reads meaning (states / mentions / debunks) instead of counting words */
function decideJudged(claim: string, sources: Source[], j: Judgement, checked: number, fallback: ReturnType<typeof decide>) {
  const live = sources.filter((s) => s.relation && s.relation !== "unrelated");
  if (!live.length) return fallback;
  const debunk = live.filter((s) => s.relation === "debunks"), states = live.filter((s) => s.relation === "states");
  const byDate = (l: Source[]) => l.find((s) => s.date) ?? l[0];
  const picked = j.originId ? sources[j.originId - 1] : undefined;
  const origin = picked && picked.relation !== "unrelated" ? picked : byDate(live.filter((s) => s.primary || s.relation === "states")) ?? byDate(live);
  // a stance that needs evidence must have it: no "false" without a debunking page, no "supported" next to one
  let stance = j.stance;
  if ((stance === "false" || stance === "misattributed") && !debunk.length) stance = "mixed";
  if (stance === "supported" && (debunk.length || !states.length)) stance = debunk.length ? "mixed" : "unverifiable";
  const eg = debunk[0]?.host;
  let verdict: Verdict;
  if (stance === "false") verdict = { kind: "disputed", title: "Likely wrong: sources call it false", detail: `${debunk.length} of ${live.length} relevant pages say this claim is false or a myth (e.g. ${eg}). ${j.originReason}` };
  else if (stance === "misattributed") verdict = { kind: "disputed", title: "Misattributed: the words are real, the source is wrong", detail: `${debunk.length} of ${live.length} relevant pages say the attribution is wrong (e.g. ${eg}). ${j.originReason}` };
  else if (stance === "supported") verdict = { kind: "supported", title: "Appears supported", detail: `${states.length} relevant page${states.length === 1 ? "" : "s"} state this and none debunk it. ${j.originReason}` };
  else if (stance === "mixed") verdict = { kind: "unclear", title: "Mixed evidence", detail: `${states.length} page${states.length === 1 ? "" : "s"} state it and ${debunk.length} dispute it. ${j.originReason}` };
  else verdict = fallback.verdict.kind === "none" ? fallback.verdict : { kind: "unclear", title: "Can't be verified from these pages", detail: j.originReason || fallback.verdict.detail };
  const rel = origin.relation;
  const confidence: Conf = origin.primary && origin.date && (rel === "states" || rel === "debunks") ? { level: "high", why: "AI-judged: origin is a dated primary-source page that addresses the claim directly" }
    : (rel === "states" || rel === "debunks") && (origin.date || origin.hop > 0 || live.length >= 3) ? { level: "medium", why: `AI-judged: ${j.originReason || "origin page addresses the claim directly"}` }
    : { level: "low", why: "AI-judged: no page clearly establishes where it began" };
  return { origin, verdict, confidence };
}

export async function POST(req: Request) {
  if (process.env.VERCEL) { const lim = rateLimit(req, "trace", Number(process.env.TRACE_RATE_MAX ?? 12), 10 * 60_000); if (lim) return lim; }
  const body = await req.json().catch(() => ({}));
  const asked = strip(String(body.claim ?? "")).slice(0, 600);
  const fresh = body.fresh === true, useJudge = body.judge !== false && judgeEnabled();
  const claim = (claimsLib.distillClaim(asked) as string) || asked; // pages repeat the claim, not the framing around it
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: unknown) => c.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const T0 = Date.now();
      try {
        if (claim.length < 12) throw new Error("Highlight a full claim (at least a short sentence).");
        const ckey = `${norm(claim)}|${useJudge}`, hit = cache.get(ckey);
        if (!fresh && hit && Date.now() - hit.at < TTL) {
          send({ type: "step", msg: "Recent result for this claim (instant)" });
          send({ ...hit.done, cached: true });
          c.close(); return;
        }
        const sources: Source[] = [];
        const seen = new Set<string>();
        const dates = new Map<string, string>();
        let checked = 0;

        send({ type: "step", msg: claim !== asked ? `Tracing the core claim: “${claim.slice(0, 90)}”` : "TinyFish Search: looking for pages that make this claim" });
        const short = claim.split(/\s+/).slice(0, 14).join(" ");
        const soft = (p: Promise<SearchHit[]>) => p.catch(() => [] as SearchHit[]);
        // 5 TinyFish Search calls: the claim itself, origin-hunting, original study/report, research papers, and primary-source domains only
        const [a, o, b, r, p] = await Promise.all([
          search(claim.slice(0, 250)),
          soft(search(`where does the statistic "${short}" come from origin fact check`)),
          soft(search(`${short} original study report source`)),
          soft(search(short, { domain_type: "research_paper" })),
          soft(search(short, { include_domains: PRIMARY })),
        ]);
        // interleave so primary/origin/research hits are not crowded out by the top of the main list
        const lists = [p, o, b, r, a];
        const hits = Array.from({ length: 10 }, (_, i) => lists.map((l) => l[i])).flat().filter(Boolean) as SearchHit[];
        let queue: { url: string; from?: string; via?: string }[] = [];
        const attrs: { at: string; from: string }[] = [];
        const triedAttr = new Set<string>();
        for (const h of hits) {
          if (seen.has(h.url)) continue;
          seen.add(h.url);
          const d = normDate(h.date);
          if (d) dates.set(h.url, d);
          queue.push({ url: h.url });
        }
        queue = queue.slice(0, 10);
        send({ type: "step", msg: `Found ${queue.length} candidate pages (incl. origin-hunting and research-paper searches)` });

        for (let hop = 0; hop <= MAX_HOPS && queue.length; hop++) {
          if (hop > 0 && Date.now() - T0 > SOFT_DEADLINE) { send({ type: "step", msg: "Time budget reached: answering with what was found" }); break; }
          send({ type: "step", msg: hop ? `Hop ${hop}: following ${queue.length} cited link(s) upstream` : `TinyFish Fetch: reading ${queue.length} pages` });
          const from = new Map(queue.map((q) => [q.url, q.from]));
          const viaOf = new Map(queue.map((q) => [q.url, q.via]));
          const pages = await fetchPages(queue.map((q) => q.url)).catch((e) => { send({ type: "step", msg: `fetch failed: ${e.message}` }); return []; });
          queue = [];
          for (const p of pages) {
            checked++;
            const url = p.url;
            if (JUNK_SITE.test(`${p.title ?? ""} ${new URL(url).host}`)) continue; // puzzle and answer sites repeat phrases; they are not sources
            const para = bestPassage(p.text, claim, p.title);
            if (!para) continue;
            let cmp = compare(claim, para.sentence);
            // a loosely-related sentence with a nearby number is not evidence the claim was altered
            if (para.score < STRONG && (cmp.status === "rounded" || cmp.status === "altered"))
              cmp = { status: "related", note: "Related figure from what may be a different context; not treated as a direct repeat of the claim." };
            const s: Source = {
              url: p.final_url || url, title: p.title || new URL(url).host, host: new URL(url).host,
              date: dates.get(url) ?? findDate(p.text), passage: para.sentence, score: Math.round(para.score * 100) / 100,
              status: cmp.status, note: cmp.note, primary: isPrimary(url, ""), disputed: isDisputed(p.title, para.paragraph), hop, citedBy: from.get(url), via: viaOf.get(url),
              ctx: around(para.paragraph, para.sentence),
            };
            sources.push(s);
            const { ctx: _ctx, ...pub } = s; void _ctx;
            send({ type: "source", source: pub });
            for (const l of links(para.paragraph)) {
              if (!seen.has(l) && queue.length < 8) { seen.add(l); queue.push({ url: l, from: s.url }); }
            }
            for (const at of attributions(para.paragraph)) if (!triedAttr.has(at)) { triedAttr.add(at); attrs.push({ at, from: s.url }); }
          }
          // Fetch drops hyperlinks, so follow the *named* sources instead: search for each attribution
          const todo = attrs.splice(0, 4);
          if (hop < MAX_HOPS && todo.length && Date.now() - T0 < SOFT_DEADLINE) {
            send({ type: "step", msg: `Following attributions upstream: ${todo.map((t) => `“${t.at}”`).join(", ")}` });
            const res = await Promise.all(todo.map((t) => soft(search(`${t.at} ${short}`))));
            todo.forEach((t, i) => {
              for (const h of res[i].slice(0, 4)) {
                if (seen.has(h.url) || queue.length >= 10) continue;
                seen.add(h.url);
                const d = normDate(h.date);
                if (d) dates.set(h.url, d);
                queue.push({ url: h.url, from: t.from, via: t.at });
              }
            });
          }
        }

        // the same page can arrive under http/https, www or a redirect: keep one copy
        const canon = (u: string) => { try { const x = new URL(u); return x.host.replace(/^www\./, "") + x.pathname.replace(/\/+$/, ""); } catch { return u; } };
        const uniq = new Set<string>();
        const deduped = sources.filter((s) => (uniq.has(canon(s.url)) ? false : (uniq.add(canon(s.url)), true)));
        sources.length = 0; sources.push(...deduped);
        // order: dated oldest first, undated last; primary wins ties
        sources.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999") || +y.primary - +x.primary || y.score - x.score);

        const baseline = decide(claim, sources, checked);
        let { origin, verdict, confidence } = baseline;
        let judgeInfo: Record<string, unknown> = { used: false, reason: useJudge ? "no pages to judge" : "AI judging is off" };

        // Claude Haiku reads what TinyFish fetched: one batched call, at most 8 short excerpts
        if (useJudge && sources.length) {
          send({ type: "step", msg: "Judging each page: does it state, mention or debunk the claim?" });
          const cands = sources.map((s, i) => ({ s, id: i + 1 })).sort((x, y) => +y.s.primary - +x.s.primary || y.s.score - x.s.score).slice(0, 8);
          const ins: JudgeInput[] = cands.map(({ s, id }) => ({ id, host: s.host.replace(/^www\./, ""), title: s.title, date: s.date, primary: s.primary, excerpt: s.ctx ?? s.passage }));
          const j = await judge(claim, ins);
          if (j) {
            for (const { s, id } of cands) {
              const r = j.pages.get(id);
              if (!r) continue;
              s.relation = r.relation; s.judgeQuote = r.quote;
              s.disputed = r.relation === "debunks";
              if (r.relation === "unrelated") s.status = "related";
            }
            const out = decideJudged(claim, sources, j, checked, baseline);
            ({ origin, verdict, confidence } = out);
            judgeInfo = { used: true, model: JUDGE_MODEL, stance: j.stance, reason: j.originReason, usd: Number(j.usage.usd.toFixed(5)), tokens: j.usage, cached: j.cached };
          } else judgeInfo = { used: false, reason: "AI judge unavailable or over its daily cap; used the rule-based judgement" };
        }

        // Drift Diff: how every other repeat's wording differs from the origin's
        if (origin) for (const s of sources) if (s !== origin) { const d = wordDiff(origin.passage, s.passage); s.drift = d.similarity; s.diff = d.toks; s.flags = driftFlags(d.toks); }
        const echo = { copies: sources.length, primaries: sources.filter((s) => s.primary).length, hosts: new Set(sources.map((s) => s.host)).size };
        const pub = sources.map(({ ctx: _c, ...s }) => { void _c; return s; });
        const done = {
          type: "done", verdict, origin: origin?.url, sources: pub, checked, echo, confidence, judge: judgeInfo, ms: Date.now() - T0,
          baseline: judgeInfo.used ? { verdict: baseline.verdict, origin: baseline.origin?.url, confidence: baseline.confidence } : undefined,
        };
        cache.set(ckey, { at: Date.now(), done });
        if (cache.size > 200) cache.delete(cache.keys().next().value!);
        send(done);
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      }
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
