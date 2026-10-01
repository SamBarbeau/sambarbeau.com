// Existing projects keep independent Pages deployments. New local projects
// (such as /photo-scrubber/) are served directly by this site's ASSETS binding.
export const PROXIES = [
  { prefix: "/qr", upstream: "https://qr-code-ex8.pages.dev" },
  { prefix: "/constants", upstream: "https://constants-explorer.pages.dev" },
  { prefix: "/color", upstream: "https://color-game-web.pages.dev" },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = PROXIES.find(
      (p) =>
        url.pathname === p.prefix || url.pathname.startsWith(p.prefix + "/"),
    );
    if (!match) return env.ASSETS.fetch(request);

    // A directory URL is essential for relative scripts, styles and images.
    if (url.pathname === match.prefix) {
      url.pathname += "/";
      return Response.redirect(url.toString(), 308);
    }
    const upstream = new URL(match.upstream);
    upstream.pathname = url.pathname.slice(match.prefix.length);
    upstream.search = url.search;
    const headers = new Headers(request.headers);
    headers.delete("host");
    // These public static projects do not need cookies or site credentials.
    headers.delete("cookie");
    headers.delete("authorization");
    const upstreamRequest = new Request(
      upstream,
      new Request(request, { headers, redirect: "manual" }),
    );
    let response;
    try {
      response = await fetch(upstreamRequest);
    } catch {
      return new Response(
        "This project is temporarily unavailable. Please try again.",
        {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }
    const location = response.headers.get("Location");
    if (!location) return response;
    const target = new URL(location, upstream);
    const responseHeaders = new Headers(response.headers);
    if (target.origin === upstream.origin) {
      responseHeaders.set(
        "Location",
        match.prefix + target.pathname + target.search + target.hash,
      );
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
