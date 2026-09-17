# Observabilidad del scheduler de n8n

Estado del documento: herramientas preparadas y validadas; la observación
controlada del scheduler quedó cerrada el 2026-09-15. Audiencia: operación de
la instancia n8n.

## Objetivo y límites

Estas herramientas conservan evidencia para distinguir problemas del scheduler,
PostgreSQL, Docker DNS, runners, host e I/O. Son recolectores de solo lectura y
no corrigen el entorno. No ejecutan workflows ni envían mensajes.

Los scripts fallan con código `2` si faltan comandos, contenedores, zona horaria
o datos analizables. No instalan dependencias ni intentan reparaciones.

## Herramientas

### Monitor de Schedule Trigger

`ops/n8n_scheduler_monitor.py` enumera workflows activos con Schedule Trigger,
consulta su ejecución más reciente y calcula:

- `scheduled_at`: última ocurrencia cron anterior a `--now`, en la zona del workflow;
- `created_at`: creación persistida por n8n;
- `started_at`: inicio persistido;
- `schedule_delay_seconds`: `created_at - scheduled_at` solamente cuando existe
  correlación temporal y de versión;
- `start_delay_seconds`: `started_at - created_at`.

Forma canónica futura, sujeta a autorización:

```bash
python3 -m ops.n8n_scheduler_monitor --output /ruta/autorizada/reporte.json
```

También se soporta explícitamente la ejecución directa
`python3 ops/n8n_scheduler_monitor.py`; ambos entrypoints resuelven el paquete
desde la ruta real del repositorio y no dependen de `PYTHONPATH`.

Uso local seguro con fixture:

```bash
python3 ops/n8n_scheduler_monitor.py \
  --fixture fixtures/n8n-observability/scheduler.json \
  --now 2026-09-14T14:02:00Z
```

`mode=trigger` nunca se presenta como prueba directa. `origin=correlated` significa
que modo, versión y ventana son compatibles; `origin=ambiguous` indica múltiples
Schedule Triggers compatibles; los demás casos son `unknown`.

Limitación: el parser admite cron estándar de cinco campos con números,
comodines, listas, rangos y pasos. Expresiones no compatibles fallan de forma
explícita. La semántica día-del-mes/día-de-semana sigue cron: cuando ambos están
restringidos, cualquiera puede satisfacer el día.

### Snapshot

`ops/n8n_health_snapshot.sh` crea exclusivamente:

```text
logs/health/YYYY-MM-DD/YYYY-MM-DD_HH-MM-SS/
├── summary.json
├── n8n.log
├── postgres.log
├── runners.log
├── docker.txt
├── postgres_stats.json
├── dns.json
└── host.txt
```

Cada consulta DNS conserva timestamp, latencia, IP y error. PostgreSQL se consulta
dentro de `BEGIN TRANSACTION READ ONLY`. No se guardan textos SQL de sesiones,
variables de entorno ni credenciales. Los logs pasan por una redacción defensiva
de campos comunes; aun así, el operador debe revisar cualquier artefacto antes de
compartirlo fuera del equipo.

La ubicación está restringida por el propio script a `logs/health` dentro del
repositorio. Si falla cualquier prerrequisito, puede quedar un directorio parcial,
marcado por la ausencia de `summary.json`; no se intenta borrarlo automáticamente.

### Correlación

`ops/analyze_n8n_incident.py --from ... --to ...` combina Schedule esperado,
ejecuciones, logs y snapshots, preserva el timestamp original y añade UTC.
No crea relaciones causales automáticamente.

En logs PostgreSQL conserva dos eventos cuando existen ambos relojes: el timestamp
de transporte de Docker y el timestamp interno emitido por PostgreSQL. Esto hace
visible la entrega tardía o agrupada de mensajes sin confundirla con causalidad.

Niveles de evidencia:

- `observed`: presente directamente en PostgreSQL, logs o snapshot;
- `correlated`: compatible por tiempo/versión, pero no prueba origen o causa;
- `inferred`: hipótesis explícita de un analista; el script no la genera;
- `unknown`: evidencia ausente, ilegible o insuficiente.

## Umbrales operativos

### Schedule

