export type Tok = { t: string; k: "same" | "del" | "add" };
const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9%.$]/g, "");

/** Word-level diff of `from` (the origin wording) → `to` (a later repeat), with a 0-100 similarity. */
export function wordDiff(from: string, to: string): { toks: Tok[]; similarity: number } {
  const a = from.split(/\s+/).slice(0, 70), b = to.split(/\s+/).slice(0, 70);
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] = key(a[i]) === key(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const toks: Tok[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) { toks.push({ t: b[j], k: "same" }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) toks.push({ t: a[i++], k: "del" });
    else toks.push({ t: b[j++], k: "add" });
  }
  while (i < a.length) toks.push({ t: a[i++], k: "del" });
  while (j < b.length) toks.push({ t: b[j++], k: "add" });
  return { toks, similarity: Math.round((100 * 2 * L[0][0]) / Math.max(1, a.length + b.length)) };
}

const HEDGE = /^(may|might|could|some|many|often|approximately|about|around|roughly|nearly|almost|suggests?|suggested|likely|estimated|estimates|reportedly|up)$/;
const ABSOLUTE = /^(all|every|always|never|only|proven|proves|proved|guaranteed|definitely|everyone|nobody|100%)$/;
const clean = (w: string) => w.replace(/^[^\w$%]+|[^\w%]+$/g, "");

/** Plain-language flags for how a repeat's wording moved away from the origin: changed figures, dropped hedges, added absolutes. */
export function driftFlags(toks: Tok[]): string[] {
  const of = (k: Tok["k"]) => toks.filter((t) => t.k === k).map((t) => clean(t.t)).filter(Boolean);
  const del = of("del"), add = of("add"), out: string[] = [];
  const dn = del.filter((w) => /\d/.test(w)), an = add.filter((w) => /\d/.test(w));
  if (dn.length && an.length) out.push(`figure changed: ${dn.join(", ")} → ${an.join(", ")}`);
  else if (dn.length) out.push(`dropped figure ${dn.join(", ")}`);
  else if (an.length) out.push(`added figure ${an.join(", ")}`);
  for (const w of del) if (HEDGE.test(w.toLowerCase()) && !add.some((a) => a.toLowerCase() === w.toLowerCase())) out.push(`dropped hedge “${w}”`);
  for (const w of add) if (ABSOLUTE.test(w.toLowerCase())) out.push(`added absolute “${w}”`);
  return [...new Set(out)].slice(0, 4);
}
