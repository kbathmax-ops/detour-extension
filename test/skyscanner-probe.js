/**
 * Skyscanner row probe — paste into the DevTools console on a Skyscanner
 * results page.
 *
 * Why this exists: Skyscanner cannot be verified from an automated browser.
 * It answers one with a PerimeterX CAPTCHA ("Are you a person or a robot?")
 * before any results render, and solving that is not something a tool should
 * do. So the row format has never been inspected, and the Skyscanner adapter
 * in src/sites.js is written blind.
 *
 * This script runs the real detection engine against the real page and prints
 * what it sees, so the check takes about thirty seconds in a normal browser
 * with no extension reload and no code changes.
 *
 * HOW TO USE
 *   1. Search a route on Skyscanner that has US connections
 *      (e.g. Toronto → Lima) and wait for results to finish loading.
 *   2. Open DevTools → Console.
 *   3. Paste this whole file and press Enter.
 *   4. Read the summary, and send it back along with one sample row.
 *
 * WHAT THE OUTPUT MEANS
 *   rows: 0            → row detection is broken. The `sample` block shows the
 *                        first few things that nearly matched; the price or
 *                        stops pattern needs adjusting for Skyscanner's markup.
 *   rows: >0, hide: 0  → rows are found but no US layover was identified.
 *                        Check `unknown` — if it is high, layover codes are not
 *                        where the engine expects them.
 *   rows: >0, hide: >0 → working. Compare the hidden count against what you can
 *                        see on screen.
 */
(() => {
  const enc = (o) => JSON.stringify(o, null, 2);

  // The engine, inlined so the probe is self-contained.
  const CODE_RE = /\b[A-Z]{3}\b/g;
  const PRICE_RE = /[$£€¥₹₩][  ]?[\d,]{2,}|\b[A-Z]{3}[  ]?[\d,]{3,}/;
  const STOPS_RE = /\bstops?\b|\bnonstop\b|\bdirect\b/i;
  const DURATION_RE = /\d+\s*(?:hr|hrs|h|min|mins|m)\b/i;
  const VIA_RE = /\b(?:via|layover(?: in)?|connects? in|connecting in|change (?:in|at)|stop in)\b/i;
  const STOP_COUNT_RE = /\b(\d+)\s*stops?\b/i;
  const NONSTOP_RE = /\b(?:nonstop|non-stop|direct)\b/i;

  const layoverCodes = (text) => {
    const out = new Set();
    for (const line of String(text).split("\n"))
      for (const m of line.matchAll(CODE_RE))
        if (DURATION_RE.test(line.slice(0, m.index)) || VIA_RE.test(line.slice(0, m.index)))
          out.add(m[0]);
    return out;
  };

  const looksLikeResult = (el) => {
    const t = el.innerText || "";
    return t.length >= 20 && t.length <= 600 && PRICE_RE.test(t) && STOPS_RE.test(t);
  };

  const all = [...document.querySelectorAll("li, [role=listitem], article, section, div")];
  const prefiltered = all.filter((el) => {
    const t = el.textContent || "";
    return (
      t.length >= 20 &&
      t.length <= 1200 &&
      /stop|nonstop|direct/i.test(t) &&
      /[$£€¥₹₩]\s?\d|[A-Z]{3}\s?\d/.test(t)
    );
  });
  const matched = prefiltered.filter(looksLikeResult);
  const innermost = matched.filter((el) => !matched.some((o) => o !== el && el.contains(o)));

  const url = location.pathname.match(/\/transport\/flights\/([a-z0-9]{3})\/([a-z0-9]{3})\//i);
  const endpoints = url ? [url[1].toUpperCase(), url[2].toUpperCase()] : null;

  let hide = 0, keep = 0, unknown = 0;
  const codesSeen = new Set();
  for (const row of innermost) {
    const codes = layoverCodes(row.innerText || "");
    if (endpoints) endpoints.forEach((e) => codes.delete(e));
    codes.forEach((c) => codesSeen.add(c));
    const stops = (() => {
      const m = STOP_COUNT_RE.exec(row.innerText || "");
      if (m) return Number(m[1]);
      return NONSTOP_RE.test(row.innerText || "") ? 0 : null;
    })();
    if (codes.size && [...codes].some((c) => /^[A-Z]{3}$/.test(c))) {
      // The probe has no airport table; it reports codes for you to eyeball.
      hide++;
    } else if (stops === 0) keep++;
    else unknown++;
  }

  console.log(
    "%c detour probe ",
    "background:#2e246b;color:#fff;font-weight:700;border-radius:3px",
    "\n" +
      enc({
        url: location.href,
        endpointsFromUrl: endpoints,
        elementsScanned: all.length,
        survivedPrefilter: prefiltered.length,
        rows: innermost.length,
        withLayoverCodes: hide,
        nonstop: keep,
        unreadable: unknown,
        layoverCodesSeen: [...codesSeen].sort(),
      })
  );

  if (!innermost.length) {
    console.warn(
      "No rows detected. Nearest misses below — check whether the price and " +
        "stops patterns match this markup:"
    );
    console.log(
      prefiltered.slice(0, 3).map((el) => ({
        len: (el.innerText || "").length,
        priceMatched: PRICE_RE.test(el.innerText || ""),
        stopsMatched: STOPS_RE.test(el.innerText || ""),
        text: (el.innerText || "").slice(0, 300),
      }))
    );
  } else {
    console.log("Sample row text (send this back):\n" + (innermost[0].innerText || "").slice(0, 400));
  }
})();
