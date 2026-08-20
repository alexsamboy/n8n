"use strict";

const http = require("node:http");
const mjml2html = require("mjml");
const { version: MJML_VERSION } = require("mjml/package.json");

const PORT = 3000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", body.length);
  response.end(body);
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    sendJson(response, 200, { status: "ok", mjmlVersion: MJML_VERSION });
    return;
  }
  if (request.method !== "POST" || request.url !== "/render") {
    sendJson(response, 404, { error: "not_found" });
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
      sendJson(response, 200, { html: result.html, errors: result.errors || [] });
    } catch (error) {
      const details = typeof error.getErrors === "function" ? error.getErrors().map(({ line, message, tagName, formattedMessage }) => ({ line, message, tagName, formattedMessage })) : [];
      sendJson(response, error.message === "payload_too_large" ? 413 : 422, { error: "render_failed", message: String(error.message).slice(0, 500), details });
    }
  });
  request.on("error", () => {
    if (!response.writableEnded) sendJson(response, 400, { error: "invalid_request" });
  });
});

server.requestTimeout = 35_000;
server.headersTimeout = 40_000;
server.listen(PORT, "0.0.0.0");
