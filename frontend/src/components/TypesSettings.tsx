import { useMemo } from 'react';
import type { CustomType } from '../api';
import { useTree } from '../stores/treeStore';

/** Un tipo en el formulario de «Ajustes»; id solo sirve de clave de la fila. */
export interface TypeForm extends CustomType {
  id: string;
}

/** Q-110: un identificador, con un parámetro opcional al final. */
const NAME = /^([A-Za-z_][A-Za-z0-9_]*)(?:#\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\})?$/;
const MAX_NAME = 64;
/** Q-12: los tipos de LiteDD, también sus otros nombres de una palabra. */
const BUILT_IN = new Set(['string', 'int', 'integer', 'long', 'decimal', 'bigdecimal', 'boolean', 'date', 'datetime', 'list']);

export function toTypeForms(types: CustomType[]): TypeForm[] {
  return types.map((t) => ({ ...t, id: crypto.randomUUID() }));
}

/** Q-110: sin las filas que se añadieron y se dejaron vacías. */
export function fromTypeForms(forms: TypeForm[]): CustomType[] {
  return forms.filter((t) => t.name.trim() !== '' || t.noteId).map((t) => ({ name: t.name.trim(), noteId: t.noteId || null }));
}

/** Clave para saber si dos tipos se repiten: «cat» y «cat#{id}» no se repiten. */
function identity(name: string): string | null {
  const m = NAME.exec(name);
  if (!m) return null;
  return m[1].toLowerCase() + (m[1] === name ? '' : '#');
}

/** Q-110: aviso de una fila de «Ajustes → Tipos», o null si es válida. */
export function typeProblem(type: CustomType, all: CustomType[]): string | null {
  const name = type.name.trim();
  if (name === '') return 'Falta el nombre';
  const id = name.length > MAX_NAME ? null : identity(name);
  if (id === null) return 'Nombre no válido';
  if (!id.endsWith('#') && BUILT_IN.has(id)) return 'Ya es un tipo de LiteDD';
  if (all.filter((t) => identity(t.name.trim()) === id).length > 1) return 'Tipo repetido';
  if (!type.noteId) return 'Elige una nota SQL';
  return null;
}

/** Q-110: el primer aviso de los tipos que se van a guardar, o null. */
export function typesProblem(forms: TypeForm[]): string | null {
  const types = fromTypeForms(forms);
  for (const t of types) {
    const problem = typeProblem(t, types);
    if (problem) return t.name ? `${problem}: ${t.name}` : problem;
  }
  return null;
}

interface Props {
  types: TypeForm[];
  onChange: (types: TypeForm[]) => void;
}

/** Q-110, ADR-0050: nombre y nota SQL de cada tipo personalizado de variable. */
export function TypesSettings({ types, onChange }: Props) {
  const nodes = useTree((s) => s.nodes);
  const sqlNotes = useMemo(() => nodes.filter((n) => n.type === 'sql'), [nodes]);

  const change = (id: string, changes: Partial<TypeForm>) => onChange(types.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  const add = () => onChange([...types, { id: crypto.randomUUID(), name: '', noteId: null }]);

  return (
    <>
      {types.length > 0 && (
        <table className="kv-table ref-table" aria-label="Tipos">
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Nota SQL</th>
              <th scope="col" className="kv-actions">
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {types.map((t, i) => {
              const name = t.name.trim() || `la fila ${i + 1}`;
              const empty = t.name.trim() === '' && !t.noteId;
              const warning = empty ? null : typeProblem(t, types);
              const missing = t.noteId !== null && !sqlNotes.some((n) => n.id === t.noteId);
              return (
                <tr key={t.id}>
                  <td>
                    <input
                      value={t.name}
                      placeholder="lang o catalogo#{id}"
                      aria-label={`Nombre de ${name}`}
                      aria-invalid={warning ? true : undefined}
                      spellCheck={false}
                      onChange={(e) => change(t.id, { name: e.target.value })}
                    />
                    {warning && <span className="kv-warning">{warning}</span>}
                  </td>
                  <td>
                    <select value={t.noteId ?? ''} aria-label={`Nota SQL de ${name}`} onChange={(e) => change(t.id, { noteId: e.target.value || null })}>
                      <option value="">Sin elegir</option>
                      {missing && <option value={t.noteId!}>Nota que ya no existe</option>}
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
                      aria-label={`Quitar el tipo ${name}`}
                      title="Quitar"
                      onClick={() => onChange(types.filter((x) => x.id !== t.id))}
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
      <div className="settings-row ref-actions">
        <button type="button" onClick={add}>
          Añadir tipo
        </button>
      </div>
      <p className="muted settings-hint">
        Una variable declarada con un tipo de esta lista, por ejemplo <code>#{'{'}lenguajeId, lang{'}'}</code>, se rellena con un combo con
        las opciones de la nota, que se consultan al abrir la pestaña. La primera opción es «(Vacío)», que vale null.
      </p>
      <p className="muted settings-hint">
        La nota es una nota SQL con una consulta que devuelve las columnas <code>key</code>, lo que recibe la variable, y <code>value</code>,
        el nombre; si no, la primera y la segunda columna. <code>KEY</code> es palabra reservada de MySQL: escribe{' '}
        <code>SELECT id AS `key`, name AS value FROM lang</code>.
      </p>
      <p className="muted settings-hint">
        Un tipo con parámetro, como <code>catalogo#{'{'}id{'}'}</code>, se usa como <code>#{'{'}tipoId, catalogo5{'}'}</code>: su nota tiene una
        sola variable, que recibe lo que va tras el nombre, por ejemplo{' '}
        <code>SELECT id AS `key`, name AS value FROM catalog_item WHERE catalog_id = #{'{'}id{'}'}</code>.
      </p>
    </>
  );
}
