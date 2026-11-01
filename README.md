# sambarbeau.com

Personal site and a few small browser tools. Plain HTML/CSS/JS, with no build step.

## Hosting and URLs

Small projects live under the personal domain. Sither is a separate game and keeps its own subdomain. The Projects page lists the small projects; Sither is accessed directly through its subdomain.

| Public URL | Source | Hosting |
| --- | --- | --- |
| `/`, `/projects`, `/travel` | this repository | main Cloudflare Pages site |
| `/photo-scrubber/` | `photo-scrubber/` in this repository | main site's static assets |
| `/worldwise/` | `worldwise/` in this repository | main site's static assets |
| `/constants/` | sibling `constants-explorer` repository | `constants-explorer.pages.dev` |
| `/color/` | sibling `color-game` repository (`color-game-web` on GitHub) | `color-game-web.pages.dev` |
| `/qr/` | sibling `qr-code` repository | `qr-code-ex8.pages.dev` |
| `sither.sambarbeau.com` | sibling `sither` repository | separate deployment and custom subdomain |

The existing `_worker.js` uses Cloudflare Pages advanced mode to proxy the three independently deployed projects. It strips the project prefix upstream, preserves queries, and rewrites same-origin redirects back to the public project path. Bare project paths redirect to the trailing-slash version so relative scripts, styles, and images resolve correctly. Other paths use `env.ASSETS`, including the photo scrubber. No new DNS record or Pages project is needed for the scrubber.

Keep project assets relative (`app.js`, `img/...`) and site navigation absolute (`https://sambarbeau.com/projects.html`) in independently hosted projects. Avoid root-relative project assets: `/app.js` would point at the personal site's root. Do not add a redirect from an upstream Pages domain back to its proxied public path; that would create a proxy loop.

## Develop and verify

With the sibling repositories checked out beside this one:

```sh
node scripts/preview.mjs
```

Open `http://127.0.0.1:8000`. The preview mounts the sibling projects at their real public prefixes; it does not make external requests. A plain `python3 -m http.server` also works for the main site's static pages, but cannot run the Worker or mount sibling projects.

```sh
node --test tests/routing.test.mjs
```

Check Constants sliders/presets, the color game's idle/playing/result screens at phone and landscape sizes, and scrubber brush/box, effects, undo/redo, compare, and PNG/JPEG export. Browser evidence goes in ignored `output/playwright/`.

## Publishing

The existing repositories are configured to auto-deploy from `main` according to their original deployment setup. Publish Constants and Color in their own repositories and the main site in this repository. Verify the public URLs after the builds finish; changing `_worker.js` alone does not publish changes in sibling projects. The local Cloudflare CLI account may differ from the account owning these Pages projects.

## Photo scrubber

All processing happens in the browser. Supports brush or box selections, pixelation, blur, solid cover, effect strength, brush size, undo/redo, original comparison, and flattened PNG/JPEG downloads. The export does not carry the input file's EXIF metadata. JPEG uses a white background for transparent pixels.

Raster image input only (JPEG, PNG, WebP, AVIF, HEIC/HEIF when the browser can decode it). Inputs are limited to 40 MB; photos are downscaled to at most 4 megapixels and 3,072 pixels on either side for bounded memory use. The editor displays export dimensions and announces resizing. Each tab holds one photo, up to 100 edits. Settings apply to the next selection. Later effects use already-edited pixels so they cannot reveal earlier solid covers. Reloading or replacing the image discards the edit history.

## Worldwise

A browser-local country statistics guessing game at `/worldwise/`. Ten distinct topics are drawn from 100; related topics cannot repeat within a game. Food is capped at two rounds, agricultural production at one, and energy at two. Other subjects are capped at three. Country pairs use a common indicator/year and a gap between 1.25 and 3 times the topic’s curated threshold. These are gameplay thresholds, not statistical significance tests. Values and winner markers are rendered only after a choice; the public dataset and browser logic remain inspectable. Scores stay in browser local storage.

### Data and size

`worldwise/data/world.json` is the compact runtime projection: 100 topics, 10,903 observations, 117 countries. It is about 257 KB raw, 91 KB gzip, or 66 KB Brotli in local compression tests. The maps add about 212 KB raw / 78 KB gzip / 61 KB Brotli. Production transfer size depends on negotiated compression; the local development server deliberately sends uncompressed, uncached responses. No database, per-question network requests, account, runtime package install, or app build is needed. Cloudflare Pages handles static-asset compression and conditional browser caching by default.

