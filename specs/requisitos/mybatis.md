# Requisitos de las notas XML MyBatis

Cuarto tipo de nota: un mapper de MyBatis completo, tal cual se copia del proyecto. Al guardarlo, LiteDD genera una nota SQL hija de solo lectura por cada sentencia, con los fragmentos `<sql>` ya incluidos. Así se prueban las consultas de un mapper sin arrancar la aplicación que lo usa (ADR-0023). Los ejemplos usan el esquema inventado litedd_demo (S-31).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="demo.BookMapper">
  <sql id="bookColumns">b.id, b.title, b.year</sql>

  <select id="selectByAuthor" resultType="demo.Book">
    SELECT <include refid="bookColumns"/>
    FROM book b
    <where>
      <if test="authorId != null">AND b.author_id = #{authorId,int}</if>
    </where>
  </select>

  <update id="renameBook">
    UPDATE book SET title = #{title} WHERE id = #{id,int}
  </update>
</mapper>
```

Esta nota genera dos hijas: «selectByAuthor», que se ejecuta como cualquier nota SQL, y «renameBook», que solo genera su SQL.

## Formato

| ID | Requisito |
|---|---|
| M-01 | Las notas XML MyBatis se crean con «Nueva nota MyBatis» del panel o «Nueva nota MyBatis hija» del menú contextual. Tienen título, descripción, etiquetas, favorita e historial como las demás. |
| M-02 | El contenido es un mapper completo: declaración XML, DOCTYPE y `<mapper>` raíz. El DOCTYPE se ignora: no se descarga la DTD ni se resuelve ninguna entidad (principio 4). |
| M-03 | El elemento raíz debe ser `<mapper>`. El atributo `namespace` es opcional. |
| M-04 | Son sentencias los hijos directos `<select>`, `<insert>`, `<update>` y `<delete>`. Cada uno necesita un `id` único en el mapper. |
| M-05 | Los fragmentos `<sql id>` se usan con `<include refid>` desde las sentencias y desde otros fragmentos, con `<property>` incluidas. Los resuelve el `XMLIncludeTransformer` de MyBatis (Q-30). `refid` puede llevar delante el namespace del propio mapper; un fragmento de otro mapper es un error. |
| M-06 | Se ignoran `<resultMap>`, `<parameterMap>`, `<cache>`, `<cache-ref>`, `<selectKey>` y todos los atributos de las sentencias salvo `id`. No se carga ninguna clase Java. |

## Hijas generadas

| ID | Requisito |
|---|---|
| M-10 | Al guardar la nota XML se genera una nota SQL hija por cada sentencia, en el orden del mapper y con el `id` como título. |
| M-11 | El contenido de la hija es el cuerpo de la sentencia con los `<include>` resueltos, sin el elemento envolvente ni la sangría común. Las etiquetas dinámicas, los comentarios y los CDATA se conservan. Por lo demás es una nota SQL: variables, formulario, valores recordados, ejecución, paginación y «SQL final». |
| M-12 | Cada hija se identifica por el `id` de su sentencia. Al guardar el padre se actualizan el contenido y el orden de las que siguen, se crean las nuevas y se borran definitivamente las de sentencias que ya no están, con sus valores (ADR-0023). Cambiar el `id` de una sentencia equivale a borrarla y crear otra. |
| M-13 | Si el mapper tiene errores (M-40), el padre se guarda igualmente y las hijas se quedan como estaban. |
| M-14 | La generación va en la misma transacción que el guardado del padre (D-03). También se genera al restaurar una versión del historial del padre, al duplicarlo y al restaurarlo de la papelera. |
| M-15 | Las pestañas abiertas de las hijas se recargan cuando el padre se guarda. |

## Solo lectura

| ID | Requisito |
|---|---|
| M-20 | Las hijas son de solo lectura: no tienen modo edición ni historial, y no se renombran, no se mueven, no se eliminan y no admiten hijas. Sí pueden ser favoritas y llevar etiquetas. |
| M-21 | La cabecera de una hija dice «Generada desde» con un enlace al padre. |
| M-22 | La nota XML solo tiene las hijas generadas: no se crea ni se suelta ninguna otra nota dentro de ella. |
| M-23 | `<insert>`, `<update>` y `<delete>` no se ejecutan nunca (principio 3, S-01, S-06). Su hija muestra «Generar SQL» y, con los valores elegidos en el formulario, el SQL final listo para copiar y ejecutar en otra herramienta (Q-45, Q-72). Un `<select>` cuyo SQL no sea una consulta se trata igual. |
| M-24 | En el árbol, en la lista de sentencias y en la cabecera, las hijas de `<insert>`, `<update>` y `<delete>` llevan una marca con el nombre de la etiqueta: INSERT, UPDATE o DELETE. |

## Árbol y papelera

| ID | Requisito |
|---|---|
| M-30 | Eliminar la nota XML lleva sus hijas a la papelera con ella, sin preguntar por ellas. En la papelera solo aparece la nota XML. Restaurarla restaura sus hijas; eliminarla definitivamente las borra. |
| M-31 | Duplicar la nota XML crea una copia con sus propias hijas generadas. Duplicar una hija crea una nota SQL normal e independiente, justo debajo de la nota XML. |
| M-32 | La nota XML se mueve con sus hijas como cualquier otra nota. |

## Editor y consulta

| ID | Requisito |
|---|---|
| M-40 | Errores del mapper, con línea y columna cuando las hay: XML mal formado, raíz que no es `<mapper>`, sentencia sin `id`, `id` repetido, fragmento inexistente o de otro mapper e `<include>` circular. |
| M-41 | En edición, el editor resalta las etiquetas MyBatis y los tokens `#{}` y `${}` (Q-80). Debajo se listan en vivo las sentencias, con su etiqueta, y los errores. |
| M-42 | En consulta se ve el XML resaltado, de solo lectura, y encima la lista de sentencias generadas, cada una con un enlace a su hija. Si el mapper guardado tiene errores, también se muestran. |

## Exportación

| ID | Requisito |
|---|---|
| M-50 | La nota XML se exporta como `.xml` y sus hijas como `.sql`, en su carpeta. El manifiesto indica en cada hija su `statementId` y su `statementKind`, y la importación los conserva. |
