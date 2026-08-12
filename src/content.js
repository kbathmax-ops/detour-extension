/**
 * detour — content script entry point.
 *
 * Results on these sites re-render constantly (filter changes, lazy loading,
 * price polling), so a single pass is never enough. A debounced MutationObserver
 * re-runs the filter, and the badge reports what happened so the user can tell
 * the difference between "nothing was hidden" and "the parser broke".
 */

const DETOUR_STATE = { enabled: true, reveal: false, last: { scanned: 0, hidden: 0, usHits: [] } };

const site = detourActiveSite();

/* ---------------------------------------------------------------- *
 * Badge — visible proof of what the extension did
 * ---------------------------------------------------------------- */

let badgeEl = null;

function ensureBadge() {
  if (badgeEl && document.body.contains(badgeEl)) return badgeEl;
  badgeEl = document.createElement("div");
  badgeEl.id = "detour-badge";
  badgeEl.setAttribute("role", "status");
  document.body.appendChild(badgeEl);
  badgeEl.addEventListener("click", (e) => {
    if (e.target instanceof HTMLElement && e.target.dataset.action === "reveal") {
      DETOUR_STATE.reveal = !DETOUR_STATE.reveal;
      run();
    }
  });
  return badgeEl;
}

/**
 * Built with createElement/textContent rather than innerHTML on purpose:
 * Google Flights enforces Trusted Types, and any innerHTML assignment there
 * throws "This document requires 'TrustedHTML' assignment", which would kill
 * the badge on the main target site.
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderBadge() {
  const badge = ensureBadge();
  const { scanned, hidden, usHits } = DETOUR_STATE.last;

  badge.replaceChildren();
  badge.appendChild(el("span", "detour-dot"));

  if (!DETOUR_STATE.enabled) {
    badge.className = "detour-off";
    badge.appendChild(el("span", null, "detour is off"));
    return;
  }
  if (!scanned) {
    // Distinguishes "no results on screen yet" from "we hid nothing".
    badge.className = "detour-idle";
    badge.appendChild(el("span", null, "detour · no results detected yet"));
    return;
  }
  if (!hidden) {
    badge.className = "detour-clean";
    badge.appendChild(el("span", null, `detour · no US layovers in ${scanned} results`));
    return;
  }

  badge.className = "detour-active";
  const via = usHits.slice(0, 4).join(", ") + (usHits.length > 4 ? "…" : "");
  const line = el("span");
  line.appendChild(el("b", null, String(hidden)));
  line.appendChild(document.createTextNode(` hidden of ${scanned}${via ? ` · via ${via}` : ""}`));
  badge.appendChild(line);

  const btn = el("button", null, DETOUR_STATE.reveal ? "hide again" : "show them");
  btn.dataset.action = "reveal";
  badge.appendChild(btn);
}

/* ---------------------------------------------------------------- *
 * Pass
 * ---------------------------------------------------------------- */

function run() {
  if (!site) return;
  try {
    DETOUR_STATE.last = detourApply(site, {
      enabled: DETOUR_STATE.enabled,
      reveal: DETOUR_STATE.reveal,
    });
  } catch (err) {
    // Never let a parsing failure break the host page.
    console.warn("[detour] pass failed:", err);
    DETOUR_STATE.last = { scanned: 0, hidden: 0, usHits: [] };
  }
  renderBadge();
}

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, 350);
}

/* ---------------------------------------------------------------- *
 * Boot
 * ---------------------------------------------------------------- */

if (site) {
  chrome.storage?.local.get({ enabled: true }, (v) => {
    DETOUR_STATE.enabled = v.enabled !== false;
    run();
  });

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Filter changes rewrite the URL without a navigation on both sites.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      schedule();
    }
  }, 800);

  chrome.storage?.onChanged.addListener((changes) => {
    if (changes.enabled) {
      DETOUR_STATE.enabled = changes.enabled.newValue !== false;
      DETOUR_STATE.reveal = false;
      run();
    }
  });
}
