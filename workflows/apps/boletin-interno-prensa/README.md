# Boletín Interno Prensa

## Workflows

- `coordination/scheduler.json` — `APP — Prensa PUCMM — Boletín interno`, ID
  `f54704c5e44f602a`; horario 10:00, lunes a viernes, inactivo al importar.
- `coordination/monthly.json` — `APP — Prensa PUCMM — Boletín mensual`, ID
  `e1a71f7ed90c4ef4`; primer lunes, mes calendario anterior, inactivo al
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
No existe una rama `dryRun` dentro del orquestador; una ejecución manual solo
puede enviar a esa dirección de prueba.

En la instancia actual, el orquestador y el manejador están publicados porque
`Execute Workflow` requiere una versión publicada. No tienen disparador
autónomo. El coordinador sigue inactivo.

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
elimine la Data Table, pues conserva idempotencia y cursor operativo.

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
- `legacy_calendar_days` no está habilitado: el modo implementado es
  `since_last_success`, que evita omitir el domingo.
- El manejador sanitiza el error, pero la notificación se habilitará cuando se
  confirme el correo operativo de alertas.
