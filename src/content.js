/**
 * detour — content script entry point.
 *
 * Results on these sites re-render constantly (filter changes, lazy loading,
 * price polling), so a single pass is never enough. A debounced MutationObserver
 * re-runs the filter, and the badge reports what happened so the user can tell
 * the difference between "nothing was hidden" and "the parser broke".
 */

const DETOUR_STATE = { enabled: true, reveal: false, last: { scanned: 0, hidden: 0, unread: 0, usHits: [] } };

const site = detourActiveSite();

/* ---------------------------------------------------------------- *
 * Instance token — newest copy wins
 *
 * Reloading an unpacked extension leaves the previous content script running in
 * any already-open tab and injects a second copy alongside it. Both then drive
 * the same rows from separate `reveal` flags, so the two fight: one hides what
 * the other just revealed, and the toggle appears to work one way only. The
 * user's fix is to close the tab, which they have no way of knowing.
 *
 * So each copy stamps a token on <html> at startup. The stamp is on the DOM,
 * not a variable, because the copies cannot see each other's scope. Whoever
 * stamps last owns the page; any older copy notices on its next pass and shuts
 * itself down. Newest-wins rather than first-wins, since the copy that just
 * loaded is the one carrying the newer code.
 * ---------------------------------------------------------------- */

const DETOUR_INSTANCE_ATTR = "data-detour-instance";
const DETOUR_INSTANCE = Math.random().toString(36).slice(2);
if (site) document.documentElement.setAttribute(DETOUR_INSTANCE_ATTR, DETOUR_INSTANCE);

function detourIsCurrentInstance() {
  return document.documentElement.getAttribute(DETOUR_INSTANCE_ATTR) === DETOUR_INSTANCE;
}

/* ---------------------------------------------------------------- *
 * Badge — visible proof of what the extension did
 * ---------------------------------------------------------------- */

let badgeEl = null;
let observer = null;
let urlPoll = null;

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
  const { scanned, hidden, unread, usHits } = DETOUR_STATE.last;

  badge.replaceChildren();
  badge.appendChild(el("span", "detour-dot"));

  const line = el("span", "detour-text");
  badge.appendChild(line);

  if (!DETOUR_STATE.enabled) {
    badge.className = "detour-off";
    line.textContent = "detour is off";
    return;
  }
  if (!scanned) {
    // Distinguishes "no results on screen yet" from "we hid nothing".
    badge.className = "detour-idle";
    line.textContent = "detour · no results detected yet";
    return;
  }

  // Rows the parser could not finish reading. Reported rather than folded into
  // the clean count, because "22 results, none of them US" and "21 plus one I
  // couldn't read" are different claims and only one of them is true.
  const unreadNote = unread ? ` · ${unread} unread` : "";

  if (!hidden) {
    badge.className = "detour-clean";
    line.appendChild(document.createTextNode(`detour · no US layovers in ${scanned} results`));
    if (unreadNote) line.appendChild(el("span", "detour-sub", unreadNote));
    return;
  }

  badge.className = "detour-active";
  const via = usHits.slice(0, 4).join(", ") + (usHits.length > 4 ? "…" : "");
  line.appendChild(el("b", null, String(hidden)));
  line.appendChild(document.createTextNode(` hidden of ${scanned}`));
  if (via) line.appendChild(el("span", "detour-sub", ` · via ${via}`));
  if (unreadNote) line.appendChild(el("span", "detour-sub", unreadNote));

  const btn = el("button", null, DETOUR_STATE.reveal ? "hide again" : "show them");
  btn.dataset.action = "reveal";
  badge.appendChild(btn);
}

/* ---------------------------------------------------------------- *
 * Publish the last result for the popup
 *
 * The badge lives on the page, so if row detection ever fails badly enough
 * that the badge never mounts, the user has no signal at all that the
 * extension is alive. The popup is that second signal -- it can be opened from
 * the toolbar whatever the page is doing.
 *
 * Written only when the numbers actually change: MutationObserver passes fire
 * constantly on these sites, and an unconditional write would hammer
 * storage.local for no new information.
 * ---------------------------------------------------------------- */

let lastPublished = "";

function publishState() {
  const { scanned, hidden, unread, usHits } = DETOUR_STATE.last;
  const payload = {
    site: site ? site.label : null,
    scanned,
    hidden,
    unread,
    usHits: usHits.slice(0, 8),
    at: Date.now(),
  };
  // `at` is excluded from the comparison, or every pass would look like a change.
  const key = JSON.stringify([payload.site, scanned, hidden, unread, payload.usHits]);
  if (key === lastPublished) return;
  lastPublished = key;
  chrome.storage?.local.set({ lastResult: payload });
}

/* ---------------------------------------------------------------- *
 * Pass
 * ---------------------------------------------------------------- */

function run() {
  if (!site) return;
  if (!detourIsCurrentInstance()) return detourStandDown();
  try {
    DETOUR_STATE.last = detourApply(site, {
      enabled: DETOUR_STATE.enabled,
      reveal: DETOUR_STATE.reveal,
    });
  } catch (err) {
    // Never let a parsing failure break the host page.
    console.warn("[detour] pass failed:", err);
    DETOUR_STATE.last = { scanned: 0, hidden: 0, unread: 0, usHits: [] };
  }
  renderBadge();
  publishState();
}

/** Superseded by a newer copy: release the page and go quiet for good. */
function detourStandDown() {
  if (observer) observer.disconnect();
  if (urlPoll) clearInterval(urlPoll);
  clearTimeout(timer);
  // Leave the rows exactly as they are — the newer copy owns them now, and
  // un-hiding here would flash US layovers back onto the page.
  if (badgeEl && badgeEl.parentNode) badgeEl.remove();
  badgeEl = null;
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

  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Filter changes rewrite the URL without a navigation on both sites.
  let lastUrl = location.href;
  urlPoll = setInterval(() => {
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
