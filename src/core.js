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
 * A price, in either form these sites use: a symbol ("$1,914") or an ISO
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

function detourCodesIn(text) {
  return new Set(text.match(CODE_RE) || []);
}

/** Endpoints from a row's own text, if it states them. */
function detourEndpointsFromText(text) {
  const m = ROUTE_PAIR_RE.exec(text);
  return m ? [m[1], m[2]] : null;
}

/**
 * Decide a row's fate.
 * Returns { verdict: "hide" | "keep" | "unknown", usCodes, layovers }.
 */
function detourJudgeRow(text, endpointsHint) {
  const endpoints = detourEndpointsFromText(text) || endpointsHint;
  if (!endpoints) return { verdict: "unknown", reason: "no endpoints" };

  const codes = detourCodesIn(text);
  for (const e of endpoints) codes.delete(e);
  for (const c of detourCurrencyCodesIn(text)) codes.delete(c);

  const layovers = [...codes];
  if (!layovers.length) {
    // Nonstop, or a row that simply doesn't name its connection. Either way
    // there is nothing to judge, so it stays.
    return { verdict: "keep", layovers: [], usCodes: [] };
  }

  const usCodes = layovers.filter((c) => DETOUR_US_AIRPORTS.has(c));
  return usCodes.length
    ? { verdict: "hide", layovers, usCodes }
    : { verdict: "keep", layovers, usCodes: [] };
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

  for (const row of judged) {
    const verdict = row.getAttribute(DETOUR_MARK);
    if (verdict === "hide") {
      hidden++;
      const codes = row.getAttribute(DETOUR_US_ATTR);
      if (codes) codes.split(",").forEach((c) => usHits.add(c));
    }
    row.classList.toggle(DETOUR_HIDDEN_CLASS, enabled && !reveal && verdict === "hide");
  }

  return { scanned: judged.length, hidden, usHits: [...usHits] };
}

/**
 * The searched route, read once per URL from anywhere on the page. Used as the
 * endpoint fallback for rows that don't state their own pair. Cached because it
 * scans the whole document; invalidated when the URL changes, since both sites
 * rewrite the URL when the search changes.
 */
let _detourRouteCache = { href: null, value: null };
function detourPageRoute() {
  if (_detourRouteCache.href === location.href) return _detourRouteCache.value;
  const m = ROUTE_PAIR_RE.exec(document.body ? document.body.innerText : "");
  _detourRouteCache = { href: location.href, value: m ? [m[1], m[2]] : null };
  return _detourRouteCache.value;
}
