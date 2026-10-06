# Requisitos de interfaz

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

La ventana tiene tres zonas fijas: barra superior, panel izquierdo con el árbol y área principal con pestañas.

```text
┌────────────────────────────────────────────────────────────────┐
│ LiteDD      [Búsqueda rápida]        ● usuario@host/esquema  ⚙ │
├────────────────┬───────────────────────────────────────────────┤
│ Buscar…        │ [Nota A ×] [Consulta B ×] [Nota A ×]          │
│ Filtros        ├───────────────────────────────────────────────┤
│ ▾ Nota A       │ Ruta / Título     ★  Etiquetas   [Editar] ⟳   │
│    Consulta B  │                                               │
│ ▸ Nota C       │ Contenido: vista o editor                     │
│                │                                               │
│ Papelera       │                                               │
└────────────────┴───────────────────────────────────────────────┘
```

| ID | Requisito |
|---|---|
| U-01 | El panel izquierdo se redimensiona arrastrando su borde y se oculta con Alt+B. El ancho se recuerda. |
| U-02 | Tema oscuro único, definido con variables CSS: fondo, superficie, borde, texto, texto atenuado, acento, error, aviso y verde (icono de las notas HTTP). Contraste mínimo AA. |
| U-03 | Toda la interfaz está en español. Fechas como dd/MM/yyyy HH:mm; coma decimal en tiempos y tamaños. |
| U-04 | Tipografía del sistema para la interfaz; monoespaciada para editores, SQL y celdas de resultado. |
| U-05 | Cabecera de nota: ruta, título, favorita, etiquetas y los botones Editar o Ver, Actualizar, Historial y Eliminar. |
| U-06 | Nota SQL en consulta, de arriba abajo: formulario de variables, barra de ejecución (Ejecutar, Cancelar, cronómetro, tamaño de página, Contar, Copiar tabla), tabla de resultados, paginación y panel «SQL final». |
| U-07 | Los avisos de guardado, copias y errores leves no bloquean. Los diálogos se reservan para confirmar acciones destructivas y resolver conflictos. |
| U-08 | Toda la aplicación se puede manejar con teclado y el foco es siempre visible. |
| U-09 | No se usan atajos reservados por el navegador: Ctrl+N, Ctrl+T, Ctrl+W ni Ctrl+Tab. |
| U-10 | Pantalla «Ajustes»: tamaño de página por defecto, tope de filas, tiempo máximo de consulta, puerto, apagado automático y guardado automático (N-46). Sección «HTTP»: URL base, nota de login, usuario, contraseña, tiempo máximo y tamaño máximo de respuesta (H-10, H-20, H-21, H-31, H-35). Da acceso a «Conexión» y «Datos». |
| U-11 | Si se pierde el contacto con el servidor, aparece una banda de aviso y se reintenta solo. El texto en edición se conserva en memoria y se guarda al recuperar el contacto. |

## Atajos de teclado

| Atajo | Acción |
|---|---|
| Ctrl+K | Búsqueda rápida |
| Ctrl+E | Cambiar entre consulta y edición |
| Ctrl+S | Guardar ahora |
| Ctrl+Intro | Ejecutar la consulta |
| Esc | Cancelar la ejecución o cerrar el diálogo |
| Alt+N | Nueva nota Markdown |
| Alt+Mayús+N | Nueva nota SQL |
| Alt+W | Cerrar pestaña |
| Alt+RePág, Alt+AvPág | Pestaña anterior, pestaña siguiente |
| Alt+B | Mostrar u ocultar el panel izquierdo |
| F2 | Renombrar, en el árbol |
| Supr | Eliminar, en el árbol |
| Alt+flechas | Mover la nota, en el árbol (N-63) |
| Ctrl+B, Ctrl+I | Negrita y cursiva, en el editor Markdown |
