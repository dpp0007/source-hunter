import { judge, judgeEnabled, JUDGE_MODEL } from "../lib/judge";

console.log("haiku enabled:", judgeEnabled(), "| model:", JUDGE_MODEL);
const claim = "Humans swallow eight spiders a year in their sleep.";
const ins = [
  { id: 1, host: "scientificamerican.com", title: "Do People Really Swallow 8 Spiders a Year While They Sleep?", date: "2014-04-15", primary: false, excerpt: "Luckily for all of us, the “fact” that people swallow eight spiders in their sleep yearly isn’t true. Spiders avoid sleeping humans." },
  { id: 2, host: "funfacts.example", title: "50 Amazing Facts", date: "2012-03-02", primary: false, excerpt: "Did you know? The average person swallows eight spiders every year while they are asleep. Weird, right?" },
  { id: 3, host: "gardening.example", title: "Garden pests", date: undefined, primary: false, excerpt: "Spiders eat aphids and help gardens. Eight species were found in the survey of the orchard last year." },
  { id: 4, host: "snopes.com", title: "Do We Swallow Eight Spiders a Year?", date: "2015-01-05", primary: false, excerpt: "The claim that we swallow eight spiders a year while sleeping is an urban legend, and was reportedly invented to show how misinformation spreads." },
];
async function main() {
  const t = Date.now();
  const j = await judge(claim, ins);
  if (!j) { console.log("judge returned null"); process.exit(1); }
  console.log(`took ${Date.now() - t}ms | tokens in/out ${j.usage.input}/${j.usage.output} | cost $${j.usage.usd.toFixed(5)}`);
  for (const [id, p] of j.pages) console.log(` page ${id}: ${p.relation.padEnd(9)} “${p.quote.slice(0, 70)}”`);
  console.log(" origin:", j.originId, "|", j.originReason, "| stance:", j.stance);
  const again = await judge(claim, ins);
  console.log("second identical call cached:", again?.cached);
}
main();
