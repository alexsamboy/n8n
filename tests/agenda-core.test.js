"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/agenda-core");

test("first Monday is monthly and covers calendar month", () => {
  assert.deepEqual(core.digestWindow("2026-09-07T12:00:00Z"), {
    digestType: "monthly", shouldSend: true,
    windowStart: "2026-09-01T00:00:00-04:00",
    windowEndExclusive: "2026-10-01T00:00:00-04:00",
    referenceDate: "2026-09-07T00:00:00-04:00", timezone: core.ZONE,
  });
});

test("other Monday is weekly and crosses year", () => {
  const result = core.digestWindow("2025-12-29T14:00:00Z");
  assert.equal(result.digestType, "weekly");
  assert.equal(result.windowStart, "2025-12-29T00:00:00-04:00");
  assert.equal(result.windowEndExclusive, "2026-01-05T00:00:00-04:00");
});

test("Tuesday through Saturday are daily; Sunday is no-op", () => {
  for (const day of [18, 19, 20, 21, 22]) assert.equal(core.digestWindow(`2026-08-${day}T14:00:00Z`).digestType, "daily");
  assert.equal(core.digestWindow("2026-08-23T14:00:00Z").shouldSend, false);
});

test("February handles leap and non-leap years", () => {
  assert.equal(core.digestWindow("2024-02-05T14:00:00Z").windowEndExclusive, "2024-03-01T00:00:00-04:00");
  assert.equal(core.digestWindow("2026-02-02T14:00:00Z").windowEndExclusive, "2026-03-01T00:00:00-04:00");
});

test("WordPress date and separate clock become Santo Domingo civil time", () => {
  assert.equal(core.combineWpDateTime("2026-08-26T00:00:00+00:00", "7:00 pm"), "2026-08-26T19:00:00-04:00");
});

test("normalization rejects unsafe URL and end before start", () => {
  const result = core.normalizeActivity({ databaseId: 1, title: "<b>Evento</b>", link: "javascript:alert(1)", horaYFechaDelEvento: { fechaInicio: "2026-08-14T00:00:00+00:00", horaDeInicio: "10:00 am", fechaTermino: "2026-08-13T00:00:00+00:00", horaTermino: "12:00 pm" } });
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.sort(), ["end_before_start", "missing_url"]);
  assert.equal(result.activity.title, "Evento");
});

test("overlap includes ongoing and boundary-start events, excludes exclusive end", () => {
  const from = "2026-08-20T00:00:00-04:00";
  const to = "2026-08-21T00:00:00-04:00";
  assert.equal(core.overlaps({ startAt: "2026-08-19T23:00:00-04:00", endAt: "2026-08-20T01:00:00-04:00" }, from, to), true);
  assert.equal(core.overlaps({ startAt: to, endAt: to }, from, to), false);
});

test("ad placement rules are deterministic for zero, one, two and three ads", () => {
  const now = "2026-08-20T08:00:00-04:00";
  const ad = (id, placement = null, priority = 0) => ({ databaseId: id, title: `Ad ${id}`, featuredImage: { node: { sourceUrl: `https://example.edu/${id}.jpg` } }, newsletter: { enlace: `https://example.edu/${id}`, inicio: "2026-08-01T00:00:00-04:00", fin: "2026-08-31T23:59:59-04:00", placement, priority } });
  assert.deepEqual(core.selectAds([], now), []);
  assert.equal(core.selectAds([ad(2)], now)[0].resolvedPlacement, "bottom");
  const two = core.selectAds([ad(2, "bottom"), ad(1, "top")], now);
  assert.deepEqual(two.map((x) => x.resolvedPlacement).sort(), ["bottom", "top"]);
  assert.deepEqual(core.selectAds([ad(3, null, 1), ad(2, null, 5), ad(1, null, 2)], now).map((x) => x.id), ["2", "1"]);
});

test("escaping neutralizes markup and execution keys are stable", () => {
  assert.equal(core.escapeHtml('<img src=x onerror="x">'), "&lt;img src=x onerror=&quot;x&quot;&gt;");
  assert.equal(core.executionKey("daily", "a", "b", "daily"), core.executionKey("daily", "a", "b", "daily"));
});

test("pagination collects more than 100 records and detects cursor cycles", async () => {
  const records = await core.paginateConnection(async (cursor) => cursor == null
    ? { nodes: Array.from({ length: 100 }, (_, id) => id), pageInfo: { hasNextPage: true, endCursor: "page-2" } }
    : { nodes: Array.from({ length: 50 }, (_, id) => id + 100), pageInfo: { hasNextPage: false, endCursor: "done" } });
  assert.equal(records.length, 150);
  await assert.rejects(() => core.paginateConnection(async () => ({ nodes: [], pageInfo: { hasNextPage: true, endCursor: "same" } })), /cycle/);
});
