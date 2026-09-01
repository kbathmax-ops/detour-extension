/* Support link. Set this to the real Buy Me a Coffee page; the link stays
   hidden until it is a real URL, so a placeholder can never ship as a dead
   link in a published build. */
const SUPPORT_URL = "";

const support = document.getElementById("support");
if (SUPPORT_URL) support.href = SUPPORT_URL;
else support.hidden = true;

const box = document.getElementById("enabled");
chrome.storage.local.get({ enabled: true }, (v) => (box.checked = v.enabled !== false));
box.addEventListener("change", () => chrome.storage.local.set({ enabled: box.checked }));
