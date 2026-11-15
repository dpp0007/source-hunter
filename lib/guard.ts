// Cheap abuse and spend protection for a public deployment. In-memory (per server instance): a best-effort brake, not a ledger.
const hits = new Map<string, { n: number; reset: number }>();
const daily = new Map<string, { n: number; day: string }>();

const ip = (req: Request) => (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();

/** Per-visitor rate limit. Returns a 429 Response when exceeded, otherwise null. */
export function rateLimit(req: Request, bucket: string, max: number, windowMs: number): Response | null {
  const key = `${bucket}:${ip(req)}`, now = Date.now(), h = hits.get(key);
  if (!h || now > h.reset) { hits.set(key, { n: 1, reset: now + windowMs }); return null; }
  if (++h.n > max) return Response.json({ error: `Too many requests. Please wait ${Math.ceil((h.reset - now) / 1000)}s and try again.` }, { status: 429, headers: { "Retry-After": String(Math.ceil((h.reset - now) / 1000)) } });
  return null;
}

/** Global daily budget for something that costs real money (TinyResearch runs, Haiku calls). */
export function dailyBudget(name: string, max: number): boolean {
  const day = new Date().toISOString().slice(0, 10), d = daily.get(name);
  if (!d || d.day !== day) { daily.set(name, { n: 1, day }); return true; }
  if (d.n >= max) return false;
  d.n++;
  return true;
}
export const dailyUsed = (name: string) => daily.get(name)?.n ?? 0;
