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
toggle. The toolbar popup has an on/off switch.

## How it decides

Each result row is read as text. The route endpoints are removed, and whatever
all-caps three-letter codes remain are the layovers. If any is on US soil, the
row is hidden.

Two deliberate choices:

**Text, not CSS selectors.** These sites ship obfuscated class names that churn
constantly — selector-based extensions break every few weeks. What stays stable
is that a row prints its layover as an IATA code near the word "stop".

**Fail safe: uncertainty means visible.** A row is hidden only when a US layover
is positively identified. No endpoints found, no codes found, an unparseable
row — all stay on screen. Showing a US itinerary is a visible annoyance you can
catch yourself; silently hiding a valid non-US one is invisible and worse.

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

**Skyscanner — implemented, unverified.** Skyscanner serves automated browsers a
shell that never hydrates, so its row format could not be inspected from here. It
runs on the same engine with endpoints read from the URL
(`/transport/flights/yyz/cai/260911/`). Because of the fail-safe rule the
realistic failure is that it hides *nothing* rather than hides wrongly — but it
needs a real browser to confirm. If the badge reads "no results detected yet" on
a Skyscanner results page, the row detection needs adjusting for their markup.

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
manifest.json          MV3, content scripts scoped to the two sites
src/us-airports.js     generated US IATA set
src/core.js            detection engine — judging, caching, hiding
src/sites.js           per-site adapters (row lookup, endpoint fallback)
src/content.js         bootstrap, badge, observer
src/detour.css         hidden-row rule and badge styling
popup.html/js          on/off switch
test/detect.test.mjs   detection + judgement tests (node test/detect.test.mjs)
```
