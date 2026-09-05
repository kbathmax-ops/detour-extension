/**
 * detour — shared detection engine.
 *
 * Deliberately text-based rather than selector-based. Flight sites ship
 * obfuscated, frequently-churned class names; what stays stable is that a
 * result row renders its layover as an all-caps IATA code near the word "stop".
 * Matching on that survives redesigns that would break any CSS selector.
 *
 * SAFETY RULE, applied everywhere below: only hide a row when the layover has
 * been positively identified as US soil. Any uncertainty — no endpoints found,
 * no codes found, an unparseable row — leaves the row visible. Showing a US
 * itinerary is a visible annoyance the traveller can catch themselves; silently
 * hiding a valid non-US one is invisible and actively harmful.
 */

const DETOUR_HIDDEN_CLASS = "detour-hidden";
const DETOUR_MARK = "data-detour-checked";

/** All-caps three-letter tokens. Case matters: prose renders "day"/"new". */
const CODE_RE = /\b[A-Z]{3}\b/g;

/**
 * A price, in either form the site uses: a symbol ("$1,914") or an ISO
 * currency code ("PEN 1,914"). Google picks the form from the viewer's region,
 * so the code form is not an edge case — a Peru-region session renders every
 * price that way, and a symbol-only match detects zero rows on the whole page.
 */
const DETOUR_PRICE_RE = /[$£€¥₹₩][ \u00a0]?[\d,]{2,}|\b[A-Z]{3}[ \u00a0]?[\d,]{3,}/;

/**
 * A three-letter code acting as a currency: one immediately followed by a
 * number. These must be stripped before judging layovers, because 19 ISO
 * currency codes are also US IATA codes — HNL (Honduran lempira / Honolulu),
 * PLN (Polish zloty), BRL, CNY, DKK, CLP among them. Left in, the currency
 * token reads as a US layover on *every* row, and the extension hides the
 * entire results page for anyone browsing in those currencies.
 */
// The separator is a literal space, never \s: innerText joins fields with
// newlines, so \s would read "...min DFW\n380 kg CO2e" as the price "DFW 380"
// and strip a real layover.
const DETOUR_PRICE_CODE_RE = /\b([A-Z]{3})[ \u00a0]?[\d][\d,.]*/g;

/** Codes that are functioning as currency labels in this row, not airports. */
function detourCurrencyCodesIn(text) {
  const out = new Set();
  for (const m of text.matchAll(DETOUR_PRICE_CODE_RE)) out.add(m[1]);
  return out;
}

/** "YYZ–CAI", "YYZ-CAI", "YYZ — CAI" — the endpoint pair on a result row. */
const ROUTE_PAIR_RE = /\b([A-Z]{3})\s*[–—-]\s*([A-Z]{3})\b/;

/** Endpoints from a row's own text, if it states them. */
function detourEndpointsFromText(text) {
  const m = ROUTE_PAIR_RE.exec(text);
  return m ? [m[1], m[2]] : null;
}

/* ------------------------------------------------------------------ *
 * Which codes on a row are actually layovers
 *
 * Sweeping up every all-caps triplet on the row was biased the WRONG way.
 * A stray token that happens to also be a US IATA code -- and 1,271 of them
 * are, eight of which are English words -- turns into a phantom layover and
 * hides a perfectly good itinerary. That failure is silent: the row simply
 * isn't there, and nothing tells the traveller a flight was removed. The
 * project's whole safety rule exists to avoid exactly that, so the code
 * sweep has to be narrowed to codes in a position that means "layover".
 *
 * Three positions qualify:
 *   a duration to the left on the same line -- "11 hr 11 min DFW"
 *   an explicit connection word              -- "via DFW", "Layover in DFW"
 *   a line that is nothing but a code list   -- "ORD, PHX"
 *
 * That third form is not a nicety, it is the common case. Google prints the
 * layover duration beside the code only on a ONE-stop row. From two stops up it
 * drops the durations and prints the airports as a bare comma list in their own
 * column, so innerText gives:
 *   "2 stops\nORD, PHX"
 * A rule that only looked for a duration read zero layovers off every multi-stop
 * row on the page -- which is most of them -- and returned "unknown" for an
 * itinerary routing through Chicago and Phoenix.
 *
 * Bounded to the LINE, never the whole row. innerText puts each field on its
 * own line, and the total trip duration sits directly above the route pair:
 *   "18 hr 30 min\nMEX-YVR"
 * An unbounded left-context would read that duration as introducing MEX and
 * book the origin airport as a layover.
 * ------------------------------------------------------------------ */

const DETOUR_DURATION_RE = /\d+\s*(?:hr|hrs|h|min|mins|m)\b/i;
const DETOUR_VIA_RE = /\b(?:via|layover(?: in)?|connects? in|connecting in|change (?:in|at)|stop in)\b/i;

