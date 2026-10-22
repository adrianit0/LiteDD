# ADR-0030: «Ajustes» por categorías, conexión dentro de Ajustes y CA opcional por entorno

- Estado: aceptada (2026-10-22)
- Requisitos: U-10, U-12, U-13, C-01, C-02, C-09, C-11, H-10, H-15, H-20, H-21, H-31, H-60, H-62, H-64, H-66, H-67, H-69, H-70, H-71, S-16, constitución (principio 4)
- Modifica: ADR-0028 (casilla y CA en «Ajustes → HTTP», CA siempre obligatoria, selector junto al estado de la conexión)

## Contexto

Cada sprint ha añadido campos a «Ajustes», que ya es una sola columna larga: crece con el contenido, hay que desplazarse hasta el final para guardar o cerrar, y los ajustes de los entornos se mezclan con los generales de HTTP. La conexión a MySQL vive en otro diálogo, al que se llega desde «Ajustes» o desde el estado de la barra superior.

Además, hoy todo entorno de preproducción exige la CA corporativa importada (H-66, H-67). Hay entornos cuyo certificado ya es de confianza en el equipo y para los que no se tiene el PEM a mano.

## Decisión

Petición del usuario (2026-10-22):

1. **Ventana más ancha y de alto fijo.** No crece con el contenido: solo se desplaza la categoría elegida.
2. **«×» arriba a la derecha** para cerrar, como en «Constantes» (ADR-0026).
3. **«Cerrar» y «Guardar ajustes» juntos en el pie**, siempre visibles.
4. **Categorías como botones a la izquierda**, para pasar de una a otra.
5. **Casilla «Pedir CA corporativa» en cada entorno**, marcada por defecto. Desmarcada, no obliga a tener la CA importada.
6. **Orden de los entornos.** Se pueden mover; Local es siempre el primero y el perfil por defecto.
7. **La conexión sale de la barra superior** y pasa a la categoría «Conexión» de «Ajustes».
8. **Categoría «Entornos» propia, justo debajo de «HTTP»,** con todo lo de los entornos.

Respuestas del usuario a las preguntas de diseño (2026-10-22):

- **Sin «Pedir CA corporativa», el certificado se valida contra las CA de confianza de Java** (en Ubuntu, las del sistema), y el nombre se comprueba siempre. Se descartó aceptar cualquier certificado: rompería H-67 y volvería a abrir el hueco del DNS que cerraba ADR-0028.
- **La barra superior no muestra nada de la conexión.** El estado y «Reconectar» están en «Ajustes → Conexión». El error de una nota SQL sin conexión sigue ofreciendo «Reconectar» o «Configurar la conexión».
- **Categorías, en este orden:** General, Conexión, SQL, HTTP, Entornos y Datos.
- **Un único «Guardar ajustes».** También guarda la conexión, pero solo si alguno de sus datos cambió. «Probar conexión» se queda dentro de su categoría.

Diseño:

- **Contenido de cada categoría:**

  | Categoría | Contenido |
  |---|---|
  | General | Puerto, apagado automático y guardado automático |
  | Conexión | Estado con «Reconectar»; método, host, puerto, usuario, contraseña, esquema y parámetros JDBC, con «Probar conexión» |
  | SQL | Tamaño de página por defecto, tope de filas y tiempo máximo de consulta |
  | HTTP | Nota de login, tiempo máximo, tamaño máximo de respuesta y headers generados |
  | Entornos | Casilla de preproducción, perfiles en su orden, clave de confirmación y CA corporativa |
  | Datos | Exportar, importar, crear copia y abrir la carpeta de datos |

- **Navegación:** las categorías son pestañas verticales (`tablist`). Se recorren con el ratón o con las flechas arriba y abajo. Solo se monta la categoría elegida. Los datos del formulario viven en la ventana, así que cambiar de categoría no pierde nada.
- **Cerrar:** «×», «Cerrar» y Esc cierran sin guardar, como hasta ahora.
- **Guardar:**
  - Primero los ajustes y las contraseñas, como hasta ahora.
  - Después la conexión, si cambió, con la regla de C-04: hace falta usuario y esquema.
  - Si algo falla, la ventana sigue abierta con el error en el pie.
- **Accesos desde otras partes:** «Configurar la conexión» de una nota SQL abre «Ajustes» en «Conexión»; «Abrir «Ajustes»» de una nota HTTP sin URL base, en «Entornos». El diálogo «Conexión» independiente desaparece.
- **Orden de los entornos:** botones «Subir» y «Bajar» en cada entorno de preproducción. Local no los tiene. El servidor ya guarda los perfiles en el orden recibido, con Local siempre el primero (H-60), y el selector de la barra superior usa ese orden.
- **«Pedir CA corporativa» (`requireCa` en config.json):**
  - Sin el campo, vale `true`: los entornos guardados antes de este cambio siguen exigiendo la CA.
  - Local no tiene la casilla y su valor es siempre `false`.
  - Marcada, la llamada usa el cliente que solo confía en la CA importada (H-66) y, sin CA, no se hace (H-67).
  - Desmarcada, usa el cliente por defecto de Java, el mismo que Local, sin la comprobación de dirección local de H-40.
  - Las dos validan la cadena y el nombre del certificado. El mensaje de error indica contra qué se validó: «la CA importada» o «una CA de confianza de Java».
- **Se mantienen** https obligatorio, nombre de host en lugar de IP, el mismo host y puerto en cada URL final (H-65), sin redirecciones ni proxy (H-68) y la clave de confirmación (H-69).
- **Constitución, principio 4:** «solo por HTTPS validado contra su CA corporativa o, si el usuario lo elige en un entorno, contra las CA de confianza de Java».

## Consecuencias

- Un entorno sin «Pedir CA corporativa» confía en cualquier CA pública de Java. Un equipo ajeno sigue sin poder presentar un certificado válido para el nombre interno de la empresa. Sí podría quien obtenga de una CA pública un certificado para ese nombre, si es un dominio público. Por eso la casilla nace marcada y quitarla es un gesto consciente.
- `HttpCaller.Call` indica si la llamada exige la CA corporativa; `HttpRunner` lo toma del perfil.
- `ConnectionStatusBar` y `ConnectionDialog` desaparecen. El formulario de la conexión pasa a una categoría de «Ajustes» y `uiStore` recuerda la categoría con la que se abre la ventana.
- Las pruebas de «Ajustes» eligen la categoría antes de buscar sus campos.
