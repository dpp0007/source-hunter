import { findCitation } from "../lib/walk";
async function main() {
  const t = Date.now();
  const a = await findCitation("95% of startups fail.", [{ host: "impactlab.com", date: "2012-09-21", text: "If failure is defined as failing to see the projected return on investment, then more than 95% of start-ups fail, based on Shikhar Ghosh, a senior lecturer at Harvard Business School, who has studied venture-backed companies since 2010." }]);
  console.log("credited:", JSON.stringify(a), `${Date.now() - t}ms`);
  const b = await findCitation("Humans swallow eight spiders a year.", [{ host: "funfacts.example", text: "Everyone has heard that we swallow eight spiders a year while sleeping. Funny, isn't it? Here are more fun facts about bugs." }]);
  console.log("no credit expected:", JSON.stringify(b));
  const c = await findCitation("Humans swallow eight spiders a year.", [{ host: "x.example", text: "The claim was made up by Lisa Holst in a 1993 magazine column." }]);
  console.log("grounded name:", JSON.stringify(c));
}
main();
