import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTree } from '../stores/treeStore';
import { ancestorsOf, visibleRows } from '../tree';
import { moveCandidates, normalize } from '../treeOps';
import { moveNote } from '../actions';
import { childrenOf } from '../tree';

interface Props {
  noteId: string;
  onClose: () => void;
}

interface Option {
  id: string | null;
  title: string;
  path: string;
}

const MAX_RESULTS = 200;

/** N-64: selector de destino con búsqueda. La nota pasa a ser la última hija del destino. */
export function MoveDialog({ noteId, onClose }: Props) {
  const nodes = useTree((s) => s.nodes);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const note = nodes.find((n) => n.id === noteId);

  const options = useMemo<Option[]>(() => {
    const allowed = new Set(moveCandidates(nodes, noteId).map((n) => n.id));
    // En el orden del árbol, con todo desplegado.
    const ordered = visibleRows(nodes, new Set()).map((r) => r.node).filter((n) => allowed.has(n.id));
    const q = normalize(query.trim());
    const matches = ordered
      .filter((n) => q === '' || normalize(n.title).includes(q))
      .slice(0, MAX_RESULTS)
      .map((n) => ({ id: n.id, title: n.title, path: ancestorsOf(nodes, n.id).map((a) => a.title).join(' / ') }));
    return q === '' || normalize('raiz').includes(q) ? [{ id: null, title: 'Raíz', path: '' }, ...matches] : matches;
  }, [nodes, noteId, query]);

  const choose = (option: Option | undefined) => {
    if (!option) return;
    const position = (childrenOf(nodes).get(option.id) ?? []).filter((n) => n.id !== noteId).length;
    onClose();
    void moveNote(noteId, { parentId: option.id, position });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((i) => Math.min(options.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setIndex((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter') choose(options[index]);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog move-dialog" role="dialog" aria-modal="true" aria-labelledby="move-title" onKeyDown={onKeyDown}>
        <h2 id="move-title">Mover «{note?.title}» a…</h2>
        <input
          autoFocus
          className="move-search"
          aria-label="Buscar destino"
          placeholder="Buscar nota…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="move-options"
          aria-activedescendant={options[index] ? `move-option-${index}` : undefined}
        />
        <ul className="move-options" id="move-options" role="listbox" aria-label="Destinos">
          {options.map((o, i) => (
            <li
              key={o.id ?? 'root'}
              id={`move-option-${i}`}
              role="option"
              aria-selected={i === index}
              className={i === index ? 'selected' : undefined}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(o)}
            >
              <span>{o.title}</span>
              {o.path && <span className="muted move-path">{o.path}</span>}
            </li>
          ))}
          {options.length === 0 && <li className="muted">Ningún destino coincide.</li>}
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
