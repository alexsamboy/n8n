# Boletín Interno Prensa

## Workflows

- `coordination/scheduler.json` — `APP — Prensa PUCMM — Boletín interno`, ID
  `f54704c5e44f602a`; horario 10:00, lunes a viernes, inactivo al importar.
- `coordination/monthly.json` — `APP — Prensa PUCMM — Boletín mensual`, ID
  `e1a71f7ed90c4ef4`; primer día laborable, mes calendario anterior, inactivo al
  importar.
- `orchestration/build-send.json` — `ORCH — Prensa PUCMM — Construir y
  enviar`, ID `654286fe97f96096`; único constructor compartido: selecciona
  SMTP para el diario y Brevo para el mensual según `emailTransport`.
- `operations/error-handler.json` — `OPS — Prensa PUCMM — Manejo de errores`,
  ID `bbb56f7efb469be8`; salida sanitizada de fallos.

## Dependencias

- Credencial `Prensa PUCMM Wordpress API` (`HTTP Basic Auth`).
- Credencial `PUCMM WordPress API` para banners.
- `LIB — Mensajería — Compilar MJML`, `LIB — Mensajería — Enviar SMTP` y
  `LIB — Mensajería — Campaña Brevo`.
- Data Table `Boletín Interno Prensa — estado`, ID `nRoI0Ta5SQizvi0U`.

Los coordinadores se importan inactivos. El orquestador está bloqueado en modo
desarrollo: fuerza `testMode=true` y solo permite el destinatario de pruebas
`manuelperez@pucmm.edu.do`, aunque una entrada intente cambiar ese indicador.
El diario usa la ventana del día calendario anterior de martes a viernes. Los
lunes usa `[viernes 00:00, lunes 00:00)` en `America/Santo_Domingo`, por lo que
recupera las publicaciones de viernes, sábado y domingo sin solapar el martes.

La campaña 999 de agosto 2026 fue cancelada después de que n8n la registrara
como programada. La prueba manual mensual queda fijada temporalmente a agosto
de 2026 y continúa restringida al canal de pruebas Brevo. Un reenvío de
producción requiere autorización explícita porque debe usar una nueva clave de
idempotencia.

No existe una rama `dryRun` dentro del orquestador; una ejecución manual solo
puede enviar a esa dirección de prueba.

La salida dinámica usa la plantilla base de Prensa: `mj-body` de 980 px,
cabecera con divisores institucionales, artículos uniformes (imagen opcional
redondeada, categoría/fecha, título sans-serif de 24 px, resumen Baskerville
de 15 px y enlace «Leer más»), banners prioritarios, CTA, footer de Prensa y
redes sociales HTTPS. La selección y las posiciones de anuncios se calculan
antes de construir el MJML. Una edición con una sola noticia utiliza únicamente
el anuncio de mayor prioridad; con dos noticias coloca un anuncio después de
cada una. Con tres o más noticias distribuye los dos anuncios sin dejarlos
consecutivos.

Los resúmenes prefieren `excerpt` cuando una fuente lo entrega y usan
`content` como fallback. En el esquema autenticado actual de WPGraphQL de
Prensa, `Post` no expone `excerpt`, por lo que actualmente se normaliza
`content`. Antes de truncar se eliminan datelines como `Santo Domingo, R.D.-`,
`Santiago, R.D.–` y `República Dominicana -`, incluso cuando aparecen después
de una oración. Los resúmenes truncados terminan en ` ...`. El preheader
(`mj-preview`) muestra “Noticias y novedades de la PUCMM” y, cuando hay
artículos, incorpora el título de la primera noticia.

El asunto es `📰 ¡Estas son las noticias de la PUCMM!` (con `[PRUEBA]` solo en
modo de desarrollo). Las imágenes incluyen `alt` y `title` descriptivos; el
último artículo y el último banner omiten su divisor cuando no tienen contenido
posterior.

