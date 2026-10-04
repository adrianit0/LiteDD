# Sprint 4: Notas SQL en la interfaz

## Objetivo

Formulario de variables, ejecución, resultados y SQL final.

## Requisitos cubiertos

Q-20 a Q-25, Q-40 a Q-50, Q-59 a Q-98

Documentos: [requisitos/sql.md](../requisitos/sql.md), [requisitos/interfaz.md](../requisitos/interfaz.md), [requisitos/pestanas.md](../requisitos/pestanas.md).

## Tareas

1. Formulario de variables con validación por tipo y valores recordados (Q-20 a Q-25).
2. Barra de ejecución: Ejecutar o «Generar SQL», cronómetro, Cancelar y Esc, tiempos y filas (Q-40 a Q-47).
3. Tamaño de página, paginación, ordenación por cabecera y «Contar» (Q-50, Q-56, Q-59).
4. Tabla de resultados virtualizada, celdas, NULL, copia de celda y «Copiar tabla» en Markdown (Q-60 a Q-68).
5. Panel «SQL final» con sus dos vistas y botones de copia (Q-70 a Q-73).
6. Editor SQL con resaltado, inserciones y lista de variables en vivo (Q-80 a Q-82).
7. Mensajes de error Q-90 a Q-98.

## Criterios de aceptación

- Una nota con tres variables muestra tres campos; vacíos valen null y los `<if>` se comportan en consecuencia.
- Un valor no numérico en un campo int marca el error y no ejecuta.
- `SELECT SLEEP(20)` muestra el cronómetro en marcha y se cancela con Esc.
- Paginación, cambio de tamaño, «Sin límite» con tope, ordenación por cabecera y «Contar» funcionan sobre una tabla de más de 10.000 filas.
- Una consulta con dos columnas de igual nombre se pagina y se ordena sin error.
- «Copiar tabla», pegado en una nota Markdown, se ve como tabla.
- Una nota con un UPDATE muestra «Generar SQL» y el SQL final con valores, y no ejecuta nada.

## Resultado

Fecha: 2026-10-04.

### Hecho

- **Servidor:** `execute` guarda los valores de una ejecución correcta y `analyze` con `noteId` los devuelve en `lastValues` (Q-24, ADR-0014). MyBatis deja de registrar parámetros en depuración (S-22).
- **Vista SQL** con la disposición de U-06:
  - Formulario de variables con controles por tipo, null para los vacíos, errores por campo, Intro y Ctrl+Intro para ejecutar, «Limpiar» y últimos valores propuestos (Q-20 a Q-25).
  - Ejecución con cronómetro, «Cancelar» y Esc, tiempo total y de servidor, «Generar SQL» para lo no ejecutable y errores con su acción: «Reconectar», «Configurar la conexión» o «Actualizar» (Q-40 a Q-47, Q-90 a Q-98).
  - Tamaños de página con «Sin límite», controles de página con rango, orden por cabecera, «Contar» y aviso de tope (Q-50, Q-54 a Q-56, Q-59).
  - Tabla virtualizada con cabecera fija, número de fila, NULL atenuado, números a la derecha y celdas recortadas a 200 caracteres. El valor completo se ve en un panel (ADR-0015). La celda seleccionada se copia con Ctrl+C y «Copiar tabla» copia en Markdown (Q-60 a Q-68).
  - Panel «SQL final» con las dos vistas y «Copiar» (Q-70 a Q-73).
- **Editor SQL:** resaltado MySQL, etiquetas MyBatis y `#{}`/`${}` en colores propios, dentro del shadow root (ADR-0008). Barra de inserciones y análisis en vivo bajo el editor (Q-80 a Q-82).
- **Estado por pestaña:** valores, tamaño de página, orden y página van en la sesión (P-06, P-09). Los resultados solo viven en memoria y se liberan al cerrar la pestaña (Q-67, P-08). Se ejecuta lo guardado, guardando antes si hay cambios (A-04).
- **Pruebas:** 193 de backend y 164 de interfaz.

### Criterios de aceptación

