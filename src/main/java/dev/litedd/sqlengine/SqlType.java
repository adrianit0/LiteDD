package dev.litedd.sqlengine;

import java.util.Locale;
import java.util.Map;

/** Tipos de variable de la tabla de «Variables». */
public enum SqlType {
    STRING("string"),
    INT("int"),
    LONG("long"),
    DECIMAL("decimal"),
    BOOLEAN("boolean"),
    DATE("date"),
    DATETIME("datetime"),
    LIST("list");

    /** Nombres admitidos en #{x,tipo} y en la forma nativa javaType= (Q-12). */
    private static final Map<String, SqlType> NAMES = Map.ofEntries(
            Map.entry("string", STRING), Map.entry("java.lang.string", STRING),
            Map.entry("int", INT), Map.entry("integer", INT), Map.entry("java.lang.integer", INT),
            Map.entry("long", LONG), Map.entry("java.lang.long", LONG),
            Map.entry("decimal", DECIMAL), Map.entry("bigdecimal", DECIMAL), Map.entry("java.math.bigdecimal", DECIMAL),
            Map.entry("boolean", BOOLEAN), Map.entry("java.lang.boolean", BOOLEAN),
            Map.entry("date", DATE),
            Map.entry("datetime", DATETIME),
            Map.entry("list", LIST), Map.entry("java.util.list", LIST));

    private final String label;

    SqlType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** null si el nombre no es un tipo conocido. */
    public static SqlType fromName(String name) {
        return NAMES.get(name.strip().toLowerCase(Locale.ROOT));
    }
}
