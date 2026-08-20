"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { escapeHtml, displayDate, displayTime } = require("./agenda-core");

function adBlock(ad) {
  if (!ad) return "";
  return `<mj-section background-color="#ffffff" padding="8px 20px"><mj-column><mj-image href="${escapeHtml(ad.targetUrl)}" src="${escapeHtml(ad.imageUrl)}" alt="${escapeHtml(ad.title)}" title="${escapeHtml(ad.title)}" fluid-on-mobile="true" /></mj-column></mj-section>`;
}

function card(activity) {
  const date = displayDate(activity.startAt);
  const location = activity.venue || "Por confirmar";
  const mode = activity.modality === "Virtual" ? "🖥️ Virtual" : `📍 ${activity.campus || activity.modality || ""}`;
  return `<mj-column width="50%" padding="8px"><mj-text css-class="event-title" padding="12px" border="2px solid #00369c"><span style="font-size:24px;color:#00369c;font-weight:bold">${date.day} ${date.month}</span><br/><a href="${escapeHtml(activity.url)}" title="${escapeHtml(activity.title)}" aria-label="${escapeHtml(activity.title)}"><b>${escapeHtml(`${activity.category ? `${activity.category} | ` : ""}${activity.title}`)}</b></a><br/><span style="font-family:Arial,sans-serif;font-size:12px">🕒 ${escapeHtml(displayTime(activity.startAt))} · 🏛️ ${escapeHtml(location)} · ${escapeHtml(mode)}</span></mj-text></mj-column>`;
}

function activityRows(activities) {
  const rows = [];
  for (let index = 0; index < activities.length; index += 2) {
    rows.push(`<mj-section background-color="#ffffff" padding="6px 20px">${activities.slice(index, index + 2).map(card).join("")}</mj-section>`);
  }
  return rows.join("");
}

function renderMjml(data, templatePath = path.join(__dirname, "..", "templates", "agenda-digest.mjml")) {
  const top = data.ads.find((ad) => ad.resolvedPlacement === "top");
  const bottom = data.ads.find((ad) => ad.resolvedPlacement === "bottom");
  const replacements = {
    SUBJECT: escapeHtml(data.subject), PREVIEW: escapeHtml(data.preview || data.subject),
    TEST_BANNER: data.testMode ? `<mj-section css-class="test-banner"><mj-column><mj-text align="center"><b>[PRUEBA]</b> ${escapeHtml(data.digestType)} · ${escapeHtml(data.windowStart)} → ${escapeHtml(data.windowEndExclusive)}</mj-text></mj-column></mj-section>` : "",
    LOGO_URL: escapeHtml(data.logoUrl), INTRODUCTION: escapeHtml(data.introduction),
    TOP_AD: adBlock(top), ACTIVITIES: activityRows(data.activities), BOTTOM_AD: adBlock(bottom),
    CLOSING: escapeHtml(data.closing), AGENDA_URL: escapeHtml(data.agendaUrl), SERVICE_URL: escapeHtml(data.serviceUrl),
  };
  let template = fs.readFileSync(templatePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) template = template.replaceAll(`{{${key}}}`, value);
  if (/{{[A-Z_]+}}/.test(template)) throw new Error("Unresolved MJML placeholder");
  return template;
}

module.exports = { renderMjml, activityRows, adBlock };
