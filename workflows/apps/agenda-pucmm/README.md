# Aplicación Agenda PUCMM

## Componentes

- `coordinators/daily.json` — ID `8a4db074159975d8`; martes a sábado a las
  08:00, hora de Santo Domingo.
- `coordinators/weekly.json` — ID `d853924eed377ab6`; lunes que no sean el
  primer lunes del mes.
- `coordinators/monthly.json` — ID `848f824105bbf077`; primer lunes del mes.
- `orchestration/build-send-digest.json` — ID `81aa01934460cec1`; consulta
  WordPress, selecciona banners y coordina MJML, SMTP y Brevo.
- `operations/error-handler.json` — ID `cf9eb8c32404623b`; alerta SMTP
  sanitizada para fallos de producción.

## Dependencias

- `LIB — Mensajería — Compilar MJML`
- `LIB — Mensajería — Enviar SMTP`
- `LIB — Mensajería — Campaña Brevo`
- Data Table `Agenda PUCMM — envíos`
- Credenciales `PUCMM WordPress API`, `PUCMM Agenda SMTP` y `Brevo`

Los archivos importables conservan los coordinadores y el orquestador
inactivos. Después de importar y asignar credenciales, publique primero las
bibliotecas y el manejador de errores, luego el orquestador y finalmente los
coordinadores.

Para rollback, desactive los coordinadores y restaure la revisión Git anterior;
no borre la Data Table porque contiene la protección de idempotencia.
