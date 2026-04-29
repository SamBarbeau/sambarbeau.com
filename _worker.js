// Cloudflare Pages Advanced Mode worker.
// Proxies sambarbeau.com/<path>/* to per-project *.pages.dev URLs while
// keeping sambarbeau.com in the user's URL bar. Free tier; runs at the edge.
//
// Anything that doesn't match a proxy prefix falls through to the static
// assets of this Pages project (env.ASSETS).

const PROXIES = [
  { prefix: '/qr',        upstream: 'https://qr-code-ex8.pages.dev'        },
  { prefix: '/constants', upstream: 'https://constants-explorer.pages.dev' },
  { prefix: '/color',     upstream: 'https://color-game-web.pages.dev'     },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = PROXIES.find(p => url.pathname === p.prefix || url.pathname.startsWith(p.prefix + '/'));

    if (!match) return env.ASSETS.fetch(request);

    // Strip the prefix; "/qr" or "/qr/" both map to upstream root.
    let rest = url.pathname.slice(match.prefix.length);
    if (rest === '' || rest === '/') rest = '/';

    const upstream = new URL(match.upstream + rest + url.search);
    const upstreamReq = new Request(upstream.toString(), request);
    upstreamReq.headers.set('Host', upstream.host);

    const resp = await fetch(upstreamReq);

    // Rewrite redirects so they stay on sambarbeau.com.
    const loc = resp.headers.get('Location');
    if (loc) {
      const newHeaders = new Headers(resp.headers);
      try {
        const locUrl = new URL(loc, upstream);
        if (locUrl.host === upstream.host) {
          newHeaders.set('Location', match.prefix + locUrl.pathname + locUrl.search);
        }
      } catch (_) {}
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: newHeaders });
    }
    return resp;
  },
};
