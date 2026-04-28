# sambarbeau.com

Personal site. Plain static HTML/CSS/JS — no build step.

## Pages
- `index.html` — bio
- `projects.html` — project list
- `travel.html` — interactive 3D globe (uses [globe.gl](https://globe.gl))

## Edit your travel locations
Open `travel.js` and edit the `LOCATIONS` array at the top.

## Local preview
```sh
python3 -m http.server 8000
```
Then open http://localhost:8000.

## Deploy
Hosted on Cloudflare Pages, auto-deployed from `main`.
