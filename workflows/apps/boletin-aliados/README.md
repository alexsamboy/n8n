# Boletín Prensa PUCMM · Mensual Brevo

Workflow mensual de Prensa enviado exclusivamente por Brevo. Reutiliza la credencial
Prensa PUCMM Wordpress API, el compilador MJML 73pz6aMDSOoMOrBr y la
credencial Brevo brevo-shared.

## Workflows

- coordinators/monthly.json: primer lunes a las 10:00 y prueba manual, inactivo.
- orchestration/build-send-campaign.json: mes anterior, orden editorial
  Rectoría → Portal PUCMM → resto, categorías completas, MJML y borrador Brevo.
- operations/error-handler.json: manejo estandarizado de errores sin secretos ni PII.
- operations/campaign-report.json: consulta métricas agregadas sin PII.

La distribución sigue la estructura estándar de Agenda PUCMM: `coordinators`
para calendario/entrada manual, `orchestration` para la lógica principal y
`operations` para soporte operativo y observabilidad.

Los exports permanecen con testMode=true y dryRun=true. No se activa el cron ni
se envía a la audiencia de producción.

Para junio de 2026, la ventana calculada es:

[2026-05-01T00:00:00-04:00, 2026-06-01T00:00:00-04:00)

La lista de prueba es 116. Las listas productivas solo se habilitan después de
confirmar audiencia, sender, baja, preferencias y aprobación institucional.
