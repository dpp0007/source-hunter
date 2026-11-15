const key = () => {
  const k = process.env.TINYFISH_API_KEY;
  if (!k) throw new Error("TINYFISH_API_KEY is not set (add it to .env.local)");
  return k;
};
const H = () => ({ "X-API-Key": key(), "Content-Type": "application/json" });

export type SearchHit = { title: string; url: string; snippet: string; date?: string; site_name?: string };

export async function search(query: string, extra: Record<string, string> = {}): Promise<SearchHit[]> {
  const u = new URL("https://api.search.tinyfish.ai");
  u.searchParams.set("query", query);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  // every call has a hard timeout so one slow upstream cannot eat the whole request budget (Vercel gives us 60s)
  const once = () => fetch(u, { headers: H(), signal: AbortSignal.timeout(12_000) });
  const go = async () => { try { return await once(); } catch (e) { if (/abort|timeout/i.test(String(e))) return once(); throw e; } }; // one retry on a timeout
  let r = await go();
  // free tier is 30 req/min: back off briefly and retry rather than failing the whole trace
  for (let i = 0; i < 2 && r.status === 429; i++) {
    await new Promise((ok) => setTimeout(ok, Math.min(Number(r.headers.get("retry-after")) || 4, 5) * 1000));
    r = await go();
  }
  if (!r.ok) throw new Error(`TinyFish Search ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()).results ?? []) as SearchHit[];
}

export type Page = { url: string; final_url: string; title: string; text: string };

const httpHref = (u: string) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };

export async function fetchPages(urls: string[], opts: { each?: boolean } = {}): Promise<Page[]> {
  // Fetch rejects the WHOLE batch on one bad URL, so normalise first and keep a map back to the caller's spelling
  const back = new Map<string, string>();
  for (const u of urls) { const n = httpHref(u); if (n && !back.has(n)) back.set(n, u); }
  const list = [...back.keys()].slice(0, 10);
  if (!list.length) return [];
  const post = async (batch: string[], ms = 22_000): Promise<Page[]> => {
    const r = await fetch("https://api.fetch.tinyfish.ai", { method: "POST", headers: H(), body: JSON.stringify({ urls: batch, format: "markdown" }), signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw Object.assign(new Error(`TinyFish Fetch ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: r.status });
    return (await r.json()).results ?? [];
  };
  // one request per URL, each with its own short timeout: a single slow page (a PDF download, say) cannot sink the others
  const each = async () => (await Promise.allSettled(list.map((u) => post([u], 12_000)))).flatMap((x) => (x.status === "fulfilled" ? x.value : []));
  let results: Page[];
  if (opts.each) results = await each();
  else {
    try { results = await post(list); } catch (e) {
      const timedOut = /abort|timeout/i.test(String(e)), status = (e as { status?: number }).status;
      if ((status !== 400 && !timedOut) || list.length === 1) throw e;
      results = await each();
    }
  }
  return results.filter((p) => typeof p.text === "string").map((p) => ({ ...p, url: back.get(p.url) ?? p.url }));
}

export async function startResearch(query: string): Promise<string> {
  const r = await fetch("https://agent.tinyfish.ai/v1/automation/run-research-async", {
    method: "POST", headers: H(), body: JSON.stringify({ query, mode: "deep" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.research_run_id) throw new Error(`TinyResearch ${r.status}: ${j?.error?.message ?? JSON.stringify(j).slice(0, 200)}`);
  return j.research_run_id;
}

export async function getResearch(id: string) {
  const r = await fetch(`https://agent.tinyfish.ai/v1/research-run/${encodeURIComponent(id)}`, { headers: H() });
  if (!r.ok) throw new Error(`TinyResearch ${r.status}`);
  return r.json();
}

/** TinyFish Agent (sync): drives a real browser. Used only when Fetch cannot read a page (cookie walls, bot checks). */
export async function runAgent(url: string, goal: string, output_schema: object, maxSeconds = 90): Promise<Record<string, unknown> | null> {
  const r = await fetch("https://agent.tinyfish.ai/v1/automation/run", {
    method: "POST", headers: H(),
    body: JSON.stringify({ url, goal, output_schema, browser_profile: "stealth", agent_config: { max_duration_seconds: maxSeconds } }),
    signal: AbortSignal.timeout((maxSeconds + 20) * 1000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status !== "COMPLETED") throw new Error(`TinyFish Agent ${r.status}: ${j?.error?.message ?? j.status ?? "failed"}`);
  return (j.result as Record<string, unknown>) ?? null;
}

const runCache = new Map<string, { at: number; id: string | null }>();

/**
 * Has this claim already been investigated? TinyFish keeps every run on its side and can list runs by query text, so the
 * claim -> run link survives other windows, other origins (localhost vs the live site), other devices and server restarts.
 * Returns a COMPLETED run if there is one, otherwise one still running.
 */
export async function findResearchRun(claim: string): Promise<string | null> {
  const want = claim.toLowerCase().replace(/\s+/g, " ").trim();
  if (want.length < 12) return null;
  const hit = runCache.get(want);
  if (hit && Date.now() - hit.at < 90_000) return hit.id;
  try {
    const u = new URL("https://agent.tinyfish.ai/v1/research-run");
    u.searchParams.set("query", claim.trim().slice(0, 120));
    u.searchParams.set("limit", "10");
    u.searchParams.set("sort_direction", "desc");
    const r = await fetch(u, { headers: H(), signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    const runs = ((j.data ?? []) as { research_run_id: string; status: string; query?: string }[])
      .filter((x) => ["COMPLETED", "RUNNING", "QUEUED"].includes(x.status) && (x.query ?? "").toLowerCase().replace(/\s+/g, " ").includes(want));
    const id = (runs.find((x) => x.status === "COMPLETED") ?? runs[0])?.research_run_id ?? null;
    runCache.set(want, { at: Date.now(), id });
    return id;
  } catch { return null; }
}
