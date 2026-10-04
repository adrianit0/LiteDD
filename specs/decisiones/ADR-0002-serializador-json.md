# ADR-0002: Jackson como serializador JSON

- Estado: propuesta (pendiente de visto bueno)
- Fecha: 2026-10-04
- Requisitos: A-01, A-02

## Contexto

La API es JSON (A-01). Javalin 7 no incluye serializador: `ctx.json()` necesita Jackson o Gson en el classpath, ambos declarados como dependencias opcionales de Javalin. La tabla «Stack» no nombra ninguno.

## Decisión

Se añade `com.fasterxml.jackson.core:jackson-databind`, el mapeador por defecto de Javalin (`JavalinJackson`). No se añade el módulo de Kotlin.

## Consecuencias

Una dependencia más, imprescindible para cumplir A-01. Si se prefiere Gson, basta con cambiar la dependencia y registrar el mapeador.
