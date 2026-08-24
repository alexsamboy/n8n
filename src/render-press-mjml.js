"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { escapeHtml, interleave } = require("./press-core");

function articleBlock(a) {
  const image = a.imageUrl ? `<mj-image border-radius="5px" href="${escapeHtml(a.url)}" src="${escapeHtml(a.imageUrl)}" alt="${escapeHtml(a.imageAlt || a.title)}" title="${escapeHtml(a.title)}" />` : "";
  return `<mj-wrapper padding="0px 30px"><mj-section background-color="#ffffff" padding-bottom="8px"><mj-column padding-left="10px" padding-right="10px">${image}<mj-text font-family="Arial, Helvetica, sans-serif" font-size="24px" font-weight="600" line-height="1.3"><a href="${escapeHtml(a.url)}" title="${escapeHtml(a.title)}" aria-label="${escapeHtml(a.title)}" style="text-decoration:none;color:#000000">${escapeHtml(a.title)}</a></mj-text>${a.excerptText ? `<mj-text font-family="Baskerville, Georgia, serif" line-height="1.5" font-size="15px"><p style="margin:0px">${escapeHtml(a.excerptText)} <a href="${escapeHtml(a.url)}" style="color: #00369c; text-decoration: none;" title="Leer más"><b>Leer más</b></a></p></mj-text>` : ""}<mj-divider border-width="1px" border-color="#f1f1f1" padding="0" align="center" padding-left="30px" padding-right="30px" padding-top="20px" /></mj-column></mj-section></mj-wrapper>`;
}
function bannerBlock(b, showDivider=true) { return `<mj-wrapper padding="0px 30px"><mj-section background-color="#ffffff" padding="0"><mj-column padding-left="10px" padding-right="10px" padding-top="0px" padding-bottom="0px"><mj-image border-radius="5px" href="${escapeHtml(b.targetUrl)}" src="${escapeHtml(b.imageUrl)}" alt="${escapeHtml(b.imageAlt || b.title)}" title="${escapeHtml(b.title)}" />${showDivider ? '<mj-divider border-width="1px" border-color="#f1f1f1" padding="0" align="center" padding-left="30px" padding-right="30px" padding-top="30px" />' : ''}</mj-column></mj-section></mj-wrapper>`; }
function renderPressMjml(data, templatePath=path.join(__dirname,"..","templates","boletin-interno-prensa.mjml")) {
  if (!data.articles?.length) throw new Error("No se renderiza boletín sin noticias");
  const blocks = interleave(data.articles, data.banners || []);
  const content = blocks.map((x, i) => x.type === "article" ? articleBlock(x.value) : bannerBlock(x.value, blocks.slice(i + 1).some(y => y.type === "article" || y.type === "banner"))).join("");
  const replacements = { SUBJECT:escapeHtml(data.subject), PREHEADER:escapeHtml(data.preheader), LOGO_URL:escapeHtml(data.logoUrl), WINDOW_START:escapeHtml(data.windowStart), WINDOW_END:escapeHtml(data.windowEndExclusive), PRESS_URL:escapeHtml(data.pressUrl), CONTENT:content, TEST_BANNER:data.testMode ? `<mj-section css-class="test-banner" padding="8px"><mj-column><mj-text align="center"><b>[PRUEBA]</b> ${escapeHtml(data.windowStart)} → ${escapeHtml(data.windowEndExclusive)} · ${escapeHtml(data.executionKey.slice(0,12))}</mj-text></mj-column></mj-section>` : "" };
  let template = fs.readFileSync(templatePath,"utf8");
  for (const [key,value] of Object.entries(replacements)) template = template.replaceAll(`{{${key}}}`,value);
  if (/{{[A-Z_]+}}/.test(template) || /(?:src=""|href="#"|href="http:)/i.test(template)) throw new Error("MJML inseguro o incompleto");
  return template;
}
module.exports={renderPressMjml,articleBlock,bannerBlock};
