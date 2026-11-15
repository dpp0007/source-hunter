import { fetchPages } from "../lib/tinyfish";
import { bestPassage, strip } from "../lib/analyze";
import { findCitation } from "../lib/walk";

async function main() {
  const claim = "95% of startups fail.";
  const [p] = await fetchPages(["https://www.impactlab.com/2012/09/21/three-out-of-four-startups-fail-a-venture-capital-secret/"]);
  const para = bestPassage(p.text, claim, p.title)!;
  const pp = strip(para.paragraph), i = Math.max(0, pp.indexOf(para.sentence.slice(0, 30)));
  const ctx = pp.slice(Math.max(0, i - 60), i + para.sentence.length + 280).slice(0, 540);
  console.log("SENTENCE:", para.sentence.slice(0, 200));
  console.log("CTX (", ctx.length, "):", ctx);
  console.log("mentions Ghosh in page text:", /Ghosh/.test(p.text), "| in ctx:", /Ghosh/.test(ctx));
  const idx = p.text.indexOf("Ghosh");
  console.log("page around Ghosh:", JSON.stringify(p.text.slice(Math.max(0, idx - 200), idx + 160)));
  console.log("CREDIT:", JSON.stringify(await findCitation(claim, [{ host: "impactlab.com", date: "2012-09-21", text: ctx }])));
}
main();
