// Finds sentences worth fact-checking. One implementation, shared by the extension (Claim Radar) and the app (Article Audit).
(function () {
  const NUM = /\b\d[\d,.]*\s?(?:%|(?:percent|per cent|million|billion|trillion|thousand|x|times|fold)\b)/i;
  const BIGNUM = /\b\d{2,}(?:,\d{3})+\b|\$\s?\d/;
  const ATTRIB = /\b(?:according to|a (?:new )?(?:study|survey|report|poll)|studies show|research (?:shows|suggests|finds|found)|researchers (?:found|say)|scientists (?:found|say)|experts say|found that|data shows|statistics show|it is (?:estimated|said|known)|is widely (?:believed|known)|everyone knows)\b/i;
  const ABSOLUTE = /\b(?:always|never|every|all|none|nobody|everyone|only|most|first|largest|biggest|fastest|proven|guaranteed|myth|fact)\b/i;
  // a saying pinned on a person ("as Albert Einstein once said", "attributed to Mark Twain"): the classic misattribution
  const PERSON = /\b(?:once said|famously (?:said|wrote|stated)|is (?:often |widely |popularly )?attributed to|(?:often |widely )?attributed to [A-Z]|as [A-Z][\w.'-]*(?: [A-Z][\w.'-]*)* (?:once |famously )?(?:said|put it|wrote)|[A-Z][\w.'-]* [A-Z][\w.'-]* (?:once |famously )?said that)\b/;
  const QUOTE =/["“”][^"“”]{25,}["“”]/;
  const JUNK = /©|copyright|subscribe|newsletter|sign up|all rights reserved|cookie|privacy policy|click here|read more|share this|advertisement/i;

  function strip(s) {
    return s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`>#|]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /** 0 = not a checkable claim. Higher = more worth checking. */
  function scoreSentence(s) {
    if (s.length < 40 || s.length > 320 || JUNK.test(s) || s.endsWith("?")) return 0;
    if (!/[a-z]{3,}\s+[a-z]{3,}\s+[a-z]{3,}/i.test(s)) return 0;
    let sc = 0, kind = "";
    if (NUM.test(s)) { sc += 3; kind = "stat"; }
    else if (BIGNUM.test(s)) { sc += 2; kind = "stat"; }
    if (PERSON.test(s)) { sc += 3; kind = kind || "quote"; }
    if (QUOTE.test(s)) { sc += 2; kind = kind || "quote"; }
    if (ATTRIB.test(s)) { sc += 2; kind = kind || "attributed"; }
    if (ABSOLUTE.test(s)) sc += 1;
    if (sc < 3) return 0;
    return sc;
  }

  function kindOf(s) {
    if (NUM.test(s) || BIGNUM.test(s)) return "stat";
    if (QUOTE.test(s) || PERSON.test(s)) return "quote";
    return "attributed";
  }

  /** Split text into sentences, score them, return the best distinct ones (document order is kept in `at`). */
  function extractClaims(text, max) {
    const out = [], seen = new Set();
    const paras = strip(text).length ? text.split(/\n+/) : [];
    paras.forEach((para, pi) => {
      for (const raw of strip(para).split(/(?<=[.!?])\s+(?=[A-Z"“])/)) {
        const s = raw.trim(), score = scoreSentence(s);
        if (!score) continue;
        const key = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 80);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ text: s, score, kind: kindOf(s), at: pi });
      }
    });
    return out.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, max || 12);
  }

  /**
   * Trim a sentence down to the claim itself: pages repeat the claim, not the commentary around it.
   * "Everyone knows that X, according to Y." -> "X";  "X, as Albert Einstein once said." -> "X — Albert Einstein"
   */
  function distillClaim(s) {
    let t = s.replace(/\s+/g, " ").trim();
    t = t.replace(/^(?:everyone knows(?: that)?|we all know(?: that)?|it is (?:widely |commonly |often )?(?:known|believed|said|estimated|thought|claimed) that|it'?s (?:widely )?(?:known|believed) that|many people (?:think|believe)(?: that)?|some (?:people )?(?:say|think|believe)(?: that)?|(?:a|the) (?:new |recent |latest )?(?:study|survey|report|poll|analysis) (?:found|finds|shows|showed|says|suggests|revealed) that|(?:researchers|scientists|experts|analysts) (?:found|say|said|believe|estimate) that|studies (?:show|suggest|have shown) that|research (?:shows|suggests|finds) that)\s+/i, "");
    // a named speaker is kept (it is part of what is being checked), the rest of the framing is cut
    t = t.replace(/,?\s*as ([A-Z][\w.'-]*(?: [A-Z][\w.'-]*){0,3}) (?:once |famously )?(?:said|put it|wrote)\b.*$/, " — $1");
    t = t.replace(/,?\s+(?:according to|as reported by|as cited by|which (?:is|was|has|have)|a factoid|something that)\b.*$/i, "");
    t = t.replace(/,\s+(?:with|while|though|although|but|and (?:yet|so))\s.*$/i, "");
    t = t.replace(/[\s,;:]+$/, "");
    if (t.length < 12) return s.trim();
    return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) || / — /.test(t) ? "" : ".");
  }

  const api = { extractClaims, scoreSentence, kindOf, distillClaim };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (typeof self !== "undefined" ? self : globalThis).SHClaims = api;
})();
