# Chrome Web Store submission

Everything the listing form asks for, plus the one item that still needs a
human. Build the upload with `./package.sh` — it runs the tests first and
refuses to package if they fail.

## Still open

- [ ] **Screenshots** — the store wants 1280×800 or 640×400. Take them on a live
      Google Flights result page showing the badge with a real hidden count.

## Listing fields

**Name**
```
detour — hide US layovers
```

**Short description** (132 char limit; this is 119)
```
Hides flight results that connect through the US. Filters what's already on your screen — no account, no network calls.
```

**Category** — Travel

**Language** — English

**Detailed description**
```
detour removes flight itineraries that connect through the United States or its
territories, so you can search normally and only see routes that don't require
transiting US immigration.

It works on the results already on your screen. There is no API, no account, and
no network call of any kind — the fares you see stay the site's own real ones.

A badge in the corner of the results page shows what was hidden and which
airports it hid them for, with a one-click "show them" toggle. The toolbar popup
has an on/off switch and repeats the last count.

WHERE IT WORKS
• Google Flights (google.com, google.ca, google.co.uk)

HOW IT DECIDES
Each result row is read as text. Airport codes sitting in layover position — next
to a connection time, or after "via" — are checked against the 1,271 IATA codes
on US soil, including Puerto Rico, Guam, the US Virgin Islands, American Samoa
and the Northern Mariana Islands, where transit still means clearing US
immigration.

WHEN IT ISN'T SURE, IT SHOWS YOU THE FLIGHT
A row is hidden only when a US layover is positively identified. A row it can't
fully read stays on screen and is counted as "unread" on the badge, so you can
see that it wasn't checked. Showing a US itinerary is an annoyance you can catch
yourself; silently hiding a valid non-US one is invisible and worse.

PRIVACY
No analytics, no telemetry, no accounts, no network requests. The only thing
stored is your on/off preference and the last result count, on your own machine.
Full policy:
https://github.com/kbathmax-ops/detour-extension/blob/main/PRIVACY.md
```

**Privacy policy URL**
```
https://github.com/kbathmax-ops/detour-extension/blob/main/PRIVACY.md
```

## Permission justifications

The store asks you to justify each permission in the form.

**`storage`**
```
Stores two values locally: the user's on/off preference, and the counts from the
most recent pass (rows scanned, hidden, unread, plus the airport codes shown on
the badge) so the toolbar popup can display them. Nothing is transmitted.
```

**Host permissions — google.com/travel/flights**
```
The extension's entire function is to read and hide flight result rows on Google
Flights. It runs content scripts only on its results pages and has no access to
any other site.
```

**Remote code** — none. All code ships in the package.

**Data usage disclosures** — tick nothing. The extension collects no user data of
any category.
