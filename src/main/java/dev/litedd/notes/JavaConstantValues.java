package dev.litedd.notes;

import dev.litedd.http.ApiError;
import dev.litedd.sqlengine.JavaConstants;
import dev.litedd.store.Store;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/** Valores de las constantes Java, comunes a todas las notas (M-61 a M-66, ADR-0025). */
public final class JavaConstantValues {

    /**
     * @param value null si no tiene valor
     * @param notes notas SQL y XML activas que la usan; 0 = «sin uso» (M-66)
     */
    public record Constant(String name, String shortName, String packageName, String value, int notes) {
    }

    private final Store store;
    private final Clock clock;

    public JavaConstantValues(Store store) {
        this(store, Clock.systemUTC());
    }

    public JavaConstantValues(Store store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    /** Nombre → valor, solo las que tienen valor. */
    public Map<String, String> values() {
        Map<String, String> out = new HashMap<>();
        store.read(s -> s.getMapper(JavaConstantMapper.class).selectAll()).forEach(r -> out.put(r.name(), r.value()));
        return out;
    }

    /** M-61, M-65: las que aparecen en las notas más las que tienen valor; primero las que no lo tienen. */
    public List<Constant> list() {
        return store.read(s -> {
            JavaConstantMapper m = s.getMapper(JavaConstantMapper.class);
            Map<String, Integer> uses = new HashMap<>();
            for (String content : m.selectSqlContents()) {
                JavaConstants.find(content).forEach(name -> uses.merge(name, 1, Integer::sum));
            }
            Map<String, String> values = new LinkedHashMap<>();
            m.selectAll().forEach(r -> values.put(r.name(), r.value()));
            TreeSet<String> names = new TreeSet<>(uses.keySet());
            names.addAll(values.keySet());
            List<Constant> out = new ArrayList<>();
            for (String name : names) {
                int at = name.indexOf('@');
                String type = name.substring(0, at);
                int dot = type.lastIndexOf('.');
                out.add(new Constant(name, JavaConstants.shortName(name), dot < 0 ? "" : type.substring(0, dot), values.get(name),
                        uses.getOrDefault(name, 0)));
            }
            out.sort(Comparator.comparing((Constant c) -> c.value() != null).thenComparing(Constant::shortName)
                    .thenComparing(Constant::name));
            return out;
        });
    }

    /** M-65, M-66: aplica los cambios en una transacción; un valor vacío o null deja la constante sin valor. */
    public List<Constant> update(Map<String, String> changes) {
        for (String name : changes.keySet()) {
            if (!JavaConstants.isName(name)) {
                throw new ApiError(400, "invalid_constant", "Nombre de constante no válido: «" + name + "»");
            }
        }
        String now = clock.instant().truncatedTo(ChronoUnit.MILLIS).toString();
        store.write(s -> {
            JavaConstantMapper m = s.getMapper(JavaConstantMapper.class);
            changes.forEach((name, value) -> {
                if (value == null || value.isBlank()) {
                    m.delete(name);
                } else {
                    m.upsert(name, value.strip(), now);
                }
            });
            return null;
        });
        return list();
    }
}
