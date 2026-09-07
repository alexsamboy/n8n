# Auditoría y corrección de fechas de Agenda PUCMM — 2026-09-07

## Alcance

Auditoría de la ejecución de Agenda PUCMM del 7 de septiembre de 2026 y
corrección del filtro de actividades vencidas. Zona horaria operativa:
`America/Santo_Domingo`.

## Hallazgo

La ejecución `340` del orquestador `81aa01934460cec1` se ejecutó a las 08:00
locales como digest mensual, con ventana `2026-09-01T00:00:00-04:00` a
`2026-10-01T00:00:00-04:00`. El boletín productivo contenía 16 actividades,
incluidas las actividades ya terminadas con IDs `7544`, `7499`, `7572` y
`7584`, correspondientes al 2 y 4 de septiembre.

La causa era que la normalización aplicaba la ventana mensual, pero no
descartaba actividades cuyo `endAt` ya había pasado respecto a
`referenceDate`.

## Corrección

Se añadió el filtro:

```js
endAt >= referenceDate
```

La regla se implementó en el orquestador y en el código versionado de agenda.
También se añadió una prueba regresiva que conserva actividades en curso o
futuras y excluye las terminadas.

## Prueba controlada

El workflow temporal `TEST — Agenda PUCMM — Corrección de fechas` recibió el
payload real capturado de la ejecución 340, sin nodos SMTP, Brevo ni llamadas
externas.

- Ejecución de prueba: `345`.
- Entrada: 16 actividades.
- Resultado: 12 actividades.
- Excluidas: `7544`, `7499`, `7572`, `7584`.
- Estado: `success`.
- No se enviaron mensajes a usuarios reales.

## Publicación

La corrección se publicó en:

- Workflow: `ORCH — Agenda PUCMM — Construir y enviar`.
- ID: `81aa01934460cec1`.
- Versión activa: `50f17494-6db3-471a-87f1-faa045367ac2`.
- No hubo ejecuciones posteriores a la publicación durante la verificación.
- No se reenvió el boletín del 7 de septiembre ni se modificó la campaña Brevo
  1017 ya programada.

## Validación

- `npm test`: PASS, 7/7 archivos.
- `npm run validate:workflows`: PASS, 16 workflows.
- `git diff --check`: PASS.
- Verificación MCP del workflow activo: PASS, el filtro está presente.

## Estado temporal

El workflow temporal de prueba quedó inactivo y sin publicar. Su archivado se
mantiene pendiente porque cambia el estado externo de n8n y requiere
autorización operativa separada.
