# Requisitos de importación, exportación y copias

> Extraído de `specs/ESPECIFICACION.md`. Si este fichero y aquel difieren tras un cambio aprobado, manda este y se registra un ADR.

Todo el contenido se exporta a un único ZIP legible y se importa desde ese mismo ZIP.

```text
litedd-export-20261004-1030.zip
├── manifest.json
├── notes/
│   ├── 01-guia-de-uso.md
│   ├── 01-guia-de-uso/
│   │   ├── 01-libros-por-autor.sql
│   │   └── 02-notas-sueltas.md
│   └── 02-consultas.sql
└── attachments/
    └── 3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90.png
```

| ID | Requisito |
|---|---|
| X-01 | «Exportar» genera el ZIP y lo descarga, con fecha y hora en el nombre. |
| X-02 | manifest.json contiene versión de formato, versión de la aplicación, fecha y, por nota: id, parentId, position, type, title, tags, favorite, createdAt, updatedAt y file. Incluye también la lista de adjuntos. |
| X-03 | Cada nota es un fichero .md o .sql en carpetas que reproducen el árbol. El nombre es la posición con dos dígitos más el título saneado. El contenido es idéntico al de la nota, sin cabeceras añadidas. |
| X-04 | No se exportan papelera, historial, pestañas, valores de variables, ajustes ni conexión. |
| X-05 | «Importar» ofrece dos modos. «Reemplazar todo» hace una copia antes y pide confirmación explícita. «Añadir como rama» cuelga todo de una nota raíz nueva, «Importado» más la fecha, con identificadores nuevos y enlaces y adjuntos reasignados. |
| X-06 | Antes de tocar nada se valida: versión del formato, existencia de cada fichero del manifiesto, rutas sin `..` ni absolutas y tamaño total máximo de 500 MB. La importación va en una transacción. |
| X-07 | En la importación, el manifiesto manda sobre el árbol de carpetas. |
| X-08 | Copia automática: al arrancar, si la última tiene más de 24 horas, se ejecuta `VACUUM INTO` hacia `backups/litedd-AAAAMMDD.db`. Se conservan las 3 más recientes. |
| X-09 | Se hace una copia adicional antes de «Reemplazar todo» y antes de una migración. Llevan un sufijo propio y se conservan las 2 últimas. |
| X-10 | Menú «Datos»: exportar, importar, crear copia ahora y abrir la carpeta de datos. |
| X-11 | Restaurar una copia es manual y se documenta en el README: cerrar LiteDD y sustituir litedd.db. |
