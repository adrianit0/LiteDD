import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { EMPTY_OPTION, filterOptions, optionLabel, valueLabel, type TypeOptions } from '../../sql/options';

interface Props {
  id: string;
  /** La key elegida; '' es «(Vacío)», que vale null. */
  value: string;
  entry: TypeOptions | undefined;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
  onExecute: () => void;
}

/**
 * Q-115, ADR-0050: combo con buscador de un tipo personalizado. La primera opción es «(Vacío)»; al escribir se filtran
 * las demás. Con la lista cerrada, Intro ejecuta (Q-23).
 */
export function TypeCombo({ id, value, entry, invalid, describedBy, onChange, onExecute }: Props) {
  const options = useMemo(() => entry?.options ?? [], [entry]);
  const [open, setOpen] = useState(false);
  /** Lo escrito para filtrar; null mientras se ve la opción elegida. */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = `${id}-list`;

  const { shown, hidden } = useMemo(() => filterOptions(options, query ?? ''), [options, query]);
  // La posición 0 es «(Vacío)».
  const count = shown.length + 1;
  const selectedLabel = valueLabel(value, options);

  // La opción activa se mantiene a la vista al moverse con las flechas.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const openList = () => {
    if (open) return;
    // Se abre con la opción elegida activa.
    const index = shown.findIndex(([key]) => key === value);
    setActive(index >= 0 ? index + 1 : 0);
    setOpen(true);
  };

  const choose = (index: number) => {
    onChange(index === 0 ? '' : shown[index - 1][0]);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => Math.min(count - 1, a + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) setActive((a) => Math.max(0, a - 1));
        break;
      case 'Enter':
        if (e.ctrlKey) return;
        e.preventDefault();
        if (open) choose(Math.min(active, count - 1));
        else onExecute();
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
      case 'Tab':
        close();
        break;
      default:
    }
  };

  return (
    <div className="type-combo">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        value={query ?? selectedLabel}
        placeholder={EMPTY_OPTION}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          // Al escribir se activa la primera coincidencia.
          setActive(1);
          setOpen(true);
        }}
        onClick={openList}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      <button
        type="button"
        className="type-combo-toggle"
        tabIndex={-1}
        aria-label="Mostrar las opciones"
        onMouseDown={(e) => {
          // El foco se queda en el cuadro.
          e.preventDefault();
          if (open) close();
          else {
            document.getElementById(id)?.focus();
            openList();
          }
        }}
      >
        ▾
      </button>
      {open && (
        <ul className="type-combo-list" id={listId} role="listbox" ref={listRef} aria-label="Opciones">
          {[EMPTY_OPTION, ...shown.map(optionLabel)].map((label, i) => (
            <li
              key={i === 0 ? '' : `${shown[i - 1][0]}\u0000${i}`}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              className={`${i === active ? 'active' : ''}${i === 0 ? ' empty' : ''}`}
              // Antes que el blur del cuadro, que cerraría la lista.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {label}
            </li>
          ))}
          {entry?.status === 'loading' && <li className="type-combo-note">Consultando…</li>}
          {entry?.status === 'ready' && shown.length === 0 && (
            <li className="type-combo-note">{query?.trim() ? 'Sin coincidencias' : 'Sin opciones'}</li>
          )}
          {hidden > 0 && (
            <li className="type-combo-note">
              {hidden.toLocaleString('es-ES')} más: escribe para filtrar
            </li>
          )}
          {entry?.capReached && <li className="type-combo-note">La consulta llegó al tope de filas</li>}
        </ul>
      )}
    </div>
  );
}
