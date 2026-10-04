# ADR-0010: Borrado definitivo de una nota que es madre de otra en la papelera

- Estado: aceptada (2026-10-04)
- Requisitos: N-53, N-55, D-04

## Contexto

Una nota en la papelera conserva su `parent_id` (D-04). Si después se elimina definitivamente su madre, la clave foránea `note.parent_id` impediría el borrado.

## Decisión

Al eliminar definitivamente una nota, las notas de la papelera que la tienen como madre pasan a `parent_id = NULL`. Al restaurarlas van a la raíz, como pide N-53 cuando la madre ya no existe. No puede haber notas activas con una madre en la papelera, porque eliminar una nota con hijas exige subirlas antes (N-51).

## Consecuencias

Se pierde la madre original de esas notas, que de todos modos ya no existe.
