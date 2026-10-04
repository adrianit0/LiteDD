# Sprint 2: Organización y pestañas

## Objetivo

Mover, eliminar, papelera, pestañas y sesión.

## Requisitos cubiertos

N-50 a N-65, P-01 a P-13

Documentos: [requisitos/notas.md](../requisitos/notas.md), [requisitos/pestanas.md](../requisitos/pestanas.md), [requisitos/datos.md](../requisitos/datos.md), [requisitos/api.md](../requisitos/api.md).

## Tareas

1. notes: mover con descendencia, validación de ciclos (D-05), eliminar con `children=promote`, papelera y restauración; pruebas T-40 a T-43 antes del código.
2. API: `move`, `DELETE /api/notes/{id}`, `/api/trash` y sus variantes.
3. Interfaz: arrastrar y soltar con dnd-kit, tres zonas, despliegue a los 600 ms, atajos Alt+flechas y «Mover a…» (N-60 a N-65).
4. Interfaz: diálogos de eliminación y panel de papelera (N-50 a N-55).
5. Interfaz: barra de pestañas, clic y clic central, cierre, reordenación, menú contextual y desbordamiento (P-01 a P-13).
6. session: `GET` y `PUT /api/session` sobre la tabla `tab`; restauración al arrancar (P-09).

## Criterios de aceptación

- Una nota con tres niveles de hijas se mueve entera arrastrando y con el teclado.
- Soltar una nota sobre una descendiente no es posible.
- Eliminar una nota con hijas ofrece subirlas un nivel; eliminar una sin hijas la manda a la papelera; restaurar la devuelve a su sitio.
- Clic sobre una nota ya abierta activa su pestaña; clic central abre otra pestaña de la misma nota.
- Tras reiniciar, vuelven las mismas pestañas, en el mismo orden y modo.

## Resultado

_Pendiente._
