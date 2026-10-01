// Local preview mirrors the production project prefixes without network access.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mounts = {
  "/constants": path.resolve(root, "../constants-explorer"),
  "/color": path.resolve(root, "../color-game"),
  "/qr": path.resolve(root, "../qr-code"),
};
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    let base = root,
      relative = decodeURIComponent(url.pathname);
    const prefix = Object.keys(mounts).find(
      (p) => relative === p || relative.startsWith(p + "/"),
    );
    if (prefix) {
      base = mounts[prefix];
      relative = relative.slice(prefix.length) || "/";
      if (url.pathname === prefix) {
        res.writeHead(308, { Location: prefix + "/" + url.search });
        res.end();
        return;
      }
    }
    let file = path.resolve(base, "." + relative);
    if (!file.startsWith(base + path.sep) && file !== base) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          res.writeHead(308, { Location: url.pathname + "/" + url.search });
          res.end();
          return;
        }
        file = path.join(file, "index.html");
      }
      const content = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(8000, "127.0.0.1", () =>
    console.log("Preview: http://127.0.0.1:8000"),
  );
