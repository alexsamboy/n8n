# Automatizaciones PUCMM en n8n

Implementación para n8n `2.35.5` que obtiene actividades y banners desde
WPGraphQL, normaliza fechas en `America/Santo_Domingo`, compila MJML localmente
y envía un boletín mensual, semanal o diario según la fecha. El correo
institucional sale por SMTP; el boletín mensual genera además una campaña en
Brevo.

El repositorio también contiene la migración segura de **Boletín Interno
Prensa**, que consulta `prensa.pucmm.edu.do`, reutiliza las bibliotecas MJML,
SMTP y Brevo, y conserva sus coordinadores inactivos hasta su aprobación.

Los coordinadores y el orquestador permanecen **inactivos** en los archivos
importables. Las tres
bibliotecas están publicadas porque n8n lo exige para ejecutar subworkflows,
pero no tienen disparadores autónomos y no realizan envíos por sí solas.

## Arquitectura

- `workflows/apps/agenda-pucmm/coordinators/`: coordinadores mensual, semanal
  y diario.
- `workflows/apps/agenda-pucmm/orchestration/build-send-digest.json`: consulta,
  validación, publicidad y orquestación de los canales.
- `workflows/apps/agenda-pucmm/operations/error-handler.json`: alerta operativa
  sanitizada.
- `workflows/libraries/messaging/compile-mjml.json`: compilación MJML mediante
  contrato v1.
- `workflows/libraries/messaging/brevo-campaign.json`: idempotencia, creación y
  programación de campañas con la credencial `Brevo`.
- `workflows/libraries/messaging/send-smtp.json`: validación, idempotencia,
  envío con `PUCMM Agenda SMTP` y auditoría.
- `workflows/archive/agenda-pucmm/`: versiones históricas inactivas que no
  deben importarse como producción.
- `workflows/apps/boletin-interno-prensa/`: coordinadores diario y mensual,
  un único orquestador compartido y manejador de errores del boletín de
  noticias. El coordinador diario selecciona SMTP y el mensual selecciona
  Brevo mediante `emailTransport`, sin duplicar la lógica de consulta/MJML.
- `workflows/apps/boletin-aliados/`: artefactos históricos inactivos; el
  coordinador y constructor mensual anteriores fueron archivados en n8n y no
  deben importarse ni activarse.
- `tools/mjml-service`: compilador local fijado a MJML 5.4.0.

Los coordinadores comparten una decisión exclusiva. El domingo no produce
salida. Todos usan intervalos semiabiertos y zona horaria institucional.

### Plantilla y presentación

La plantilla institucional usa `<mj-body width="900px">` y conserva el
breakpoint móvil en `575px`. Las actividades se agrupan de dos en dos; cuando
la última fila contiene una sola actividad, su `mj-group` utiliza
`width="50%"`. La ubicación muestra hasta 34 caracteres antes de añadir
`…`, mientras el atributo `title` conserva el texto completo.

## Configuración en n8n

### 1. Data Table

La tabla operativa se llama `Agenda PUCMM — envíos` y su ID es
`o5CPOvvy1rTlogfc`. Contiene estas columnas:

| Columna | Tipo |
|---|---|
| `execution_key` | String |
| `digest_type` | String |
| `window_start` | String |
| `window_end` | String |
| `recipient_group` | String |
| `status` | String |
| `message_id` | String |
| `sent_at` | Date/String |
| `activity_count` | Number |
| `ad_count` | Number |

La comprobación ocurre antes de enviar. SMTP se registra como `sent` después
de la aceptación del servidor y Brevo como `scheduled` después de que la API
confirma la programación. Para una repetición controlada, cambie
temporalmente `forceResend` a `true` en `Configuración segura` y vuelva a
`false` inmediatamente.

La biblioteca SMTP recibe el contrato `v1` con remitente, destinatarios,
dominios permitidos, asunto, HTML compilado y metadatos de auditoría. Rechaza
direcciones inválidas o fuera de los dominios permitidos, comprueba
`idempotencyKey`, envía una sola vez y devuelve únicamente estado, conteos,
duración y message ID; no devuelve HTML ni listas de destinatarios.

### 2. Credenciales de correo

El workflow utiliza estas credenciales reutilizables de n8n:

- `PUCMM Agenda SMTP`: servidor `172.26.68.60`, puerto `25`, sin TLS ni
  autenticación. Se usa para los envíos diario, semanal y mensual.
- `Brevo`: credencial API compartida por los workflows actuales y futuros. La
  clave real se guarda exclusivamente en n8n y nunca en Git.

Microsoft Graph no forma parte de esta solución. No coloque contraseñas,
tokens ni secretos en Git o en Code nodes.

### 3. Configuración incorporada

La edición comunitaria no depende de variables de n8n: los valores no secretos
se conservan en el nodo `Configuración segura`. La versión de producción queda
en `testMode=false`; para una prueba manual controlada debe cambiarse
temporalmente a `true`, lo que dirige SMTP a
`manuelperez@pucmm.edu.do`.

En producción, SMTP utiliza exclusivamente:

- `comunidad@pucmm.edu.do`
- `st-estudiante@ce.pucmm.edu.do`
- `sd-estudiante@ce.pucmm.edu.do`

Estos destinatarios se mantienen una sola vez en `emailToInternal`. El nombre
visible del remitente es `Comunicaciones PUCMM`.

El envío mensual adicional de Brevo utiliza la lista `116` en pruebas y las
listas `2`, `4`, `146`, `160`, `164`, `165`, `170`, `189` y `190` en
producción. Las claves de idempotencia separan proveedor y modo para impedir
que una prueba bloquee un envío real.

La credencial WordPress no es una variable: ambos nodos HTTP Request usan
`PUCMM WordPress API`. Los secretos de correo tampoco deben convertirse en
variables.

