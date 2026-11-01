# Working on sambarbeau.com

## Project style

- New projects belong to Sam's existing site and should look like the other projects here. Match the muted stone background, dark blue ink, blue links, serif typography, simple borders, and restrained controls in `styles.css` and `photo-scrubber/style.css`.
- Reuse the site logo and the about / projects / travel navigation. Keep project titles and descriptions short. Adapt the content width to the tool; the main personal page's narrow width is not mandatory for interactive projects.
- Put creativity into the interaction and visualization. Do not introduce an unrelated brand, landing page aesthetic, font system, or color palette unless Sam asks.
- Add each new small project to `projects.html` with its public path and a concise description.

## Repositories and hosting

- This repository is the main Cloudflare Pages site. Read `README.md` for the current URL and hosting inventory.
- Default small static HTML/CSS/JS tools to their own directory in this repository, served at `/<project>/`. Photo scrubber and Worldwise use this approach. They use the existing Pages static assets and need no additional Worker proxy, DNS record, hosting provider, or Pages project.
- Projects that need an independent lifecycle or deployment can have sibling repositories. Constants, color, and QR already use this approach: `_worker.js` proxies their public paths to their separate Pages deployments.
- Preserve existing routing. For a new independently hosted project, add its prefix and upstream to `PROXIES`, preserve query strings and redirect rewriting, and canonicalize the bare prefix to a trailing slash. Add a corresponding local mount in `scripts/preview.mjs`.
- Use relative URLs for a project's own assets so it works beneath a path prefix. Root-relative links are appropriate for shared site navigation and shared site assets in this repository. Independently hosted projects should use absolute `https://sambarbeau.com/...` site navigation.
- Keep new projects dependency-light. This repository currently has no build step. Do not add a framework, separate hosted Site, or backend when browser-local code suffices.

## Preview, checks, and publishing

- Run `node scripts/preview.mjs` for the local site at `http://127.0.0.1:8000`. It serves in-repository projects and mounts the existing sibling projects at their public paths.
- Verify a new project's start, play/use, result, and reset flows on desktop and mobile. Keep browser evidence in ignored `output/`.
- Run relevant Node tests with `node --test tests/*.test.mjs`; add meaningful tests for game rules, data integrity, or routing changes, not cosmetic edits.
- Main-site and sibling repositories have their own deployment pipelines. Changes here do not deploy changes in sibling repositories. A push to their configured production branch may publish immediately.
- Distinguish a working local preview from a verified production deployment in the handoff. Never report a public URL as updated without verification.
