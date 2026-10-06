import { useEffect, useState, type KeyboardEvent } from 'react';
import { searchActive, useSearch } from '../stores/searchStore';
import { useTree } from '../stores/treeStore';
import { ancestorsOf } from '../tree';
import { api, type TagCount } from '../api';
import { openNote } from '../actions';
import { TypeIcon } from './TypeIcon';
import { Marked } from './Marked';
import type { DateRange } from '../search';
import type { NoteType } from '../types';

/** N-70, N-72: cuadro de búsqueda y filtros combinables del panel izquierdo. */
export function SearchBox() {
  const { query, filters, filtersOpen } = useSearch();
  const store = useSearch.getState();
  const [tags, setTags] = useState<TagCount[]>([]);
  const active = searchActive({ query, filters });

  useEffect(() => {
    if (filtersOpen) api.tags().then(setTags).catch(() => setTags([]));
  }, [filtersOpen]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && active) {
      e.stopPropagation();
      store.clear();
    }
  };

  const toggleTag = (name: string) =>
    store.setFilters({ tags: filters.tags.includes(name) ? filters.tags.filter((t) => t !== name) : [...filters.tags, name] });

  const filterCount = (filters.type ? 1 : 0) + filters.tags.length + (filters.favorite ? 1 : 0) + (filters.since ? 1 : 0);

  return (
    <div className="search-box">
      <div className="search-row">
        <input
          type="search"
          aria-label="Buscar en las notas"
          placeholder="Buscar…"
          value={query}
          onChange={(e) => store.setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" aria-expanded={filtersOpen} onClick={store.toggleFilters} title="Filtros">
          Filtros{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>
      </div>
      {filtersOpen && (
        <div className="search-filters" role="group" aria-label="Filtros">
          <label>
            <span className="muted">Tipo</span>
            <select value={filters.type} onChange={(e) => store.setFilters({ type: e.target.value as NoteType | '' })}>
              <option value="">Todos</option>
              <option value="md">Markdown</option>
              <option value="sql">SQL</option>
              <option value="http">HTTP</option>
            </select>
          </label>
          <label>
            <span className="muted">Modificada</span>
            <select value={filters.since} onChange={(e) => store.setFilters({ since: e.target.value as DateRange })}>
              <option value="">Cuando sea</option>
              <option value="today">Hoy</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
            </select>
          </label>
          <label className="search-check">
            <input type="checkbox" checked={filters.favorite} onChange={(e) => store.setFilters({ favorite: e.target.checked })} />
            Solo favoritas
          </label>
          {tags.length > 0 && (
            <div className="search-tags" role="group" aria-label="Etiquetas">
              {tags.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className={`tag-chip${filters.tags.includes(t.name) ? ' selected' : ''}`}
                  aria-pressed={filters.tags.includes(t.name)}
                  onClick={() => toggleTag(t.name)}
                >
                  {t.name} <span className="muted">{t.count}</span>
                </button>
              ))}
            </div>
          )}
          {active && (
            <button type="button" onClick={store.clear}>
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** N-71: lista plana con título, ruta y fragmento resaltado. */
export function SearchResults() {
  const { results, loading, error } = useSearch();
  const nodes = useTree((s) => s.nodes);

  if (error) return <p className="error-text search-empty">{error}</p>;
  if (results.length === 0) return <p className="muted search-empty">{loading ? 'Buscando…' : 'Ninguna nota coincide.'}</p>;

  return (
    <ul className="search-results" aria-label="Resultados de la búsqueda">
      {results.map((hit) => {
        const path = ancestorsOf(nodes, hit.id).map((n) => n.title).join(' / ');
        return (
          <li key={hit.id}>
            <button
              type="button"
              className="search-hit"
              onClick={() => void openNote(hit.id)}
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              onAuxClick={(e) => e.button === 1 && void openNote(hit.id, true)}
            >
              <span className="search-hit-title">
                <TypeIcon type={hit.type} />
                {hit.favorite && <span className="favorite-mark" aria-label="Favorita">★</span>}
                <Marked text={hit.titleMarked ?? hit.title} />
              </span>
              {path && <span className="search-hit-path muted">{path}</span>}
              {hit.fragment && (
                <span className="search-hit-fragment">
                  <Marked text={hit.fragment} />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
