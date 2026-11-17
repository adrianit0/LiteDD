# ADR-0049: Abrir la nota de una referencia con Ctrl+clic

- Estado: aceptada (2026-11-17)
- Requisitos: Q-108, Q-40
- Relacionada: Q-100 a Q-107, P-03, Q-24, N-88, U-08, ADR-0048

## Contexto

El recuadro de una celda marcada (Q-104) muestra el valor referenciado, pero no se puede seleccionar ni copiar, y solo enseña la primera fila. Cuando el usuario necesita el contenido de ese identificador, por ejemplo para copiarlo, abre a mano la nota de la referencia, escribe el valor en su variable y la ejecuta.

Petición del usuario (2026-11-17): con Ctrl+clic sobre una celda marcada, abrir la nota de la referencia en una pestaña nueva, con el valor ya puesto y ejecutada.

## Decisión

1. **Gesto.** Ctrl+clic sobre una celda marcada (Q-102) abre la nota de su referencia. Con el teclado (U-08), Alt+Intro con la celda marcada seleccionada hace lo mismo; Ctrl+Intro no vale porque ya ejecuta la nota de la pestaña (Q-23), y Alt+Intro es lo que abre en una pestaña nueva en la búsqueda rápida. Sobre una celda sin marca, Ctrl+clic es un clic normal y Alt+Intro no hace nada. El recuadro, si estaba abierto, se cierra y lo pendiente se cancela: no se llama a `POST /api/sql/lookup`.
2. **Pestaña.** Siempre una pestaña nueva, fija y activa, al final, como el clic central (P-03), aunque la nota ya esté abierta: cada Ctrl+clic es un valor distinto y no debe pisar los valores de otra pestaña.
3. **Valor y ejecución.** La pestaña nace con el valor de la celda en la única variable de la nota y se ejecuta sola, con el tamaño de página por defecto. Es la única excepción a Q-40, y la pide un gesto expreso del usuario. Es una ejecución normal de la pestaña, no una consulta de referencia (Q-107): guarda los últimos valores de la nota (Q-24), cuenta como ejecución correcta (N-88) y muestra sus resultados, su paginación y su «SQL final».
4. **Comprobaciones.** Las mismas que la consulta del recuadro (Q-105), hechas en la interfaz, que ya tiene el árbol y el análisis de la nota:
   - Si la nota no existe o está en la papelera (no está en el árbol), o no es una nota SQL, no se abre nada y un aviso no bloqueante (U-07) lo dice: «La nota de la referencia «author» no existe o está en la papelera», «… no es una nota SQL».
   - Si el análisis no tiene errores y la nota no tiene una sola variable, o no es una consulta, la pestaña se queda abierta sin ejecutar y el aviso lo dice: «… debe tener una sola variable», «… no es una consulta». Así se puede arreglar la nota en el momento.
   - Si el análisis tiene errores, la pestaña se queda abierta sin ejecutar, con el valor puesto si hay una sola variable; los errores ya se ven en ella.
5. **Alcance.** Vale donde hay marcas: los resultados de las notas SQL y de las hijas de una nota XML. El plan de «Explicar» y los workflows siguen sin marcas (ADR-0048).

## Consecuencias

- Ninguna ruta, sentencia ni dependencia nueva: se usan la apertura de pestañas, el análisis y la ejecución que ya existen. La ejecución sigue en solo lectura (S-01 a S-06).
- Los últimos valores de la nota de la referencia cambian con cada Ctrl+clic, como si se hubiera ejecutado a mano.
- Varios Ctrl+clic seguidos abren varias pestañas; se cierran como cualquier otra.
