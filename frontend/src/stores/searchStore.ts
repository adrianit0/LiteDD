import { create } from 'zustand';
import { api } from '../api';
import { hasFilters, NO_FILTERS, searchParams, type SearchFilters, type SearchHit } from '../search';

/** Búsqueda y filtros del panel izquierdo (N-70 a N-72). */
export const SEARCH_DELAY = 200;

interface SearchState {
  query: string;
  filters: SearchFilters;
  filtersOpen: boolean;
  results: SearchHit[];
  loading: boolean;
  error: string | null;
  setQuery: (query: string) => void;
  setFilters: (changes: Partial<SearchFilters>) => void;
  toggleFilters: () => void;
  clear: () => void;
  refresh: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;

/** ¿Se muestra la lista plana en lugar del árbol? (N-71) */
export function searchActive(s: Pick<SearchState, 'query' | 'filters'>): boolean {
  return s.query.trim() !== '' || hasFilters(s.filters);
}

export const useSearch = create<SearchState>((set, get) => {
  const run = () => {
    clearTimeout(timer);
    if (!searchActive(get())) {
      set({ results: [], loading: false, error: null });
      return;
    }
    set({ loading: true });
    // N-70: responde mientras se escribe, con un retraso corto.
    timer = setTimeout(async () => {
      const mine = ++sequence;
      try {
        const results = await api.search(searchParams(get().query, get().filters, new Date()));
        if (mine === sequence) set({ results, loading: false, error: null });
      } catch (e) {
        if (mine === sequence) set({ loading: false, error: e instanceof Error ? e.message : 'No se pudo buscar' });
      }
    }, SEARCH_DELAY);
  };

  return {
    query: '',
    filters: NO_FILTERS,
    filtersOpen: false,
    results: [],
    loading: false,
    error: null,
    setQuery(query) {
      set({ query });
      run();
    },
    setFilters(changes) {
      set({ filters: { ...get().filters, ...changes } });
      run();
    },
    toggleFilters: () => set({ filtersOpen: !get().filtersOpen }),
    clear() {
      set({ query: '', filters: NO_FILTERS });
      run();
    },
    refresh: run,
  };
});
