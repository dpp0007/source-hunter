import { fetchPages } from "@/lib/tinyfish";
import claims from "@/extension/claims.js";
import { rateLimit } from "@/lib/guard";

export const maxDuration = 60;
export const runtime = "nodejs";

/** Article Audit: TinyFish Fetch reads any article, the shared extractor picks the sentences worth fact-checking. */
export async function POST(req: Request) {
  if (process.env.VERCEL) { const lim = rateLimit(req, "claims", 10, 10 * 60_000); if (lim) return lim; }
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  let u: URL;
  try { u = new URL(String(url ?? "").trim()); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { return Response.json({ error: "Enter a full article URL starting with http(s)://" }, { status: 400 }); }
  try {
    const [page] = await fetchPages([u.toString()]);
    if (!page || page.text.length < 300) return Response.json({ error: "That page could not be read (it may block automated readers or be too short)." }, { status: 422 });
    const found = claims.extractClaims(page.text, 12) as { text: string; score: number; kind: string }[];
    return Response.json({ title: page.title || u.host, host: u.host.replace(/^www\./, ""), url: page.final_url || u.toString(), chars: page.text.length, claims: found });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
