"use strict";

const http = require("node:http");
const mjml2html = require("mjml");

const PORT = 3000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const server = http.createServer((request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method === "GET" && request.url === "/healthz") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/render") {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  let size = 0;
  const chunks = [];
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) request.destroy(new Error("payload_too_large"));
    else chunks.push(chunk);
  });
  request.on("end", async () => {
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (typeof payload.mjml !== "string" || !payload.mjml.trim()) throw new Error("mjml_required");
      const result = await mjml2html(payload.mjml, { validationLevel: "strict", minify: true, keepComments: false });
      if (!result.html?.trim()) throw new Error("empty_html");
      response.end(JSON.stringify({ html: result.html, errors: result.errors || [] }));
    } catch (error) {
      response.statusCode = error.message === "payload_too_large" ? 413 : 422;
      response.end(JSON.stringify({ error: "render_failed", message: String(error.message).slice(0, 500) }));
    }
  });
  request.on("error", () => {
    if (!response.headersSent) response.statusCode = 400;
    if (!response.writableEnded) response.end(JSON.stringify({ error: "invalid_request" }));
  });
});

server.requestTimeout = 35_000;
server.headersTimeout = 40_000;
server.listen(PORT, "0.0.0.0");
