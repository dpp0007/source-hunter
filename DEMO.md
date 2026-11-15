# Source Hunter: demo script (about 3 minutes)

Record the screen in Chrome with the extension installed. Live app: https://source-hunter.vercel.app · Gallery of real traces: https://source-hunter.vercel.app/showcase

## The pitch (15 s)
"A statistic gets repeated across a hundred articles and nobody checks where it came from. Source Hunter is the button a journalist clicks before quoting a number: highlight, click once, and it traces the claim back to its source, showing every step and flagging where it changed."

## Shot list

| Time | Show | Say | Brief requirement |
|---|---|---|---|
| 0:15 | On any article, highlight a statistic or quote → click **Trace it** | "One highlight, one click." | #1 highlight text to start a trace |
| 0:30 | The inline card loads, then shows verdict + **Trail · oldest first** | "Each step has its date, its source and the exact wording, and whether it states, mentions or debunks the claim." | #3 chain with link, date, exact wording |
| 0:55 | Point at the ⚑ flags on a trail step ("figure changed", "dropped hedge") | "It flags where the wording drifted." | #4 flags changes |
| 1:10 | Trace **"95% of startups fail."** → TinyResearch block: *Misquoted*, origin Shikhar Ghosh / Harvard 2011 | "TinyResearch walked it back to Harvard: the original said 90 to 95 percent of firms *missing their own projections*, and the context was stripped as it was repeated." | #2 reaches the primary source, #6 TinyResearch |
| 1:50 | Trace the **Einstein "insanity" quote** → *Refuted*, 1981 Al-Anon newspaper | "A wrong claim: it was never Einstein's." | #5 at least one wrong claim |
| 2:10 | Open the full trace → **Chain** tab: ✓ quote found on live page / ⚠ page blocked | "Every cited quote is re-checked on its live page. If a page blocks us, we say so instead of pretending." | Accuracy, Honesty |
| 2:30 | Trace a made-up claim → **"No original source found"** or "Can't be verified" | "And when there's no source, it says so." | Approval #3 honest |
| 2:45 | Click the toolbar icon on a news page → **Claim Radar** badges | "Claim Radar flags the checkable claims on any page before you even highlight." | Experience |
| 3:00 | Open `/showcase` | "Nine real traces, captured from the live app." | Demo on 5+ claims |

## Claims to use (all real, already traced)
1. 95% of startups fail. — misquoted statistic (origin: Harvard Business School, 2011)
2. "Insanity is doing the same thing over and over…" — Albert Einstein — misattributed quote
3. Humans use only 10% of their brains. — myth
4. The Great Wall of China is visible from space. — myth
5. Humans swallow eight spiders a year in their sleep. — myth (origin story was a hoax)
6. You need to walk 10,000 steps a day for good health. — statistic with a marketing origin
7. Goldfish have a three-second memory. — myth
8. Sugar makes children hyperactive. — myth
9. "Let them eat cake." — Marie Antoinette — misattributed quote

Also show a **true** claim (e.g. "The Earth is about 4.5 billion years old.") to prove it does not cry wolf: "Appears supported".

## How TinyFish is used (say this near the end)
- **Search**: finds pages repeating the claim, the sources they name, and primary-source sites.
- **Fetch**: reads every page; re-checks every quote TinyResearch cites on its live page.
- **TinyResearch**: the deep, cited investigation behind the TinyResearch blocks, with live progress.
- **Agent**: a real browser for pages that block Fetch (opt-in).
- **Claude Haiku** only judges text TinyFish already fetched (states / mentions / debunks); every quote it cites must exist in the page text.

## Numbers to quote
- Measured on 20 claims with known answers: 95% verdict accuracy, 0 of 4 true claims wrongly flagged, 5 of 5 high-confidence answers correct (`node scripts/eval.mjs`).
- About $0.0005 of Haiku per trace.
