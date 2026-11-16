# ADR-0046: Notas obsoletas, sustituta y última ejecución correcta

- Estado: aceptada (2026-11-16)
- Requisitos: N-82 a N-88
- Relacionada: N-04, N-08, N-72, N-73, N-90, N-96, W-23, W-24, W-26, X-02

## Contexto

El usuario guarda muchas notas HTTP y SQL para reutilizarlas. El proyecto sobre el que trabaja crece: cambian endpoints y tablas, aparecen columnas y desaparecen otras, y muchas notas dejan de valer. Una etiqueta «obsoleta» no basta: la nota sigue saliendo en las búsquedas y en los selectores, y nada avisa al abrirla ni al usarla en un workflow.

Respuestas del usuario (2026-11-16):

- La marca la pone y la quita él, a mano. No se quiere detección automática (ni contra el esquema de MySQL ni por un 404), y reparar una nota tampoco le quita la marca.
- Una nota obsoleta puede indicar, de forma opcional, qué otra nota la sustituye.
- No se añade una limpieza en bloque; si hace falta, será otra función.
- Se guarda la fecha de la última ejecución, que molesta poco y ayuda a decidir. Solo cuentan las ejecuciones correctas.
- La marca vale para cualquier tipo de nota y es de esa nota: no pasa a sus hijas.

## Decisión

1. `note` gana tres columnas (V008): `obsolete`, `replaced_by` y `last_run_at`. Ninguna cambia `version` ni `updated_at`, como ocurre con «favorita»: marcar una nota no es editarla y no debe provocar un conflicto (N-42) en una pestaña abierta.
2. La marca se pone y se quita desde el menú contextual del árbol y desde la cabecera de la nota, en cualquier tipo de nota, también en las hijas generadas de una nota XML MyBatis.
3. La nota obsoleta no cambia de sitio: se ve atenuada y tachada en el árbol. Deja de ofrecerse donde se eligen notas para reutilizarlas: la búsqueda del panel (salvo con el filtro «Mostrar obsoletas»), la búsqueda rápida, el autocompletado `[[` y el selector de nota de un nodo de workflow. «Mover a…» sí la ofrece, porque mover es ordenar el árbol.
4. Lo que apunta a ella de forma expresa sigue funcionando: un enlace `litedd://note/<id>` la abre, y `litedd --open "título"` también. Si con ese título hay varias notas y solo una no es obsoleta, `--open` abre esa.
5. Al abrirla, una banda bajo la cabecera avisa. No bloquea nada: a veces se ejecuta una nota obsoleta justo para ver qué falla.
6. «Sustituida por» es un campo opcional de la nota obsoleta. Se elige con el selector de notas con búsqueda y admite cualquier nota activa que no sea ella misma. Si la sustituta va a la papelera se muestra tachada, como un enlace roto (N-91); si se elimina definitivamente, el campo se vacía. Al quitar la marca de obsoleta se vacía también.
7. «Duplicar» crea la copia sin la marca: lo normal es duplicar una nota obsoleta para arreglarla.
8. En un workflow, el nodo cuya nota está obsoleta lo indica en el lienzo y en su panel. Es un aviso, no un error: el workflow se ejecuta igual.
9. `last_run_at` guarda la última ejecución correcta: una nota SQL que se ejecuta sin error, una nota HTTP que responde 2xx y un workflow que termina sin errores. Cuenta igual si la nota se ejecuta desde su pestaña o como nodo de un workflow. No cuentan «SQL final», «Explicar», el recuento de filas ni la nota de login. Las notas anteriores a V008 no tienen fecha hasta que se ejecutan, y hasta entonces no se muestra nada.
10. La exportación lleva `obsolete`, `replacedBy` y `lastRunAt` en el manifiesto. Al importar como rama, `replacedBy` apunta al identificador nuevo; si la sustituta no viene en el archivo, se vacía.

## Consecuencias

- Las notas que ya no valen dejan de estorbar sin perderse, y queda dicho cuál usar en su lugar.
- Nada se marca ni se desmarca solo: el estado es siempre el que puso el usuario.
- Una migración que solo añade columnas; no hay que reconstruir `note`.
- Ninguna dependencia nueva.
