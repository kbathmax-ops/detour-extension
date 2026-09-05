/**
 * Per-site adapters.
 *
 * Each supplies only what the shared engine can't infer: where the result rows
 * live, and a fallback source for the route endpoints when a row doesn't state
 * them itself. Google Flights is the only site currently supported.
 */

/**
 * Google Flights states endpoints on every row ("YYZ–CAI"), verified live.
 *
 * Results do not live under /travel/flights. That path is only the search form;
 * the moment a search runs, Google moves to /travel/search, and the map route
 * ("Explore") sits at /travel/explore. Matching /travel/flights alone meant the
 * script loaded on the form and never on a page with results on it -- reaching
 * results any way other than typing into that one form left the extension
 * entirely absent, with no badge and nothing hidden.
 *
 * The manifest now injects across /travel/*, which is wider than the flight
 * routes, so this test is what actually decides whether to run. Hotels and
 * things are matched by the manifest and rejected here.
 */
const DETOUR_FLIGHT_PATHS = ["/travel/flights", "/travel/search", "/travel/explore"];

const DETOUR_SITE_GOOGLE = {
  id: "google-flights",
  label: "Google Flights",
  test: () =>
    /(^|\.)google\.[a-z.]+$/.test(location.hostname) &&
    DETOUR_FLIGHT_PATHS.some((p) => location.pathname.startsWith(p)),
  // Not li-only: the first-leg list is <li>, but the return-leg list Google
  // renders after an outbound is chosen is not, and an li-only lookup finds
  // nothing there. detourInnermost keeps a wrapper from being hidden as a row.
  findRows: () => detourCandidates('li, [role="listitem"], article, div'),
  // Google ships two row formats: one writes "YYZ–LIM", the other "YYZToronto
  // Pearson". Rows in the second form state no pair, so fall back to the pair
  // found anywhere on the page — every row shares the one searched route.
  endpointsHint: () => detourPageRoute(),
};

const DETOUR_SITES = [DETOUR_SITE_GOOGLE];

function detourActiveSite() {
  return DETOUR_SITES.find((s) => s.test()) || null;
}
