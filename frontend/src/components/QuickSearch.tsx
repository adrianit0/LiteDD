import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTree } from '../stores/treeStore';
import { useUi } from '../stores/uiStore';
import { ancestorsOf } from '../tree';
import { linkCandidates } from '../markdown/links';
import { openNote } from '../actions';
import { TypeIcon } from './TypeIcon';

/** N-73: Ctrl+K busca por título; Intro abre la nota. */
export function QuickSearch() {
  const nodes = useTree((s) => s.nodes);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const matches = useMemo(() => linkCandidates(nodes, query, 30), [nodes, query]);
  const close = () => useUi.getState().setQuickSearch(false);

  const choose = (id: string | undefined, newTab = false) => {
    if (!id) return;
    close();
    void openNote(id, newTab);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((i) => Math.min(matches.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setIndex((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter') choose(matches[index]?.id, e.altKey);
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog quick-search" role="dialog" aria-modal="true" aria-label="Búsqueda rápida" onKeyDown={onKeyDown}>
        <input
          autoFocus
          className="move-search"
          aria-label="Título de la nota"
          placeholder="Escribe parte del título…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="quick-options"
          aria-activedescendant={matches[index] ? `quick-${index}` : undefined}
        />
        <ul className="move-options" id="quick-options" role="listbox" aria-label="Notas">
          {matches.map((n, i) => (
            <li
              key={n.id}
              id={`quick-${i}`}
              role="option"
              aria-selected={i === index}
              className={i === index ? 'selected' : undefined}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(n.id)}
            >
              <span>
                <TypeIcon type={n.type} /> {n.title}
              </span>
              <span className="muted move-path">{ancestorsOf(nodes, n.id).map((a) => a.title).join(' / ')}</span>
            </li>
          ))}
          {matches.length === 0 && <li className="muted">Ninguna nota coincide.</li>}
        </ul>
      </div>
    </div>
  );
}
