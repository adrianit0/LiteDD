# Sprint 10: Notas pizarra

## Objetivo

Un tipo de nota para dibujar al estilo de Paint, que en consulta es una imagen y que una nota Markdown puede mostrar siempre en su última versión.

## Requisitos cubiertos

B-01 a B-44, y los cambios de N-04, N-05, N-20, N-90, X-03, U-02 y la API

Documentos: [requisitos/pizarra.md](../requisitos/pizarra.md), [decisiones/ADR-0029-notas-pizarra.md](../decisiones/ADR-0029-notas-pizarra.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: requisitos B, ADR-0029 con las propuestas A, B y C, y los cambios en notas, transferencia, interfaz, API, modelo de datos y arquitectura. La constitución no cambia.
2. Migración V006:
   - Tipo `board`, reconstruyendo `note` como V003 y V004 y conservando `rid`.
   - Disparadores de `note_fts` que indexan '' como contenido de las pizarras.
3. Servidor:
   - Validación del contenido de una pizarra al guardar, al restaurar una versión y al importar: vacío o PNG en URL `data:`, firma, cabecera IHDR, 10 MB y 4096 × 4096 (B-31).
   - Búsqueda sin fragmento para las pizarras (B-33).
   - Exportación `.png` e importación (B-34).
   - `maxRequestSize` a 15 MB.
4. Interfaz, motor de dibujo: un módulo puro con pruebas para el relleno con tolerancia, el recorte y el crecimiento del lienzo, la pila de deshacer por rectángulos y los límites de tamaño.
5. Interfaz, pizarra:
   - Lienzo con pincel, goma, texto, relleno, selección, pegar y deshacer, y barra de herramientas.
   - Bordes arrastrables y guardado asíncrono con `toBlob`.
   - Consulta con visor, «Copiar imagen» y «Descargar PNG».
6. Interfaz, integración:
   - Tipo `board` con icono naranja y su prueba de contraste AA.
   - «Nota Pizarra» en los dos menús y «Pizarra» en el filtro de tipo.
   - Miniaturas en el historial.
7. Interfaz, Markdown:
   - `![[` y el botón «Pizarra» de la barra de formato.
   - Imagen `litedd://note/<id>` con la última versión guardada, refrescada al guardar la pizarra.
   - Visor, clic central y avisos.
8. Verificación: `./mvnw verify` y los criterios de aceptación con la aplicación arrancada y datos aislados.

## Criterios de aceptación

- «Nota Pizarra» crea una pizarra que se abre en edición con un lienzo de 1200 × 800. Pincel, goma, texto, relleno, deshacer y rehacer funcionan, y el estado pasa a «Guardado» sin pulsar nada.
- En consulta se ve la imagen y no se puede pintar. Pulsarla la abre en el visor.
- Seleccionar un área y arrastrarla la mueve, y Supr la borra. Ctrl+V pega una captura de pantalla como selección flotante, y el lienzo crece si no cabe.
- Arrastrar la esquina cambia el tamaño al soltar. Encoger recorta, y Ctrl+Z lo deshace.
- Con «Copiar imagen», la pizarra se pega en otra aplicación. «Descargar PNG» descarga «Título.png».
- `![[` en una nota Markdown inserta una pizarra. Tras cambiar la pizarra en otra pestaña, la nota Markdown muestra el cambio sin pulsar «Actualizar». Con la pizarra en la papelera, aparece el aviso.
- La búsqueda encuentra una pizarra por su título y su descripción, sin fragmentos de base64.
- La exportación deja un `.png` que se abre con cualquier visor, y la importación recupera la pizarra igual. Un contenido que no es PNG se rechaza sin cambiar la nota.
- Una base de datos de la versión anterior se migra sin perder notas, búsqueda, historial ni pestañas.

## Resultado
