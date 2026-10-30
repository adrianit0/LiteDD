# Requisitos de interfaz

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

La ventana tiene tres zonas fijas: barra superior, panel izquierdo con el árbol y área principal con pestañas.

```text
┌────────────────────────────────────────────────────────────────┐
│ LiteDD                                              [Local ▾] ⚙ │
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
| U-02 | Tema oscuro único, definido con variables CSS: fondo, superficie, borde, texto, texto atenuado, acento, error, aviso, verde (icono de las notas HTTP), violeta (icono de las notas XML MyBatis), naranja (icono de las pizarras) y cian (icono de los workflows). Contraste mínimo AA. |
| U-03 | Toda la interfaz está en español. Fechas como dd/MM/yyyy HH:mm; coma decimal en tiempos y tamaños. |
| U-04 | Tipografía del sistema para la interfaz; monoespaciada para editores, SQL y celdas de resultado. |
| U-05 | Cabecera de nota: ruta, título, favorita, etiquetas y los botones Editar o Ver, Actualizar, Historial y Eliminar. |
| U-06 | Nota SQL en consulta, de arriba abajo: formulario de variables, barra de ejecución (Ejecutar, Cancelar, cronómetro, tamaño de página, Contar, Copiar tabla), tabla de resultados, paginación y panel «SQL final». |
| U-07 | Los avisos de guardado, copias y errores leves no bloquean. Los diálogos se reservan para confirmar acciones destructivas y resolver conflictos. |
| U-08 | Toda la aplicación se puede manejar con teclado y el foco es siempre visible. |
| U-09 | No se usan atajos reservados por el navegador: Ctrl+N, Ctrl+T, Ctrl+W ni Ctrl+Tab. |
| U-10 | Pantalla «Ajustes», en categorías y en este orden (ADR-0030). «General»: puerto, apagado automático y guardado automático (N-46). «Conexión»: estado de la conexión con «Reconectar» y sus datos con «Probar conexión» (C-01 a C-04, C-09). «SQL»: tamaño de página por defecto, tope de filas y tiempo máximo de consulta. «HTTP»: nota de login, valores por defecto de Accept, User-Agent y Cache-Control, tiempo máximo y tamaño máximo de respuesta (H-15, H-20, H-31, H-35). «Entornos»: casilla «Permitir entornos de preproducción», perfiles en su orden con URL base, usuario, contraseña y las casillas «Pedir clave al enviar» y «Pedir CA corporativa», clave de confirmación y CA corporativa (H-10, H-21, H-60 a H-66, H-69 a H-71). «Datos»: exportar, importar y copias (X-10). «Actualizaciones»: versión instalada, «URL del repositorio» y los botones «Buscar actualizaciones» y «Actualizar» (R-10 a R-14). |
| U-11 | Si se pierde el contacto con el servidor, aparece una banda de aviso y se reintenta solo. El texto en edición se conserva en memoria y se guarda al recuperar el contacto. |
| U-12 | Con «Permitir entornos de preproducción» marcada (H-62), la barra superior muestra a la izquierda del botón de «Ajustes» un desplegable con los perfiles de las notas HTTP, en el orden de «Ajustes» (H-70). El elegido es el perfil activo (H-63). Si no es Local, el desplegable usa el color de aviso (U-02). Con la casilla desmarcada, el desplegable no aparece y todo va al perfil Local. |
| U-13 | La ventana «Ajustes» es ancha y de alto fijo: no crece con el contenido. A la izquierda, una lista de botones con las categorías (U-10), que también se recorre con las flechas; a la derecha, la categoría elegida, que es lo único que se desplaza. Una «×» arriba a la derecha la cierra, igual que «Cerrar» y Esc, sin guardar. El pie tiene juntos «Cerrar» y «Guardar ajustes», que guarda todas las categorías a la vez. Los accesos desde otras partes la abren en su categoría: «Configurar la conexión» en «Conexión» y «Abrir «Ajustes»» de una nota HTTP sin URL base en «Entornos» (ADR-0030). |

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
