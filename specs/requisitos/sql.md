# Requisitos de notas SQL

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Una nota SQL contiene exactamente una sentencia, escrita como el cuerpo de un mapper de MyBatis. En edición se modifica el texto; en consulta se rellenan sus variables, se ejecuta y se ven los resultados.

## Formato de la nota

| ID | Requisito |
|---|---|
| Q-01 | El contenido es el cuerpo de una sentencia MyBatis: SQL con `#{...}`, `${...}` y etiquetas dinámicas. |
| Q-02 | Se admite también la sentencia envuelta en `<select>`, `<insert>`, `<update>` o `<delete>`. Se ignoran los atributos y se usa el contenido. Más de un elemento envolvente, o texto fuera de él, es un error. |
| Q-03 | Etiquetas admitidas: todas las del lenguaje dinámico de MyBatis (if, where, choose, when, otherwise, trim, set, foreach, bind). `<include>` da el error «no admitido en esta versión». |
| Q-04 | El contenido debe ser XML válido, igual que en un mapper: `<` y `&` dentro del SQL se escriben como `&lt;` y `&amp;`, o dentro de `<![CDATA[ ]]>`. El error indica línea y columna. |
| Q-05 | Una nota contiene una sola sentencia. Un `;` final se ignora; cualquier otro `;` que separe sentencias es un error. |
| Q-06 | WHERE puede escribirse como cláusula SQL o con la etiqueta `<where>`. |

Ejemplo con el esquema de demostración:

```xml
SELECT b.id, b.title, a.name AS author
FROM book b
JOIN author a ON a.id = b.author_id
<where>
  <if test="title != null">
    AND b.title LIKE CONCAT('%', #{title}, '%')
  </if>
  <if test="minYear != null">
    AND b.year >= #{minYear,int}
  </if>
  <if test="authorIds != null">
    AND a.id IN
    <foreach collection="authorIds" item="id" open="(" separator="," close=")">
      #{id}
    </foreach>
  </if>
</where>
```

Esta nota muestra tres campos: title (string), minYear (int) y authorIds (list).

## Variables

| ID | Requisito |
|---|---|
| Q-10 | Se detectan los nombres usados en `#{...}` y `${...}` (la raíz, antes de un punto o corchete), y los identificadores usados en `test`, en `collection` de `<foreach>` y en `value` de `<bind>`. |
| Q-11 | Se excluyen: variables locales (`item` e `index` de `<foreach>`, `name` de `<bind>`), palabras y literales de OGNL (null, true, false, and, or, not, in, eq, neq, lt, lte, gt, gte, números y cadenas), `_parameter`, `_databaseId` y nombres de método tras un punto. |
| Q-12 | El tipo se declara en el propio token: `#{nombre}` o `#{nombre,tipo}`. También se acepta la forma nativa `#{nombre, javaType=tipo}`. LiteDD extrae el tipo y entrega a MyBatis `#{nombre}`. |
| Q-13 | Sin tipo declarado, la variable es string. |
| Q-14 | Una variable usada como `collection` de un `<foreach>` es list automáticamente. Si el token del item declara tipo, se convierte cada elemento. |
| Q-15 | Una variable que solo aparece en un test se tipa con un comentario XML, que MyBatis ignora: `<!-- #{onlyActive,boolean} -->`. |
| Q-16 | Tipos contradictorios para la misma variable son un error, visible en edición y en consulta. Si un token declara tipo y los demás no, vale el declarado. |
| Q-17 | `${...}` es sustitución textual: el valor se inserta tal cual en el SQL. Siempre es string y el editor lo resalta en otro color. |

| Tipo | Valor Java | Control | Entrada válida |
|---|---|---|---|
| string | String | Texto | Cualquiera; no se recorta |
| int | Integer | Texto | Entero con signo |
| long | Long | Texto | Entero con signo |
| decimal | BigDecimal | Texto | Número con punto decimal |
| boolean | Boolean | Selector: vacío, sí, no | |
| date | String validado | Selector de fecha | yyyy-MM-dd |
| datetime | String validado | Selector de fecha y hora | yyyy-MM-dd HH:mm:ss |
| list | List | Texto | Valores separados por comas; se recorta cada uno |

## Formulario de variables

