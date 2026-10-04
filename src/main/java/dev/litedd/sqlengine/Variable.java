package dev.litedd.sqlengine;

/**
 * Variable de una nota SQL.
 *
 * @param elementType tipo de cada elemento si type es LIST (Q-14)
 * @param textual     se usa en ${…}: sustitución textual (Q-17)
 */
public record Variable(String name, SqlType type, SqlType elementType, boolean textual) {
}
