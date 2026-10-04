# ADR-0004: Desarrollo en Windows, ejecución en Ubuntu

- Estado: aceptada
- Fecha: 2026-10-04
- Requisitos: «Ciclo de vida», «Build y distribución», «Rutas en disco», S-20

## Contexto

La especificación describe una única máquina con Ubuntu 22.04. El desarrollo se hace en Windows 10 y la aplicación se instala después en un equipo con Ubuntu 22.04.

## Decisión

- La plataforma de ejecución sigue siendo Ubuntu 22.04; no cambia ningún requisito.
- `./mvnw verify` y las pruebas automáticas deben pasar también en Windows (`mvnw.cmd` o Git Bash).
- Los scripts de `scripts/` son bash y se ejecutan en Git Bash durante el desarrollo.
- `.gitattributes` fuerza finales de línea LF, salvo en `.cmd`.
- El código que dependa del sistema (permisos POSIX 600, lanzar Chrome, `xdg-open`, rutas XDG, jpackage) apunta a Linux. En Windows debe degradar sin romper las pruebas; por ejemplo, las de permisos POSIX se omiten fuera de Linux.
- Los criterios de aceptación ligados al sistema (instalación, icono, `.desktop`, imagen jpackage) se verifican en Ubuntu.

## Consecuencias

Algunas pruebas se marcarán como solo Linux. Los criterios del Sprint 6 requieren una pasada manual en Ubuntu.
