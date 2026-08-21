"use strict";

const fs = require("node:fs");
const path = require("node:path");

const directory = path.join(__dirname, "..", "workflows", "pucmm");
const expected = [
  "agenda-daily.json",
  "agenda-weekly.json",
  "agenda-monthly.json",
  "agenda-build-send.json",
  "agenda-error-handler.json",
  "lib-compile-mjml.json",
  "lib-brevo-campaign.json",
  "lib-send-smtp.json",
];
let failed = false;
for (const file of expected) {
  const full = path.join(directory, file);
  const workflow = JSON.parse(fs.readFileSync(full, "utf8"));
  const names = new Set(workflow.nodes.map((node) => node.name));
  const targets = Object.values(workflow.connections).flatMap((connection) => connection.main.flat().map((edge) => edge.node));
  const missing = targets.filter((name) => !names.has(name));
  const credentialValues = JSON.stringify(workflow).match(/(?:password|secret|applicationPassword)\s*["':=]+\s*[^,$}\]]+/gi) || [];
  const unsupported = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.microsoftOutlook" && node.typeVersion !== 2);
  const envAccess = JSON.stringify(workflow).includes("$env.");
  const wordpressNodes = workflow.nodes.filter((node) => ["Consultar actividades autenticadas", "Consultar banners autenticados"].includes(node.name));
  const wordpressCredentialsOk = file !== "agenda-build-send.json" || (wordpressNodes.length === 2 && wordpressNodes.every((node) => node.credentials?.httpBasicAuth?.id === "pucmm-wordpress-api" && node.parameters?.options?.pagination?.pagination?.limitPagesFetched === true));
  const isLibrary = file.startsWith("lib-");
  const activationOk = workflow.active === isLibrary;
  const ok = activationOk && workflow.settings.timezone === "America/Santo_Domingo" && missing.length === 0 && credentialValues.length === 0 && unsupported.length === 0 && !envAccess && wordpressCredentialsOk;
  console.log(`${ok ? "OK" : "FAIL"} ${file}: nodes=${workflow.nodes.length} active=${workflow.active} missingTargets=${missing.length} unsupportedVersions=${unsupported.length} envAccess=${envAccess}`);
  failed ||= !ok;
}
if (failed) process.exit(1);
