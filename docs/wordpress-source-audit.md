# Auditoría de la fuente WordPress de Agenda PUCMM

Fecha: 2026-08-20  
Zona horaria de negocio: `America/Santo_Domingo`

## Resumen

La fuente viable es WPGraphQL en `https://dia.pucmm.edu.do/graphql`.
La API REST no es una alternativa pública en el estado actual: tanto el índice
como `/wp-json/wp/v2/types` y `/wp-json/wp/v2/taxonomies` responden HTTP 403 con
el código `forbidden_root` y el mensaje `REST root disabled.`

GraphQL permite consultas públicas de actividades y banners. La introspección
está desactivada por WPGraphQL incluso usando la credencial autenticada probada
el 20 de agosto de 2026, por lo que el mapa siguiente distingue entre campos
comprobados mediante consultas y campos aún no verificables.

## Auditoría autenticada

Se probó desde un nodo HTTP Request de n8n la credencial
`PUCMM WordPress API`, sin leer ni registrar su usuario o contraseña.

- Autenticación: correcta; `/wp-json/wp/v2/users/me?context=edit` respondió como
  usuario autenticado.
- `/wp-json/wp/v2/types`: accesible con la credencial.
- Tipos REST observados: `post`, `page`, `attachment`, `banner`, menús,
  plantillas, estilos, fuentes y tipos internos de Elementor/Astra/Spectra.
- GraphQL autenticado: accesible para consultas normales, pero la introspección
  continúa deshabilitada por la configuración de WPGraphQL.
- No se imprimieron respuestas de perfil, tokens, contraseñas ni contenido
  editorial durante la prueba; la salida conservada fue solo un resumen de
  estados y nombres de tipos.

La credencial es válida para nodos HTTP Request con tipo `HTTP Basic Auth`. El
workflow de producción ya usa dos nodos HTTP Request autenticados —actividades
y banners— con paginación nativa por cursor, máximo de 100 páginas y espera de
250 ms entre solicitudes. El Code node recibe únicamente las respuestas y no
puede acceder al secreto.

## Endpoint elegido

- Modo recomendado: `graphql`.
- Endpoint: `https://dia.pucmm.edu.do/graphql`.
- Autenticación de lectura observada: las consultas limitadas de actividades y
  banners funcionan públicamente. Se recomienda mantener una credencial n8n
  opcional para el caso de que WordPress cierre el acceso anónimo.
- REST: disponible con la credencial n8n; no está disponible anónimamente.
- Scraping HTML: no recomendado y debe permanecer desactivado.

## Tipos y conexiones comprobados

La introspección anónima devuelve un error explícito, pero las consultas
existentes y una muestra pública sanitizada verificaron estas conexiones:

- `posts(first, after, where)` para actividades.
- `banners(first, after, where)` para publicidad.
- Ambas exponen `pageInfo.hasNextPage` y `pageInfo.endCursor`.
- Una consulta de tres elementos devolvió `hasNextPage=true` en ambas
  conexiones, por lo que la paginación es obligatoria.
- `where.metaQuery` acepta comparaciones `DATETIME`; se comprobó públicamente
  el filtro de solapamiento con `LESS_THAN` y `GREATER_THAN_OR_EQUAL_TO`.

No se puede afirmar el nombre interno del post type REST ni enumerar todas las
taxonomías sin acceso administrativo o introspección autenticada.

## Mapa canónico comprobado

| Campo canónico | Campo GraphQL | Transformación |
|---|---|---|
| `id` | `databaseId` | Convertir número a string |
| `title` | `title` | Decodificar entidades y sanitizar como texto |
| `url` | `link` | Aceptar únicamente URL absoluta HTTPS |
| `category` | `categories.nodes[0].name` | Primer valor tras orden determinista, o null |
| `startAt` | `horaYFechaDelEvento.fechaInicio` + `horaDeInicio` | Combinar como hora civil de Santo Domingo |
| `endAt` | `fechaTermino` + `horaTermino` | Combinar como hora civil; null si falta |
| `venue` | `locations.nodes[0].name` | Texto sanitizado o null |
| `campus` | `detallesDelEvento.detcampus` | Texto sanitizado o null |
| `modality` | `detallesDelEvento.modalidad` | Normalizar a Presencial/Virtual/Híbrida/null |
| `status` | `detallesDelEvento.status` | Texto sanitizado o null |
| `organizer` | `organizer.nodes[0].organizador.nomCsd`, fallback `name` | Texto sanitizado |
| `imageUrl` | `featuredImage.node.sourceUrl` | HTTPS o null |

Los datos de contacto `telCsd` y `correoCsd` existen, pero no son necesarios
para la tarjeta solicitada y no deben incluirse en fixtures ni logs.

### Semántica de fecha y hora

WordPress devuelve la fecha separada de la hora. En la muestra, la fecha lleva
`+00:00` y siempre marca medianoche, mientras la hora real aparece como texto
separado (`6:00 pm`, por ejemplo). Ese offset no debe interpretarse como el
instante UTC del evento. La normalización correcta es:

1. extraer únicamente el año, mes y día de `fechaInicio`/`fechaTermino`;
2. parsear `horaDeInicio`/`horaTermino`;
3. construir la hora civil en `America/Santo_Domingo`;
4. producir ISO 8601 con `-04:00` y UTC solo para consultas que lo exijan.

Se encontró al menos un registro público con fecha final anterior a la fecha
inicial. Debe ir a la rama de inválidos; no se debe corregir silenciosamente.
Cuando el fin esté ausente, sí se permite usar el inicio como fin.

## Publicidad

Mapa comprobado:

| Campo canónico | Campo GraphQL |
|---|---|
| `id` | `databaseId` |
| `title` | `title` |
| `imageUrl` | `featuredImage.node.sourceUrl` |
| `targetUrl` | `newsletter.enlace` |
| `activeFrom` | `newsletter.inicio` |
| `activeUntil` | `newsletter.fin` |

No se comprobaron campos de `placement` ni `priority`: no aparecen en la
consulta existente y la introspección pública está desactivada. Mientras no se
habiliten o documenten, usar `placement=null`, `priority=0` y ordenar por ID
ascendente como desempate estable. Seleccionar como máximo dos anuncios tras
filtrar vigencia y validar ambas URL HTTPS.

## Paginación y filtros

- Tamaño previsto: `first: 100`.
- Continuación: `after: endCursor` hasta `hasNextPage=false`.
- Protección: cursor no repetido y máximo `WP_MAX_PAGES`.
- Actividades candidatas en servidor:
  `fecha_inicio < windowEndExclusive AND fecha_termino >= windowStart`.
- Repetir el filtro de solapamiento después de normalizar, porque los metadatos
  de WordPress contienen fechas y horas separadas y pueden ser inconsistentes.
- Orden final: `startAt`, después `title`, después `id`.

## Limitaciones pendientes

1. La introspección completa requiere habilitación explícita en WPGraphQL; la
   credencial actual autentica correctamente pero no elimina esa restricción.
2. REST permite enumerar tipos al autenticar, pero permanece bloqueado para
   solicitudes anónimas.
3. `placement` y `priority` de banners no están expuestos en los campos
   verificados.
4. Debe confirmarse institucionalmente si los eventos finalizados/cancelados
   se excluyen según `status`.

## Evidencia sanitizada

Las respuestas temporales de auditoría se guardaron fuera del repositorio en
`/tmp`. No se guardaron títulos, contactos, credenciales ni cuerpos completos
en este documento. Se comprobó una muestra de tres actividades y tres banners,
además de un filtro de solapamiento de agosto de 2026.
