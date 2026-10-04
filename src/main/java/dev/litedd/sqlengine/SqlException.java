package dev.litedd.sqlengine;

import java.util.List;

/** La nota no se puede renderizar o no es una sola sentencia. */
public class SqlException extends RuntimeException {

    private final List<SqlError> errors;

    public SqlException(List<SqlError> errors) {
        super(errors.getFirst().message());
        this.errors = List.copyOf(errors);
    }

    public SqlException(SqlError error) {
        this(List.of(error));
    }

    public List<SqlError> errors() {
        return errors;
    }
}
