# detour — hide US layovers

A browser extension that removes flight itineraries connecting through the US or
its territories, on **Google Flights** and **Skyscanner**.

No API, no account, no network calls. It filters the results already on your
screen, so the fares stay the site's own real ones.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Search a flight on Google Flights or Skyscanner

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

**Text, not CSS selectors.** These sites ship obfuscated class names that churn
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

**Google Flights — verified end to end.** Tested against live results on
YYZ→LIM: 22 rows judged, 9 hidden via DTW, ATL, CLT, MIA and EWR, zero false
positives, and the reveal toggle cycles 9 → 0 → 9 with stable counts.

A later YVR→MEX session in PEN detected nothing at all — the price regex only
knew `$£€`. Fixed, with `test/detect.test.mjs` covering that page's rows, the
symbol-price regression, and all nineteen currency/airport collisions.

**Skyscanner — implemented, still unverified, and now known to be unverifiable
from an automated browser.** Skyscanner answers one with a PerimeterX
interstitial — *"Are you a person or a robot?"* — before any results render.
That is a CAPTCHA, and solving it is not something a tool should do, so the row
format has never been inspected and the adapter in `src/sites.js` is written
blind. Endpoints come from the URL (`/transport/flights/yyz/cai/260911/`), which
is reliable; the row lookup is the unknown.

Because of the fail-safe rule, the realistic failure is that it hides *nothing*
rather than hides wrongly.

**Verifying it takes about thirty seconds in a normal browser**, which is not
blocked. Search a route with US connections, open DevTools → Console, and paste
`test/skyscanner-probe.js`. It runs the real engine against the real page and
prints what it found, including the nearest misses if it found nothing. The
header comment says how to read the output.

## Notes for later

- The badge is built with `createElement`/`textContent`, never `innerHTML`:
  Google Flights enforces Trusted Types and any `innerHTML` assignment throws.
- Verdicts are cached on each row as `data-detour-checked`. They must be —
  hiding sets `display:none`, and `innerText` of a hidden element is `""`, so a
  hidden row can never be re-read.
- Results re-render constantly (filter changes, lazy loading, price polling), so
  a debounced `MutationObserver` re-runs the pass, plus a URL-change poll since
  both sites rewrite the URL without navigating.

## Files

```
manifest.json              MV3, content scripts scoped to the two sites
src/us-airports.js         generated US IATA set
src/core.js                detection engine — judging, caching, hiding
src/sites.js               per-site adapters (row lookup, endpoint fallback)
src/content.js             bootstrap, badge, observer, state publishing
src/detour.css             hidden-row rule and badge styling
popup.html/js              on/off switch and last-pass readout
test/detect.test.mjs       detection + judgement tests (node test/detect.test.mjs)
test/skyscanner-probe.js   console script for verifying Skyscanner by hand
package.sh                 builds the store zip from an allowlist
PRIVACY.md                 privacy policy (required for the store listing)
STORE.md                   listing copy and remaining submission items
design/                    icon sources and the generator — not shipped
```

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
