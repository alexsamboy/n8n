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
    assert.equal((mjml.match(/css-class="event-title"/g) || []).length, count);
    assert.equal((activityRows(activities).match(/<mj-section/g) || []).length, Math.ceil(count / 2));
  });
}

test("one ad is bottom and two ads surround activities", () => {
  const ad = (id, resolvedPlacement) => ({ id, title: `Ad ${id}`, imageUrl: `https://example.edu/${id}.jpg`, targetUrl: `https://example.edu/${id}`, resolvedPlacement });
  const one = renderMjml({ ...base, activities: [activity(1)], ads: [ad("1", "bottom")] });
  assert.ok(one.indexOf("Ad 1") > one.indexOf("Actividad 1"));
  const two = renderMjml({ ...base, activities: [activity(1)], ads: [ad("1", "top"), ad("2", "bottom")] });
  assert.ok(two.indexOf("Ad 1") < two.indexOf("Actividad 1"));
  assert.ok(two.indexOf("Ad 2") > two.indexOf("Actividad 1"));
});
