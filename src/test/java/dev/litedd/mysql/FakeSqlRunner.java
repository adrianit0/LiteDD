package dev.litedd.mysql;

import dev.litedd.http.ApiError;
import dev.litedd.settings.AppConfig;
import dev.litedd.sqlengine.SqlEngine;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Nodos SQL de un workflow sin MySQL (ADR-0031, ADR-0013): devuelve las filas indicadas y recuerda los valores
 * recibidos. Un contenido con FAIL responde como un error de MySQL.
 */
public final class FakeSqlRunner extends SqlRunner {

    public final List<Map<String, String>> received = new ArrayList<>();
    private final List<String> labels;
    private final List<List<String>> rows;

    public FakeSqlRunner(List<String> labels, List<List<String>> rows) {
        super(new SqlEngine(), new MySqlGateway(), () -> AppConfig.DEFAULT, Map::of);
        this.labels = labels;
        this.rows = rows;
    }

    @Override
    public Rows all(String content, Map<String, String> values, String executionId) {
        received.add(new java.util.HashMap<>(values));
        plan(content, values);
        if (content.contains("FAIL")) {
            throw new ApiError(422, "mysql_error", "Error de MySQL 1146: Table 'litedd_demo.fail' doesn't exist");
        }
        List<QueryRunner.Column> columns = labels.stream().map(l -> new QueryRunner.Column(l, "VARCHAR", false)).toList();
        return new Rows(columns, rows, false, 3, null);
    }

    @Override
    public boolean cancel(String executionId) {
        return false;
    }
}