| Estado | Regla |
|---|---|
| PASS | ejecución correlacionable con retraso menor de 30 s |
| WARN | retraso desde 30 s y menor de 60 s |
| DEGRADED | retraso igual o mayor de 60 s; todo drift mayor de 60 s es incidente registrable |
| FAIL | persistencia de éxito habilitada y no existe ejecución correlacionable 5 minutos después de la hora prevista |
| PENDING | aún no han transcurrido los 5 minutos de gracia |
| INDETERMINATE | el workflow no persiste éxitos o existen múltiples triggers compatibles |

Una ejecución existente con 180 segundos o más permanece `DEGRADED`; `FAIL` se
reserva para la ausencia después del período de gracia.

Cuando `saveDataSuccessExecution=none`, el monitor expone
`success_execution_observable=false` y `observability=SUCCESS_NOT_PERSISTED`.
La ausencia del coordinador se clasifica `INDETERMINATE`, no `FAIL`; una ejecución
integrada cercana puede investigarse aparte, pero no prueba por sí sola el origen
del Schedule Trigger.

### PostgreSQL

- PASS: conexión disponible, sin bloqueos, capacidad de conexiones con margen y
  sin errores recientes.
- WARN: waits prolongados, crecimiento sostenido de tuplas muertas, autovacuum
  retrasado o recuperación reciente sin pérdida confirmada.
- FAIL: PostgreSQL inaccesible, pool agotado, statements críticos cancelados o
  bloqueos que impiden persistir ejecuciones.

`database connection recovered` es un evento de recuperación, no una causa raíz.

### DNS

- PASS: todas las resoluciones son exitosas y sin latencia anómala respecto de la base.
- WARN: latencia intermitente elevada sin fallo.
- FAIL: cualquier `EAI_AGAIN postgres` para ese evento o imposibilidad de resolver.

### Runner

- PASS: broker disponible y registro normal de runners.
- WARN: reconexión aislada o salida esperada por idle timeout.
- FAIL: broker inaccesible de forma sostenida o tareas rechazadas/perdidas.

El canary propuesto no usa task runner; esto permite separar el timer/persistencia
del camino de Code nodes.

### Host

- PASS: CPU, RAM, swap e I/O con margen y sin OOM/bloqueos.
- WARN: presión sostenida, swapping activo, latencia I/O alta o journal incompleto.
- FAIL: OOM kill, I/O error, filesystem sin espacio/inodos o pausa confirmada de VM.

## Canary y cierre de la observación

`workflows/ops/scheduler-canary.json` contiene solamente Schedule Trigger cada
cinco minutos y Edit Fields/Set. El artefacto del repositorio permanece en
`active=false`, conserva ejecuciones exitosas y no tiene credenciales, SMTP,
HTTP, PostgreSQL, Code nodes ni subworkflows. Los tiempos persistidos se miden
externamente con el monitor; el campo `observed_at` es contexto, no sustituto de
`execution_entity.createdAt`.

La ventana productiva válida fue
`2026-09-14 16:40:00-04:00`–`2026-09-15 16:40:00-04:00`: se esperaban y
observaron 288 ejecuciones, todas `PASS`, sin faltantes. El delay medio fue
0.013069 s, la mediana 0.012 s, P95 0.019650 s, P99 0.023520 s y el máximo
0.030 s. La conclusión es `PASS — scheduler global estable durante la
observación controlada`.

El workflow productivo Canary quedó temporalmente activo porque no había sesión
UI ni API runtime autenticada para desactivarlo sin recurrir a un cambio CLI que
exigiría reinicio. No se modificó PostgreSQL directamente. Debe desactivarse
únicamente desde la UI administrativa o API runtime autorizada; no usar el CLI
como sustituto sin una autorización separada de reinicio.

El detalle de conclusiones e incidentes está en
`docs/n8n-scheduler-investigation-closure-2026-09-15.md`.

## Procedimiento ante incidente

1. No reiniciar servicios ni ejecutar manualmente el workflow afectado.
2. Con autorización operativa, capturar un snapshot.
3. Registrar hora local, UTC y workflow esperado.
4. Ejecutar el analizador para una ventana que cubra al menos cinco minutos antes
   y después.
5. Separar hechos observados de correlaciones e hipótesis.
6. Preservar el directorio completo y revisar redacción antes de compartirlo.
7. Decidir recuperación solamente después de identificar qué dependencia continúa
   inestable.

## Autorizaciones futuras

Requieren autorización explícita e independiente: ejecutar scripts contra
producción, programarlos mediante cron/systemd, importar el Canary, activarlo,
modificar Compose o variables, reiniciar servicios, cambiar PostgreSQL y realizar
cualquier actualización de n8n.
