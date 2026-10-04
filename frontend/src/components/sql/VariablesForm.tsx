import type { KeyboardEvent } from 'react';
import type { SqlVariable } from '../../sql/types';
import { fromControl, toControl, typeLabel } from '../../sql/values';

interface Props {
  variables: SqlVariable[];
  values: Record<string, string>;
  errors: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onExecute: () => void;
  onClear: () => void;
}

/** Q-20 a Q-25: un campo por variable, con el aspecto de los criterios de un buscador. */
export function VariablesForm({ variables, values, errors, onChange, onExecute, onClear }: Props) {
  // Q-25: sin variables no hay formulario.
  if (variables.length === 0) return null;

  // Q-23: Intro en cualquier campo ejecuta.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.ctrlKey) {
      e.preventDefault();
      onExecute();
    }
  };

  return (
    <div className="sql-form" role="group" aria-label="Variables">
      {variables.map((v) => {
        const id = `var-${v.name}`;
        const value = values[v.name] ?? '';
        const error = errors[v.name];
        const common = {
          id,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? `${id}-error` : undefined,
          onKeyDown,
        };
        return (
          <div key={v.name} className={`sql-field${error ? ' invalid' : ''}`}>
            <label htmlFor={id}>
              <span className="sql-field-name">{v.name}</span>
              <span className="sql-field-type">{typeLabel(v.type, v.elementType)}</span>
              {v.textual && (
                <span className="sql-field-textual" title="Sustitución textual ${…}: el valor se inserta tal cual en el SQL">
                  $
                </span>
              )}
            </label>
            {v.type === 'boolean' ? (
              <select {...common} value={value} onChange={(e) => onChange(v.name, e.target.value)}>
                <option value="">(vacío)</option>
                <option value="true">sí</option>
                <option value="false">no</option>
              </select>
            ) : v.type === 'date' || v.type === 'datetime' ? (
              <input
                {...common}
                type={v.type === 'date' ? 'date' : 'datetime-local'}
                step={v.type === 'datetime' ? 1 : undefined}
                value={toControl(v.type, value)}
                onChange={(e) => onChange(v.name, fromControl(v.type, e.target.value))}
              />
            ) : (
              <input
                {...common}
                value={value}
                placeholder={v.type === 'list' ? 'valor1, valor2' : 'vacío = null'}
                onChange={(e) => onChange(v.name, e.target.value)}
                spellCheck={false}
              />
            )}
            {error && (
              <span className="sql-field-error" id={`${id}-error`}>
                {error}
              </span>
            )}
          </div>
        );
      })}
      <div className="sql-form-actions">
        <button type="button" onClick={onClear}>
          Limpiar
        </button>
      </div>
    </div>
  );
}