| ID | Requisito |
|---|---|
| Q-20 | En consulta, sobre los resultados, aparece un formulario con un campo por variable, en orden de aparición, con su nombre y su tipo. Tiene el aspecto de los criterios de un buscador. |
| Q-21 | Un campo vacío vale null. Sin excepciones. |
| Q-22 | Un valor que no convierte a su tipo marca el campo con un error y no se ejecuta. |
| Q-23 | Intro en cualquier campo, o Ctrl+Intro, ejecuta. El botón «Limpiar» vacía todos los campos. |
| Q-24 | Los últimos valores ejecutados se recuerdan por nota y se proponen al abrirla. Cada pestaña mantiene sus propios valores. |
| Q-25 | Una nota sin variables no muestra formulario, solo el botón «Ejecutar». |

## Renderizado con MyBatis

MyBatis genera el SQL y la lista ordenada de parámetros; LiteDD ejecuta con su propio PreparedStatement. Así se conservan los metadatos de las columnas, incluidos los nombres repetidos.

```java
Configuration cfg = new Configuration();                 // única, reutilizada
LanguageDriver driver = new XMLLanguageDriver();
SqlSource source = driver.createSqlSource(cfg, "<script>" + body + "</script>", Map.class);
BoundSql bound = source.getBoundSql(params);             // params: Map<String,Object> ya convertido
String sql = bound.getSql();                             // SQL con '?'
MetaObject meta = cfg.newMetaObject(params);
for (ParameterMapping pm : bound.getParameterMappings()) {
    String prop = pm.getProperty();
    Object value = bound.hasAdditionalParameter(prop)    // elementos de foreach, bind
        ? bound.getAdditionalParameter(prop)
        : meta.getValue(prop);
    // statement.setObject(i++, value)
}
```

| ID | Requisito |
|---|---|
| Q-30 | El SQL final se genera siempre con el motor de MyBatis, como en el fragmento anterior. No se reimplementa ninguna etiqueta. |
| Q-31 | El mapa de parámetros contiene todas las variables detectadas, ya convertidas a su tipo y con null por defecto. |
| Q-32 | La ejecución es JDBC directo; no se usan mappers ni ResultMap contra MySQL. |
| Q-33 | Los SqlSource se cachean por hash del contenido de la nota. |

## Ejecución

| ID | Requisito |
|---|---|
| Q-40 | Una nota nunca se ejecuta al abrirla. Solo con «Ejecutar». |
| Q-41 | Durante la ejecución se muestra un cronómetro en vivo y el botón «Cancelar» (también Esc), que llama a `Statement.cancel()`. |
| Q-42 | Al terminar se muestra el tiempo total, el tiempo de servidor y las filas: «1,24 s (servidor 1,19 s) · 20 filas». |
| Q-43 | Tiempo máximo de 30 s, ajustable. Al superarlo se cancela y se informa. |
| Q-44 | SHOW, DESCRIBE y EXPLAIN se ejecutan tal cual, sin paginación ni ordenación, con el tope de filas. |
| Q-45 | Si la sentencia no es ejecutable (S-01, S-02), el botón pasa a ser «Generar SQL». Se muestra el SQL final con el aviso: «LiteDD solo ejecuta consultas. Copia la sentencia para ejecutarla en otra herramienta.» |
| Q-46 | Sin conexión, se muestra el error con un botón «Reconectar». El resto de la aplicación sigue funcionando. |
| Q-47 | Ante un fallo de comunicación (SQLState 08xxx) se reintenta una vez con una conexión nueva. |

## Paginación, ordenación y total

