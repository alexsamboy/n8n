"use strict";

const crypto = require("node:crypto");
const ZONE = "America/Santo_Domingo";
const OFFSET = "-04:00";

function cleanText(value) {
  if (value == null) return null;
  const entities = { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">" };
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, code) => {
      if (code[0] === "#") return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
      return entities[code.toLowerCase()] ?? " ";
    }).replace(/\s+/g, " ").trim() || null;
}

function stripDatelinePrefix(value) {
  const text = cleanText(value);
  if (!text) return text;
  return text.replace(/(^|[.!?…]["”']?\s+)(?:Santo\s+Domingo|Santiago|Rep(?:u|ú)blica\s+Dominicana)\s*,?\s*(?:R\.?\s*D\.?)?\s*[-–—:]+\s*/gi, "$1").trim() || null;
}

function truncateText(value, max = 320) {
  const text = stripDatelinePrefix(value);
  if (!text || text.length <= max) return text;
  const marker = " ...";
  const budget = Math.max(0, max - marker.length);
  const cut = text.slice(0, budget + 1).replace(/\s+\S*$/, "").trim();
  return `${(cut || text.slice(0, budget).trim())}${marker}`.slice(0, max);
}

function httpsUrl(value, allowedHosts = []) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    if (allowedHosts.length && !allowedHosts.includes(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch { return null; }
}

function localWeekday(iso) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short" }).format(new Date(iso));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function fallbackWindow(referenceNow, lastSuccess, mode = "since_last_success", mondayHours = 72, weekdayHours = 24) {
  const end = new Date(referenceNow);
  if (Number.isNaN(end.valueOf())) throw new Error("referenceNow inválido");
  if (mode === "since_last_success" && lastSuccess) {
    const start = new Date(lastSuccess);
    if (Number.isNaN(start.valueOf()) || start >= end) throw new Error("lastSuccess inválido");
    return { windowStart: start.toISOString(), windowEndExclusive: end.toISOString() };
  }
  const hours = localWeekday(end) === 1 ? mondayHours : weekdayHours;
  return { windowStart: new Date(end.valueOf() - hours * 3600000).toISOString(), windowEndExclusive: end.toISOString() };
}

function termName(value) {
  if (typeof value === "string") return cleanText(value);
  return cleanText(value?.nodes?.[0]?.name || value?.edges?.[0]?.node?.name);
}

function normalizeArticle(node, maxChars = 320) {
  const department = termName(node?.opcionesPublicacion?.dependencia);
  const portalPucmm = Boolean(node?.opcionesPublicacion?.portalPucmm);
  const article = {
    id: node?.databaseId == null ? null : String(node.databaseId), title: cleanText(node?.title),
    publishedAt: node?.date || null, url: httpsUrl(node?.link, ["prensa.pucmm.edu.do"]),
    excerptText: truncateText(node?.excerpt || node?.content, maxChars),
    imageUrl: httpsUrl(node?.featuredImage?.node?.sourceUrl, ["prensa.pucmm.edu.do"]),
    imageAlt: cleanText(node?.featuredImage?.node?.altText),
    categories: (node?.categories?.nodes || []).map(x => ({ id: String(x.databaseId || ""), name: cleanText(x.name), slug: cleanText(x.slug) })).filter(x => x.name),
    campus: cleanText(node?.opcionesPublicacion?.campus), department, portalPucmm,
    segment: department?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "rectoria" ? 0 : portalPucmm ? 1 : 2,
  };
  const validDate = article.publishedAt && !Number.isNaN(new Date(article.publishedAt).valueOf());
  return { valid: Boolean(article.id && article.title && validDate && article.url), article };
}

function dedupeSortArticles(values) {
  const map = new Map();
  for (const article of values) {
    const key = article.id || crypto.createHash("sha256").update(`${article.url}|${article.publishedAt}`).digest("hex");
    if (!map.has(key)) map.set(key, article);
  }
  return [...map.values()].sort((a, b) => a.segment - b.segment || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}

function normalizeBanner(node) {
  return { id: String(node?.databaseId || ""), title: cleanText(node?.title),
    imageUrl: httpsUrl(node?.featuredImage?.node?.sourceUrl, ["dia.pucmm.edu.do"]),
    imageAlt: cleanText(node?.featuredImage?.node?.altText) || cleanText(node?.title),
    targetUrl: httpsUrl(node?.newsletter?.enlace), priority: Number(node?.priority ?? node?.prioridad ?? node?.newsletter?.priority ?? node?.newsletter?.prioridad ?? 0),
    activeFrom: node?.newsletter?.inicio || null, activeUntil: node?.newsletter?.fin || null };
}

function selectBanners(nodes, referenceNow) {
  const now = new Date(referenceNow);
  return nodes.map(normalizeBanner).filter(x => x.id && x.title && x.imageUrl && x.targetUrl && (!x.activeFrom || new Date(x.activeFrom) <= now) && (!x.activeUntil || now < new Date(x.activeUntil)))
    .sort((a, b) => b.priority - a.priority || String(b.activeFrom || "").localeCompare(String(a.activeFrom || "")) || a.id.localeCompare(b.id)).slice(0, 2);
}

function interleave(articles, banners) {
  const out = [];
  articles.forEach((article, index) => {
    out.push({ type: "article", value: article });
    if (index === 0 && banners[0]) out.push({ type: "banner", value: banners[0] });
    if (index === 2 && banners[1]) out.push({ type: "banner", value: banners[1] });
    if (index === articles.length - 1 && articles.length < 3 && banners[1]) out.push({ type: "banner", value: banners[1] });
  });
  return out;
}

function executionKey(start, end, group) { return crypto.createHash("sha256").update(`internal-press|${start}|${end}|${group}`).digest("hex"); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

module.exports = { ZONE, OFFSET, cleanText, stripDatelinePrefix, truncateText, httpsUrl, fallbackWindow, normalizeArticle, dedupeSortArticles, normalizeBanner, selectBanners, interleave, executionKey, escapeHtml };
