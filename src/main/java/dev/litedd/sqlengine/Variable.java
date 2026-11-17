package dev.litedd.sqlengine;

/**
 * Variable de una nota SQL.
 *
 * @param elementType tipo de cada elemento si type es LIST (Q-14)
 * @param textual     se usa en ${…}: sustitución textual (Q-17)
 * @param customType  Q-111: el tipo personalizado tal como se usa, como «catalogo5»; null si no tiene. type es STRING
 */
public record Variable(String name, SqlType type, SqlType elementType, boolean textual, String customType) {

    public Variable(String name, SqlType type, SqlType elementType, boolean textual) {
        this(name, type, elementType, textual, null);
    }
}