/** A line consisting only of airport codes: "ORD, PHX", "PVR, GDL, TIJ". */
const DETOUR_CODE_LIST_LINE_RE = /^\s*[A-Z]{3}(?:\s*,\s*[A-Z]{3})*\s*,?\s*$/;
/** Codes trailing the stop count on one line: "2 stops ORD, PHX". */
const DETOUR_AFTER_STOPS_RE = /\bstops?\b[^A-Za-z\n]*([A-Z]{3}(?:\s*,\s*[A-Z]{3})*)/;

function detourLayoverCodesIn(text) {
  const out = new Set();
  for (const line of String(text).split("\n")) {
    if (DETOUR_CODE_LIST_LINE_RE.test(line)) {
      for (const m of line.matchAll(CODE_RE)) out.add(m[0]);
      continue;
    }
    const after = DETOUR_AFTER_STOPS_RE.exec(line);
    if (after) for (const m of after[1].matchAll(CODE_RE)) out.add(m[0]);
    for (const m of line.matchAll(CODE_RE)) {
      const left = line.slice(0, m.index);
      if (DETOUR_DURATION_RE.test(left) || DETOUR_VIA_RE.test(left)) out.add(m[0]);
    }
  }
  return out;
}

/**
 * How many stops the row claims. 0 for a nonstop, N for "N stops", null when
 * the row doesn't say.
 *
 * The count is what makes a "keep" trustworthy. Reading one non-US layover off
 * a two-stop row proves nothing about the second stop, and calling that row
 * clean is the same silent failure as a phantom layover, just in reverse. The
 * numeric form is tested first: a stray "Nonstop" elsewhere in the row must not
 * be able to talk a multi-stop itinerary down to zero.
 */
const DETOUR_STOP_COUNT_RE = /\b(\d+)\s*stops?\b/i;
const DETOUR_NONSTOP_RE = /\b(?:nonstop|non-stop|direct)\b/i;

function detourStopCount(text) {
  const m = DETOUR_STOP_COUNT_RE.exec(text);
  if (m) return Number(m[1]);
  if (DETOUR_NONSTOP_RE.test(text)) return 0;
  return null;
}

/**
 * Decide a row's fate.
 * Returns { verdict: "hide" | "keep" | "unknown", usCodes, layovers, stops }.
 *
 * "unknown" is not a failure mode to be minimised -- it is the honest third
 * answer, and it renders identically to "keep" on screen. What it buys is a
 * count the badge can report, so a row the parser could not fully read shows up
 * as a number the user can see rather than as false confidence.
 */
function detourJudgeRow(text, endpointsHint) {
  const endpoints = detourEndpointsFromText(text) || endpointsHint;
  if (!endpoints) {
    return { verdict: "unknown", reason: "no endpoints", layovers: [], usCodes: [], stops: null };
  }

  const stops = detourStopCount(text);

  // Checked before any code is looked at. A row that says "Nonstop" has no
  // layover by definition, so nothing scraped off it can be one -- which is
  // what lets the code-list rule above stay loose without risking a wrongly
  // hidden nonstop.
  if (stops === 0) return { verdict: "keep", layovers: [], usCodes: [], stops };

  const codes = detourLayoverCodesIn(text);
  for (const e of endpoints) codes.delete(e);
  for (const c of detourCurrencyCodesIn(text)) codes.delete(c);

  const layovers = [...codes];
  const usCodes = layovers.filter((c) => DETOUR_US_AIRPORTS.has(c));

  // A positively identified US layover settles the row on its own. Whether the
  // other stops were readable doesn't matter -- one is enough to hide.
  if (usCodes.length) return { verdict: "hide", layovers, usCodes, stops };

  if (stops === null) {
    // No stop count to check against. Trust a row that named its connections;
    // don't trust one that named nothing.
    return layovers.length
      ? { verdict: "keep", layovers, usCodes: [], stops }
      : { verdict: "unknown", reason: "no stop count and no layovers read", layovers, usCodes: [], stops };
  }

  // Every stop accounted for, none of them US.
  if (layovers.length >= stops) return { verdict: "keep", layovers, usCodes: [], stops };

  return {
    verdict: "unknown",
    reason: `read ${layovers.length} of ${stops} stops`,
    layovers,
    usCodes: [],
    stops,
  };
}

/** Rows say how many stops they have. Nonstop counts — it still needs judging. */
const DETOUR_STOPS_RE = /\bstops?\b|\bnonstop\b|\bdirect\b/i;

/** Does this element read like a single flight result? */
function detourLooksLikeResult(el) {
  const t = el.innerText || "";
  if (t.length < 20 || t.length > 600) return false;
  return DETOUR_PRICE_RE.test(t) && DETOUR_STOPS_RE.test(t);
}

