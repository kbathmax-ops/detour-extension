# Privacy policy — detour

**Last updated: 1 September 2026**

detour collects nothing, sends nothing, and stores nothing about you.

## What is collected

Nothing. There is no analytics, no telemetry, no crash reporting, no
identifiers, and no account.

## What leaves your browser

Nothing. detour makes no network requests of any kind. It has no host
permissions to any server, no background service worker, and no remote code.
Every airport code it checks against ships inside the extension as a static
file (`src/us-airports.js`).

You can verify this: open DevTools → Network on a flight results page and
filter by the extension's origin. There is no traffic, because there is nowhere
for it to go.

## What is stored

Two values, in `chrome.storage.local`, on your own machine only:

| Key | Contents | Why |
| --- | --- | --- |
| `enabled` | `true` / `false` | Remembers the on/off switch between sessions. |
| `lastResult` | Counts from the most recent pass: how many rows were scanned, hidden, and unread, plus up to eight airport codes such as `ATL`, and a timestamp. | Lets the toolbar popup show what happened on the page. |

`lastResult` holds no route, no dates, no prices, no passenger details, and no
URL — only counts and airport codes. It is overwritten by the next search and
never transmitted. Uninstalling the extension deletes both values.

## What is read

detour reads the visible text of flight result rows on the pages listed below,
in your browser, to decide which rows connect through the US. That text is
examined and discarded within the same function call. It is never stored,
copied, or sent.

The extension runs only on:

- `https://www.google.com/travel/*` (and `.ca`, `.co.uk`)

Google Flights is a single-page app whose results live at `/travel/search` and
`/travel/explore`, not `/travel/flights`, so the match has to cover `/travel/*`
to see a results page at all. The extension only acts on flight routes; on any
other `/travel/` page it does nothing and shows no badge.

It does not run on any other site, and it has no permission to.

## Permissions

`storage` is the only permission requested, for the two values above.

## Changes

Any future version that collects or transmits anything would require new
permissions, which Chrome shows you before the update installs. This policy
will be updated in the same commit as any such change.

## Contact

Open an issue on the repository.
