"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../src/press-core");

test("Monday fallback covers 72 hours and last success wins", () => {
  assert.equal(p.fallbackWindow("2026-08-24T14:00:00Z", null).windowStart, "2026-08-21T14:00:00.000Z");
  assert.equal(p.fallbackWindow("2026-08-24T14:00:00Z", "2026-08-20T15:00:00Z").windowStart, "2026-08-20T15:00:00.000Z");
});

test("articles are sanitized, validated, deduplicated and sorted", () => {
  const base = { databaseId: 2, title: "<b>Normal &amp; segura</b>", date: "2026-08-21T09:00:00-04:00", link: "https://prensa.pucmm.edu.do/noticia/", content: "<script>x</script><p>Resumen válido</p>", opcionesPublicacion: { dependencia: { nodes: [{ name: "Rectoría" }] } } };
  const result = p.normalizeArticle(base, 320);
  assert.equal(result.valid, true); assert.equal(result.article.segment, 0); assert.equal(result.article.title, "Normal & segura"); assert.equal(result.article.excerptText, "Resumen válido");
  assert.equal(p.dedupeSortArticles([result.article, result.article]).length, 1);
  assert.equal(p.normalizeArticle({ ...base, link: "http://prensa.pucmm.edu.do/x" }).valid, false);
});

test("marks truncated summaries with ... within the configured limit", () => {
  const result = p.truncateText("Este es un resumen suficientemente largo para ser recortado.", 24);
  assert.equal(result.endsWith(" ..."), true);
  assert.equal(result.length <= 24, true);
});

test("removes Dominican dateline prefixes before truncating", () => {
  assert.equal(p.truncateText("Santo Domingo, R.D.- Un resumen de prueba.", 200), "Un resumen de prueba.");
  assert.equal(p.truncateText("Santiago, R.D.– Un resumen de prueba.", 200), "Un resumen de prueba.");
  assert.equal(p.truncateText("Republica Dominicana - Un resumen de prueba.", 200), "Un resumen de prueba.");
  assert.equal(p.truncateText("El investigador explicó el hallazgo. Santo Domingo, R.D.- La universidad informó los resultados.", 200), "El investigador explicó el hallazgo. La universidad informó los resultados.");
});

test("banner placement follows first, third, or last article", () => {
  const a = [1, 2].map(id => ({ id })); const b = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(p.interleave(a, b).map(x => `${x.type}:${x.value.id}`), ["article:1", "banner:a", "article:2", "banner:b"]);
  const three = p.interleave([...a, { id: 3 }], b).map(x => `${x.type}:${x.value.id}`);
  assert.deepEqual(three, ["article:1", "banner:a", "article:2", "article:3", "banner:b"]);
  assert.deepEqual(p.interleave([], b), []);
});

test("banners require HTTPS and are deterministic", () => {
  const make = (id, inicio, enlace="https://pucmm.edu.do/") => ({ databaseId:id,title:`B${id}`,newsletter:{inicio,fin:"2026-09-01T00:00:00Z",enlace},featuredImage:{node:{sourceUrl:"https://dia.pucmm.edu.do/a.png"}} });
  const selected = p.selectBanners([make(3,"2026-08-01T00:00:00Z"),make(2,"2026-08-10T00:00:00Z"),make(1,"2026-08-10T00:00:00Z"),make(4,"2026-08-10T00:00:00Z","#")],"2026-08-21T14:00:00Z");
  assert.deepEqual(selected.map(x=>x.id), ["1","2"]);
  const prioritized=p.selectBanners([ {...make(9,"2026-08-01T00:00:00Z"),priority:2}, {...make(8,"2026-08-10T00:00:00Z"),newsletter:{...make(8,"2026-08-10T00:00:00Z").newsletter,priority:7}} ],"2026-08-21T14:00:00Z");
  assert.deepEqual(prioritized.map(x=>x.id), ["8","9"]);
});
