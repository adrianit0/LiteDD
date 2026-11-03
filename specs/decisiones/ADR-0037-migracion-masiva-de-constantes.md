# ADR-0037: Migración masiva de constantes

- Estado: aceptada (2026-11-03)
- Requisitos: M-65, M-69, M-70
- Completa: ADR-0025 (constantes Java) y ADR-0026 (ventana «Constantes»)

## Contexto

Con muchos mappers pegados, la ventana «Constantes» tiene decenas de constantes y darles valor una a una es pesado. Los valores ya están en el fichero `.java` de constantes del proyecto de trabajo.

El usuario pide un botón «Migración masiva» en «Constantes» para pegar el contenido de ese `.java`, que detecte los valores y los ponga en las constantes, sustituyendo el que tuvieran. El contenido pegado no se guarda y no se añaden más constantes de las necesarias.

## Decisión

Respuestas del usuario (2026-11-03):

1. **Valores que se entienden:** literales y referencias. Números en cualquier notación de Java, textos, caracteres, `true` y `false`, las construcciones de los tipos envoltorio (`Long.valueOf(1)`, `new BigDecimal("1.5")`) y referencias a otras constantes del mismo texto. Las operaciones (`60 * 1000`, `PREFIJO + "_X"`) no se calculan: esas constantes se listan para darles valor a mano.
2. **Guardado:** «Aplicar» rellena la tabla con cambios sin guardar y un resumen. Se guardan con «Guardar», que ya pregunta al cerrar si quedan cambios pendientes (ADR-0026).

Diseño:

- **Solo en la interfaz.** El texto se analiza en el navegador (`javaConstants.ts`) y se cruza con la lista que ya tiene la ventana. No hay ruta nueva: el texto no llega al servidor, no se guarda en SQLite ni en el navegador, y se descarta al aplicar o cancelar. Los valores llegan por el `PUT /api/constants` de siempre.
- **Solo las constantes de la lista.** Se rellenan las que aparecen en las notas o ya tienen valor (M-61, M-66). Los demás campos del texto se cuentan en el resumen, pero no se añaden.
- **Nombres:** `package` + clase + campo, como en OGNL. Las clases anidadas se nombran con `$` (`@paquete.Clase$Interna@CAMPO`), porque así las carga OGNL. Si el texto no tiene `package`, se busca por clase y campo en cualquier paquete. Se pueden pegar varios ficheros seguidos: cada `package` vale hasta el siguiente.
- **Campos:** los `static` de clases, enum y record, y todos los de las interfaces. Las constantes de un enum no son literales y no se leen.
- **Valores:**
  - Los enteros se pasan a decimal (`0x1F` → `31`, `1_000` → `1000`, `5L` → `5`) para que M-62 los use como número.
  - Los decimales `float` y `double` se escriben como Java (`1.5f` → `1.5`, `5d` → `5.0`). `new BigDecimal("1.50")` conserva el texto tal cual.
  - Un texto vacío, solo de espacios o de varias líneas no se puede guardar como valor (un valor vacío quita la constante, M-66), así que no se lee.
- **Resumen:** constantes rellenadas, las que ya tenían ese valor, campos del texto que no están en la lista y constantes de la lista cuyo valor no se ha podido leer, por su nombre corto.
- **Revisión:** las filas cuyo valor no coincide con el guardado se marcan, tanto si vienen de la migración como si se han editado a mano.

## Consecuencias

- Pegar el fichero de constantes del proyecto basta para dar valor a todas las que usan los mappers. Las que se calculan con operaciones se completan a mano.
- No cambia la API, ni el modelo de datos, ni la exportación (M-68).
- Si una constante cambia en el proyecto, se vuelve a pegar el fichero: los valores nuevos sustituyen a los guardados.