En la instancia actual, el orquestador y el manejador están publicados porque
`Execute Workflow` requiere una versión publicada. No tienen disparador
autónomo. Los coordinadores se activan únicamente en la instancia de n8n;
los JSON del repositorio permanecen `active=false` para importación segura.

Producción: los coordinadores diario y mensual fueron activados en n8n el
24 de agosto de 2026. El horario programado usa destinatarios productivos;
las rutas de prueba manual conservan `testMode=true`, `developmentMode=true`
y el correo de prueba institucional. El contenedor n8n fue reiniciado para
cargar los cron activos.

### Ventanas e idempotencia

El coordinador diario procesa exclusivamente el día calendario anterior en
`America/Santo_Domingo`: desde las 00:00 de ayer hasta las 00:00 de hoy, con
el límite final exclusivo. No utiliza el último registro de la Data Table para
ampliar la ventana; de este modo una noticia no reaparece en días posteriores.
El horario continúa siendo de lunes a viernes, por lo que cada ejecución cubre
solo el día inmediatamente anterior, incluso los lunes.

El coordinador mensual procesa exclusivamente el mes calendario anterior. La
fecha de producción se calcula en el momento de la ejecución; la fecha fija se
reserva para la ruta manual de pruebas. Ambos productos generan una clave de
ejecución determinística a partir de inicio, fin y grupo destinatario. Las
bibliotecas SMTP y Brevo rechazan una segunda entrega de la misma ventana en
el mismo canal y modo. Diario y mensual tienen ventanas, canales y grupos
distintos: el mensual es un resumen deliberado y puede incluir noticias ya
publicadas en boletines diarios.

## Importación segura

1. Importe o publique primero las bibliotecas MJML y SMTP existentes.
2. Importe el manejador de errores, el orquestador y finalmente ambos
   coordinadores.
3. Confirme las dos credenciales WordPress y la Data Table.
4. Ejecute manualmente y revise conteos, ventana y render; el correo solo se
   entrega a la dirección de pruebas configurada.
5. Mantenga el modo de desarrollo hasta autorizar explícitamente el cambio de
   destinatarios y la activación de los coordinadores.
6. No active el coordinador hasta autorización explícita.

Rollback: desactive el coordinador y restaure la revisión Git anterior. No
elimine la Data Table, pues conserva la auditoría e idempotencia de entregas.

## Evidencia de ejecución

Dry-run histórico del 21 de agosto de 2026:

- ventana: `2026-08-13T00:00:00Z` a `2026-08-20T16:00:00Z`;
- noticias válidas: 3; registro descartado por quedar fuera de la ventana: 1;
- banners activos y válidos: 2;
- salida: MJML de 6,190 bytes y HTML de 25,508 bytes;
- SMTP: no ejecutado; Data Table: sin avance de cursor.

La consolidación se verificó además con las pruebas manuales de los dos
coordinadores: el diario produjo 2 noticias/2 banners por la rama SMTP y el
mensual produjo 28 noticias por la rama Brevo, ambos con `status=dry_run`.
Los workflows mensuales antiguos de `boletin-aliados` fueron archivados en
n8n para impedir constructores duplicados.

La ejecución temporal terminó correctamente y su workflow auxiliar fue
archivado. Las pruebas automáticas y la validación estructural cubren los
exports; las capturas visuales no se generaron porque Playwright no dispone de
un navegador compatible instalado en este host Rocky Linux.

## Riesgos residuales

- La Data Table comunitaria no garantiza un lock atómico. Antes de activar el
  horario se recomienda un lock con PostgreSQL/Redis o impedir solapamientos a
  nivel operativo.
- El diario no recupera automáticamente días omitidos si el schedule falla;
  una recuperación debe ejecutarse manualmente con una ventana explícita y en
  modo controlado para no romper la regla de un día por edición.
- El manejador sanitiza el error, pero la notificación se habilitará cuando se
  confirme el correo operativo de alertas.
