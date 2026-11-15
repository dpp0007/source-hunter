import { startResearch, getResearch } from "@/lib/tinyfish";
import { norm } from "@/lib/analyze";
import { rateLimit, dailyBudget, dailyUsed } from "@/lib/guard";
export const runtime = "nodejs";

const err = (e: unknown) => Response.json({ error: (e as Error).message }, { status: 500 });

// Every run costs credits (about $2), so the same claim reuses a recent run and a daily cap applies to the public site.
const cache = new Map<string, { id: string; at: number }>();
const TTL = 24 * 3600e3;
const MAX_DAILY = Number(process.env.RESEARCH_DAILY_MAX ?? 8);

// TinyResearch is asked for a readable report AND a machine-readable chain, so the UI can verify every step live.
const prompt = (claim: string) =>
  `Trace the provenance of this claim back to its original primary source (study, report, filing, interview, book or dataset): "${claim.slice(0, 600)}"\n` +
  `Prefer primary sources over popular copies. List each step of the citation trail, oldest first, each with URL, publication date and the EXACT wording used (copy it verbatim from the page; never paraphrase inside quotes). ` +
  `State whether the claim matches the original and flag anywhere it was rounded, changed, overstated or misquoted. If no original source can be found, say so plainly instead of guessing.\n` +
  `End your answer with ONE fenced json block and nothing after it, exactly in this shape (use null where unknown; steps are oldest first, include the origin as the first step, at most 8):\n` +
  "```json\n" +
  `{"claim_status":"supported|refuted|misquoted|unverifiable","origin_found":true,"origin":{"title":"","url":"","date":"YYYY-MM-DD or year","source_type":"study|report|filing|interview|dataset|book|other","exact_wording":""},"steps":[{"title":"","url":"","date":"","exact_wording":"verbatim from the page","note":"how this step differs from the origin"}],"changes":["short note on each place the claim changed"],"summary":"one sentence"}\n` +
  "```";

export async function POST(req: Request) {
  if (process.env.VERCEL) { const lim = rateLimit(req, "research", 3, 10 * 60_000); if (lim) return lim; }
  const { claim } = await req.json().catch(() => ({ claim: "" }));
  const text = String(claim ?? "").trim();
  if (text.length < 12) return Response.json({ error: "claim too short" }, { status: 400 });
  const key = norm(text);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json({ id: hit.id, cached: true });
  if (!dailyBudget("research", MAX_DAILY))
    return Response.json({ error: `Today's deep-verification budget is used up (${dailyUsed("research")} runs). The fast result above is still valid; try the pre-computed demos or come back tomorrow.`, budget: true }, { status: 429 });
  try {
    const id = await startResearch(prompt(text));
    cache.set(key, { id, at: Date.now() });
    return Response.json({ id, cached: false });
  } catch (e) { return err(e); }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  try {
    const r = await getResearch(id);
    return Response.json({
      status: r.status, report: r.deep_result?.result ?? null, citations: r.deep_result?.citations ?? [], error: r.error,
      // live progress while it works: how many rounds, which sources it has read, what it is asking next
      progress: {
        iterations: r.iterations ?? 0,
        sources: ((r.evidence ?? []) as { url: string; title?: string; published_date?: string }[]).slice(-30).map((e) => ({ url: e.url, title: e.title, date: e.published_date?.slice(0, 10) })),
        sourceCount: (r.evidence ?? []).length,
        questions: ((r.research_plan?.subquestions ?? []) as { question: string }[]).slice(0, 4).map((q) => q.question),
      },
    });
  } catch (e) { return err(e); }
}