Sin MySQL en el equipo de desarrollo (ADR-0013), comprobado con la aplicación arrancada lo que no necesita servidor, y con pruebas de interfaz sobre respuestas simuladas lo demás:

1. **Tres variables, tres campos; vacíos valen null:** la nota de demostración muestra title (string), minYear (int) y authorIds (list<int>), y los vacíos viajan vacíos y el servidor los convierte en null (T-01, pruebas Q-20 y Q-21). Que los `<if>` se comporten en consecuencia está probado en el motor (T-02, T-03). Contra MySQL real, **pendiente en Ubuntu**.
2. **Valor no numérico en un campo int:** con la aplicación arrancada, «abc» en un campo int marca el campo con «Se esperaba un número entero (int)» y no ejecuta. **Cumplido.**
3. **`SELECT SLEEP(20)` con cronómetro y Esc:** cronómetro, «Cancelar» y Esc → `/api/sql/cancel` cubiertos por la prueba Q-41. **Pendiente en Ubuntu** el recorrido real.
4. **Paginación, tamaño, «Sin límite», orden y «Contar» sobre más de 10.000 filas:** cubiertos por pruebas de interfaz (Q-50, Q-54 a Q-56, Q-59) y por T-23 y T-24 en el servidor. **Pendiente en Ubuntu.**
5. **Dos columnas de igual nombre se paginan y ordenan:** el servidor ordena por posición (T-22, pendiente en Ubuntu) y la tabla admite etiquetas repetidas (Q-61). **Pendiente en Ubuntu.**
6. **«Copiar tabla» pegado en una nota Markdown se ve como tabla:** el Markdown que se copia, renderizado por la vista de notas, da una tabla con las barras escapadas, los saltos y NULL (prueba N-33/Q-66). **Cumplido.**
7. **Una nota con un UPDATE:** con la aplicación arrancada muestra «Generar SQL», el aviso de Q-45 y el SQL final abierto con los valores (`UPDATE book SET title = 'O'Brien' WHERE id = 7`), sin tocar la base de datos. **Cumplido.**

### Pendiente

- Recorrer en Ubuntu, con MySQL, los criterios 1, 3, 4 y 5, además de las pruebas `-Pit` del Sprint 3.
- El tamaño de página por defecto y el tope de filas pasan a ser ajustes en el Sprint 6.

### Desviaciones y decisiones

- ADR-0014: `execute` guarda los últimos valores y `analyze` con `noteId` los devuelve.
- ADR-0015: el valor completo de una celda se muestra en un panel bajo la tabla, que se abre al hacer clic en una celda que no cabe.
- Con «Generar SQL» el panel «SQL final» se abre solo, porque es lo que se busca; tras una consulta empieza plegado (Q-70).
- Cambiar el tamaño de página o el orden vuelve a ejecutar desde la página 1, si ya había resultados.
- Ctrl+Intro desde el modo edición pasa antes a consulta.
- MyBatis no registra nada: sus registros de depuración incluían los parámetros de las consultas a SQLite (S-22).

### Cómo probarlo a mano

1. `./mvnw verify` y arrancar LiteDD con una conexión configurada a `litedd_demo`.
2. Crear una nota SQL con el ejemplo de la especificación. En edición se ven los colores y, debajo, «Variables: title string, minYear int, authorIds list<int>».
3. Ctrl+E: aparecen tres campos. Ejecutar con todos vacíos y luego con «1990» en minYear; escribir «abc» marca el campo.
4. `SELECT SLEEP(20)`: cronómetro en marcha; Esc cancela y muestra «Consulta cancelada a los …».
5. Sobre una tabla de más de 10.000 filas: páginas, tamaños, «Sin límite» con su aviso, clic en las cabeceras y «Contar».
6. `SELECT a.id, b.id FROM author a JOIN book b ON b.author_id = a.id`: se pagina y se ordena por la segunda columna.
7. «Copiar tabla» y pegar en una nota Markdown: se ve como tabla.
8. `UPDATE book SET title = #{t}`: el botón es «Generar SQL» y no se ejecuta nada.
