package dev.litedd.notes;

import dev.litedd.notes.VariableValueMapper.ValueRow;
import dev.litedd.store.Store;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/** Últimos valores de las variables de cada nota SQL (Q-24, ADR-0014). */
public final class VariableValues {

    private final Store store;

    public VariableValues(Store store) {
        this.store = store;
    }

    /** Variable → último valor; null si se ejecutó con el campo vacío. */
    public Map<String, String> load(String noteId) {
        Map<String, String> out = new LinkedHashMap<>();
        for (ValueRow r : store.read(s -> s.getMapper(VariableValueMapper.class).selectByNote(noteId))) {
            out.put(r.name(), r.value());
        }
        return out;
    }

    /** Sustituye los valores guardados por los de las variables actuales de la nota. */
    public void save(String noteId, Collection<String> variables, Map<String, String> values) {
        Map<String, String> clean = new HashMap<>();
        for (String name : variables) {
            String v = values == null ? null : values.get(name);
            clean.put(name, v == null || v.isEmpty() ? null : v);
        }
        store.write(s -> {
            VariableValueMapper m = s.getMapper(VariableValueMapper.class);
            m.deleteByNote(noteId);
            clean.forEach((name, value) -> m.insert(noteId, name, value));
            return null;
        });
    }
}
