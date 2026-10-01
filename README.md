# sambarbeau.com

Personal site and a few small browser tools. Plain HTML/CSS/JS, with no build step.

## Hosting and URLs

Small projects live under the personal domain. Sither is a separate game and keeps its own subdomain. The Projects page links to both kinds of project.

| Public URL | Source | Hosting |
| --- | --- | --- |
| `/`, `/projects`, `/travel` | this repository | main Cloudflare Pages site |
| `/photo-scrubber/` | `photo-scrubber/` in this repository | main site's static assets |
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

## Travel

Edit the `LOCATIONS` array in `travel.js` to change travel locations. The globe uses globe.gl.
