# ADR-0050: Tipos personalizados de variable con desplegable

- Estado: aceptada (2026-11-18)
- Requisitos: Q-110 a Q-117, Q-12, Q-92, U-10
- Relacionada: Q-20 a Q-25, Q-100, ADR-0048

## Contexto

En el formulario de variables (Q-20), una variable que recibe un identificador, por ejemplo el de un lenguaje o el de un elemento de un catálogo, es un campo de texto. El usuario tiene que buscar antes el identificador en otra consulta o recordarlo.

Petición del usuario (2026-11-17):

- Tipos personalizados que se declaran en el token como los demás: `#{lenguajeId, lang}`. El campo es un desplegable con el contenido, que se consulta nada más abrir la pestaña.
- Todo desplegable tiene la opción «(Vacío)», que vale null y es la de por defecto.
- Como las referencias (ADR-0048), cada tipo se define en «Ajustes» con un nombre y una nota SQL: `lang` con `SELECT id AS key, nombre AS value FROM lenguaje`. `key` es lo que recibe la variable y `value` el nombre.
- Un tipo puede llevar un parámetro tras el nombre, para no crear una nota por catálogo de una tabla maestra: el tipo `catalogo#{id}` con `SELECT id AS key, nombre AS value FROM catalogo_item WHERE catalogo_id = #{id}`, usado como `#{tipoId, catalogo5}`, muestra solo el catálogo 5.

Respuestas del usuario (2026-11-18):

- Cada opción se ve como «key — value».
- Las opciones se consultan una vez al abrir la pestaña y se guardan en memoria hasta cerrarla o cambiar la conexión o los tipos.
- El control es un combo con buscador: al escribir se filtran las opciones.

## Decisión

1. **Ajustes.** `config.json` gana `types`, una lista de `{ name, noteId }`, en una categoría nueva, «Tipos», tras «Referencias». El nombre es un identificador (`[A-Za-z_][A-Za-z0-9_]*`, hasta 64 caracteres) y puede terminar en un parámetro `#{nombre}`. No se repite, sin distinguir mayúsculas, ni coincide con un tipo de la tabla de Q-12 (`string`, `int`, `integer`, …). Cada tipo necesita su nota; como en las referencias, la nota se comprueba al consultar, no al guardar.
2. **Uso.** En `#{x, t}` o `#{x, javaType=t}`, un `t` que no es de la tabla de Q-12 se busca entre los tipos: primero uno sin parámetro con ese nombre; si no, uno con parámetro cuyo nombre sea el principio de `t`, sin distinguir mayúsculas, con algo detrás, que es el valor del parámetro (`catalogo5` → `catalogo#{id}` con `5`). Con varios, gana el nombre más largo. Si no hay ninguno, sigue siendo el error de tipo desconocido (Q-92). Vale también en un comentario (Q-15). Guardar los tipos vuelve a analizar las notas abiertas, como las constantes (M-67).
3. **Valor.** Una variable de un tipo personalizado es string para MyBatis: recibe la `key` tal cual, y MySQL la compara con la columna. Usarla en `${…}`, como colección de un `<foreach>`, en el item de un `<foreach>` o con otro tipo es un error de tipos contradictorios (Q-92).
4. **Nota del tipo.** Es una nota SQL con una consulta: sin variables si el tipo no tiene parámetro y con una sola, que recibe el valor del parámetro, si lo tiene. Se ejecuta su contenido guardado en solo lectura (S-01 a S-06), con el tiempo máximo de consulta y el tope de filas (Q-55). La `key` es la columna con etiqueta `key` y el `value` la de etiqueta `value`, sin distinguir mayúsculas; si no están, la primera y la segunda columna, o la primera para las dos si solo hay una. `KEY` es palabra reservada de MySQL: el alias se escribe `` AS `key` `` o se omite. Las filas con `key` nula no se ofrecen, porque null es «(Vacío)».
5. **Ruta.** `POST /api/sql/options` con el tipo tal como se usa (`catalogo5`) devuelve `[key, value]` en el orden de la consulta y si se llegó al tope. El servidor busca el tipo en los ajustes. No recuerda valores (Q-24), no cuenta como ejecución (N-88) y no registra el parámetro (S-22).
6. **Combo.** En consulta, el campo de una variable de tipo personalizado es un combo: un cuadro de texto con una lista. Cada opción se ve como «key — value» y la primera es «(Vacío)», que es el valor por defecto. Al escribir, la lista muestra las opciones que contienen el texto, sin distinguir mayúsculas ni acentos, hasta 200; si hay más, lo dice. Flechas para moverse, Intro o clic para elegir, Esc para cerrar la lista. Con la lista cerrada, Intro ejecuta (Q-23). Al salir sin elegir, el cuadro vuelve a mostrar la opción elegida. Un valor recordado (Q-24) que no está entre las opciones se conserva y se ve solo con su `key`.
7. **Consulta y memoria.** Las opciones de cada tipo usado se piden al mostrar el formulario en la pestaña y se guardan en memoria por pestaña. Se olvidan al cerrarla, al cambiar la conexión o al guardar los ajustes de tipos. Mientras llegan, la lista dice «Consultando…»; si fallan, el error se ve bajo el campo, la lista solo ofrece «(Vacío)» y no se recuerda el fallo, para reintentar al volver a la pestaña. Nada se guarda en disco.
8. **Fuera del formulario.** En el editor (Q-82) la variable se lista con el nombre de su tipo. Las hijas de una nota XML se ejecutan igual que las notas SQL y también tienen el combo. En los workflows (W-50), que no se han pedido, el campo es de texto, como un string.

## Consecuencias

- Una ruta nueva que no modifica nada: ejecuta una nota ya clasificada como consulta (S-01, S-02).
- Ningún destino nuevo (constitución, punto 4) y ninguna dependencia nueva: el combo es propio.
- El análisis de una nota depende de los tipos de «Ajustes»: una nota que usa un tipo que luego se borra pasa a tener un error de tipo desconocido.
- El ejemplo del usuario `SELECT id AS key …` falla en MySQL por la palabra reservada; el texto de ayuda de «Ajustes → Tipos» lo indica.
