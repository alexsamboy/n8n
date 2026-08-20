"use strict";

const crypto = require("node:crypto");

const ZONE = "America/Santo_Domingo";
const OFFSET = "-04:00";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function localParts(reference) {
  const date = reference instanceof Date ? reference : new Date(reference);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid reference date");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
}

function calendarShift(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function midnight(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T00:00:00${OFFSET}`;
}

function weekday(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function digestWindow(reference) {
  const today = localParts(reference);
  const dow = weekday(today);
  let digestType;
  let start;
  let end;

  if (dow === 0) return { digestType: "none", shouldSend: false, referenceDate: midnight(today), timezone: ZONE };

  if (dow === 1 && today.day <= 7) {
    digestType = "monthly";
    start = { year: today.year, month: today.month, day: 1 };
    end = today.month === 12
      ? { year: today.year + 1, month: 1, day: 1 }
      : { year: today.year, month: today.month + 1, day: 1 };
  } else if (dow === 1) {
    digestType = "weekly";
    start = today;
    end = calendarShift(today, 7);
  } else if (dow >= 2 && dow <= 6) {
    digestType = "daily";
    start = today;
    end = calendarShift(today, 1);
  } else {
    return { digestType: "none", shouldSend: false, referenceDate: midnight(today), timezone: ZONE };
  }

  return {
    digestType,
    shouldSend: true,
    windowStart: midnight(start),
    windowEndExclusive: midnight(end),
    referenceDate: midnight(today),
    timezone: ZONE,
  };
}

function parseClock(value) {
  if (!value) return { hour: 0, minute: 0 };
  const text = String(value).trim().toLowerCase();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) throw new Error(`Invalid clock: ${text}`);
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (minute > 59 || hour > 23 || (match[3] && (hour < 1 || hour > 12))) throw new Error(`Invalid clock: ${text}`);
  if (match[3] === "am" && hour === 12) hour = 0;
  if (match[3] === "pm" && hour !== 12) hour += 12;
  return { hour, minute };
}

function combineWpDateTime(dateValue, timeValue) {
  if (!dateValue) return null;
  const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error("Invalid WordPress date");
  const clock = parseClock(timeValue);
  return `${match[1]}-${match[2]}-${match[3]}T${pad(clock.hour)}:${pad(clock.minute)}:00${OFFSET}`;
}

function cleanText(value) {
  if (value == null) return null;
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function safeHttps(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeActivity(node) {
  const startAt = combineWpDateTime(node?.horaYFechaDelEvento?.fechaInicio, node?.horaYFechaDelEvento?.horaDeInicio);
  let endAt = combineWpDateTime(node?.horaYFechaDelEvento?.fechaTermino, node?.horaYFechaDelEvento?.horaTermino);
  if (!endAt) endAt = startAt;
  const activity = {
    id: node?.databaseId == null ? null : String(node.databaseId),
    title: cleanText(node?.title),
    url: safeHttps(node?.link),
    category: cleanText(node?.categories?.nodes?.[0]?.name),
    startAt,
    endAt,
    venue: cleanText(node?.locations?.nodes?.[0]?.name),
    campus: cleanText(node?.detallesDelEvento?.detcampus),
    modality: normalizeModality(node?.detallesDelEvento?.modalidad),
    status: cleanText(node?.detallesDelEvento?.status),
    organizer: cleanText(node?.organizer?.nodes?.[0]?.organizador?.nomCsd || node?.organizer?.nodes?.[0]?.name),
    imageUrl: safeHttps(node?.featuredImage?.node?.sourceUrl),
  };
  const errors = [];
  for (const field of ["id", "title", "url", "startAt"]) if (!activity[field]) errors.push(`missing_${field}`);
  if (activity.startAt && activity.endAt && new Date(activity.endAt) < new Date(activity.startAt)) errors.push("end_before_start");
  return { valid: errors.length === 0, errors, activity };
}

function normalizeModality(value) {
  const text = cleanText(value)?.toLowerCase();
  if (!text) return null;
  if (text.includes("híbr") || text.includes("hibr")) return "Híbrida";
  if (text.includes("virtual")) return "Virtual";
  if (text.includes("presencial")) return "Presencial";
  return null;
}

function overlaps(activity, windowStart, windowEndExclusive) {
  const start = new Date(activity.startAt);
  const end = new Date(activity.endAt || activity.startAt);
  return start < new Date(windowEndExclusive) && end >= new Date(windowStart);
}

function normalizeAd(node) {
  return {
    id: node?.databaseId == null ? null : String(node.databaseId),
    title: cleanText(node?.title),
    imageUrl: safeHttps(node?.featuredImage?.node?.sourceUrl),
    targetUrl: safeHttps(node?.newsletter?.enlace),
    placement: ["top", "bottom"].includes(node?.newsletter?.placement) ? node.newsletter.placement : null,
    priority: Number.isFinite(Number(node?.newsletter?.priority)) ? Number(node.newsletter.priority) : 0,
    activeFrom: node?.newsletter?.inicio || null,
    activeUntil: node?.newsletter?.fin || null,
  };
}

function selectAds(nodes, reference) {
  const now = new Date(reference);
  const valid = nodes.map(normalizeAd).filter((ad) => {
    if (!ad.id || !ad.title || !ad.imageUrl || !ad.targetUrl) return false;
    const from = ad.activeFrom ? new Date(ad.activeFrom) : null;
    const until = ad.activeUntil ? new Date(ad.activeUntil) : null;
    return (!from || from <= now) && (!until || until >= now);
  }).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, 2);

  if (valid.length === 1) valid[0].resolvedPlacement = "bottom";
  if (valid.length === 2) {
    const top = valid.find((ad) => ad.placement === "top") || valid[0];
    const bottom = valid.find((ad) => ad !== top && ad.placement === "bottom") || valid.find((ad) => ad !== top);
    top.resolvedPlacement = "top";
    bottom.resolvedPlacement = "bottom";
  }
  return valid;
}

function dedupeAndSort(activities) {
  const unique = new Map();
  for (const activity of activities) if (!unique.has(activity.id)) unique.set(activity.id, activity);
  return [...unique.values()].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.title.localeCompare(b.title, "es") || a.id.localeCompare(b.id));
}

function executionKey(digestType, windowStart, windowEndExclusive, recipientGroup) {
  return crypto.createHash("sha256").update(`${digestType}|${windowStart}|${windowEndExclusive}|${recipientGroup}`).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function displayDate(iso) {
  const date = new Date(iso);
  const parts = localParts(date);
  return { day: parts.day, month: MONTHS_SHORT[parts.month - 1], monthLong: MONTHS[parts.month - 1], year: parts.year };
}

function displayTime(iso) {
  return new Intl.DateTimeFormat("es-DO", { timeZone: ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

async function paginateConnection(fetchPage, maxPages = 100) {
  const output = [];
  const seen = new Set();
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const connection = await fetchPage(cursor, page);
    output.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return output;
    cursor = connection.pageInfo.endCursor;
    if (!cursor || seen.has(cursor)) throw new Error("Pagination cursor cycle");
    seen.add(cursor);
  }
  throw new Error("Maximum pagination pages exceeded");
}

module.exports = {
  ZONE, OFFSET, MONTHS, digestWindow, combineWpDateTime, cleanText, safeHttps,
  normalizeActivity, overlaps, normalizeAd, selectAds, dedupeAndSort,
  executionKey, escapeHtml, displayDate, displayTime, paginateConnection,
};
