"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const agenda = require("../workflows/apps/agenda-pucmm/orchestration/build-send-digest.json");
const mjml = require("../workflows/libraries/messaging/compile-mjml.json");
const brevo = require("../workflows/libraries/messaging/brevo-campaign.json");
const smtp = require("../workflows/libraries/messaging/send-smtp.json");

test("Agenda delegates MJML, SMTP and Brevo to reusable workflows", () => {
  const executeNodes = agenda.nodes.filter((node) => node.type === "n8n-nodes-base.executeWorkflow");
  assert.equal(executeNodes.filter((node) => node.parameters.workflowId?.value === mjml.id).length, 2);
  assert.equal(executeNodes.filter((node) => node.parameters.workflowId?.value === brevo.id).length, 1);
  assert.equal(executeNodes.filter((node) => node.parameters.workflowId?.value === smtp.id).length, 1);
  assert.equal(agenda.nodes.some((node) => node.name === "Brevo: crear campaña mensual"), false);
  assert.equal(agenda.nodes.some((node) => node.name === "Compilar MJML local"), false);
  assert.equal(agenda.nodes.some((node) => node.type === "n8n-nodes-base.emailSend"), false);
  assert.equal(agenda.nodes.some((node) => node.name === "Registrar envío confirmado"), false);
});

test("Reusable workflows expose contract v1 and encapsulate delivery credentials", () => {
  const mjmlInputs = mjml.nodes.find((node) => node.type === "n8n-nodes-base.executeWorkflowTrigger").parameters.workflowInputs.values;
  const brevoInputs = brevo.nodes.find((node) => node.type === "n8n-nodes-base.executeWorkflowTrigger").parameters.workflowInputs.values;
  const smtpInputs = smtp.nodes.find((node) => node.type === "n8n-nodes-base.executeWorkflowTrigger").parameters.workflowInputs.values;
  assert.deepEqual(mjmlInputs.map((input) => input.name), ["contractVersion", "mjml", "correlationId", "context"]);
  assert.equal(brevoInputs.some((input) => input.name === "contractVersion"), true);
  assert.equal(brevoInputs.some((input) => input.name === "idempotencyKey"), true);
  assert.equal(smtpInputs.some((input) => input.name === "contractVersion"), true);
  assert.equal(smtpInputs.some((input) => input.name === "allowedDomains"), true);
  assert.equal(smtpInputs.some((input) => input.name === "idempotencyKey"), true);
  const credentialNodes = brevo.nodes.filter((node) => node.credentials?.sendInBlueApi);
  assert.equal(credentialNodes.length, 2);
  assert.equal(credentialNodes.every((node) => node.credentials.sendInBlueApi.id === "brevo-shared"), true);
  const smtpCredentialNodes = smtp.nodes.filter((node) => node.credentials?.smtp);
  assert.equal(smtpCredentialNodes.length, 1);
  assert.equal(smtpCredentialNodes[0].credentials.smtp.id, "pucmm-agenda-smtp");
});

test("Agenda uses one internal recipient list and the institutional sender name", () => {
  const config = agenda.nodes.find((node) => node.name === "Configuración segura");
  const values = Object.fromEntries(config.parameters.assignments.assignments.map((assignment) => [assignment.name, assignment.value]));
  assert.equal(values.emailToInternal, "comunidad@pucmm.edu.do,st-estudiante@ce.pucmm.edu.do,sd-estudiante@ce.pucmm.edu.do");
  assert.equal(values.emailToDaily, undefined);
  assert.equal(values.emailToWeekly, undefined);
  assert.equal(values.emailToMonthly, undefined);
  assert.equal(values.emailFromName, "Comunicaciones PUCMM");
});
