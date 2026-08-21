"use strict";

const crypto = require("node:crypto");
const ZONE = "America/Santo_Domingo";

function monthlyWindow(referenceNow) {
  const now = new Date(referenceNow);
  if (Number.isNaN(now.valueOf())) throw new Error("referenceNow inválido");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "numeric", day: "numeric"
  }).formatToParts(now).map(p => [p.type, p.value]));
  const year = Number(parts.year), month = Number(parts.month);
  const start = new Date(Date.UTC(year, month - 2, 1, 4, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, 1, 4, 0, 0));
  return { windowStart: start.toISOString(), windowEndExclusive: end.toISOString() };
}

function clean(value) {
  return String(value ?? "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function https(value, host) {
  const s = String(value ?? "").trim();
  if (!/^https:\/\/[^\s<>"']+$/i.test(s)) return null;
  if (host && !(s === "https://" + host || s.startsWith("https://" + host + "/") || s.startsWith("https://" + host + "?"))) return null;
  return s;
}

function normalizeArticle(node, maxChars = 320) {
  const content = clean(node?.content);
  const categories = (node?.categories?.nodes || []).map(c => ({
    id: String(c.databaseId ?? ""), name: clean(c.name), slug: clean(c.slug)
  })).filter(c => c.name);
  const excerpt = clean(node?.excerpt) || content;
  const dependency = clean(node?.opcionesPublicacion?.dependencia?.nodes?.[0]?.name) || null;
  const portalPucmm = Boolean(node?.opcionesPublicacion?.portalPucmm);
  const normalizedDependency = dependency?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return {
    id: node?.databaseId == null ? null : String(node.databaseId),
    title: clean(node?.title),
    publishedAt: node?.date || null,
    url: https(node?.link, "prensa.pucmm.edu.do"),
    excerptText: excerpt.slice(0, maxChars),
    imageUrl: https(node?.featuredImage?.node?.sourceUrl, "prensa.pucmm.edu.do"),
    imageAlt: clean(node?.featuredImage?.node?.altText) || clean(node?.title),
    categories,
    primaryCategory: categories[0] || null,
    campus: clean(node?.opcionesPublicacion?.campus) || null,
    department: dependency,
    portalPucmm,
    segment: normalizedDependency === "rectoria" ? 0 : portalPucmm ? 1 : 2
  };
}

function sortArticles(articles) {
  return [...articles].filter(a => a.id && a.title && a.url && a.publishedAt)
    .sort((a, b) => (a.segment ?? 2) - (b.segment ?? 2) || new Date(b.publishedAt) - new Date(a.publishedAt) || a.id.localeCompare(b.id));
}

function executionKey(month, recipientType, recipientId) {
  return crypto.createHash("sha256").update("allies-monthly|" + month + "|" + recipientType + "|" + recipientId).digest("hex");
}

module.exports = { ZONE, monthlyWindow, clean, https, normalizeArticle, sortArticles, executionKey };
