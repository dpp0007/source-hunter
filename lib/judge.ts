import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { norm } from "./analyze";
import { dailyBudget } from "./guard";

/**
 * Claude Haiku judges what TinyFish fetched: does each page STATE, MENTION or DEBUNK the claim, and which page is the origin?
 * Built to be cheap: ONE batched call per trace, short excerpts, no thinking, tiny output, cached, and capped per day.
 * (Haiku 5.5 is $0.10 / $0.50 per million tokens: a call is about 1,500 in + 300 out tokens, roughly $0.0003.)
 * Every quote it returns must exist in the page excerpt we sent, or the judgement is downgraded: it cannot invent evidence.
 */
export const JUDGE_MODEL = "claude-haiku-5-5";
export type Relation = "states" | "mentions" | "debunks" | "unrelated";
export type JudgeInput = { id: number; host: string; title: string; date?: string; primary: boolean; excerpt: string };
export type Judgement = {
  pages: Map<number, { relation: Relation; quote: string }>;
  originId: number | null;
  originReason: string;
  stance: "supported" | "false" | "misattributed" | "mixed" | "unverifiable";
  usage: { input: number; output: number; usd: number };
  cached: boolean;
};

const MAX_DAILY = Number(process.env.HAIKU_DAILY_MAX ?? 400);
const cache = new Map<string, { at: number; j: Judgement }>();
const TTL = 6 * 3600e3;
let client: Anthropic | null = null;
export const judgeEnabled = () => !!process.env.ANTHROPIC_API_KEY && process.env.DISABLE_HAIKU !== "1";

const SCHEMA = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          relation: { type: "string", enum: ["states", "mentions", "debunks", "unrelated"] },
          quote: { type: "string" },
        },
        required: ["id", "relation", "quote"],
        additionalProperties: false,
      },
    },
    origin_id: { type: "integer" },
    origin_reason: { type: "string" },
    stance: { type: "string", enum: ["supported", "false", "misattributed", "mixed", "unverifiable"] },
  },
  required: ["pages", "origin_id", "origin_reason", "stance"],
  additionalProperties: false,
};

const SYSTEM = `You judge whether web pages support a claim. You only see short excerpts. Be strict and literal.
For each page excerpt decide "relation" to the CLAIM:
- states: the page asserts the claim as true (or reports the figure/quote as its own statement)
- mentions: the page repeats or cites the claim without endorsing or refuting it
- debunks: the page says the claim is false, a myth, misattributed or misleading
- unrelated: about something else, or only shares words with the claim
"quote": copy a phrase (max 25 words) VERBATIM from that page's excerpt that justifies the relation; empty string only for unrelated.
"origin_id": the page that best shows where the claim or figure FIRST came from (prefer primary sources, earlier dates, pages naming the original source); 0 if no page does.
"origin_reason": max 20 words. "stance" of the claim overall given the pages: supported, false, misattributed (real words, wrong person/source), mixed, or unverifiable.
Never use knowledge outside the excerpts.`;

const key = (claim: string, ins: JudgeInput[]) =>
  createHash("sha1").update(norm(claim) + "|" + ins.map((i) => i.host + i.excerpt.slice(0, 40)).join("|")).digest("hex");

const inExcerpt = (quote: string, excerpt: string) => {
  const q = norm(quote), e = norm(excerpt);
  if (q.length < 8) return false;
  if (e.includes(q)) return true;
  const qt = q.split(" "), et = new Set(e.split(" "));
  return qt.filter((w) => et.has(w)).length / qt.length >= 0.9; // tolerate trivial punctuation/case/number-format drift
};

export async function judge(claim: string, ins: JudgeInput[]): Promise<Judgement | null> {
  if (!judgeEnabled() || ins.length === 0) return null;
  const k = key(claim, ins), hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.j, cached: true };
  if (!dailyBudget("haiku", MAX_DAILY)) return null; // spend cap reached: fall back to the deterministic judgement

  client ??= new Anthropic({ maxRetries: 0, timeout: 14_000 });
  const prompt =
    `CLAIM: ${claim}\n\nPAGES:\n` +
    ins.map((p) => `[${p.id}] ${p.host} | ${p.date ?? "undated"} | ${p.primary ? "primary source" : "secondary"} | ${p.title.slice(0, 90)}\n"${p.excerpt}"`).join("\n");

  const base = { model: JUDGE_MODEL, max_tokens: 700, system: SYSTEM, messages: [{ role: "user" as const, content: prompt }] };
  let res;
  try {
    // no thinking, lowest effort, schema-constrained JSON: the cheapest way to get a reliable answer
    res = await client.messages.create({ ...base, thinking: { type: "disabled" }, output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } } });
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) { console.warn("[judge] failed:", (e as Error).message); return null; }
    // an option was rejected: retry once with the plain request, asking for JSON in the prompt
    try {
      res = await client.messages.create({ ...base, system: SYSTEM + "\nReply with ONLY a JSON object: {pages:[{id,relation,quote}],origin_id,origin_reason,stance}." });
    } catch (e2) { console.warn("[judge] retry failed:", (e2 as Error).message); return null; }
  }

  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  let raw: { pages?: { id: number; relation: string; quote: string }[]; origin_id?: number; origin_reason?: string; stance?: string };
  try { raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { console.warn("[judge] unparseable output"); return null; }

  const byId = new Map(ins.map((i) => [i.id, i]));
  const pages = new Map<number, { relation: Relation; quote: string }>();
  for (const p of raw.pages ?? []) {
    const src = byId.get(p.id);
    if (!src || !["states", "mentions", "debunks", "unrelated"].includes(p.relation)) continue;
    let relation = p.relation as Relation, quote = String(p.quote ?? "");
    // guard: a verdict that needs evidence must quote the page; invented or non-matching quotes are downgraded
    if (relation !== "unrelated" && !inExcerpt(quote, src.excerpt)) { relation = relation === "debunks" || relation === "states" ? "mentions" : relation; quote = ""; }
    pages.set(p.id, { relation, quote });
  }
  const oid = raw.origin_id && pages.has(raw.origin_id) && pages.get(raw.origin_id)!.relation !== "unrelated" ? raw.origin_id : null;
  const stance = (["supported", "false", "misattributed", "mixed", "unverifiable"].includes(String(raw.stance)) ? raw.stance : "unverifiable") as Judgement["stance"];
  const input = res.usage.input_tokens, output = res.usage.output_tokens;
  const j: Judgement = { pages, originId: oid, originReason: String(raw.origin_reason ?? "").slice(0, 160), stance, usage: { input, output, usd: (input * 0.1 + output * 0.5) / 1e6 }, cached: false };
  cache.set(k, { at: Date.now(), j });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return j;
}