| ID | Requisito |
|---|---|
| Q-50 | Tamaños de página: 10, 20 (por defecto), 50, 100, 200, 500 y «Sin límite». Se elige por pestaña; el valor por defecto es un ajuste. |
| Q-51 | LiteDD añade la paginación al final del SQL renderizado: `<sql> ORDER BY <n> <ASC o DESC> LIMIT <tamaño+1> OFFSET <desplazamiento>`. `<n>` es la posición de la columna, desde 1; la cláusula de orden solo se añade si se ha elegido orden en la tabla. Se ordena por posición y no por nombre para admitir consultas con nombres de columna repetidos. |
| Q-52 | Siempre se pide una fila más de las que se muestran. Si llega, hay página siguiente. No se lanza ningún COUNT automático. |
| Q-53 | Si la página no se llena, el total ya se conoce (desplazamiento más filas) y se muestra. |
| Q-54 | El botón «Contar» calcula el total con `SELECT COUNT(*) FROM (<sql>) AS litedd_count`. Si falla por nombres de columna duplicados (error 1060), se recorre la consulta en streaming contando filas, bajo el tiempo máximo. |
| Q-55 | «Sin límite» aplica `LIMIT 10001`. Si llegan 10.001 filas, se muestran 10.000 y un aviso de tope alcanzado. El tope es un ajuste. |
| Q-56 | Clic en una cabecera: ascendente, descendente, sin orden. Reejecuta desde la página 1. El orden es de la pestaña y no se guarda en la nota. |
| Q-57 | Se asume que la nota no termina en ORDER BY ni LIMIT. Si termina en ORDER BY y no se ha elegido orden en la tabla, solo se añade LIMIT. En cualquier otro caso se envuelve: `SELECT * FROM (<sql>) AS litedd_page` más orden y límite. Si el envoltorio falla por columnas duplicadas, el mensaje pide quitar ORDER BY y LIMIT de la nota. |
| Q-58 | Un analizador léxico propio, que entiende cadenas, comentarios y paréntesis, detecta el `;`, el ORDER BY y el LIMIT de primer nivel y las cláusulas prohibidas. No se usa un parser SQL completo. |
| Q-59 | Controles de página: primera, anterior, siguiente, número de página y rango visible («21–40»). Cambiar el tamaño vuelve a la página 1. |

## Tabla de resultados

| ID | Requisito |
|---|---|
| Q-60 | El formato es siempre el mismo: cabecera fija, columna con el número de fila, desplazamiento en ambos ejes y filas virtualizadas. |
| Q-61 | Las cabeceras son las etiquetas de columna (`getColumnLabel`). Se admiten repetidas. |
| Q-62 | Los valores se leen como texto (`getString`), sin conversiones de zona horaria. Los binarios se muestran como `[BLOB 2,3 KB]`. |
| Q-63 | NULL se muestra atenuado y en cursiva, distinto de la cadena vacía. Los números se alinean a la derecha. |
| Q-64 | Las celdas largas se truncan a 200 caracteres en la tabla. Un clic abre el valor completo, hasta 10.000 caracteres, con aviso si el servidor lo recortó. |
| Q-65 | Clic selecciona una celda; Ctrl+C copia su valor. |
| Q-66 | «Copiar tabla» copia las filas cargadas como tabla Markdown GFM: la barra vertical se escapa, los saltos de línea pasan a `<br>` y los nulos a NULL. |
| Q-67 | Los resultados no se guardan en disco. Se pierden al cerrar la pestaña o la aplicación. |
| Q-68 | Una consulta sin filas muestra las cabeceras y el mensaje «Sin resultados». |

## SQL final

| ID | Requisito |
|---|---|
| Q-70 | Tras cada ejecución o generación hay un panel plegable «SQL final», cerrado por defecto. |
| Q-71 | Vista «Con parámetros»: el SQL con `?` y la lista numerada de valores con su tipo. |
| Q-72 | Vista «Con valores»: los literales insertados con el escapado de MySQL, lista para pegar en otra herramienta. No incluye la paginación añadida por LiteDD. |
| Q-73 | Las dos vistas tienen botón «Copiar». |

## Editor SQL

| ID | Requisito |
|---|---|
| Q-80 | Resaltado de SQL (dialecto MySQL), de etiquetas MyBatis y de tokens `#{}` y `${}`. |
| Q-81 | Barra con inserciones: `#{}`, `<if>`, `<where>`, `<choose>`, `<foreach>`, `<trim>` y `<![CDATA[ ]]>`. |
| Q-82 | Bajo el editor se listan en vivo las variables detectadas con su tipo y los errores de análisis. |

## Errores

| ID | Situación | Mensaje |
|---|---|---|
| Q-90 | XML mal formado | Línea, columna y causa |
| Q-91 | Expresión test inválida | La expresión y el error de OGNL |
| Q-92 | Tipo desconocido o contradictorio | Variable y tipos implicados |
| Q-93 | Valor no convertible | En el campo: tipo esperado |
| Q-94 | Más de una sentencia | «Una nota solo puede contener una sentencia» |
| Q-95 | Cláusula no permitida | La cláusula detectada |
| Q-96 | Error de MySQL | Código y mensaje del servidor, sin traducir |
| Q-97 | Tiempo agotado o cancelación | Tiempo transcurrido |
| Q-98 | Sin conexión | Causa y botón «Reconectar» |
