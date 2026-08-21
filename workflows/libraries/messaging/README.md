# Bibliotecas de mensajería

Estas bibliotecas son compartidas por Agenda PUCMM y por futuros workflows. No
tienen disparadores autónomos, pero deben estar publicadas para aceptar llamadas
de subworkflow.

| Archivo | Workflow ID | Credencial | Contrato |
|---|---|---|---|
| `compile-mjml.json` | `73pz6aMDSOoMOrBr` | Ninguna | v1: MJML, correlación y contexto |
| `send-smtp.json` | `apJmJfvec2P8KOG7` | `PUCMM Agenda SMTP` | v1: mensaje HTML, dominios e idempotencia |
| `brevo-campaign.json` | `SklCy2UMq5G0elbg` | `Brevo` | v1: campaña, listas e idempotencia |

Las respuestas solo deben exponer estado, identificadores, conteos y duración.
No deben devolver secretos, HTML completo ni listas de destinatarios.
