import { useEffect, type KeyboardEvent } from 'react';
import type { SqlVariable } from '../../sql/types';
import { fromControl, toControl, typeLabel } from '../../sql/values';
import { typeKey, useTypeOptions } from '../../sql/options';
import { useConnection } from '../../stores/connectionStore';
import { useUi } from '../../stores/uiStore';
import { connectionKey } from '../../sql/schema';
import { TypeCombo } from './TypeCombo';

interface Props {
  tabId: string;
  variables: SqlVariable[];
  values: Record<string, string>;
  errors: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onExecute: () => void;
  onClear: () => void;
}

/** Q-20 a Q-25: un campo por variable, con el aspecto de los criterios de un buscador. */
export function VariablesForm({ tabId, variables, values, errors, onChange, onExecute, onClear }: Props) {
  // Q-116: las opciones de los tipos personalizados se piden al mostrar el formulario en la pestaña.
  const usages = variables.flatMap((v) => (v.customType ? [v.customType] : []));
  const usagesKey = usages.map(typeKey).join('\n');
  const types = useUi((s) => s.config.types);
  const connection = useConnection((s) => connectionKey(s.status));
  const typeOptions = useTypeOptions((s) => s.byTab[tabId]);
  useEffect(() => {
    if (usagesKey !== '') useTypeOptions.getState().ensure(tabId, usagesKey.split('\n'));
  }, [tabId, usagesKey, types, connection]);

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
        // Q-116: si las opciones fallan, el error se ve bajo el campo.
        const entry = v.customType ? typeOptions?.[typeKey(v.customType)] : undefined;
        const error = errors[v.name] ?? entry?.error ?? undefined;
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
              <span className="sql-field-type">{typeLabel(v.type, v.elementType, v.customType)}</span>
              {v.textual && (
                <span className="sql-field-textual" title="Sustitución textual ${…}: el valor se inserta tal cual en el SQL">
                  $
                </span>
              )}
            </label>
            {v.customType ? (
              <TypeCombo
                id={id}
                value={value}
                entry={entry}
                invalid={Boolean(error)}
                describedBy={error ? `${id}-error` : undefined}
                onChange={(next) => onChange(v.name, next)}
                onExecute={onExecute}
              />
            ) : v.type === 'boolean' ? (
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
