# detour — hide US layovers

A browser extension that removes flight itineraries connecting through the US or
its territories, on **Google Flights**.

No API, no account, no network calls. It filters the results already on your
screen, so the fares stay the site's own real ones.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Search a flight on Google Flights

A badge appears bottom-right showing what was hidden, with a **show them**
toggle. The toolbar popup has an on/off switch and repeats the last count.

To build the Chrome Web Store upload instead: `./package.sh`. It runs the tests
first and packages from an allowlist, so design sources and test files never
ship. `STORE.md` has the listing copy and the two items that still need you.

## How it decides

Each result row is read as text. Codes sitting in **layover position** — with a
duration to their left on the same line (`11 hr 11 min DFW`) or after a
connection word (`via DFW`) — are the layovers. If any is on US soil, the row is
hidden.

Position matters, and an earlier version learned that the hard way by taking
every all-caps triplet on the row. 1,271 US IATA codes is a wide net:

- **LOT** is LOT Polish Airlines, and also Lottsburg, Virginia. A Warsaw
  connection hid itself as a US layover.
- **PDT** is Pacific Daylight Time, and also Pendleton, Oregon. Any row whose
  departure time carried a timezone hid itself.

Both are covered by tests now.

Three deliberate choices:

**Text, not CSS selectors.** Flight sites ship obfuscated class names that churn
constantly — selector-based extensions break every few weeks. What stays stable
is that a row prints its layover as an IATA code near the word "stop".

**Fail safe: uncertainty means visible.** A row is hidden only when a US layover
is positively identified. No endpoints found, no codes found, an unparseable
row — all stay on screen. Showing a US itinerary is a visible annoyance you can
catch yourself; silently hiding a valid non-US one is invisible and worse.

**"Unread" is a third answer, and it is counted.** Reading one non-US layover off
a two-stop row proves nothing about the second stop, so calling that row clean
would be false confidence — the same silent failure as a phantom layover, in
reverse. Rows say how many stops they have; when fewer layovers than that were
read, the verdict is `unknown`. On screen it looks the same as `keep` (the row
stays), but the badge reports it: `9 hidden of 22 · 2 unread`. A parser that
can't finish a row now says so instead of quietly passing it.

## Prices, and why they matter

A row is recognised as a result partly by containing a price. Google renders
that price in the viewer's regional format — `$1,914` in some sessions,
`PEN 1,914` in others — so the detector accepts both a currency **symbol** and a
three-letter currency **code**.

Accepting the code form creates a trap. Nineteen ISO 4217 codes are also US IATA
codes: **HNL** (Honduran lempira / Honolulu), **PLN** (Polish zloty), plus BBD,
BIF, BRL, CLP, CNY, DKK, ETB, HUF, LRD, MYR, RWF, SBD, SLE, SZL, TOP, TTD, WST.
Left unhandled, the currency token on every row reads as a US layover and the
extension hides the entire page. So any three-letter code *immediately followed
by a number* is stripped before layovers are judged — that's a price, not an
airport.

The separator there is a literal space, never `\s`. `innerText` joins fields
with newlines, and `\s` would read `...11 hr 11 min DFW\n380 kg CO2e` as the
price `DFW 380` and strip a real layover.

## Airport data

