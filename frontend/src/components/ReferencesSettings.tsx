import { useEffect, useId, useMemo } from 'react';
import type { Reference } from '../api';
import { DEFAULT_REFERENCE_COLOR, referenceProblem } from '../sql/references';
import { useSqlSchema } from '../sql/schema';
import { useTree } from '../stores/treeStore';

/** Una referencia en el formulario de «Ajustes»; id solo sirve de clave de la fila. */
export interface ReferenceForm extends Reference {
  id: string;
}

export function toReferenceForms(references: Reference[]): ReferenceForm[] {
  return references.map((r) => ({ ...r, id: crypto.randomUUID() }));
}

/** Q-100: sin las filas que se añadieron y se dejaron vacías. */
export function fromReferenceForms(forms: ReferenceForm[]): Reference[] {
  return forms
    .filter((r) => r.table.trim() !== '' || r.noteId)
    .map((r) => ({ table: r.table.trim(), color: r.color, noteId: r.noteId || null }));
}

/** Q-100: el primer aviso de las referencias que se van a guardar, o null. */
export function referencesProblem(forms: ReferenceForm[]): string | null {
  const references = fromReferenceForms(forms);
  for (const r of references) {
    const problem = referenceProblem(r, references);
    if (problem) return r.table ? `${problem}: ${r.table}` : problem;
  }
  return null;
}

interface Props {
  references: ReferenceForm[];
  onChange: (references: ReferenceForm[]) => void;
}

/** Q-100, ADR-0048: tabla objetivo, color y nota SQL de cada referencia de clave foránea. */
export function ReferencesSettings({ references, onChange }: Props) {
  const listId = useId();
  const nodes = useTree((s) => s.nodes);
  const sqlNotes = useMemo(() => nodes.filter((n) => n.type === 'sql'), [nodes]);
  const tables = useSqlSchema((s) => s.tables);

  // Q-84: las tablas del esquema se proponen al escribir la tabla objetivo.
  useEffect(() => {
    void useSqlSchema.getState().ensure();
  }, []);

  const change = (id: string, changes: Partial<ReferenceForm>) => onChange(references.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  const add = () => onChange([...references, { id: crypto.randomUUID(), table: '', color: DEFAULT_REFERENCE_COLOR, noteId: null }]);

  return (
    <>
      {references.length > 0 && (
        <table className="kv-table ref-table" aria-label="Referencias">
          <thead>
            <tr>
              <th scope="col">Tabla objetivo</th>
              <th scope="col" className="ref-color-cell">
                Color
              </th>
              <th scope="col">Nota SQL</th>
              <th scope="col" className="kv-actions">
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {references.map((r, i) => {
              const name = r.table.trim() || `la fila ${i + 1}`;
              const empty = r.table.trim() === '' && !r.noteId;
              const warning = empty ? null : referenceProblem(r, references);
              const missing = r.noteId !== null && !sqlNotes.some((n) => n.id === r.noteId);
              return (
                <tr key={r.id}>
                  <td>
                    <input
                      value={r.table}
                      placeholder="Tabla"
                      aria-label={`Tabla objetivo de ${name}`}
                      aria-invalid={warning ? true : undefined}
                      list={listId}
                      onChange={(e) => change(r.id, { table: e.target.value })}
                    />
                    {warning && <span className="kv-warning">{warning}</span>}
                  </td>
                  <td className="ref-color-cell">
                    <input type="color" value={r.color} aria-label={`Color de ${name}`} onChange={(e) => change(r.id, { color: e.target.value })} />
                  </td>
                  <td>
                    <select value={r.noteId ?? ''} aria-label={`Nota SQL de ${name}`} onChange={(e) => change(r.id, { noteId: e.target.value || null })}>
                      <option value="">Sin elegir</option>
                      {missing && <option value={r.noteId!}>Nota que ya no existe</option>}
                      {sqlNotes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="kv-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Quitar la referencia de ${name}`}
                      title="Quitar"
                      onClick={() => onChange(references.filter((x) => x.id !== r.id))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <datalist id={listId}>
        {tables.map((t) => (
          <option key={t.name} value={t.name} />
        ))}
      </datalist>
      <div className="settings-row ref-actions">
        <button type="button" onClick={add}>
          Añadir referencia
        </button>
      </div>
      <p className="muted settings-hint">
        En los resultados de las notas SQL, las celdas de una columna con clave foránea hacia la tabla objetivo llevan una marca del color
        elegido en la esquina inferior derecha. Con el ratón quieto sobre una de ellas, o seleccionándola con el teclado, se ejecuta la nota
        con el valor de la celda y se muestra el resultado.
      </p>
      <p className="muted settings-hint">
        La nota es una nota SQL con una consulta y una sola variable, por ejemplo <code>SELECT name FROM author WHERE id = #{'{'}id{'}'}</code>.
        Solo cuentan las claves foráneas declaradas en MySQL.
      </p>
    </>
  );
}
