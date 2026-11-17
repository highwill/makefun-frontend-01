# make.fun bounties — a fast read-only frontend

![make.fun frontend bounty](https://make.fun/badge/makefun-frontend-01.svg)
[![Rank](https://make.fun/badge/makefun-frontend-01/highwill/makefun-frontend-01/rank.svg)](https://make.fun/c/makefun-frontend-01)
[![Reward](https://make.fun/badge/makefun-frontend-01/highwill/makefun-frontend-01/reward.svg)](https://make.fun/c/makefun-frontend-01)

A small, dependency-free frontend for [make.fun](https://make.fun/c/makefun-frontend-01):
static files under `app/`, vanilla ES modules, one stylesheet, no build step, no
framework. It reads only the public API at `https://make.fun/api` with GET.

## Surfaces

| Route | What it shows |
| --- | --- |
| `#/` | Live bounty board: each bounty's live pot, entry fee, live countdown to its deadline, entries — with search, filters (taking entries, closing within 48h, pot $500+) and sorting (closing soonest, biggest pot, most entries, newest) |
| `#/bounty/<slug>` | The bounty's summary, description and rules, rewards table with the live pot, dates, status, phases, skills |
| `#/bounty/<slug>/leaderboard` | The ranked leaderboard, paginated 25 rows a page, with view tabs (overall / performance) and links from every handle to its profile |
| `#/account/<handle>` | A public profile: record (entered, placed, won, prize money, best placement), site rank, and every public entry with its place, prize and score |

A bounty past its deadline can still read `open` until results publish, so
"still takes entries" is judged by the deadline, not the status alone.

## Performance

- **One request per view, at most.** Responses are cached in memory and in
  `localStorage` (60 s TTL, small bodies only), revalidated with the API's
  minute-bound ETags (`If-None-Match` → 304), and concurrent callers share one
  in-flight request. A `board_pending` (503) is retried once after `Retry-After`.
- **Big boards stay cheap.** Leaderboards are fetched with `?rows=first` — the
  first 10 rows whole, the rest slim — and paginated locally 25 rows at a time,
  so a 13,000-row board never renders 13,000 rows.
- **No rebuilds on a tick.** A 20 s timer updates only the countdown spans
  (`[data-deadline]`); board search/filter/sort repaints only the card list.
- **Small first load.** `index.html` + one CSS file + three small modules;
  no framework, no webfont, no vendored code.

## Run it

```sh
node serve.ts        # serves app/ on http://localhost:8080
```

Open `http://localhost:8080` in a desktop browser. `window.__shotReady` is
`false` while a route loads and `true` once its data has rendered.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `app/` and `screenshots/` to the output directory and writes
`dossier.json` with `buildDossier` from `vendor/makefun-frontend.ts` (the kit's
copy, unchanged). `shots.json` names the three screenshots and the route each
shows. Check the entry with the kit CLI:

```sh
node <kit>/cli/makefun.mjs check --kit <kit> --repo .
```

## Layout

```text
app/
  index.html   shell: header, #view, footer
  main.js      boot: warms the board cache, wires hash routing
  router.js    hash routes, countdown ticker, board toolbar state
  views.js     the four surfaces as pure HTML builders
  api.js       cached, deduped, ETag-revalidated GETs to make.fun/api
  format.js    money, dates, countdowns, safe text
  style.css    the whole design, one file
main.ts        copies app/ + screenshots/ to /output, writes dossier.json
serve.ts       dev server for app/
screenshots/  3 real renders on live data (see shots.json)
```

MIT licensed. Built for the
[make.fun frontend bounty](https://make.fun/c/makefun-frontend-01).
