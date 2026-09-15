import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8092);

const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".svg", "image/svg+xml"],
]);

function sendText(response, status, message) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") return sendText(response, 405, "Method not allowed");

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    return sendText(response, 400, "Bad request");
  }

  let filePath = path.resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return sendText(response, 403, "Forbidden");

  try {
    let fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      fileStat = await stat(filePath);
    }
    if (!fileStat.isFile()) throw new Error("Not a file");

    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store", // a dev server should never serve yesterday's file
      "Content-Type": mime.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    };

    // Audio seeking needs byte ranges, Safari especially.
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || "");
    if (request.headers.range) {
      const size = fileStat.size;
      const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2] || 0));
      const end = match?.[2] && match?.[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (!match || start > end || start >= size) {
        response.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` });
        return response.end();
      }
      response.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}` });
      if (request.method === "HEAD") return response.end();
      return createReadStream(filePath, { start, end }).pipe(response);
    }

    response.writeHead(200, { ...headers, "Content-Length": fileStat.size });
    if (request.method === "HEAD") return response.end();
    createReadStream(filePath).pipe(response);
  } catch {
    sendText(response, 404, "Not found");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`SUG Packs ready at http://localhost:${port}/`);
});
