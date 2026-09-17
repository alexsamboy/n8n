# Cierre de investigación del Schedule Trigger

Fecha de cierre: 2026-09-15. La investigación no requiere reinicio,
mantenimiento de PostgreSQL, cambio de cron ni modificación de Prensa o Agenda.

## Resultado del scheduler global

La ventana válida fue `[2026-09-14 16:40:00-04:00,
2026-09-15 16:40:00-04:00)`. El Canary `OPS - Scheduler Canary` produjo 288 de
288 ejecuciones esperadas, sin faltantes ni anomalías.

| Métrica | Resultado |
|---|---:|
| PASS / WARN / DEGRADED / FAIL | 288 / 0 / 0 / 0 |
| Delay medio | 0.013069 s |
| Mediana | 0.012 s |
| P95 / P99 | 0.019650 s / 0.023520 s |
| Máximo | 0.030 s |

Clasificación: **PASS — scheduler global estable durante la observación
controlada**. No existe evidencia de un problema persistente o reproducible del
scheduler global.

## Incidentes separados

### Prensa, 14 de septiembre

Se mantiene `TRANSIENT / ROOT CAUSE UNDETERMINED`. La ejecución 383 tuvo
`createdAt` 10:01:29.869 para un schedule de 10:00:00: delay 89.869 s. Su
`startedAt` ocurrió 0.011 s después, por lo que el retraso se localiza antes de
persistir `execution_entity`. No hubo evidencia contemporánea de timeout de DB,
`EAI_AGAIN` ni reconexión del task broker, y el Canary y Prensa fueron puntuales
a las 10:00 durante la observación posterior. No se atribuye causalidad a
PostgreSQL, DNS, scheduler o event loop.

### Ejecución 372, 12 de septiembre

Se mantiene separada: hubo degradación confirmada de PostgreSQL/autovacuum,
`EAI_AGAIN postgres`, timeouts de pool/base de datos, reconexión del task broker
y recuperación posterior. La ejecución 372 conserva `origin=unknown`: no se
demostró cron atrasado, retry, ejecución manual ni trigger alternativo.

## Ventanas prioritarias

- 08:00: Canary ID 523, delay 0.016 s; Agenda downstream ID 573 a las
  08:00:03.022. La política de Agenda no persiste el éxito padre, por lo que la
  evidencia downstream es solo correlación.
- 10:00: Canary ID 547, delay 0.011 s; Prensa diario ID 597 a las 10:00:00.033.

## Estado y acciones

- Scheduler global: `STABLE`.
- Prensa 2026-09-14: retraso transitorio no explicado y no reproducido.
- Incidente de infraestructura del 2026-09-12: degradación DB/DNS/broker
  confirmada; origen de 372 desconocido.
- Reinicio correctivo requerido ahora: `NO`.
- Mantenimiento PostgreSQL requerido ahora: `NO`.
- Cambio de configuración o modificación de workflows: `NO`.

El Canary productivo permanece temporalmente `active=true` porque no existe una
sesión administrativa UI ni API runtime autenticada disponible. La acción
pendiente, cuando exista autorización y acceso, es desactivar únicamente el
Canary desde la UI o API runtime, conservar sus 288 ejecuciones y no eliminar
el workflow. No debe hacerse un cambio CLI que requiera reinicio sin autorización
separada.

La política normal de retención de n8n puede gestionar las ejecuciones; no se
autoriza pruning manual para eliminarlas.
