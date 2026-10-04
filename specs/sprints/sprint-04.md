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

_Pendiente._
