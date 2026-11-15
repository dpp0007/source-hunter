import claimsLib from "@/extension/claims.js";
import { norm } from "./analyze";
import runs from "./known-runs.json";

/**
 * Claims whose TinyResearch investigation was already paid for. Tracing one of them attaches the finished deep result
 * instantly (no wait, no spend). Regenerate with: node scripts/gen-known.mjs
 */
export const KNOWN: { q: string; run: string }[] = Object.entries(runs as Record<string, string>).map(([q, run]) => ({ q, run }));

export function knownRun(...claims: string[]): string | undefined {
  const want = new Set(claims.flatMap((c) => [norm(c), norm(claimsLib.distillClaim(c) as string)]));
  return KNOWN.find((k) => want.has(norm(k.q)) || want.has(norm(claimsLib.distillClaim(k.q) as string)))?.run;
}
