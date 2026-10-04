# Sprint 6: Datos y distribución

## Objetivo

ZIP, copias, ajustes, ciclo de vida e instalación.

## Requisitos cubiertos

X-01 a X-11, U-10, U-11, ciclo de vida

Documentos: [requisitos/transferencia.md](../requisitos/transferencia.md), [requisitos/interfaz.md](../requisitos/interfaz.md), [diseno/arquitectura.md](../diseno/arquitectura.md).

## Tareas

1. Exportación e importación ZIP con validación previa y transacción (X-01 a X-07, T-46, T-47).
2. Copias con `VACUUM INTO` y rotación (X-08, X-09, T-48); copia antes de migrar (D-02).
3. Menú «Datos» y pantalla «Ajustes» (X-10, U-10).
4. Banda de pérdida de contacto y reintento (U-11).
5. Ciclo de vida: instancia única, ventana Chrome en modo aplicación, SSE de presencia, despedida, apagado y opciones `--no-window`, `--port`, `--stop`.
6. Registro en fichero con rotación de 5 MB x 3 y opciones de JVM.
7. Perfil `-Pdist` con JAR único y `jpackage --type app-image`; `scripts/install.sh`, `scripts/uninstall.sh` y `packaging/litedd.desktop` con icono.
8. Prueba de resistencia de 2.000 ejecuciones y auditoría final.

## Criterios de aceptación

- Exportar, vaciar e importar con «Reemplazar todo» deja un árbol idéntico; «Añadir como rama» no altera lo existente.
- La copia diaria se crea y la rotación conserva 3.
- `scripts/install.sh` deja un icono que arranca la aplicación con doble clic.
- Un segundo lanzamiento reutiliza la instancia; cerrar la ventana apaga el proceso en 15 segundos.
- Una prueba de resistencia de 2.000 ejecuciones seguidas termina con la memoria del proceso estable.
- La auditoría final no encuentra datos sensibles en el repositorio.

## Resultado

_Pendiente._
