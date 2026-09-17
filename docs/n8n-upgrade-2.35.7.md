# Evaluación de actualización n8n 2.35.7 a 2.38.7

Estado: propuesta preventiva, no autorizada ni ejecutada. Fecha de evaluación:
2026-09-14. Instancia observada: n8n y task runners `2.35.7`, PostgreSQL
`17-alpine`.

## Conclusión

`2.38.7` figura como versión estable publicada el 11 de septiembre de 2026. La
actualización es candidata razonable para mantenimiento preventivo, pero no es
una corrección demostrada del retraso del Schedule Trigger: las notas públicas de
`2.38.7` enumeran correcciones de MCP, consentimiento y CA de Git, no una
corrección específica del scheduler.

Existe además una razón preventiva de seguridad: el advisory oficial
[GHSA-pq6c-vh67-xpm3](https://github.com/n8n-io/n8n/security/advisories/GHSA-pq6c-vh67-xpm3)
marca las ramas 2.x anteriores a `2.37.7` como afectadas por una omisión de
autorización en destinos de Log Streaming. `2.38.7` es posterior a la versión
corregida. Esto justifica priorizar la evaluación, pero tampoco demuestra una
relación con el scheduler.

Fuentes oficiales:

- [Releases oficiales de n8n](https://github.com/n8n-io/n8n/releases)
- [Notas de versiones 2.x](https://docs.n8n.io/release-notes/)
- [Actualización de instalaciones Docker](https://docs.n8n.io/hosting/installation/docker/#updating)
- [Variables de task runners](https://docs.n8n.io/hosting/configuration/environment-variables/task-runners/)
- [Variables de base de datos](https://docs.n8n.io/hosting/configuration/environment-variables/database/)
- [CLI de exportación e importación](https://docs.n8n.io/hosting/cli-commands/)

Antes de aprobar debe revisarse el conjunto completo de releases `2.36.x`,
`2.37.x` y `2.38.x`, además del digest exacto de las imágenes. Las notas de una
versión patch no sustituyen las notas de las versiones intermedias.

## Áreas de compatibilidad

### Breaking changes y migraciones

El salto permanece dentro de n8n 2.x, pero puede incluir migraciones automáticas
de esquema al arrancar. Deben tratarse como cambios persistentes: no asumir que
bajar nuevamente la imagen revierte el esquema. No se encontró en `2.38.7` una
advertencia pública específica que elimine este riesgo.

### Scheduler y ciclo de ejecución

No atribuir al upgrade una solución del incidente. Antes y después deben medirse
los mismos schedules, `createdAt`, `startedAt`, versión publicada y desviación. El
Canary, si se autoriza por separado, ofrece una señal independiente de SMTP,
HTTP, Code nodes y subworkflows.

### Publication service

Verificar en staging que workflows activos con `activeVersionId` continúan
publicados, que editar no publica automáticamente y que las versiones ejecutadas
coinciden con las activas. Exportar tanto definiciones guardadas como evidencia
de versiones activas antes del cambio.

### Task runners

n8n main y `n8n-task-runners` deben actualizarse conjuntamente a la misma versión.
Validar registro del broker, ejecución aislada de Code nodes, timeouts y variables
vigentes. No mezclar main `2.38.7` con runners `2.35.7`.

### PostgreSQL

PostgreSQL 17 ya está operativo, pero la compatibilidad debe confirmarse contra la
documentación de la versión candidata. Revisar espacio disponible, conexiones,
locks y backup restaurable. No ejecutar `VACUUM`, `ANALYZE` o migraciones manuales
como parte de la preparación.

### Variables y Compose

Inventariar solamente nombres y valores no sensibles. Revisar especialmente zona
horaria, DB, execution mode, runners, pruning, logging, métricas, encryption key y
binary data. Comparar las variables contra la documentación actual y marcar las
obsoletas; no renombrarlas durante el mismo cambio sin evidencia y prueba.

El cambio mínimo de Compose debería limitarse a los tags/digests de n8n main y
runners. PostgreSQL y MJML no forman parte del upgrade. Cualquier cambio adicional
de Compose debe separarse.

## Backup exigido antes de autorizar

1. Registrar hashes/digests de imágenes y copia exacta del Compose, sin secretos.
2. Exportar workflows, tags y credenciales cifradas siguiendo el CLI oficial; no
   imprimir material sensible.
3. Obtener backup consistente de PostgreSQL mediante el mecanismo operativo
   aprobado y verificar que el archivo sea legible.
4. Respaldar el volumen/directorio de datos de n8n, incluida la encryption key por
   el canal secreto institucional, nunca en Git.
5. Documentar conteos de workflows activos, versiones publicadas y ejecuciones.
6. Restaurar el backup en un entorno aislado y comprobar arranque antes de tocar
   producción. Un backup sin prueba de restauración no constituye rollback.

## Ensayo y criterios de aceptación

En staging clonado y aislado de correo/HTTP productivo:

- las migraciones terminan sin error;
- main y runners reportan `2.38.7` y se registran correctamente;
- no cambia la zona horaria efectiva;
- los workflows se cargan y conservan active/published version;
- pruebas manuales controladas no alcanzan SMTP, Brevo ni WordPress productivo;
- Schedule Canary produce al menos 12 intervalos consecutivos con drift menor de
  30 segundos;
- no aparecen errores nuevos de DB, pruning, broker o publication service;
- la suite del repositorio y validación de JSON permanecen verdes.

## Despliegue propuesto

Solo después de aprobación:

1. Abrir ventana de mantenimiento y detener disparos productivos mediante el
   procedimiento aprobado, preservando estado y evitando reenvíos.
2. Capturar snapshot y backups verificados.
3. Fijar imágenes de main y runners a `2.38.7` por digest revisado.
4. Aplicar el cambio mediante el Compose autoritativo.
5. Observar migraciones y arranque; no ejecutar workflows manualmente.
6. Verificar salud, publicación, runners, DB y schedules no productivos.
7. Rehabilitar operación únicamente tras el gate humano.

## Rollback

Si no hubo migración incompatible, restaurar los tags/digests anteriores de main
y runners y reaplicar el Compose autorizado. Si hubo migraciones o incompatibilidad
de esquema, detener el servicio y restaurar conjuntamente el backup PostgreSQL y
el volumen n8n del mismo punto consistente; no ejecutar la versión antigua contra
un esquema parcialmente migrado.

El rollback puede repetir o perder ventanas programadas. Antes de reanudar,
comparar las claves de idempotencia y ejecuciones persistidas. No realizar envíos
de recuperación sin autorización específica.

## Decisión pendiente

- **Actualización preventiva:** mejora acumulativa y soporte; requiere staging,
  backup restaurado, ventana y rollback aprobado.
- **Corrección demostrada del incidente:** no establecida. Solo podría afirmarse
  después de reproducir o capturar el fallo y demostrar que desaparece bajo una
  variable controlada.
