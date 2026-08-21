"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { escapeHtml, interleave } = require("./press-core");

function articleBlock(a) {
  const date = new Intl.DateTimeFormat("es-DO", { timeZone:"America/Santo_Domingo", dateStyle:"long" }).format(new Date(a.publishedAt));
  const category = a.categories?.[0]?.name;
  const image = a.imageUrl ? `<mj-image href="${escapeHtml(a.url)}" src="${escapeHtml(a.imageUrl)}" alt="${escapeHtml(a.imageAlt || a.title)}" padding="0 0 16px" fluid-on-mobile="true" />` : "";
  return `<mj-section background-color="#ffffff" padding="18px 28px"><mj-column>${image}<mj-text color="#666666" font-size="12px" padding="0 0 6px">${escapeHtml(category ? `${category} · ${date}` : date)}</mj-text><mj-text css-class="headline" font-family="Libre Baskerville, Georgia, serif" font-size="21px" font-weight="700" padding="0 0 8px"><a href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a></mj-text>${a.excerptText ? `<mj-text padding="0 0 12px">${escapeHtml(a.excerptText)}</mj-text>` : ""}<mj-text padding="0"><a href="${escapeHtml(a.url)}" style="color:#00369c;font-weight:600">Leer noticia</a></mj-text><mj-divider border-color="#dddddd" padding="20px 0 0" /></mj-column></mj-section>`;
}
function bannerBlock(b) { return `<mj-section background-color="#ffffff" padding="8px 28px 18px"><mj-column><mj-image href="${escapeHtml(b.targetUrl)}" src="${escapeHtml(b.imageUrl)}" alt="${escapeHtml(b.imageAlt || b.title)}" title="${escapeHtml(b.title)}" fluid-on-mobile="true" padding="0" /></mj-column></mj-section>`; }
function renderPressMjml(data, templatePath=path.join(__dirname,"..","templates","boletin-interno-prensa.mjml")) {
  if (!data.articles?.length) throw new Error("No se renderiza boletín sin noticias");
  const content = interleave(data.articles, data.banners || []).map(x => x.type === "article" ? articleBlock(x.value) : bannerBlock(x.value)).join("");
  const replacements = { SUBJECT:escapeHtml(data.subject), PREHEADER:escapeHtml(data.preheader), LOGO_URL:escapeHtml(data.logoUrl), WINDOW_START:escapeHtml(data.windowStart), WINDOW_END:escapeHtml(data.windowEndExclusive), PRESS_URL:escapeHtml(data.pressUrl), CONTENT:content, TEST_BANNER:data.testMode ? `<mj-section css-class="test-banner" padding="8px"><mj-column><mj-text align="center"><b>[PRUEBA]</b> ${escapeHtml(data.windowStart)} → ${escapeHtml(data.windowEndExclusive)} · ${escapeHtml(data.executionKey.slice(0,12))}</mj-text></mj-column></mj-section>` : "" };
  let template = fs.readFileSync(templatePath,"utf8");
  for (const [key,value] of Object.entries(replacements)) template = template.replaceAll(`{{${key}}}`,value);
  if (/{{[A-Z_]+}}/.test(template) || /(?:src=""|href="#"|href="http:)/i.test(template)) throw new Error("MJML inseguro o incompleto");
  return template;
}
module.exports={renderPressMjml,articleBlock,bannerBlock};
