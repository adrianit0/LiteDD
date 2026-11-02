# ADR-0034: Logotipo en la barra superior y favicon

- Estado: aceptada (2026-11-02)
- Requisitos: U-14
- Modifica: esquema de la ventana de `requisitos/interfaz.md`, que muestra el logotipo en lugar del nombre

## Contexto

La barra superior mostraba el nombre de la aplicación como texto, y el favicon era el mismo PNG que el lanzador de escritorio. El usuario aportó un logotipo en SVG para usarlo en su lugar.

## Decisión

Respuestas del usuario (2026-11-02):

1. **Texto.** Se añade «Lite» debajo y a la derecha del nombre del logotipo.
2. **Icono.** El naranja pasa a gris oscuro y se añade una hoja de papel abajo a la derecha.
3. **Posición.** El logotipo va arriba a la izquierda, en lugar del texto «LiteDD».
4. **Altura.** La barra crece un poco para que quepa.
5. **Favicon.** Se usa el icono del logotipo.

Detalles, tomados con el mismo criterio que las respuestas:

- **Colores.** El tema oscuro es único (U-02), así que el texto del logotipo, casi negro en el original, pasa al color `--text`. Los tres naranjas pasan a tres grises que conservan su orden de claro a oscuro. El más oscuro queda en el límite de 3:1 con la barra; por debajo se perdería en ella.
- **«Lite».** La «t» y la «e» son los glifos del propio logotipo, y la «L» y la «i» usan el grosor de sus trazos. Queda bajo el final del nombre, antes del rabo de la «p», para no añadir altura.
- **Altura.** La barra pasa de 40 a 48 px y el logotipo mide 40 px de alto.
- **Favicon.** Es un SVG con el icono solo, sobre una placa del color de la barra, porque el gris se perdería en una pestaña oscura. Sustituye a `frontend/public/litedd.png`.
- **Nombre de la aplicación.** No cambia. «LiteDD» sigue en el título de la página, en la pantalla sin pestañas (P-12) y como texto alternativo del logotipo.
- **Lanzador.** `packaging/litedd.png` no cambia, porque no se pidió.

## Consecuencias

- Los dos SVG están en `frontend/public/` y se sirven como ficheros estáticos, igual que el favicon anterior. Encajan en la política de seguridad de contenidos y no añaden dependencias.
- Solo contienen trazados, sin texto ni metadatos (S-32).
- Si cambia el color de la barra hay que revisar el logotipo: sus colores están en el SVG, no en las variables del tema. Una prueba comprueba el contraste de sus grises.
