# Auditoría del repositorio e instalación n8n — 2026-08-27

## Alcance

Auditoría de solo lectura del repositorio, los artefactos importables y el
estado general de la instalación Docker. Las correcciones posteriores se
limitaron a pruebas y documentación; no se modificaron activaciones,
credenciales, ejecuciones, contenedores ni datos de n8n.

## Estado verificado

- La rama `main` estaba sincronizada con `origin/main` antes de las
  correcciones.
- `n8n` y `task-runners` ejecutan la versión `2.35.7`.
- Los contenedores n8n, PostgreSQL y MJML estaban saludables.
- `git fsck --full` no encontró daños en el repositorio.
- Los 16 workflows importables pasaron la validación estructural: conexiones
  completas, versiones soportadas, sin acceso a `$env` y sin secretos
  detectados por el validador.
- El escaneo básico del contenido versionado no encontró claves privadas,
  tokens ni contraseñas evidentes.
- En los siete días auditados se registraron 167 ejecuciones exitosas y dos
  errores de Prensa del 24 de agosto. Los mismos workflows tuvieron
  ejecuciones posteriores exitosas.

## Correcciones aplicadas

1. Se actualizó la versión documentada de n8n de `2.35.5` a `2.35.7`.
2. Se aclaró que `active=false` representa el estado seguro de los JSON al
   importarlos y no necesariamente el estado de los workflows ya publicados.
3. Se actualizó la prueba de la biblioteca Brevo para verificar explícitamente
   los tres nodos que utilizan la credencial compartida: creación de campaña,
   envío de prueba y programación de campaña.

Después de las correcciones:

- `npm test`: 7 archivos aprobados, 0 fallos.
- `npm run validate:workflows`: 16 workflows aprobados.
- `git diff --check`: sin errores.

## Estado operativo observado

En la instancia estaban activos los coordinadores diario, semanal y mensual de
Agenda, además de los coordinadores diario y mensual de Prensa. Los archivos
versionados conservan `active=false` para evitar activaciones accidentales al
importar.

Permanecen en la base de datos, ambos inactivos:

- `TEMP — Auditoría Prensa PUCMM`
- `TEMP — Prueba histórica Prensa`

No se eliminaron porque esa acción modifica el estado externo y requiere una
decisión operativa expresa.

## Pendientes

- Decidir si se conservan o eliminan los dos workflows temporales inactivos.
- Investigar la advertencia del CLI sobre la credencial desconocida
  `confluenceCloudOAuth2Api` si se utiliza el nodo Confluence.
- Mantener iguales las versiones de `n8n` y `task-runners` en futuras
  actualizaciones.
