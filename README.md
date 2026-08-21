# Agenda PUCMM Día a Día en n8n

Implementación para n8n `2.35.5` que obtiene actividades y banners desde
WPGraphQL, normaliza fechas en `America/Santo_Domingo`, compila MJML localmente
y envía un boletín mensual, semanal o diario según la fecha. El correo
institucional sale por SMTP; el boletín mensual genera además una campaña en
Brevo.

Los coordinadores y el orquestador permanecen **inactivos**. Las dos
bibliotecas están publicadas porque n8n lo exige para ejecutar subworkflows,
pero no tienen disparadores autónomos y no realizan envíos por sí solas.

## Arquitectura

- `agenda-monthly.json`: primer lunes del mes; mes calendario completo.
- `agenda-weekly.json`: demás lunes; lunes a lunes siguiente.
- `agenda-daily.json`: martes a sábado; día calendario completo.
- `agenda-build-send.json`: consulta, validación, publicidad y orquestación de
  los canales de salida.
- `agenda-error-handler.json`: alerta operativa sanitizada.
- `lib-compile-mjml.json`: subworkflow reutilizable que valida el contrato v1,
  compila MJML y devuelve el HTML junto con métricas y contexto.
- `lib-brevo-campaign.json`: subworkflow reutilizable que valida destinatarios,
  aplica idempotencia, crea y programa campañas con la credencial `Brevo`.
- `tools/mjml-service`: compilador local fijado a MJML 5.4.0.

Los coordinadores comparten una decisión exclusiva. El domingo no produce
salida. Todos usan intervalos semiabiertos y zona horaria institucional.

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
se conservan en el nodo `Configuración segura`. El workflow queda en
`testMode=true` y apunta a `manuelperez@pucmm.edu.do` durante las pruebas.

En producción, SMTP utiliza exclusivamente:

- `comunidad@pucmm.edu.do`
- `st-estudiante@ce.pucmm.edu.do`
- `sd-estudiante@ce.pucmm.edu.do`

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
de errores; después las bibliotecas MJML y Brevo; luego `build-send`; y al final
los tres coordinadores. Asigne la credencial `Brevo` dentro de su biblioteca y
la credencial SMTP dentro de `build-send`. Los IDs usados por el orquestador son
`73pz6aMDSOoMOrBr` para MJML, `SklCy2UMq5G0elbg` para Brevo y
`81aa01934460cec1` para `build-send`.

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
