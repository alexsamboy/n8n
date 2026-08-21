# Catálogo de workflows

Los exports de n8n se organizan por función para facilitar su búsqueda y mantenimiento:

- `apps/`: automatizaciones asociadas a una aplicación o proceso institucional.
- `libraries/`: workflows reutilizables invocados por otras automatizaciones.
- `archive/`: versiones históricas inactivas que se conservan como referencia.

## Convención de nombres en n8n

- `APP — <aplicación> — <proceso>`: punto de entrada o coordinador.
- `ORCH — <aplicación> — <proceso>`: orquestación compartida dentro de una aplicación.
- `OPS — <aplicación> — <proceso>`: monitoreo, errores y operación.
- `LIB — <dominio> — <capacidad>`: componente reutilizable.
- `ARCHIVE — <aplicación> — <referencia>`: workflow retirado.

## Convención de etiquetas

Las etiquetas complementan las carpetas y permiten búsquedas transversales:

- `app:<nombre>` identifica la aplicación propietaria.
- `tipo:<función>` distingue coordinadores, orquestadores, operaciones y librerías.
- `canal:<nombre>` identifica integraciones como SMTP o Brevo.
- `formato:<nombre>` identifica capacidades como MJML.
- `estado:<nombre>` indica el estado operativo.

Cada aplicación y biblioteca mantiene su propio `README.md` con IDs de n8n,
dependencias, orden de importación y consideraciones operativas. El archivo
`.json` en esta carpeta contiene metadata del repositorio y no es un workflow.

Aplicaciones actuales: `agenda-pucmm` y `boletin-interno-prensa`.
