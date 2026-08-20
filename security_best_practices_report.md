# Auditoría de seguridad — Agenda PUCMM en n8n

Fecha: 2026-08-20

## Resultado

Las dos credenciales expuestas fueron revocadas por el propietario. El secreto
WordPress se eliminó del workflow, de la copia almacenada en n8n y de todo el
historial Git alcanzable; `main` remoto apunta al historial saneado. También se
eliminó `pinData` con muestras de contacto. No se copiaron credenciales nuevas.

La compilación MJML usa el servicio local fijado a `mjml 5.4.0`, por lo que no
requiere Application ID ni Secret Key de `api.mjml.io`.

## Controles implementados

- Workflows importados inactivos y `TEST_MODE=true`.
- Fallo cerrado si `EMAIL_TEST_RECIPIENTS` está vacío en modo prueba.
- Destinatarios reales limitados por `ALLOWED_EMAIL_DOMAINS`.
- Texto escapado y URLs limitadas a HTTPS antes de construir MJML.
- Datos de fecha/hora construidos como hora civil de Santo Domingo.
- Paginación con límite y detección de ciclos.
- Idempotencia mediante `executionKey` y Data Table.
- Registro sanitizado sin HTML, destinatarios ni cuerpos completos.
- Credenciales de correo referenciadas por nombre y sin valores versionados.
- WordPress se consulta mediante dos nodos HTTP Request que usan la credencial
  cifrada `PUCMM WordPress API`; ningún Code node accede a ella.
- La configuración no secreta usa `$vars`. Se conservó el bloqueo global de
  acceso de nodos a variables de entorno.
- Task runners permiten únicamente `crypto,node:crypto`, necesario para la
  huella SHA-256 de idempotencia; no se habilitaron módulos externos.
- Servicio MJML sin puerto público, sin capacidades Linux, de solo lectura y
  con versión de dependencia fijada.

## Riesgos y acciones operativas pendientes

1. Crear la Data Table indicada en el README y configurar
   `AGENDA_DATA_TABLE_ID`; sin ella el envío no puede avanzar.
2. Crear una credencial n8n de correo con uno de los nombres documentados.
3. Configurar un destinatario de prueba antes de una ejecución manual.
4. Confirmar si la política institucional desea incluir o excluir eventos por
   el campo editorial `status`.
5. Mantener los schedules inactivos hasta completar una prueba de extremo a
   extremo en Outlook, Gmail y móvil y recibir autorización explícita.

No se detectaron secretos con los patrones auditados en los archivos ni en las
revisiones alcanzables del repositorio después del saneamiento.
