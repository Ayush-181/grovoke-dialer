import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

// Serve only the exported HTML. Never expose the checkout or any credentials.
const previewPath = resolve(".smoke-work/callboard-preview.html");
await readFile(previewPath);
const server = createServer(async (request, response) => {
  if (request.method !== "GET" || request.url?.split("?")[0] !== "/remake/index.html") {
    response.writeHead(404);
    response.end();
    return;
  }
  let html;
  try {
    html = await readFile(previewPath);
  } catch {
    response.writeHead(503);
    response.end("Export the preview again, then refresh.");
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
});
server.listen(4175, "127.0.0.1", () =>
  console.log("Standalone preview ready on port 4175, path /remake/index.html"),
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
