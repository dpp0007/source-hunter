import { search, fetchPages } from "../lib/tinyfish";
import { loosePassage } from "../lib/analyze";

async function main() {
  const claim = "95% of startups fail.";
  const q = "Shikhar Ghosh Harvard Business School start-up failure rate research 95 percent";
  const hits = await search(q);
  console.log("search hits:", hits.length);
  for (const h of hits.slice(0, 8)) console.log("  ", h.date ?? "-", h.url.slice(0, 100));
  const urls = hits.slice(0, 6).map((h) => h.url);
  const t = Date.now();
  let pages: Awaited<ReturnType<typeof fetchPages>> = [];
  try { pages = await fetchPages(urls); } catch (e) { console.log("FETCH ERROR:", (e as Error).message.slice(0, 200)); }
  console.log(`fetched ${pages.length}/${urls.length} in ${Date.now() - t}ms`);
  for (const p of pages) {
    const lp = loosePassage(p.text, claim);
    console.log("  ", new URL(p.url).host, "| chars", p.text.length, "| match:", lp ? `${lp.score.toFixed(2)} “${lp.sentence.slice(0, 90)}”` : "none");
  }
}
main();
