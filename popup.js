/* Support link. Set this to the real Buy Me a Coffee page; the link stays
   hidden until it is a real URL, so a placeholder can never ship as a dead
   link in a published build. */
const SUPPORT_URL = "";

const support = document.getElementById("support");
if (SUPPORT_URL) support.href = SUPPORT_URL;
else support.hidden = true;

/* ---- on/off ------------------------------------------------------- */

const box = document.getElementById("enabled");
chrome.storage.local.get({ enabled: true }, (v) => (box.checked = v.enabled !== false));
box.addEventListener("change", () => chrome.storage.local.set({ enabled: box.checked }));

/* ---- last pass ----------------------------------------------------- *
 * Mirrors the in-page badge. The content script writes `lastResult` on every
 * pass whose numbers changed; this reads it back.
 *
 * A result older than five minutes is shown as stale rather than as current
 * truth -- otherwise closing the flight tab leaves the popup cheerfully
 * reporting a count for a page that is no longer open.
 * ------------------------------------------------------------------- */

const STALE_AFTER_MS = 5 * 60 * 1000;

const statusEl = document.getElementById("status");
const textEl = document.getElementById("status-text");

function describe(r) {
  if (!r || !r.at) return { cls: "", text: "No results seen yet. Open a flight search." };
  if (Date.now() - r.at > STALE_AFTER_MS) {
    return { cls: "", text: "No recent search. Open a flight search." };
  }
  if (!r.scanned) return { cls: "idle", text: `${r.site || "This page"} · no results detected yet` };

  const unread = r.unread ? ` · ${r.unread} unread` : "";
  if (!r.hidden) {
    return { cls: "clean", text: `No US layovers in ${r.scanned} results${unread}`, where: r.site };
  }
  const via = (r.usHits || []).slice(0, 4).join(", ");
  return {
    cls: "active",
    html: [r.hidden, ` hidden of ${r.scanned}${via ? ` · via ${via}` : ""}${unread}`],
    where: r.site,
  };
}

function render(r) {
  const d = describe(r);
  statusEl.className = "status" + (d.cls ? " " + d.cls : "");
  textEl.replaceChildren();

  if (d.html) {
    // Built node by node rather than with innerHTML — the count is the only
    // styled part and there is no reason to hand markup to a string.
    const b = document.createElement("b");
    b.textContent = String(d.html[0]);
    textEl.append(b, document.createTextNode(d.html[1]));
  } else {
    textEl.textContent = d.text;
  }

  if (d.where) {
    const w = document.createElement("span");
    w.className = "where";
    w.textContent = d.where;
    textEl.appendChild(w);
  }
}

chrome.storage.local.get({ lastResult: null }, (v) => render(v.lastResult));
chrome.storage.onChanged.addListener((c) => {
  if (c.lastResult) render(c.lastResult.newValue);
});
