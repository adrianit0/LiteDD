# ADR-0047: Notas importantes con fecha de fin

- Estado: aceptada (2026-11-16)
- Requisitos: N-89, N-97 a N-99
- Relacionada: N-04, N-08, N-72, N-81, N-82, X-02, ADR-0046

## Contexto

El usuario escribe muchas notas con análisis o tareas para el día siguiente o la semana que viene. Las venía marcando con una etiqueta, pero una etiqueta no caduca: hay que acordarse de quitarla. «Favorita» tampoco sirve, porque la reserva para las notas que usa como herramienta (SQL, HTTP, workflows), que son permanentes, y mezclar las dos cosas mete ruido.

Hace falta lo contrario de «obsoleta» (ADR-0046): una marca de importancia que se pone a mano y que caduca sola.

Respuestas del usuario (2026-11-16):

- Pasada la fecha, la nota deja de ser importante sin más. No queda como «vencida» ni hay nada que limpiar a mano.
- La fecha se elige en un diálogo con atajos («Hoy», «Mañana», «1 semana») y un campo de fecha. Es obligatoria.
- En el árbol la nota se resalta en su sitio, con color. No hay una sección aparte: para verlas juntas está el filtro «Solo importantes».
- «Importante» y «obsoleta» son marcas independientes y pueden convivir en la misma nota.

## Decisión

1. `note` gana la columna `important_until` (V009), una fecha `AAAA-MM-DD` sin hora. `NULL` es «sin marca». Como «favorita» y «obsoleta», no cambia `version` ni `updated_at`: marcar una nota no es editarla.
2. Una nota es importante mientras hoy, en la hora local de la máquina, no pase de esa fecha: el día indicado todavía lo es. La caducidad no escribe nada: la fecha pasada se queda en la columna y sencillamente deja de contar. No hay tarea programada ni limpieza.
3. «Hoy» lo pone la interfaz, que es quien conoce la hora local: calcula el resalte con su fecha y la envía en el filtro de la búsqueda (`important=AAAA-MM-DD`), igual que ya hace con la fecha de modificación (`since`). El servidor no decide qué día es.
4. La marca se pone, se cambia y se quita desde el menú contextual del árbol («Importante…») y desde la cabecera de la nota, en cualquier tipo de nota, también en las hijas generadas de una nota XML MyBatis. Las dos entradas abren el mismo diálogo: los atajos «Hoy», «Mañana» y «1 semana» guardan con un clic; el campo de fecha, que nace con mañana o con la fecha vigente, sirve para cualquier otro día y no admite uno anterior a hoy. Si la nota es importante, el diálogo ofrece «Quitar la marca».
5. El resalte no mueve la nota: en el árbol y en los resultados de búsqueda el título va en negrita y en el color de aviso, con una marca «!»; el título emergente dice hasta cuándo. En la cabecera, el botón «Importante» pasa a decir «Importante hasta» y la fecha.
6. «Solo importantes» es un filtro más de la búsqueda del panel, combinable con los otros, y solo cuenta las vigentes.
7. Es independiente de «favorita» y de «obsoleta». Una nota obsoleta e importante se ve con los dos estilos, y las reglas de N-84 siguen valiendo para ella: no sale en la búsqueda salvo con «Mostrar obsoletas».
8. La marca es de esa nota y no pasa a sus hijas. «Duplicar» crea la copia sin ella: la tarea es de la original.
9. La exportación lleva `importantUntil` en el manifiesto y la importación la conserva, también si ya pasó.

## Consecuencias

- Las notas de trabajo de estos días destacan sin etiquetas y dejan de destacar solas.
- «Favorita» queda para las herramientas permanentes.
- Una migración que solo añade una columna; ninguna dependencia nueva.
- Si la aplicación pasa la medianoche abierta, el resalte de las que caducan se va en el siguiente repintado del árbol, no en el instante exacto.