## Prueba segura

1. Mantenga todos los schedules inactivos.
2. Confirme `testMode=true` en `Configuración segura` y revise que SMTP apunte
   a la cuenta controlada y Brevo a la lista `116`.
3. Abra uno de los coordinadores y ejecute el trigger manual. Puede inyectar
   `referenceDate` en ISO 8601 antes del nodo de cálculo para reproducir una
   fecha concreta.
4. Verifique asunto `[PRUEBA]`, banner visible con tipo/ventana y una fila nueva
   en la Data Table.
5. Repita la misma ventana y compruebe que no se envía nuevamente.

No cambie `testMode=false` ni active schedules sin autorización explícita. La
hora programada es 08:00 local.

## Validación reproducible

```bash
docker run --rm -v /srv/data/n8n/git:/app -w /app node:22-alpine npm test
docker run --rm -v /srv/data/n8n/git:/app -w /app node:22-alpine npm run validate:workflows
docker compose -f /srv/stacks/n8n/compose.yaml ps
```

El render local puede verificarse desde la red Docker enviando JSON con la
propiedad `mjml` a `http://mjml:3000/render`. El servicio devuelve `html` y una
lista `errors`; un HTML vacío hace fallar el workflow.

## Importación y actualización

Los archivos son importables desde la interfaz o, dentro del contenedor, con
`n8n import:workflow --input=/ruta/archivo.json`. Importe primero el manejador
de errores; después las bibliotecas MJML, SMTP y Brevo; luego `build-send`; y
al final los tres coordinadores. Asigne cada credencial exclusivamente dentro
de su biblioteca. Los IDs usados por el orquestador son
`73pz6aMDSOoMOrBr` para MJML, `apJmJfvec2P8KOG7` para SMTP,
`SklCy2UMq5G0elbg` para Brevo y `81aa01934460cec1` para `build-send`.

## Operación y rollback

- Revise solo conteos, tipo, ventana, duración, estado y message ID; no registre
  HTML, secretos ni listas de destinatarios.
- Ante error, mantenga los schedules desactivados, corrija y repita en modo
  prueba con la misma fecha.
- Para rollback, desactive los coordinadores y restaure los JSON de la revisión
  Git anterior. La Data Table conserva la protección contra duplicados.
- El workflow legado se conserva inactivo y saneado solo como referencia; no
  debe activarse junto con los nuevos coordinadores.

El descubrimiento verificable de campos está en
[docs/wordpress-source-audit.md](docs/wordpress-source-audit.md). El estado de
seguridad está en [security_best_practices_report.md](security_best_practices_report.md).

## Boletín Interno Prensa

Los coordinadores `APP — Prensa PUCMM — Boletín interno`
(`f54704c5e44f602a`) y `APP — Prensa PUCMM — Boletín mensual`
(`e1a71f7ed90c4ef4`) llaman al único orquestador
`ORCH — Prensa PUCMM — Construir y enviar` (`654286fe97f96096`). El diario
calcula una ventana semiabierta desde el último envío confirmado; el mensual
calcula el mes calendario anterior. Las pruebas manuales inyectan `testMode`
con una ventana histórica, igual que Agenda; no existe una rama `dryRun`.

Dependencias:

- `Prensa PUCMM Wordpress API`, ya configurada en n8n.
- `PUCMM WordPress API` para banners de Agenda.
- Data Table `Boletín Interno Prensa — estado` (`nRoI0Ta5SQizvi0U`).
- Bibliotecas MJML `73pz6aMDSOoMOrBr`, SMTP `apJmJfvec2P8KOG7` y Brevo
  `SklCy2UMq5G0elbg`.

Prueba segura:

1. Mantenga el coordinador inactivo.
2. Conserve `testMode=true`, `dryRun=true` y `emailTo` vacío.
3. Ejecute una ventana histórica desde un trigger manual.
4. Confirme `status=dry_run`, conteos mayores que cero cuando existan
   publicaciones y HTML no vacío.
5. Revise visualmente el HTML antes de habilitar una prueba SMTP.

La validación del 21 de agosto de 2026 usó la ventana
`2026-08-13T00:00:00Z`–`2026-08-20T16:00:00Z`: recuperó 3 noticias,
seleccionó 2 banners y compiló 25,508 bytes de HTML. No envió correo ni avanzó
el cursor. El workflow temporal usado para esta prueba fue archivado.

## Boletín mensual de Prensa para Aliados

El coordinador `APP — Prensa PUCMM — Boletín mensual` ejecuta el primer lunes
a las 10:00 y calcula el mes calendario anterior. Reutiliza el mismo
orquestador de Prensa y selecciona la rama Brevo; usa el orden Rectoría,
Portal PUCMM y demás noticias, con fecha descendente e ID ascendente.

El dry-run validado en n8n calculó julio de 2026, recuperó 28 noticias y
generó 111,769 bytes de HTML. No creó campaña Brevo ni envió correo. Los
constructores antiguos de `boletin-aliados` fueron archivados.

La rama Brevo está preparada para crear un borrador, enviar solo `sendTest`
en modo prueba y quedar en `awaiting_approval` antes de cualquier envío
productivo. Las listas de producción son `2,4,146,160,164,165,170,189,190` y
la lista de prueba es `116`. La documentación específica está en
[docs/brevo-campaign-audit.md](docs/brevo-campaign-audit.md).

Antes de producción todavía se debe configurar `emailTo`, realizar una
prueba SMTP controlada, aprobar el render y activar expresamente el
coordinador. La Data Table reduce duplicados mediante la biblioteca SMTP, pero
no ofrece un bloqueo atómico entre ejecuciones concurrentes; para garantía
fuerte se recomienda PostgreSQL o Redis con restricción única/lock.
