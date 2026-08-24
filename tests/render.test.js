"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { renderMjml, activityRows } = require("../src/render-mjml");

const activity = (id) => ({ id: String(id), title: `Actividad ${id}`, url: `https://dia.pucmm.edu.do/${id}`, category: "Académica", startAt: `2026-08-${String(19 + id).padStart(2, "0")}T09:00:00-04:00`, venue: "Auditorio", campus: "Santiago", modality: "Presencial" });
const base = { subject: "Prueba", preview: "Prueba", testMode: true, digestType: "daily", windowStart: "2026-08-20T00:00:00-04:00", windowEndExclusive: "2026-08-21T00:00:00-04:00", logoUrl: "https://pucmm.edu.do/logo.png", introduction: "Introducción", closing: "Cierre", agendaUrl: "https://dia.pucmm.edu.do/", serviceUrl: "https://pucmm.edu.do/servicios" };

for (const count of [0, 1, 2, 3, 5]) {
  test(`render supports ${count} activities`, () => {
    const activities = Array.from({ length: count }, (_, index) => activity(index + 1));
    const mjml = renderMjml({ ...base, activities, ads: [] });
    assert.equal((mjml.match(/event-title/g) || []).length, count + 1);
    assert.equal((activityRows(activities).match(/<mj-group/g) || []).length, count);
    assert.equal((activityRows(activities).match(/<mj-section/g) || []).length, Math.ceil(count / 2));
    assert.equal((activityRows(activities).match(/<mj-group css-class="row" width="50%">/g) || []).length, count % 2);
    assert.equal(mjml.includes("{{"), false);
    assert.equal(mjml.includes("width=\"900px\""), true);
    assert.equal(mjml.includes("No hay actividades publicadas"), count === 0);
  });
}

test("template includes responsive and accessible defaults", () => {
  const mjml = renderMjml({ ...base, preview: "Resumen distinto", activities: [activity(1)], ads: [] });
  assert.match(mjml, /<mj-breakpoint width="575px"/);
  assert.match(mjml, /<mj-preview>Resumen distinto<\/mj-preview>/);
  assert.match(mjml, /mj-font name="Baskerville"/);
  assert.match(mjml, /title="Ver todas las actividades de PUCMM"/);
  assert.match(mjml, /Haz visibles tus actividades en <b>PUCMM Día a Día<\/b>/);
  assert.match(mjml, /<mj-column width="40%">/);
  assert.match(mjml, /Unidad Comunicación Interna/);
});

test("agenda uses the institutional descriptive preheader by default", () => {
  const mjml = renderMjml({ ...base, preview: undefined, activities: [activity(1)], ads: [] });
  assert.match(mjml, /<mj-preview>🗓️ Entérate de lo que ocurre en la PUCMM: conferencias, talleres y más\.<\/mj-preview>/);
});

test("activity location shows up to 34 characters before truncation", () => {
  const venue = "12345678901234567890123456789012345";
  const mjml = activityRows([{ ...activity(1), venue }]);
  assert.match(mjml, /1234567890123456789012345678901234…/);
  assert.doesNotMatch(mjml, />12345678901234567890123456789012345<\/span>/);
  assert.match(mjml, new RegExp(`title="${venue}"`));
});

test("one ad is bottom and two ads surround activities", () => {
  const ad = (id, resolvedPlacement) => ({ id, title: `Ad ${id}`, imageUrl: `https://example.edu/${id}.jpg`, targetUrl: `https://example.edu/${id}`, resolvedPlacement });
  const one = renderMjml({ ...base, activities: [activity(1)], ads: [ad("1", "bottom")] });
  assert.ok(one.indexOf("Ad 1") > one.indexOf("Actividad 1"));
  const two = renderMjml({ ...base, activities: [activity(1)], ads: [ad("1", "top"), ad("2", "bottom")] });
  assert.ok(two.indexOf("Ad 1") < two.indexOf("Actividad 1"));
  assert.ok(two.indexOf("Ad 2") > two.indexOf("Actividad 1"));
});
