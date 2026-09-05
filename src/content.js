/**
 * detour — content script entry point.
 *
 * Results on Google Flights re-render constantly (filter changes, lazy loading,
 * price polling), so a single pass is never enough. A debounced MutationObserver
 * re-runs the filter, and the badge reports what happened so the user can tell
 * the difference between "nothing was hidden" and "the parser broke".
 */

const DETOUR_STATE = { enabled: true, reveal: false, last: { scanned: 0, hidden: 0, unread: 0, usHits: [] } };

/* Re-resolved on every pass, never fixed at load.
 *
 * Google Flights is a single-page app: searching from the form moves
 * /travel/flights -> /travel/search with no page load, and the map route moves
 * between /travel/explore and /travel/search the same way. The manifest injects
 * across /travel/*, so the script is present the whole time -- but resolving the
 * site once at startup froze the answer to whichever route the tab happened to
 * open on, and a tab that started anywhere outside a flight route stayed dead
 * for its whole life however the user navigated afterwards. */
let site = detourActiveSite();

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
document.documentElement.setAttribute(DETOUR_INSTANCE_ATTR, DETOUR_INSTANCE);

function detourIsCurrentInstance() {
  return document.documentElement.getAttribute(DETOUR_INSTANCE_ATTR) === DETOUR_INSTANCE;
}

/* ---------------------------------------------------------------- *
 * Badge — visible proof of what the extension did
 * ---------------------------------------------------------------- */

let badgeEl = null;
let badgeDot = null;
let badgeLine = null;
let badgeBtn = null;
let lastRender = "";
let observer = null;
let urlPoll = null;

/* The badge's elements are built once and then only have their text updated.
 *
 * They used to be thrown away and rebuilt on every pass, which quietly broke
 * the toggle: a click only fires when mouseup lands on the SAME element that
 * received mousedown, so any pass landing inside the ~100ms a person holds the
 * button down destroyed the element mid-press and the browser produced no
 * click at all. On a page that re-renders as often as Google Flights does,
 * that is a coin flip -- hence having to press the thing several times before
 * anything happened. Keeping the element alive makes a press a press. */
function ensureBadge() {
  if (badgeEl && document.body.contains(badgeEl)) return badgeEl;

  badgeEl = document.createElement("div");
  badgeEl.id = "detour-badge";
  badgeEl.setAttribute("role", "status");

  badgeDot = el("span", "detour-dot");
  badgeLine = el("span", "detour-text");
  badgeBtn = el("button", null, "show them");
  badgeBtn.dataset.action = "reveal";
  badgeBtn.hidden = true;
  badgeEl.append(badgeDot, badgeLine, badgeBtn);

  // Bound to the button itself. Delegating from the badge relied on
  // e.target being the button, which stops being reliable the moment the
  // button gains any child node.
  badgeBtn.addEventListener("click", () => {
    DETOUR_STATE.reveal = !DETOUR_STATE.reveal;
    run();
  });

  document.body.appendChild(badgeEl);
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

  // Nothing changed since the last render? Then don't touch the DOM. Without
  // this the badge rewrote itself on every pass, and since the observer watches
  // the whole document that rewrite was itself a mutation -- the badge kept
  // waking the observer that kept re-rendering the badge.
  const sig = JSON.stringify([DETOUR_STATE.enabled, DETOUR_STATE.reveal, scanned, hidden, unread, usHits]);
  if (sig === lastRender) return;
  lastRender = sig;

  badgeLine.replaceChildren();
  badgeBtn.hidden = true;

  if (!DETOUR_STATE.enabled) {
    badge.className = "detour-off";
    badgeLine.textContent = "detour is off";
    return;
  }
  if (!scanned) {
    // Distinguishes "no results on screen yet" from "we hid nothing".
    badge.className = "detour-idle";
    badgeLine.textContent = "detour · no results detected yet";
    return;
  }

  // Rows the parser could not finish reading. Reported rather than folded into
  // the clean count, because "22 results, none of them US" and "21 plus one I
  // couldn't read" are different claims and only one of them is true.
  const unreadNote = unread ? ` · ${unread} unread` : "";

  if (!hidden) {
    badge.className = "detour-clean";
    badgeLine.appendChild(document.createTextNode(`detour · no US layovers in ${scanned} results`));
    if (unreadNote) badgeLine.appendChild(el("span", "detour-sub", unreadNote));
    return;
  }

  badge.className = "detour-active";
  const via = usHits.slice(0, 4).join(", ") + (usHits.length > 4 ? "…" : "");
  badgeLine.appendChild(el("b", null, String(hidden)));
  badgeLine.appendChild(document.createTextNode(` hidden of ${scanned}`));
  if (via) badgeLine.appendChild(el("span", "detour-sub", ` · via ${via}`));
  if (unreadNote) badgeLine.appendChild(el("span", "detour-sub", unreadNote));

  badgeBtn.textContent = DETOUR_STATE.reveal ? "hide again" : "show them";
  badgeBtn.hidden = false;
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
 * constantly on this site, and an unconditional write would hammer
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
  lastRunAt = Date.now();
  if (!detourIsCurrentInstance()) return detourStandDown();

  site = detourActiveSite();
  if (!site) {
    // On /travel/hotels or similar. Keep the observer running so navigating
    // back into a flight route picks straight back up, but show no badge --
    // "no results detected yet" on a hotels page is a false alarm.
    removeBadge();
    DETOUR_STATE.last = { scanned: 0, hidden: 0, unread: 0, usHits: [] };
    return;
  }

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
  removeBadge();
}

function removeBadge() {
  if (badgeEl && badgeEl.parentNode) badgeEl.remove();
  badgeEl = badgeDot = badgeLine = badgeBtn = null;
  lastRender = "";
}

/* Debounced, but with a ceiling.
 *
 * A plain trailing debounce is starvable: every mutation cleared the pending
 * timer and set a new one, so while a page mutated more often than every 350ms
 * the pass simply never ran. Google Flights polls prices and lazy-loads
 * constantly, and in a harness reproducing that churn the pass went over four
 * seconds without firing once -- new results stayed unfiltered, and a
 * superseded copy of the script never reached the check that retires it.
 *
 * So: still coalesce bursts, but never let more than MAX_WAIT pass without a
 * run while mutations are arriving. */
const DETOUR_DEBOUNCE_MS = 350;
const DETOUR_MAX_WAIT_MS = 1200;

let timer = null;
let lastRunAt = 0;

function schedule() {
  if (Date.now() - lastRunAt >= DETOUR_MAX_WAIT_MS) return run();
  clearTimeout(timer);
  timer = setTimeout(run, DETOUR_DEBOUNCE_MS);
}

/* ---------------------------------------------------------------- *
 * Boot
 * ---------------------------------------------------------------- */

{
  chrome.storage?.local.get({ enabled: true }, (v) => {
    DETOUR_STATE.enabled = v.enabled !== false;
    run();
  });

  // Mutations confined to the badge are our own render; reacting to them would
  // be a feedback loop. Anything else is the page changing, which we care about.
  observer = new MutationObserver((records) => {
    if (badgeEl && records.every((r) => badgeEl.contains(r.target))) return;
    schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Filter changes rewrite the URL without a navigation.
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
