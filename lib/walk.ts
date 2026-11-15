import { createHash } from "node:crypto";
import { haiku, judgeEnabled, JUDGE_MODEL, HAIKU_MAX_DAILY } from "./judge";
import { dailyBudget } from "./guard";
import { norm } from "./analyze";

/**
 * Upstream walk: a page repeats a claim and often says where it came from ("according to Harvard's Shikhar Ghosh", "a 1978 study in…").
 * One tiny Haiku call reads that page's excerpt and names the credited source plus a search query that would find its own page.
 * TinyFish Search and Fetch then go and read that page: this is how the trail reaches a study or report instead of stopping at a news copy.
 * Grounded: the credited name must appear in the excerpt we sent, so the model cannot make a source up.
 */
export type Credit = { cited: string; query: string };

const SCHEMA = {
  type: "object",
  properties: { cited: { type: "string" }, query: { type: "string" } },
  required: ["cited", "query"],
  additionalProperties: false,
};
const SYSTEM = `Web pages repeat a claim or figure. From the excerpts ONLY, name the ORIGINAL source that any of the pages credits for it: a study, report, dataset, book, publication, or a person with their institution, with the year if given. If no excerpt credits a specific earlier source, return an empty string for "cited".
"query": a web search query of at most 12 words that would find that original source's own page. Never guess beyond the excerpt.`;

const cache = new Map<string, Credit | null>();

export type Excerpt = { host: string; date?: string; text: string };

export async function findCitation(claim: string, pages: Excerpt[]): Promise<Credit | null> {
  if (!judgeEnabled() || !pages.length) return null;
  const excerpt = pages.map((p) => p.text).join(" ");
  const key = createHash("sha1").update(norm(claim) + "|" + pages.map((p) => p.text.slice(0, 80)).join("|")).digest("hex");
  if (cache.has(key)) return cache.get(key)!;
  if (!dailyBudget("haiku", HAIKU_MAX_DAILY)) return null;
  let res;
  try {
    res = await haiku().messages.create({
      model: JUDGE_MODEL, max_tokens: 160, system: SYSTEM,
      messages: [{ role: "user", content: `CLAIM: ${claim}\n\n` + pages.map((p, i) => `PAGE ${i + 1}: ${p.host} | ${p.date ?? "undated"}\nEXCERPT: ${p.text.slice(0, 420)}`).join("\n\n") }],
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    });
  } catch (e) { console.warn("[walk] failed:", (e as Error).message); return null; }
  const text = res.content.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text").map((b) => b.text).join("");
  let out: Credit | null = null;
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const cited = String(j.cited ?? "").trim(), query = String(j.query ?? "").trim();
    // grounding: the DISTINCTIVE part of the credited name (a surname, an institution, a year) must appear in the excerpts.
    // The model may add context it knows ("Shikhar Ghosh, Harvard Business School" for "Mr. Ghosh"), which only helps the search.
    const GENERIC = new Set(["business", "school", "university", "institute", "journal", "study", "report", "research", "department", "college", "press", "review", "magazine", "news", "times", "mr", "mrs", "dr", "prof", "professor", "senior", "lecturer", "the"]);
    const ex = new Set(norm(excerpt).split(" "));
    const proper = (cited.match(/\b[A-Z][\w'’.-]{3,}/g) ?? []).map((w) => norm(w)).filter((w) => w && !GENERIC.has(w));
    const years = cited.match(/\b(?:1[5-9]|20)\d{2}\b/g) ?? [];
    const grounded = proper.length ? proper.some((w) => ex.has(w)) : years.some((y) => ex.has(y));
    if (cited && query && grounded) out = { cited: cited.slice(0, 80), query: query.slice(0, 120) };
  } catch { /* unparseable: no credit */ }
  cache.set(key, out);
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return out;
}
