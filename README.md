# Source Hunter

Highlight a number, claim or quote on any page and see where it really came from. Built on four TinyFish products, with Claude Haiku as a cheap judge.

**Live app:** https://source-hunter.vercel.app
**Extension (.zip):** https://source-hunter.vercel.app/source-hunter-extension.zip (served by the app, so no repo access is needed to try it)

## Try it in 60 seconds (judges)

1. Open the site. Click **▶ Einstein “insanity” quote** under *Finished deep traces*: a real TinyResearch run (4 min, 27 sources) opens instantly at no cost. See the verdict, the origin, the verified chain, the drift diff.
2. Click a claim chip (e.g. *Humans use only 10% of their brains*). A fast trace takes 15 to 35 seconds.
3. Install the extension: **Download the extension (.zip)** at the bottom of the page → unzip → `chrome://extensions` → Developer mode → **Load unpacked**.
4. On any article: highlight a sentence → **Trace it** (inline card). Or click the toolbar icon with nothing selected → **Claim Radar** numbers every checkable claim on the page.

## What it does

| | |
|---|---|
| **Highlight → inline verdict** | Select text, click *Trace it*. A card opens beside the text: verdict, earliest match, confidence, *Copy safe quote*. |
| **Claim Radar** | Toolbar icon with nothing selected: numbered badges on the page's statistics, quotes, "according to…" claims and sayings pinned on a person. |
| **Full trace** | One verdict card, then tabs: Chain (every TinyResearch citation re-checked on its live page), Pages (who repeats it, with a word-level diff vs the earliest wording), Drift, Report. |
| **Article Audit** | Paste an article URL: TinyFish Fetch reads it and lists the claims worth checking. |
| **Safe to quote** | Original wording + source + link, ready to paste. Also *Copy citation* and *Download JSON*. |

## How it uses TinyFish (4 products)

| Product | Used for |
|---|---|
| **Search** | 5 calls per trace (the claim, origin-hunting, original study, `research_paper`, `include_domains` = primary-source sites) + one per *named* source found in a passage, up to 3 hops upstream. |
| **Fetch** | Reads every candidate page; re-checks every quote TinyResearch cites on its live page; reads articles for Article Audit. Bad URLs are normalised; a rejected batch is retried one by one. |
| **TinyResearch** | The deep pass: asked for a cited chain **and** a JSON verdict. Live progress (round, sources read) while it works. Button on the public site (each run is ~$2); same claim reuses a run. |
| **Agent** | A real browser for pages Fetch cannot read (cookie walls, bot checks). Opt-in per check. |

**Claude Haiku (`claude-haiku-5-5`)** is the judge, not the researcher: it only reads text TinyFish already fetched and decides, per page, *states / mentions / debunks / unrelated*, and which page is the origin. It cannot invent evidence: every quote it cites must appear in the page excerpt we sent, or the judgement is downgraded. If the key is missing, over its daily cap, or the call fails, the rule-based judgement is used.

## Cost control (built for a small budget)

- **Haiku:** one batched call per trace, 8 short excerpts, no thinking, tiny output, cached 6h, capped per day. About **1,900 input + 500 output tokens ≈ $0.0005 per trace** (2,000 traces per dollar).
- **TinyResearch (~$2/run):** a button on the public site, not automatic; the same claim reuses a run; 8 runs/day cap; three pre-computed demo runs open for free.
- **Agent:** opt-in, 2 pages max per click, daily cap.
- **Abuse:** per-visitor rate limits on every route (deployed site); traces cached 6h.

## Measured results

`node scripts/eval.mjs`: 20 claims with a known answer, each traced live and fresh. One trace yields both the rule-based verdict and the Haiku-judged verdict, so the comparison is like for like.

| | Rule-based only | With Claude Haiku |
|---|---|---|
| **Verdict accuracy** (20 claims) | 18/20 = 90% | **19/20 = 95%** |
| False alarms on **true** claims (4) | 0/4 | **0/4** |
| High-confidence answers correct | n/a | **5/5** |
| Cost | $0 | **$0.0066 for all 20 traces** ($0.00033 each) |
| Average time per trace | | 26 s |

The set: 11 myths ("10% of the brain", "Great Wall from space", "bats are blind"…), 3 misattributed quotes (Einstein "insanity", Marie Antoinette "let them eat cake", Gandhi "be the change"), 4 true claims ("Earth is 4.5 billion years old", "water boils at 100 °C"…) to catch false alarms, and 2 murky statistics ("95% of startups fail", "10,000 steps a day") where "supported as stated" would be wrong.

- **The one miss** was the Gandhi quote: that run returned nothing usable (a transient network error plus search variance). Re-run on its own it is judged *Misattributed* correctly. The table above keeps the original measured run.
- **Haiku's gain** (+5 points) is mostly on quotes and true claims, where word-counting says "origin unclear" and reading the page says *supported* or *misattributed*.
- It is a 20-claim set, mostly well-known myths. Treat the percentages as a sanity check, not a benchmark; the script is in the repo so you can add your own claims.

## Run it yourself

```bash
npm install
cp .env.example .env.local     # add TINYFISH_API_KEY (and ANTHROPIC_API_KEY for Haiku)
npm run dev -- -p 3001
npm run check                  # unit assertions
node scripts/eval.mjs          # the measured eval (needs the app running)
node scripts/ext-test.mjs      # extension background logic against the running app
node scripts/pack-ext.mjs https://your-app.vercel.app   # rebuild the extension zip for your URL
```

## Known limits

- Matching is word-based before Haiku; Haiku only sees what TinyFish found. Search results vary run to run, so a fast origin can change.
- Fetch returns text without hyperlinks, so upstream hops follow *named* sources found by Search.
- TinyFish Search is 30 requests/min on the free tier: about 3 traces a minute.
- Some real origins sit behind paywalls or bot checks that even the Agent browser cannot pass.
- Rate limits and daily caps are per server instance (best effort), not a global ledger.
