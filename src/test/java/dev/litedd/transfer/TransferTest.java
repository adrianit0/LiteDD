package dev.litedd.transfer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.litedd.http.ApiError;
import dev.litedd.notes.Note;
import dev.litedd.notes.NoteService;
import dev.litedd.notes.TreeNode;
import dev.litedd.store.Store;
import dev.litedd.transfer.Importer.Mode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Exportación, importación y copias (X-01 a X-09, T-46 a T-48). */
class TransferTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};

    @TempDir
    Path dir;
    Store store;
    NoteService notes;
    Backups backups;
    Exporter exporter;
    Importer importer;
    Clock clock = Clock.fixed(Instant.parse("2026-10-04T08:30:00Z"), ZoneOffset.UTC);

    @BeforeEach
    void open() {
        store = Store.open(dir.resolve("litedd.db"), dir.resolve("backups"));
        notes = new NoteService(store);
        backups = new Backups(store, dir.resolve("backups"), clock);
        exporter = new Exporter(store, clock);
        importer = new Importer(store, backups, clock, Importer.MAX_BYTES);
    }

    @AfterEach
    void close() {
        store.close();
    }

    private Note note(String parent, String type, String title, String content) {
        Note n = notes.create(parent, type, title);
        return notes.save(n.id(), title, content, n.version());
    }

    private static Map<String, byte[]> unzip(byte[] zip) throws IOException {
        Map<String, byte[]> out = new LinkedHashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip), StandardCharsets.UTF_8)) {
            for (ZipEntry e = in.getNextEntry(); e != null; e = in.getNextEntry()) {
                out.put(e.getName(), in.readAllBytes());
            }
        }
        return out;
    }

    private static byte[] zip(Map<String, String> files) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream out = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            for (Map.Entry<String, String> f : files.entrySet()) {
                out.putNextEntry(new ZipEntry(f.getKey()));
                out.write(f.getValue().getBytes(StandardCharsets.UTF_8));
                out.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    /** Árbol comparable: identidad, madre, posición, tipo, título, contenido, etiquetas y favorita. */
    private List<String> snapshot() {
        return notes.tree().stream()
                .map(TreeNode::id)
                .map(notes::get)
                .map(n -> String.join("|", n.id(), String.valueOf(n.parentId()), String.valueOf(n.position()), n.type(),
                        n.title(), n.description(), n.content(), String.join(",", n.tags()), String.valueOf(n.favorite())))
                .sorted()
                .toList();
    }

    @Test
    void x01_file_name_has_date_and_time() {
        assertThat(Exporter.fileName(clock)).isEqualTo("litedd-export-20261004-0830.zip");
    }

    @Test
    void x02_x03_export_has_manifest_and_a_folder_tree_with_identical_content() throws Exception {
        Note guide = note(null, "md", "Guía de uso", "# Guía\nTexto");
        note(guide.id(), "sql", "Libros por autor", "SELECT * FROM book");
        note(guide.id(), "md", "Notas sueltas", "");
        note(null, "sql", "Consultas", "SHOW TABLES");
        notes.setTags(guide.id(), List.of("demo"));
        notes.setFavorite(guide.id(), true);

        Map<String, byte[]> files = unzip(exporter.export());

        assertThat(files.keySet()).contains("manifest.json", "notes/01-guia-de-uso.md", "notes/01-guia-de-uso/01-libros-por-autor.sql",
                "notes/01-guia-de-uso/02-notas-sueltas.md", "notes/02-consultas.sql");
        assertThat(new String(files.get("notes/01-guia-de-uso.md"), StandardCharsets.UTF_8)).isEqualTo("# Guía\nTexto");
        JsonNode manifest = JSON.readTree(files.get("manifest.json"));
        assertThat(manifest.get("formatVersion").asInt()).isEqualTo(1);
        assertThat(manifest.has("appVersion")).isTrue();
        assertThat(manifest.get("exportedAt").asText()).isEqualTo("2026-10-04T08:30:00Z");
        JsonNode first = manifest.get("notes").get(0);
        for (String field : List.of("id", "parentId", "position", "type", "title", "tags", "favorite", "createdAt", "updatedAt", "file")) {
            assertThat(first.has(field)).as(field).isTrue();
        }
        assertThat(first.get("tags").get(0).asText()).isEqualTo("demo");
        assertThat(manifest.get("attachments").isArray()).isTrue();
    }

    @Test
    void h50_http_notes_export_as_http_json_and_import_back() throws Exception {
        String content = "{\"method\":\"GET\",\"endpoint\":\"/user/{id}/tasks\"}";
        note(null, "http", "Tareas", content);
        byte[] zip = exporter.export();
        Map<String, byte[]> files = unzip(zip);
        assertThat(files.keySet()).contains("notes/01-tareas.http.json");
        assertThat(new String(files.get("notes/01-tareas.http.json"), StandardCharsets.UTF_8)).isEqualTo(content);

        Importer.ImportResult result = importer.importZip(new ByteArrayInputStream(zip), Mode.BRANCH);
        Note copy = notes.get(notes.tree().stream().filter(n -> result.rootId().equals(n.parentId())).findFirst().orElseThrow().id());
        assertThat(copy.type()).isEqualTo("http");
        assertThat(copy.content()).isEqualTo(content);
    }

    @Test
    void x04_trash_history_tabs_and_values_are_not_exported() throws Exception {
        Note keep = note(null, "md", "Activa", "x");
        Note gone = note(null, "md", "En la papelera", "y");
        notes.save(keep.id(), "Activa", "x2", keep.version(), true);
        notes.delete(gone.id(), false);
        Map<String, byte[]> files = unzip(exporter.export());
        JsonNode manifest = JSON.readTree(files.get("manifest.json"));
        assertThat(manifest.get("notes")).hasSize(1);
        assertThat(files.keySet()).containsExactlyInAnyOrder("manifest.json", "notes/01-activa.md");
    }

    @Test
    void x02_attachments_go_to_their_folder() throws Exception {
        Note n = note(null, "md", "Con imagen", "");
        String id = Attachments.insert(store, n.id(), "foto.png", "image/png", PNG, clock);
        notes.save(n.id(), "Con imagen", "![](litedd://attachment/" + id + ")", notes.get(n.id()).version());
        Map<String, byte[]> files = unzip(exporter.export());
        assertThat(files.get("attachments/" + id + ".png")).isEqualTo(PNG);
        JsonNode att = JSON.readTree(files.get("manifest.json")).get("attachments").get(0);
        assertThat(att.get("id").asText()).isEqualTo(id);
        assertThat(att.get("noteId").asText()).isEqualTo(n.id());
        assertThat(att.get("file").asText()).isEqualTo("attachments/" + id + ".png");
    }

    @Test
    void t47_title_with_slash_or_emoji_is_sanitized_in_the_file_and_kept_in_the_title() throws Exception {
        note(null, "md", "Informe 2026/10 🚀 «final»", "x");
        Map<String, byte[]> files = unzip(exporter.export());
        assertThat(files.keySet()).contains("notes/01-informe-2026-10-final.md");
        assertThat(Exporter.slug("🚀🚀")).isEqualTo("nota");
        assertThat(Exporter.slug("a".repeat(100))).hasSize(60);

        byte[] zip = exporter.export();
        importer.importZip(new ByteArrayInputStream(zip), Mode.BRANCH);
        assertThat(notes.tree()).extracting(TreeNode::title).contains("Informe 2026/10 🚀 «final»");
    }

    @Test
    void x05_replace_all_round_trip_gives_an_identical_tree() throws Exception {
        Note a = note(null, "md", "A", "contenido A");
        Note a1 = note(a.id(), "sql", "A1", "SELECT 1");
        note(a1.id(), "md", "A11", "profundo");
        note(null, "md", "B", "[enlace](litedd://note/" + a1.id() + ")");
        notes.setTags(a.id(), List.of("demo", "libros"));
        notes.setFavorite(a1.id(), true);
        // N-07: la descripción viaja en el manifiesto.
        notes.save(a.id(), "A", "Resumen de A", "contenido A", notes.get(a.id()).version(), false);
        List<String> before = snapshot();
        byte[] zip = exporter.export();

        // Se vacía todo y se importa.
        for (TreeNode n : notes.tree()) {
            if (n.parentId() == null) {
                notes.delete(n.id(), true);
            }
        }
        while (!notes.tree().isEmpty()) {
            notes.delete(notes.tree().getFirst().id(), true);
        }
        notes.emptyTrash();
        assertThat(notes.tree()).isEmpty();

        Importer.ImportResult result = importer.importZip(new ByteArrayInputStream(zip), Mode.REPLACE);

        assertThat(result.notes()).isEqualTo(4);
        assertThat(snapshot()).isEqualTo(before);
        // X-09: copia antes de reemplazar.
        try (Stream<Path> s = Files.list(dir.resolve("backups"))) {
            assertThat(s.map(p -> p.getFileName().toString())).anyMatch(n -> n.endsWith("-prereemplazo.db"));
        }
    }

    @Test
    void x05_replace_all_removes_what_was_there() throws Exception {
        byte[] zip = exporter.export();
        Note old = note(null, "md", "Vieja", "");
        Note trashed = note(null, "md", "Papelera", "");
        notes.delete(trashed.id(), false);
        importer.importZip(new ByteArrayInputStream(zip), Mode.REPLACE);
        assertThat(notes.tree()).isEmpty();
        assertThat(notes.trash()).isEmpty();
        assertThatThrownBy(() -> notes.get(old.id())).isInstanceOf(ApiError.class);
    }

    @Test
    void x05_add_as_branch_keeps_existing_notes_and_remaps_ids_links_and_images() throws Exception {
        Note a = note(null, "md", "A", "");
        Note b = note(null, "md", "B", "");
        String att = Attachments.insert(store, a.id(), "x.png", "image/png", PNG, clock);
        notes.save(a.id(), "A", "[ir a B](litedd://note/" + b.id() + ") ![](litedd://attachment/" + att + ")", notes.get(a.id()).version());
        List<String> before = snapshot();
        byte[] zip = exporter.export();

        Importer.ImportResult result = importer.importZip(new ByteArrayInputStream(zip), Mode.BRANCH);

        // Lo existente no cambia.
        assertThat(snapshot()).containsAll(before);
        Note root = notes.get(result.rootId());
        assertThat(root.parentId()).isNull();
        assertThat(root.title()).isEqualTo("Importado 2026-10-04 08:30");
        List<TreeNode> imported = notes.tree().stream().filter(n -> result.rootId().equals(n.parentId())).toList();
        assertThat(imported).extracting(TreeNode::title).containsExactly("A", "B");
        assertThat(imported).extracting(TreeNode::id).doesNotContain(a.id(), b.id());
        String newB = imported.get(1).id();
        String content = notes.get(imported.get(0).id()).content();
        assertThat(content).contains("litedd://note/" + newB).doesNotContain(b.id()).doesNotContain(att);
        String newAtt = content.replaceAll("(?s).*litedd://attachment/([0-9a-f-]{36}).*", "$1");
        assertThat(Attachments.load(store, newAtt)).isEqualTo(PNG);
    }

    @Test
    void x06_t46_path_traversal_is_rejected_without_changes() throws Exception {
        note(null, "md", "Intacta", "x");
        List<String> before = snapshot();
        String manifest = """
                {"formatVersion":1,"appVersion":"x","exportedAt":"2026-10-04T08:30:00Z",
                 "notes":[{"id":"n1","parentId":null,"position":0,"type":"md","title":"Mala","tags":[],"favorite":false,
                           "createdAt":"2026-10-04T08:30:00Z","updatedAt":"2026-10-04T08:30:00Z","file":"../fuera.md"}],
                 "attachments":[]}""";
        byte[] traversalInManifest = zip(Map.of("manifest.json", manifest, "../fuera.md", "x"));
        for (Mode mode : Mode.values()) {
            assertThatThrownBy(() -> importer.importZip(new ByteArrayInputStream(traversalInManifest), mode))
                    .isInstanceOfSatisfying(ApiError.class, e -> assertThat(e.status()).isEqualTo(400));
        }
        byte[] absolute = zip(Map.of("manifest.json", manifest.replace("../fuera.md", "/etc/fuera.md"), "/etc/fuera.md", "x"));
        assertThatThrownBy(() -> importer.importZip(new ByteArrayInputStream(absolute), Mode.REPLACE)).isInstanceOf(ApiError.class);
        assertThat(snapshot()).isEqualTo(before);
        try (Stream<Path> s = Files.exists(dir.resolve("backups")) ? Files.list(dir.resolve("backups")) : Stream.empty()) {
            assertThat(s.toList()).isEmpty();
        }
    }

    @Test
    void x06_version_missing_files_and_size_are_validated() throws Exception {
        String manifest = """
                {"formatVersion":%d,"appVersion":"x","exportedAt":"2026-10-04T08:30:00Z",
                 "notes":[{"id":"n1","parentId":null,"position":0,"type":"md","title":"T","tags":[],"favorite":false,
                           "createdAt":"2026-10-04T08:30:00Z","updatedAt":"2026-10-04T08:30:00Z","file":"notes/01-t.md"}],
                 "attachments":[]}""";
        assertThatThrownBy(() -> importer.importZip(new ByteArrayInputStream(zip(Map.of("manifest.json", manifest.formatted(2),
                "notes/01-t.md", "x"))), Mode.BRANCH)).hasMessageContaining("versión");
        assertThatThrownBy(() -> importer.importZip(new ByteArrayInputStream(zip(Map.of("manifest.json", manifest.formatted(1)))),
                Mode.BRANCH)).hasMessageContaining("notes/01-t.md");
        assertThatThrownBy(() -> importer.importZip(new ByteArrayInputStream(zip(Map.of("otro.txt", "x"))), Mode.BRANCH))
                .hasMessageContaining("manifest.json");
        Importer small = new Importer(store, backups, clock, 100);
        assertThatThrownBy(() -> small.importZip(new ByteArrayInputStream(zip(Map.of("manifest.json", manifest.formatted(1),
                "notes/01-t.md", "x".repeat(200)))), Mode.BRANCH)).hasMessageContaining("500 MB");
        assertThat(notes.tree()).isEmpty();
    }

    @Test
    void x07_the_manifest_wins_over_the_folders() throws Exception {
        String manifest = """
                {"formatVersion":1,"appVersion":"x","exportedAt":"2026-10-04T08:30:00Z",
                 "notes":[
                   {"id":"p","parentId":null,"position":0,"type":"md","title":"Madre","tags":[],"favorite":false,
                    "createdAt":"2026-10-04T08:30:00Z","updatedAt":"2026-10-04T08:30:00Z","file":"notes/a.md"},
                   {"id":"c","parentId":"p","position":0,"type":"sql","title":"Hija","tags":["x"],"favorite":true,
                    "createdAt":"2026-10-04T08:30:00Z","updatedAt":"2026-10-04T08:30:00Z","file":"notes/otra-carpeta/b.sql"}],
                 "attachments":[]}""";
        importer.importZip(new ByteArrayInputStream(zip(Map.of("manifest.json", manifest, "notes/a.md", "madre",
                "notes/otra-carpeta/b.sql", "SELECT 1"))), Mode.REPLACE);
        Note child = notes.get("c");
        assertThat(child.parentId()).isEqualTo("p");
        assertThat(child.type()).isEqualTo("sql");
        assertThat(child.content()).isEqualTo("SELECT 1");
        assertThat(child.tags()).containsExactly("x");
        assertThat(child.favorite()).isTrue();
    }

    @Test
    void x08_daily_backup_when_the_last_one_is_older_than_a_day_and_keeps_three() throws Exception {
        Path backupsDir = dir.resolve("backups");
        Path first = backups.dailyIfDue();
        assertThat(first.getFileName().toString()).isEqualTo("litedd-20261004.db");
        assertThat(backups.dailyIfDue()).isNull();

        Files.createDirectories(backupsDir);
        for (String day : List.of("20260930", "20261001", "20261002")) {
            Path old = backupsDir.resolve("litedd-" + day + ".db");
            Files.writeString(old, "");
            Files.setLastModifiedTime(old, FileTime.from(Instant.parse("2026-10-02T00:00:00Z")));
        }
        Files.setLastModifiedTime(first, FileTime.from(clock.instant().minus(25, ChronoUnit.HOURS)));
        assertThat(backups.dailyIfDue()).isNotNull();
        try (Stream<Path> s = Files.list(backupsDir)) {
            assertThat(s.map(p -> p.getFileName().toString()).filter(n -> n.matches("litedd-\\d{8}\\.db")).sorted())
                    .containsExactly("litedd-20261001.db", "litedd-20261002.db", "litedd-20261004.db");
        }
    }

    @Test
    void x09_pre_replace_backups_keep_the_last_two() throws Exception {
        Path backupsDir = Files.createDirectories(dir.resolve("backups"));
        for (String name : List.of("litedd-20260101-000000-prereemplazo.db", "litedd-20260102-000000-prereemplazo.db")) {
            Files.writeString(backupsDir.resolve(name), "");
        }
        backups.preReplace();
        try (Stream<Path> s = Files.list(backupsDir)) {
            assertThat(s.map(p -> p.getFileName().toString()).filter(n -> n.endsWith("-prereemplazo.db")).sorted())
                    .containsExactly("litedd-20260102-000000-prereemplazo.db", "litedd-20261004-083000-prereemplazo.db");
        }
    }

    @Test
    void t48_full_text_index_is_consistent_in_the_copy() throws Exception {
        note(null, "md", "Préstamos", "tabla de libros prestados");
        Path copy = backups.backupNow();
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + copy);
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT count(*) FROM note_fts WHERE note_fts MATCH '\"prestamo\"* \"libros\"'")) {
            rs.next();
            assertThat(rs.getInt(1)).isEqualTo(1);
        }
        // FTS5 lanza un error si el índice no es coherente con la tabla note.
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + copy); Statement st = c.createStatement()) {
            st.execute("INSERT INTO note_fts(note_fts) VALUES ('integrity-check')");
        }
    }
}
