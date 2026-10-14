# ADR-0025: Fragmentos entre mappers y constantes Java

- Estado: aceptada (2026-10-14)
- Requisitos: M-05, M-16, M-17, M-40, M-60 a M-68, X-02, X-04, X-05
- Modifica: ADR-0023 («Un mapper con fragmentos de otros mappers no se puede resolver»)

## Contexto

Al pegar un mapper real del proyecto de trabajo, sus sentencias usan fragmentos `<sql>` de otros mappers con el `refid` cualificado por su namespace: `utilidadesMapper.columnasComunes` o `paginacionMapper.sqlPaginacion`. ADR-0023 lo dejó fuera, así que cada sentencia da el error de M-40. Copiar los fragmentos a mano en cada mapper anula la ventaja de pegar el mapper entero.

Además, los mappers usan constantes de clases Java con la sintaxis de OGNL para campos estáticos: `${@paquete.Clase@CAMPO}` en el SQL o `@paquete.Clase@CAMPO` dentro de un `test`. LiteDD no carga clases Java (M-06), así que OGNL no puede resolverlas.

## Decisión

Respuestas del usuario (2026-10-14):

1. **Fragmentos de otros mappers:** un `<include>` puede usar los fragmentos de cualquier otra nota XML MyBatis que no esté en la papelera, buscándola por su `namespace`.
2. **Namespace repetido:** si dos notas XML tienen el mismo namespace y una sentencia usa un fragmento de ese namespace, es un error claro que nombra las notas. El propio mapper siempre resuelve sus fragmentos sin prefijo, aunque otra nota tenga su mismo namespace. Por eso duplicar un mapper (M-31) no rompe la copia ni el original.
3. **Constantes:** cada `@paquete.Clase@CAMPO` que aparece en una nota SQL o XML se añade a una lista global de constantes. El usuario le da un valor una vez y vale para todas las notas.
4. **Tipo del valor:** automático. Si el valor es un número entero o decimal, se usa como número; si no, como texto.
5. **Constantes sin uso:** si dejan de aparecer en las notas, se conservan con su valor, marcadas como «sin uso», y se pueden borrar.
6. **Alcance:** las constantes valen en todas las notas SQL, no solo en las hijas de un mapper.

Diseño:

- **Biblioteca de mappers (`MapperSource.Library`):**
  - Se analiza una vez cada nota XML activa. Se guardan su namespace y sus fragmentos `<sql>`.
  - Al analizar un mapper, los fragmentos de las demás notas se registran en su `Configuration` con el nombre `namespace.id`. Los resuelve el mismo `XMLIncludeTransformer` de MyBatis (Q-30).
  - Se excluye la propia nota y su namespace. Las notas sin namespace no aportan fragmentos.
  - Un fragmento de otro mapper que use a su vez un `<include>` sin prefijo se resuelve, como en MyBatis, con el namespace del mapper que lo incluye. Por eso los fragmentos compartidos suelen llevar el `refid` completo.
- **Regeneración en cascada:** al guardar una nota XML, restaurar una versión suya, duplicarla, eliminarla o restaurarla de la papelera, se regeneran en la misma transacción las hijas de **todas** las notas XML activas, con una sola biblioteca. Una nota con errores conserva sus hijas (M-13). Tras guardar una nota XML, la interfaz recarga todas las pestañas de hijas generadas, no solo las de esa nota.
- **Errores:** el mensaje de M-40 nombra solo los fragmentos que faltan, con su namespace, y no todos los `<include>` de la sentencia.
- **Constantes (`sqlengine.JavaConstants`):**
  - Una referencia es `@` + nombre de clase con paquete + `@` + campo, sin un `(` detrás, porque eso sería una llamada a un método estático.
  - Antes de pasar la nota a MyBatis, cada referencia se cambia por una variable interna `__constant_N`, y su valor se añade al mapa de parámetros. Así funciona igual dentro de `${}`, `#{}`, `test`, `bind` y CDATA, sin escapar nada.
  - Las variables internas no aparecen en el formulario.
  - El contenido de las hijas conserva la referencia original, así que cambiar un valor no regenera nada.
- **Datos:**
  - Tabla `java_constant(name, value, updated_at)` (migración V005). Solo guarda las constantes con valor.
  - La lista se calcula juntando las constantes que aparecen en las notas SQL y XML activas con las guardadas.
  - Vaciar el valor quita la constante de la tabla.
- **Exportación:** las constantes con valor van en el manifiesto (`constants`). «Reemplazar todo» las sustituye. «Añadir como rama» solo añade las que no tienen valor todavía, para no cambiar los valores ya dados.

## Consecuencias

- Pegar todos los mappers del proyecto, cada uno en su nota XML, basta para que sus `<include>` cruzados funcionen. El orden en que se peguen no importa.
- Guardar una nota XML cuesta un análisis de cada nota XML activa. Con decenas de mappers sigue siendo de milisegundos a pocos cientos de milisegundos.
- Una nota en la papelera no aporta fragmentos. Los mappers que la usaban muestran el error y conservan sus hijas hasta que se restaura.
- Las constantes son datos del usuario: se exportan, a diferencia de los valores de variables (X-04), porque valen para todas las notas.
