# Auditoría de Power Automate — Boletín Interno Prensa

Fecha: 2026-08-21. Fuente auditada por el solicitante:
`3BoletinInternoPrensa-10736174-90C4-F011-BBD3-6045BD0510D4.json`.

La migración sustituye los días calendario por la ventana semiabierta desde el
último envío confirmado, incluye el domingo, pagina ambas conexiones, trata
`errors[]` como fallo, valida HTTPS, escapa contenido, limita publicidad de
forma determinista y separa prueba, dry-run, compilación y envío.

No se copiaron las contraseñas de aplicación encontradas en la solución. Se
consideran comprometidas y deben rotarse antes de crear las credenciales n8n
`WordPress Prensa - Application Password` y
`WordPress Agenda - Application Password`.

El envío heredado de Microsoft 365 se reemplaza inicialmente por la biblioteca
SMTP ya validada. Microsoft Graph queda fuera porque la instalación fue
definida previamente para no utilizarlo.

Rectoría conserva precedencia absoluta (`segment=0`), Portal PUCMM usa
`segment=1` y el resto `segment=2`; los empates se resuelven por fecha
descendente e ID ascendente.

El estado se almacena en la Data Table `Boletín Interno Prensa — estado`, ID
`nRoI0Ta5SQizvi0U`. Su cursor solo puede avanzar después de una confirmación
del proveedor; dry-run no escribe una confirmación.
