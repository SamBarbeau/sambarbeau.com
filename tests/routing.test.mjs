import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(
  new URL("../_worker.js", import.meta.url),
  "utf8",
);
const { default: worker } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const env = {
  ASSETS: {
    fetch: async (request) => new Response(new URL(request.url).pathname),
  },
};
test("canonical project URL preserves query and method via 308", async () => {
  const response = await worker.fetch(
    new Request("https://sambarbeau.com/constants?test=1"),
    env,
  );
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://sambarbeau.com/constants/?test=1",
  );
});
test("project assets are stripped once, with site credentials removed", async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async (request) => {
    assert.equal(
      request.url,
      "https://constants-explorer.pages.dev/app.js?v=2",
    );
    assert.equal(request.redirect, "manual");
    assert.equal(request.headers.get("cookie"), null);
    assert.equal(request.headers.get("authorization"), null);
    return new Response("ok");
  };
  try {
    const r = await worker.fetch(
      new Request("https://sambarbeau.com/constants/app.js?v=2", {
        headers: { cookie: "private=1", authorization: "Bearer private" },
      }),
      env,
    );
    assert.equal(await r.text(), "ok");
  } finally {
    globalThis.fetch = prior;
  }
});
test("redirects stay under project prefix and preserve hash", async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(null, {
      status: 302,
      headers: { Location: "/next?q=1#part" },
    });
  try {
    const r = await worker.fetch(
      new Request("https://sambarbeau.com/color/index.html"),
      env,
    );
    assert.equal(r.headers.get("Location"), "/color/next?q=1#part");
  } finally {
    globalThis.fetch = prior;
  }
});
test("local project and similar prefixes use static assets", async () => {
  for (const pathname of ["/photo-scrubber/", "/colorful", "/projects.html"]) {
    const r = await worker.fetch(
      new Request("https://sambarbeau.com" + pathname),
      env,
    );
    assert.equal(await r.text(), pathname);
  }
});
test("upstream failure returns a useful 502", async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  try {
    assert.equal(
      (await worker.fetch(new Request("https://sambarbeau.com/qr/"), env))
        .status,
      502,
    );
  } finally {
    globalThis.fetch = prior;
  }
});
