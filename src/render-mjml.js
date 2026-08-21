"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { escapeHtml, displayDate, displayTime } = require("./agenda-core");

function adBlock(ad) {
  if (!ad) return "";
  return `<mj-section padding="0px" padding-bottom="10px" background-color="#ffffff"><mj-column padding="0px"><mj-image href="${escapeHtml(ad.targetUrl)}" src="${escapeHtml(ad.imageUrl)}" alt="${escapeHtml(ad.title)}" title="${escapeHtml(ad.title)}" fluid-on-mobile="true" padding="0px" /></mj-column></mj-section>`;
}

function card(activity, halfWidth = false) {
  const date = displayDate(activity.startAt);
  const location = activity.venue || "Por confirmar";
  const mode = activity.modality === "Virtual" ? "🖥️ Virtual" : `📍 ${activity.campus || activity.modality || ""}`;
  const shortLocation = location.length <= 22 ? location : `${location.slice(0, 22)}…`;
  return `<mj-group css-class="row"${halfWidth ? ' width="50%"' : ""}><mj-column width="15%" padding="5px" border="solid #00369c 3px" vertical-align="middle"><mj-text font-size="30px" color="#00369c" font-family="Baskerville" padding="0px" font-weight="600" align="center">${date.day}</mj-text><mj-text font-size="14px" color="#00369c" font-family="Baskerville" padding="0px" font-weight="600" text-transform="uppercase" align="center">${date.month}</mj-text></mj-column><mj-column width="85%" padding="5px 15px 5px 10px" vertical-align="middle"><mj-text css-class="event-title" font-size="16px" color="#000000" font-family="Baskerville" padding="0px" font-weight="500"><a href="${escapeHtml(activity.url)}" title="${escapeHtml(activity.title)}" aria-label="${escapeHtml(activity.title)}"><p style="margin:0;line-height:1.1rem;">${escapeHtml(`${activity.category ? `${activity.category} | ` : ""}${activity.title}`)}</p></a></mj-text><mj-table align="left" font-size="11px" border="solid 0px gray" width="100%" padding="5px 0px 0px 0px" line-height="11px"><tr><td style="text-align:center;">🕒 ${escapeHtml(displayTime(activity.startAt))}</td><td style="text-align:center;border-left:solid 1px gray;border-right:solid 1px gray;">🏛️ <span title="${escapeHtml(location)}">${escapeHtml(shortLocation)}</span></td><td style="text-align:center;">${escapeHtml(mode)}</td></tr></mj-table></mj-column></mj-group>`;
}

function activityRows(activities) {
  const sections = [];
  for (let index = 0; index < activities.length; index += 2) {
    const pair = activities.slice(index, index + 2);
    sections.push(`<mj-section background-color="#ffffff" padding="0px 20px" full-width="full-width">${pair.map((activity) => card(activity, pair.length === 1)).join("")}</mj-section>`);
  }
  return sections.join("");
}

function renderMjml(data, templatePath = path.join(__dirname, "..", "templates", "agenda-digest.mjml")) {
  const top = data.ads.find((ad) => ad.resolvedPlacement === "top");
  const bottom = data.ads.find((ad) => ad.resolvedPlacement === "bottom");
  const replacements = {
    SUBJECT: escapeHtml(data.subject), PREVIEW: escapeHtml(data.preview || `${data.activities.length} actividades en PUCMM Día a Día`),
    TEST_BANNER: data.testMode ? `<mj-section css-class="test-banner"><mj-column><mj-text align="center"><b>[PRUEBA]</b> ${escapeHtml(data.digestType)} · ${escapeHtml(data.windowStart)} → ${escapeHtml(data.windowEndExclusive)}</mj-text></mj-column></mj-section>` : "",
    LOGO_URL: escapeHtml(data.logoUrl), INTRODUCTION: escapeHtml(data.introduction),
    TOP_AD: adBlock(top), ACTIVITIES_OR_EMPTY: data.activities.length ? activityRows(data.activities) : `<mj-section background-color="#ffffff" padding="18px 32px"><mj-column><mj-text align="center" color="#4a4a4a">No hay actividades publicadas para este período.</mj-text></mj-column></mj-section>`, BOTTOM_AD: adBlock(bottom),
    CLOSING: escapeHtml(data.closing), AGENDA_URL: escapeHtml(data.agendaUrl), SERVICE_URL: escapeHtml(data.serviceUrl),
  };
  let template = fs.readFileSync(templatePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) template = template.replaceAll(`{{${key}}}`, value);
  if (/{{[A-Z_]+}}/.test(template)) throw new Error("Unresolved MJML placeholder");
  return template;
}

module.exports = { renderMjml, activityRows, adBlock };
