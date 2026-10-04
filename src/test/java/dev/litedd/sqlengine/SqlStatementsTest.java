package dev.litedd.sqlengine;

import dev.litedd.sqlengine.SqlLexer.Kind;
import dev.litedd.sqlengine.SqlStatements.Classification;
import dev.litedd.sqlengine.SqlStatements.StatementKind;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SqlStatementsTest {

    // --- Q-58: analizador léxico ---

    @Test
    void q58_lexer_understands_strings_comments_and_parentheses() {
        var tokens = SqlLexer.tokenize("SELECT 'a;b', \"c\\\"d\", `e``f` -- x;\n/* y; */ # z;\n(1)");
        assertThat(tokens).filteredOn(t -> t.kind() == Kind.SEMICOLON).isEmpty();
        assertThat(tokens).filteredOn(t -> t.kind() == Kind.STRING).extracting(SqlLexer.Token::text)
                .containsExactly("'a;b'", "\"c\\\"d\"");
        assertThat(tokens).filteredOn(t -> t.kind() == Kind.QUOTED_ID).extracting(SqlLexer.Token::text)
                .containsExactly("`e``f`");
        assertThat(tokens).filteredOn(t -> t.kind() == Kind.COMMENT).hasSize(3);
        var one = tokens.stream().filter(t -> t.text().equals("1")).findFirst().orElseThrow();
        assertThat(one.depth()).isEqualTo(1);
    }

    @Test
    void q58_lexer_handles_doubled_quotes_and_unterminated_strings() {
        var tokens = SqlLexer.tokenize("SELECT 'it''s' ; SELECT 'sin cerrar");
        assertThat(tokens).filteredOn(t -> t.kind() == Kind.STRING).extracting(SqlLexer.Token::text)
                .containsExactly("'it''s'", "'sin cerrar");
    }

    @Test
    void q58_double_dash_without_space_is_not_a_comment() {
        var tokens = SqlLexer.tokenize("SELECT 1--1");
        assertThat(tokens).noneMatch(t -> t.kind() == Kind.COMMENT);
    }

    // --- S-03, Q-05, Q-94, T-14 ---

    @Test
    void t14_more_than_one_statement_is_an_error() {
        assertThatThrownBy(() -> SqlStatements.stripTrailingSemicolon("SELECT 1; SELECT 2"))
                .isInstanceOfSatisfying(SqlException.class, e -> {
                    assertThat(e.errors().getFirst().code()).isEqualTo("multiple_statements");
                    assertThat(e.getMessage()).isEqualTo("Una nota solo puede contener una sentencia");
                });
    }

    @Test
    void t14_semicolon_in_string_and_trailing_semicolon_are_valid() {
        assertThat(SqlStatements.stripTrailingSemicolon("SELECT ';'")).isEqualTo("SELECT ';'");
        assertThat(SqlStatements.stripTrailingSemicolon("SELECT 1; -- fin\n")).isEqualTo("SELECT 1");
        assertThat(SqlStatements.stripTrailingSemicolon("SELECT 1;")).isEqualTo("SELECT 1");
    }

    @Test
    void s03_semicolon_after_trailing_one_is_still_an_error() {
        assertThatThrownBy(() -> SqlStatements.stripTrailingSemicolon("SELECT 1;;")).isInstanceOf(SqlException.class);
    }

    // --- S-01, T-15, T-16, T-17 ---

    @ParameterizedTest
    @ValueSource(strings = {
            "UPDATE book SET title = 'x'",
            "INSERT INTO book VALUES (1)",
            "DELETE FROM book",
            "REPLACE INTO book VALUES (1)",
            "DROP TABLE book",
            "ALTER TABLE book ADD c INT",
            "TRUNCATE TABLE book",
            "SET @a = 1",
            "CALL p()",
            "LOAD DATA INFILE 'f' INTO TABLE book",
            "CREATE TABLE x (a INT)",
            "GRANT ALL ON *.* TO u",
            "TABLE book"})
    void s01_t15_non_queries_are_not_executable(String sql) {
        Classification c = SqlStatements.classify(sql);
        assertThat(c.kind()).isEqualTo(StatementKind.STATEMENT);
        assertThat(c.executable()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "SELECT 1",
            "-- comentario\nSELECT 1",
            "/* comentario */ select 1",
            "# comentario\nSELECT 1",
            "(SELECT id FROM author) UNION (SELECT id FROM book)",
            "WITH x AS (SELECT 1 AS a) SELECT a FROM x",
            "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 3) SELECT n FROM r",
            "SELECT /*+ MAX_EXECUTION_TIME(1000) */ 1"})
    void s01_t16_queries_are_executable(String sql) {
        Classification c = SqlStatements.classify(sql);
        assertThat(c.kind()).isEqualTo(StatementKind.QUERY);
        assertThat(c.executable()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"SHOW TABLES", "DESCRIBE book", "DESC book", "EXPLAIN SELECT 1",
            "EXPLAIN UPDATE book SET title = 'x'", "EXPLAIN ANALYZE SELECT 1", "EXPLAIN FORMAT=TREE SELECT 1"})
    void s01_q44_meta_statements_run_as_they_are(String sql) {
        Classification c = SqlStatements.classify(sql);
        assertThat(c.kind()).isEqualTo(StatementKind.META);
        assertThat(c.executable()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"EXPLAIN ANALYZE UPDATE book SET title = 'x'", "EXPLAIN ANALYZE DELETE FROM book",
            "DESCRIBE ANALYZE INSERT INTO book VALUES (1)"})
    void adr0011_explain_analyze_only_with_queries(String sql) {
        assertThat(SqlStatements.classify(sql).executable()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "WITH x AS (SELECT 1) UPDATE book SET title = 'x'",
            "WITH x AS (SELECT 1) DELETE FROM book",
            "WITH x AS (SELECT 1) INSERT INTO book SELECT * FROM x"})
    void t17_with_ending_in_a_write_is_not_executable(String sql) {
        assertThat(SqlStatements.classify(sql).executable()).isFalse();
    }

    // --- S-02, Q-95, T-18 ---

    @ParameterizedTest
    @ValueSource(strings = {
            "SELECT * FROM book INTO OUTFILE '/tmp/x'",
            "SELECT * FROM book INTO DUMPFILE '/tmp/x'",
            "SELECT title FROM book INTO @t",
            "SELECT * FROM book FOR UPDATE",
            "SELECT * FROM book FOR SHARE",
            "SELECT * FROM book LOCK IN SHARE MODE",
            "SELECT * FROM (SELECT * FROM book FOR UPDATE) b",
            "SELECT * FROM book /*! FOR UPDATE */"})
    void s02_t18_forbidden_clauses_even_in_select(String sql) {
        Classification c = SqlStatements.classify(sql);
        assertThat(c.executable()).isFalse();
        assertThat(c.forbiddenClause()).isNotBlank();
    }

    @Test
    void t18_forbidden_words_inside_strings_or_comments_are_fine() {
        assertThat(SqlStatements.classify("SELECT 'for update'").executable()).isTrue();
        assertThat(SqlStatements.classify("SELECT 1 -- FOR UPDATE").executable()).isTrue();
        assertThat(SqlStatements.classify("SELECT `into` FROM book").executable()).isTrue();
    }

    @Test
    void t18_forbidden_clause_names_the_clause() {
        assertThat(SqlStatements.classify("SELECT * FROM book FOR UPDATE").forbiddenClause()).isEqualTo("FOR UPDATE");
        assertThat(SqlStatements.classify("SELECT 1 INTO OUTFILE 'x'").forbiddenClause()).isEqualTo("INTO OUTFILE");
    }
}