`src/us-airports.js` — 1,271 IATA codes on US soil, generated from
[OpenFlights](https://github.com/jpatokal/openflights) `airports.dat` filtered by
country. Includes the territories where transit still means clearing US
immigration: Puerto Rico, Guam, US Virgin Islands, American Samoa, Northern
Mariana Islands.

Eight of those codes are English words (AND, CAR, DAY, NEW, OFF, SEE, SUN, TOP).
They are kept — DAY and SUN are real connecting airports — and collisions are
avoided by matching **all-caps** tokens only, since prose renders "day"/"new".

## Status

**Three bugs found from a live YYZ→LTO screenshot** (map/Explore route, dark
theme) where the badge never appeared and nothing was hidden. All three are
fixed and covered by tests:

1. **The content script never loaded.** Results do not live at
   `/travel/flights` — that path is only the search form. Searching moves to
   `/travel/search`, and the map route sits at `/travel/explore`. The manifest
   matched `/travel/flights*` alone, so reaching results any way other than
   typing into that one form left the extension entirely absent. Now matches
   `/travel/*`, with `sites.js` deciding what is a flight route.
2. **The site was resolved once at load.** Google Flights is a single-page app,
   so a tab that opened outside a flight route stayed dead for its whole life
   however the user navigated afterwards. Now re-resolved on every pass.
3. **Multi-stop rows read as zero layovers.** Google prints a layover duration
   beside the code only on a *one*-stop row; from two stops up it drops the
   durations and prints a bare comma list in its own column (`ORD, PHX`). The
   layover-position rule only looked for durations, so every multi-stop row on
   the page — most of them — came back `unknown`, including three routing
   through ORD and PHX. A code-list line now counts as a layover position.

**Google Flights — verified end to end.** Tested against live results on
YYZ→LIM: 22 rows judged, 9 hidden via DTW, ATL, CLT, MIA and EWR, zero false
positives, and the reveal toggle cycles 9 → 0 → 9 with stable counts.

A later YVR→MEX session in PEN detected nothing at all — the price regex only
knew `$£€`. Fixed, with `test/detect.test.mjs` covering that page's rows, the
symbol-price regression, and all nineteen currency/airport collisions.

## Notes for later

- The badge is built with `createElement`/`textContent`, never `innerHTML`:
  Google Flights enforces Trusted Types and any `innerHTML` assignment throws.
- Verdicts are cached on each row as `data-detour-checked`. They must be —
  hiding sets `display:none`, and `innerText` of a hidden element is `""`, so a
  hidden row can never be re-read.
- Results re-render constantly (filter changes, lazy loading, price polling), so
  a debounced `MutationObserver` re-runs the pass, plus a URL-change poll since
  the site rewrites the URL without navigating.

## Files

```
manifest.json              MV3, content scripts scoped to Google Flights
src/us-airports.js         generated US IATA set
src/core.js                detection engine — judging, caching, hiding
src/sites.js               site adapter (row lookup, endpoint fallback)
src/content.js             bootstrap, badge, observer, state publishing
src/detour.css             hidden-row rule and badge styling
popup.html/js              on/off switch and last-pass readout
test/detect.test.mjs       detection + judgement tests (node test/detect.test.mjs)
test/harness/index.html    live-DOM harness for badge and toggle behaviour
package.sh                 builds the store zip from an allowlist
PRIVACY.md                 privacy policy (required for the store listing)
STORE.md                   listing copy and remaining submission items
design/                    icon sources and the generator — not shipped
```

## The harness

`test/detect.test.mjs` covers judgement, which is pure text. It cannot cover the
failure modes that only exist in a live DOM — and two of those made the toggle
feel broken. `test/harness/index.html` loads the real `core.js`, `sites.js` and
`content.js` against fake result rows so both can be reproduced:

```bash
python3 -m http.server 8733     # from the repo root
# open http://localhost:8733/test/harness/index.html, then in the console:
await detourCheckPress()        # toggle survives a pass landing mid-press
await detourCheckStarvation()   # passes keep running while the page churns
```

**The toggle needed several presses.** A click only fires when mouseup lands on
the *same element* that received mousedown. The badge was rebuilt wholesale on
every pass, so any pass landing inside the ~100 ms a person holds the button
destroyed the element mid-press and the browser produced no click at all. On a
page that re-renders as often as Google Flights, that is a coin flip. The badge
now updates its text in place and keeps the button alive.

**Passes could stop happening entirely.** The 350 ms debounce was a plain
trailing one: every mutation cleared the pending timer and set a new one, so
while the page mutated faster than that, the pass never ran. Measured in the
harness under continuous churn, it went over four seconds without firing once —
new results stayed unfiltered, and a superseded copy of the script never reached
the check that retires it. There is now a 1.2 s ceiling: bursts still coalesce,
but a pass can no longer be starved.

The badge also woke the observer that re-rendered the badge. It now skips
mutations confined to its own subtree, and skips the render entirely when
nothing changed.

## Design notes

**The badge is a light pill on purpose.** Google Flights ships both a light and
a dark theme and the user can switch either at any time, so the badge has to
stand apart from a background it cannot predict. The old dark badge vanished
into the dark theme. A light one pops against dark, and against light it is held
apart by three things that don't depend on the surface colour: a hairline
border, a real drop shadow, and a saturated status dot. One treatment covers
both themes instead of two that each fail on the other.

**The toolbar icon is `DTR`, not the wordmark.** The script "detour" wordmark
collapses into a smudge at 16px — `design/preview-compare.png` is the comparison
that settled it. Three condensed capitals on the brand blue still resolve in a
pinned toolbar slot. `design/make-icons.py` regenerates the set.
