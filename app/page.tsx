import Hero from "@/components/Hero";
import Tracer from "@/components/Tracer";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // opened from the extension (a claim in the URL): skip the landing page and go straight to the answer
  const compact = Boolean(sp.q || sp.run);
  return (
    <main>
      {!compact && <Hero />}
      <Tracer compact={compact} />
      {!compact && (
        <footer className="mx-auto max-w-3xl px-5 pb-16 pt-10 text-sm text-mute">
          <p>
            <b className="text-ink">How it uses TinyFish.</b> <b>Search</b> finds pages repeating the claim and the sources they name; <b>Fetch</b> reads each page and
            re-checks every cited quote on its live page; <b>TinyResearch</b> runs a deep, cited investigation automatically; the <b>Agent</b> browser reads pages
            that block Fetch. Matching, dating and change-detection are deterministic text checks. Nothing is invented: if no source matches, it says so.
          </p>
        </footer>
      )}
    </main>
  );
}
