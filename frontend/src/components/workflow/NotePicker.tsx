import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTree } from '../../stores/treeStore';
import { ancestorsOf, visibleRows } from '../../tree';
import { normalize } from '../../treeOps';

interface Props {
  type: 'http' | 'sql';
  onPick: (noteId: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 200;

/** W-23, W-24: selector de la nota de un nodo, con búsqueda, como el de «Mover a…» (N-64). */
export function NotePicker({ type, onPick, onClose }: Props) {
  const nodes = useTree((s) => s.nodes);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const options = useMemo(() => {
    const q = normalize(query.trim());
    return visibleRows(nodes, new Set())
      .map((r) => r.node)
      .filter((n) => n.type === type && (q === '' || normalize(n.title).includes(q)))
      .slice(0, MAX_RESULTS)
      .map((n) => ({ id: n.id, title: n.title, path: ancestorsOf(nodes, n.id).map((a) => a.title).join(' / ') }));
  }, [nodes, query, type]);

  const choose = (id: string | undefined) => {
    if (!id) return;
    onClose();
    onPick(id);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((i) => Math.min(options.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setIndex((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter') choose(options[index]?.id);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const what = type === 'http' ? 'nota HTTP' : 'nota SQL';
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog move-dialog" role="dialog" aria-modal="true" aria-labelledby="wf-pick-title" onKeyDown={onKeyDown}>
        <h2 id="wf-pick-title">Elegir {what}</h2>
        <input
          autoFocus
          className="move-search"
          aria-label={`Buscar ${what}`}
          placeholder="Buscar nota…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="wf-pick-options"
          aria-activedescendant={options[index] ? `wf-pick-${index}` : undefined}
        />
        <ul className="move-options" id="wf-pick-options" role="listbox" aria-label="Notas">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`wf-pick-${i}`}
              role="option"
              aria-selected={i === index}
              className={i === index ? 'selected' : undefined}
              onPointerEnter={() => setIndex(i)}
              onClick={() => choose(o.id)}
            >
              <span>{o.title}</span>
              {o.path && <span className="move-path muted">{o.path}</span>}
            </li>
          ))}
          {options.length === 0 && <li className="muted">No hay ninguna {what}.</li>}
        </ul>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
