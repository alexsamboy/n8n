# Auditoría de campaña mensual de Aliados

La campaña de Aliados quedó separada del boletín interno. Usa el mismo
compilador MJML y la credencial n8n Brevo, cuyo ID actual es brevo-shared, pero
tiene ventana, audiencia, asunto e idempotencia propios.

## Configuración implementada

- Workflow mensual: ORCH — Prensa PUCMM — Campaña mensual Aliados.
- Horario: primer lunes del mes, 10:00, America/Santo_Domingo.
- Ventana: mes calendario anterior completo.
- Prueba: lista Brevo 116, sender ID 1, manuelperez@pucmm.edu.do.
- Producción pendiente: listas 2, 4, 146, 160, 164, 165, 170, 189, 190.
- Publicidad: desactivada por defecto.
- dryRun=true, testMode=true y cron inactivo en los exports.

La generación no reutiliza el orden institucional del boletín interno: conserva
todas las categorías de cada noticia y ordena por fecha descendente e ID
ascendente. Un post multicategoría no pierde categorías.

## Brevo

El nodo crea una campaña mediante POST /v3/emailCampaigns usando htmlContent,
sender ID, reply-to y las listas configuradas. El export no contiene la API
key. La campaña de prueba debe limitarse a la lista 116.

Antes de producción deben confirmarse en Brevo:

- lista o segmento de Aliados;
- sender verificado y reply-to;
- página de baja y formulario de preferencias;
- consentimiento, rebotes, quejas y contactos bloqueados;
- límites de crédito y tamaño máximo de HTML.

El export actual deja la campaña en modo seguro y no activa el envío
automático. La rama sendTest y la espera de aprobación están implementadas; la
persistencia operativa del campaignId y sus métricas en una tabla dedicada debe
validarse antes de habilitar una campaña real. Mientras tanto, el workflow solo
debe ejecutarse como dry-run.
