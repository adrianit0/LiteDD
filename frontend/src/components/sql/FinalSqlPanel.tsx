import { useState } from 'react';
import type { FinalSql } from '../../sql/types';

interface Props {
  finalSql: FinalSql;
  /** Q-45: con «Generar SQL» el panel se abre, porque es lo que se busca. */
  open: boolean;
  onCopy: (text: string, what: string) => void;
}

function showValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return `'${value}'`;
  return String(value);
}

/** Q-70 a Q-73: panel plegable con el SQL con parámetros y con valores. */
export function FinalSqlPanel({ finalSql, open, onCopy }: Props) {
  const [view, setView] = useState<'params' | 'values'>(open ? 'values' : 'params');

  return (
    <details className="final-sql" open={open || undefined}>
      <summary>SQL final</summary>
      <div className="final-sql-tabs" role="tablist" aria-label="Vista del SQL final">
        <button type="button" role="tab" aria-selected={view === 'params'} onClick={() => setView('params')}>
          Con parámetros
        </button>
        <button type="button" role="tab" aria-selected={view === 'values'} onClick={() => setView('values')}>
          Con valores
        </button>
      </div>
      {view === 'params' ? (
        <div role="tabpanel" aria-label="Con parámetros">
          <pre className="final-sql-code">{finalSql.withPlaceholders}</pre>
          {finalSql.parameters.length > 0 && (
            <ol className="final-sql-params">
              {finalSql.parameters.map((p) => (
                <li key={p.index}>
                  <code>{showValue(p.value)}</code> <span className="muted">· {p.type}</span>
                </li>
              ))}
            </ol>
          )}
          <button type="button" onClick={() => onCopy(finalSql.withPlaceholders, 'SQL con parámetros')}>
            Copiar
          </button>
        </div>
      ) : (
        <div role="tabpanel" aria-label="Con valores">
          <pre className="final-sql-code">{finalSql.inlined}</pre>
          <button type="button" onClick={() => onCopy(finalSql.inlined, 'SQL con valores')}>
            Copiar
          </button>
        </div>
      )}
    </details>
  );
}