/**
 * Find result rows under a broad selector without paying for it.
 *
 * The tag a row is built from is not stable: Google renders the first leg as
 * <li> and other lists (the return leg, after an outbound is chosen) as plain
 * divs, which is why an li-only lookup reports "no results detected yet" on
 * half the funnel. So the selector has to be wide.
 *
 * Wide is expensive, though: detourLooksLikeResult reads innerText, and
 * innerText forces layout, so calling it on every div on the page would be slow.
 * textContent needs no layout, so it prefilters first and only survivors are
 * measured properly.
 *
 * The prefilter matches on LOOSE patterns, never the strict ones. textContent
 * concatenates fields with no separator -- "1 stop" followed by "11 hr" becomes
 * "1 stop11 hr" -- which destroys the word boundaries \b depends on, so the
 * strict regexes reject real rows here. A prefilter that drops a genuine row is
 * invisible and unfixable downstream; one that lets extra rows through just
 * costs an innerText read that the strict check then rejects. So it errs wide.
 */
const DETOUR_STOPS_LOOSE_RE = /stop|nonstop|direct/i;
const DETOUR_PRICE_LOOSE_RE = /[$£€¥₹₩]\s?\d|[A-Z]{3}\s?\d/;

function detourCandidates(selector) {
  const out = [];
  for (const el of document.querySelectorAll(selector)) {
    const t = el.textContent || "";
    if (t.length < 20 || t.length > 1200) continue;
    if (!DETOUR_STOPS_LOOSE_RE.test(t) || !DETOUR_PRICE_LOOSE_RE.test(t)) continue;
    out.push(el);
  }
  return out.filter(detourLooksLikeResult);
}

/**
 * Innermost matching elements only — otherwise a container wrapping the whole
 * result list also matches and hiding it would blank the page.
 */
function detourInnermost(candidates) {
  const set = new Set(candidates);
  return candidates.filter((el) => !candidates.some((o) => o !== el && set.has(o) && el.contains(o)));
}

const DETOUR_US_ATTR = "data-detour-us";

/**
 * Judge rows we haven't seen before, recording the verdict on the element.
 *
 * The verdict must be cached rather than recomputed: hiding a row sets
 * display:none, and innerText of a display:none element is "" — so a hidden row
 * can never be re-read. Re-deriving each pass would lose every row the moment it
 * was hidden, breaking the reveal toggle and drifting the counts.
 */
function detourScan(site) {
  const fresh = site.findRows().filter((el) => !el.hasAttribute(DETOUR_MARK));
  for (const row of detourInnermost(fresh)) {
    // detourInnermost only dedupes within this batch. A container wrapping rows
    // judged on an earlier pass has no unjudged sibling to lose to, so it would
    // be marked as a row itself and inflate the badge's count.
    if (row.querySelector(`[${DETOUR_MARK}]`)) continue;
    const { verdict, usCodes } = detourJudgeRow(row.innerText || "", site.endpointsHint());
    row.setAttribute(DETOUR_MARK, verdict);
    if (usCodes && usCodes.length) row.setAttribute(DETOUR_US_ATTR, usCodes.join(","));
  }
}

function detourApply(site, { enabled, reveal }) {
  detourScan(site);

  // Drive display off the cached verdicts, so hidden rows stay addressable.
  const judged = document.querySelectorAll(`[${DETOUR_MARK}]`);
  const usHits = new Set();
  let hidden = 0;
  let unread = 0;

  for (const row of judged) {
    const verdict = row.getAttribute(DETOUR_MARK);
    if (verdict === "hide") {
      hidden++;
      const codes = row.getAttribute(DETOUR_US_ATTR);
      if (codes) codes.split(",").forEach((c) => usHits.add(c));
    } else if (verdict === "unknown") {
      // Left on screen, but counted: the badge says so rather than letting a
      // row the parser couldn't finish reading pass as verified clean.
      unread++;
    }
    row.classList.toggle(DETOUR_HIDDEN_CLASS, enabled && !reveal && verdict === "hide");
  }

  return { scanned: judged.length, hidden, unread, usHits: [...usHits] };
}

/**
 * The searched route, read once per URL from anywhere on the page. Used as the
 * endpoint fallback for rows that don't state their own pair. Cached because it
 * scans the whole document; invalidated when the URL changes, since the site
 * rewrites the URL when the search changes.
 */
let _detourRouteCache = { href: null, value: null };
function detourPageRoute() {
  if (_detourRouteCache.href === location.href) return _detourRouteCache.value;
  const m = ROUTE_PAIR_RE.exec(document.body ? document.body.innerText : "");
  _detourRouteCache = { href: location.href, value: m ? [m[1], m[2]] : null };
  return _detourRouteCache.value;
}