Full provenance is retained in `worldwise/data/provenance/`; those files are not fetched by the game. They include source definitions, license terms, derivation inputs, and source configurations. The client file keeps question definitions, source/license links, units, and country values needed for charts. Rebuilding unchanged inputs preserves the content-based edition ID used by shared and daily games. Updating data can change these games; past editions are not archived for challenge replay.

Sources include World Bank WDI, FAOSTAT, Ember, EIA via Our World in Data, Copernicus via Our World in Data, and UNESCO. **Licenses differ by source.** In particular, derived UNESCO site counts retain CC BY-SA 4.0; temperature data retains the Copernicus license. Preserve each metric’s attribution and license when reusing it. A transboundary UNESCO site counts once in each participating country; the separately listed Jerusalem property is not assigned to a country by this game.

Use country codes, never fuzzy name matching. Display names are reviewed in `scripts/worldwise-countries.mjs`. Most topics require at least 90 countries in a common year within the last five completed years. Selected research, healthcare, and crop topics have explicit lower coverage thresholds (never below 60). UNESCO uses a dated current inventory. Missing data stays missing; real zeros stay zero. Source estimates remain estimates. Derived patents and scientific papers per person use exactly matching country/year population denominators, with calculation inputs preserved in provenance.

Food supply measures **availability**, not actual intake. Crop production, livestock headcounts, electricity generation shares, and energy consumption have separate units and definitions. The charts handle signed values, ratios above 100%, and zero-inclusive logarithmic scales. The importer and builder reject malformed values, duplicate observations, wrong units, incomplete pagination, insufficient coverage, and topics with fewer than 100 playable pairs.

### Refresh

Refreshing is a development task, separate from serving the site. Each source importer updates its provenance file. The builder validates all sources and atomically replaces the playable snapshot only when everything passes.

```sh
# World Bank: current APIs; Node + curl.
node scripts/fetch-worldwise-data.mjs

# FAO: official bulk files + UN M49 country codes; Python standard library + curl.
python3 scripts/fetch-worldwise-food.py --countries worldwise/data/world.json --definitions scripts/worldwise-sources/food.json --cache-dir output/worldwise/sources/fao --output worldwise/data/provenance/food.json --refresh

# Energy/climate/heritage: Python + pyarrow, only for this refresh step.
python3 -m venv output/worldwise/refresh-venv
output/worldwise/refresh-venv/bin/pip install pyarrow==26.0.0
output/worldwise/refresh-venv/bin/python scripts/fetch-worldwise-energy.py --countries worldwise/data/world.json --cache-dir output/worldwise/sources/energy --output worldwise/data/provenance/energy.json --fetch

# Assemble the small client dataset, then validate it.
node scripts/build-worldwise-data.mjs
node --test tests/worldwise*.test.mjs
```

FAO supports `--offline` to reproduce a cached download; energy refresh reuses its cache when `--fetch` is omitted. Some OWID catalog URLs intentionally pin a source version: review their versions and metadata when refreshing to newer releases. Raw source caches and temporary Python packages belong in ignored `output/`.

Question wording and rules live in `scripts/worldwise-metrics.mjs`, `scripts/worldwise-sources/`, and the energy importer. Favor direct, recognizable comparisons. The airline-passenger topic was removed because it counted registered airlines, not travel within the country. Older largest-city projections and narrow business-registration ratios were rejected. Don’t add indirect proxies or near-duplicate topics merely to raise the count.

### Silhouettes

`worldwise/data/geography.json` contains simplified Natural Earth 1:50m country outlines and decorative 1:110m globe dots, all public domain. Every playable country has an outline. France shows metropolitan France including Corsica; the US, Norway, Ecuador, and New Zealand use explicit mainland/main-island display extents so distant land does not shrink the familiar outline. Shapes are not drawn to a shared scale and do not define the territorial coverage of statistical sources.

Regenerate with `node scripts/fetch-worldwise-geography.mjs`, or pass a local Natural Earth 50m GeoJSON file as its argument. The importer preserves the existing globe dots. Tests cover France’s extent, date-line handling, and bounds for all 117 silhouettes.

## Travel

Edit the `LOCATIONS` array in `travel.js` to change travel locations. The globe uses globe.gl.
