import { useId } from 'react';
import type { Row } from '../../http/content';

interface Props {
  /** Nombre de la tabla para los lectores de pantalla: «Params», «Headers»… */
  label: string;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  /** H-16: sugerencias para la clave. */
  suggestions?: string[];
  /** Aviso por fila, por ejemplo una cabecera que no se puede escribir. */
  problem?: (row: Row) => string | null;
}

/** H-14, H-16, H-17: filas clave, valor y activa. La última, vacía, sirve para añadir. */
export function KeyValueTable({ label, rows, onChange, suggestions, problem }: Props) {
  const listId = useId();
  const all = [...rows, { key: '', value: '', enabled: true }];

  const change = (index: number, changes: Partial<Row>) => {
    if (index === rows.length) {
      onChange([...rows, { key: '', value: '', enabled: true, ...changes }]);
      return;
    }
    onChange(rows.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  };

  return (
    <table className="kv-table" aria-label={label}>
      <thead>
        <tr>
          <th scope="col" className="kv-check">
            <span className="visually-hidden">Activa</span>
          </th>
          <th scope="col">Clave</th>
          <th scope="col">Valor</th>
          <th scope="col" className="kv-actions">
            <span className="visually-hidden">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {all.map((row, i) => {
          const isNew = i === rows.length;
          const warning = !isNew && problem ? problem(row) : null;
          return (
            <tr key={i} className={row.enabled ? undefined : 'kv-off'}>
              <td className="kv-check">
                {!isNew && (
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    aria-label={`Activar ${row.key || `fila ${i + 1}`}`}
                    onChange={(e) => change(i, { enabled: e.target.checked })}
                  />
                )}
              </td>
              <td>
                <input
                  value={row.key}
                  placeholder={isNew ? 'Clave nueva' : 'Clave'}
                  aria-label={isNew ? `${label}: clave nueva` : `${label}: clave ${i + 1}`}
                  aria-invalid={warning ? true : undefined}
                  title={warning ?? undefined}
                  list={suggestions ? listId : undefined}
                  onChange={(e) => change(i, { key: e.target.value })}
                />
                {warning && <span className="kv-warning">{warning}</span>}
              </td>
              <td>
                <input
                  value={row.value}
                  placeholder="Valor"
                  aria-label={isNew ? `${label}: valor nuevo` : `${label}: valor ${i + 1}`}
                  onChange={(e) => change(i, { value: e.target.value })}
                />
              </td>
              <td className="kv-actions">
                {!isNew && (
                  <button type="button" className="icon-button" aria-label={`Quitar ${row.key || `fila ${i + 1}`}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </table>
  );
}
