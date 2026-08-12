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

/** Does this element read like a single flight result? */
function detourLooksLikeResult(el) {
  const t = el.innerText || "";
  if (t.length < 20 || t.length > 600) return false;
  const hasPrice = /[$£€]\s?[\d,]{2,}/.test(t);
  const hasStops = /\bstops?\b|\bnonstop\b|\bdirect\b/i.test(t);
  return hasPrice && hasStops;
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
