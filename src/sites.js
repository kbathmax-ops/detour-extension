/**
 * Per-site adapters.
 *
 * Each supplies only what the shared engine can't infer: where the result rows
 * live, and a fallback source for the route endpoints when a row doesn't state
 * them itself.
 */

/** Google Flights states endpoints on every row ("YYZ–CAI"), verified live. */
const DETOUR_SITE_GOOGLE = {
  id: "google-flights",
  label: "Google Flights",
  test: () =>
    /(^|\.)google\.[a-z.]+$/.test(location.hostname) &&
    location.pathname.startsWith("/travel/flights"),
  findRows: () => [...document.querySelectorAll("li")].filter(detourLooksLikeResult),
  // Google ships two row formats: one writes "YYZ–LIM", the other "YYZToronto
  // Pearson". Rows in the second form state no pair, so fall back to the pair
  // found anywhere on the page — every row shares the one searched route.
  endpointsHint: () => detourPageRoute(),
};

/**
 * Skyscanner. Its results DOM could not be inspected — it serves automated
 * browsers a shell that never hydrates — so the row lookup is intentionally
 * generic and the engine's fail-safe rule carries the risk: anything it cannot
 * parse stays visible. Endpoints come from the URL, which is reliable:
 *   /transport/flights/yyz/cai/260911/
 */
const DETOUR_SITE_SKYSCANNER = {
  id: "skyscanner",
  label: "Skyscanner",
  test: () =>
    /(^|\.)skyscanner\.[a-z.]+$/.test(location.hostname) &&
    location.pathname.includes("/transport/flights/"),
  findRows: () =>
    [...document.querySelectorAll("li, article, section, div")].filter(detourLooksLikeResult),
  endpointsHint: () => {
    const m = location.pathname.match(/\/transport\/flights\/([a-z0-9]{3})\/([a-z0-9]{3})\//i);
    return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : detourPageRoute();
  },
};

const DETOUR_SITES = [DETOUR_SITE_GOOGLE, DETOUR_SITE_SKYSCANNER];

function detourActiveSite() {
  return DETOUR_SITES.find((s) => s.test()) || null;
}
