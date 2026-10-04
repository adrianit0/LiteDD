# ADR-0013: Las pruebas contra MySQL se ejecutan en el equipo con Ubuntu

- Estado: aceptada (2026-10-04)
- Requisitos: T-22, T-26, T-27, T-28, criterios de aceptación del Sprint 3

## Contexto

El equipo de desarrollo (Windows) no tiene MySQL ni Docker. Las pruebas del perfil `-Pit` necesitan un MySQL real.

## Decisión

Las pruebas `-Pit` se escriben en el Sprint 3 y se ejecutan más adelante en el equipo con Ubuntu. Hasta entonces, los casos que necesitan servidor (T-22, T-26, T-27, T-28, el rechazo de un UPDATE por la sesión de solo lectura y la ejecución de una consulta de demostración) quedan pendientes de verificar.

La lógica que no necesita servidor se prueba sin él: análisis, renderizado, clasificación, paginación, ensamblado de páginas (T-23, T-24) y SQL con valores.

## Consecuencias

El Sprint 3 queda abierto hasta ejecutar `./mvnw -Pit verify` en Ubuntu.
