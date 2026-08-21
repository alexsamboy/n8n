"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const agenda = require("../workflows/pucmm/agenda-build-send.json");
const mjml = require("../workflows/pucmm/lib-compile-mjml.json");
const brevo = require("../workflows/pucmm/lib-brevo-campaign.json");

test("Agenda delegates MJML and Brevo to reusable workflows", () => {
  const executeNodes = agenda.nodes.filter((node) => node.type === "n8n-nodes-base.executeWorkflow");
  assert.equal(executeNodes.filter((node) => node.parameters.workflowId?.value === mjml.id).length, 2);
  assert.equal(executeNodes.filter((node) => node.parameters.workflowId?.value === brevo.id).length, 1);
  assert.equal(agenda.nodes.some((node) => node.name === "Brevo: crear campaña mensual"), false);
  assert.equal(agenda.nodes.some((node) => node.name === "Compilar MJML local"), false);
});

test("Reusable workflows expose contract v1 and encapsulate Brevo credentials", () => {
  const mjmlInputs = mjml.nodes.find((node) => node.type === "n8n-nodes-base.executeWorkflowTrigger").parameters.workflowInputs.values;
  const brevoInputs = brevo.nodes.find((node) => node.type === "n8n-nodes-base.executeWorkflowTrigger").parameters.workflowInputs.values;
  assert.deepEqual(mjmlInputs.map((input) => input.name), ["contractVersion", "mjml", "correlationId", "context"]);
  assert.equal(brevoInputs.some((input) => input.name === "contractVersion"), true);
  assert.equal(brevoInputs.some((input) => input.name === "idempotencyKey"), true);
  const credentialNodes = brevo.nodes.filter((node) => node.credentials?.sendInBlueApi);
  assert.equal(credentialNodes.length, 2);
  assert.equal(credentialNodes.every((node) => node.credentials.sendInBlueApi.id === "brevo-shared"), true);
});
