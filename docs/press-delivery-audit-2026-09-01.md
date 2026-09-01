# Auditoría y corrección de entregas de Prensa — 2026-09-01

## Alcance

Revisión de las ejecuciones semanales de los coordinadores diario y mensual de
Prensa PUCMM, corrección de sus ventanas y verificación de los cambios en la
instancia publicada. Zona horaria operativa: `America/Santo_Domingo`.

## Hallazgos

1. El diario del lunes consultaba únicamente el domingo. Las publicaciones del
   viernes posteriores al corte quedaban fuera porque sábado y domingo no hay
   entregas programadas.
2. El mensual usaba `0 10 1-7 * 1`. La combinación de día del mes y día de la
   semana permitió una ejecución el lunes 31 de agosto.
3. La ejecución 292 procesó julio y programó la campaña Brevo 994, enviada antes
   de detectar el problema.
4. La ejecución 301 comenzó el 1 de septiembre a las 10:00, procesó agosto y
   programó la campaña Brevo 999. El usuario confirmó que canceló esa campaña.
5. La Data Table conserva la clave productiva de la campaña 999. Por tanto, una
   repetición normal de agosto queda bloqueada por idempotencia.

## Política implementada

### Diario

- Horario: 10:00, lunes a viernes.
- Martes a viernes: `[ayer 00:00, hoy 00:00)`.
- Lunes: `[viernes 00:00, lunes 00:00)`.
- Resultado: viernes, sábado y domingo forman una única edición del lunes sin
  solaparse con la edición del martes.

### Mensual

- El trigger se evalúa a las 10:00 los días 1, 2 y 3.
- Una guarda permite continuar solamente:
  - el día 1 cuando cae de lunes a viernes;
  - el lunes 2 cuando el día 1 fue domingo;
  - el lunes 3 cuando el día 1 fue sábado.
- La ventana es siempre el mes calendario inmediatamente anterior.
- No existe una recuperación productiva automática para agosto de 2026.

## Evidencia posterior

- Ejecución 306: una invocación MCP tomó la rama programada; llegó hasta la
  verificación de idempotencia y no creó una campaña nueva.
- Ejecución 310: prueba manual de agosto completada correctamente.
- Orquestador 311: 16 noticias, 2 anuncios, `invalidCount=0`.
- Compilación 312: HTML de 108,533 bytes.
- Brevo 313: operación `Enviar prueba Brevo`, campaña de prueba 1000,
  `status=test_sent`.
- No se ejecutó el nodo SMTP durante esta prueba.
- No se creó ni programó otra campaña productiva después de la cancelación de
  la campaña 999.

## Estado final

- Coordinador diario `f54704c5e44f602a`: activo y publicado.
- Coordinador mensual `e1a71f7ed90c4ef4`: activo y publicado.
- `/healthz`: HTTP 200 después del despliegue.
- `npm test`: 7 archivos aprobados, 0 fallos.
- `npm run validate:workflows`: 16 workflows aprobados.
- La próxima entrega mensual automática corresponderá a septiembre en el
  primer día laborable de octubre de 2026.

## Decisión operativa

No programar ni enviar una nueva campaña productiva de agosto. La ruta manual
de agosto permanece únicamente como prueba controlada de Brevo. Cualquier
reenvío productivo exigiría autorización explícita y una nueva clave de
idempotencia.
