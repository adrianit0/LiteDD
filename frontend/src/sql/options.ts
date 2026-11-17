import { create } from 'zustand';
import { api, type CustomType } from '../api';
import { useConnection } from '../stores/connectionStore';
import { useTabs } from '../stores/tabsStore';
import { useUi } from '../stores/uiStore';
import { connectionKey } from './schema';

/** Q-115: opciones que se ven a la vez en la lista del combo. */
export const MAX_VISIBLE_OPTIONS = 200;

/** Q-115: texto de la opción que vale null, que es la de por defecto. */
export const EMPTY_OPTION = '(Vacío)';

export type TypeOption = [key: string, value: string | null];

/** Q-116: opciones de un tipo en una pestaña. */
export interface TypeOptions {
  status: 'loading' | 'ready' | 'error';
  options: TypeOption[];
  capReached: boolean;
  error: string | null;
}

/** Q-115: «key — value»; sin value, solo la key. */
export function optionLabel([key, value]: TypeOption): string {
  return value === null || value === '' ? key : `${key} — ${value}`;
}

/** Q-117: el texto de un valor elegido; uno que no está entre las opciones se ve con su key. */
export function valueLabel(value: string, options: TypeOption[]): string {
  if (value === '') return '';
  const option = options.find(([key]) => key === value);
  return option ? optionLabel(option) : value;
}

/** Q-115: sin mayúsculas ni acentos. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Q-115: las opciones que contienen el texto, hasta el máximo visible, y cuántas quedan fuera. */
export function filterOptions(options: TypeOption[], query: string): { shown: TypeOption[]; hidden: number } {
  const q = normalize(query.trim());
  const matches = q === '' ? options : options.filter((o) => normalize(optionLabel(o)).includes(q));
  return { shown: matches.slice(0, MAX_VISIBLE_OPTIONS), hidden: Math.max(0, matches.length - MAX_VISIBLE_OPTIONS) };
}

/** Q-111: el mismo tipo con otras mayúsculas es el mismo. */
export const typeKey = (usage: string) => usage.trim().toLowerCase();

/** Q-116: la conexión y los tipos de «Ajustes»; si cambian, lo consultado ya no vale. */
function settingsKey(types: CustomType[]): string {
  return `${connectionKey(useConnection.getState().status)}\u0001${JSON.stringify(types)}`;
}

interface TypeOptionsState {
  /** pestaña → tipo (typeKey) → opciones */
  byTab: Record<string, Record<string, TypeOptions>>;
  /** Conexión y tipos con los que se consultó lo que hay en byTab. */
  key: string;
  /** Q-116: pide las opciones de los tipos que la pestaña aún no tiene, o que fallaron. */
  ensure: (tabId: string, usages: string[]) => void;
}

export const useTypeOptions = create<TypeOptionsState>((set, get) => ({
  byTab: {},
  key: '',

  ensure(tabId, usages) {
    const key = settingsKey(useUi.getState().config.types);
    if (get().key !== key) set({ byTab: {}, key });
    const current = get().byTab[tabId] ?? {};
    const byKey = new Map<string, string>();
    for (const u of usages) if (!byKey.has(typeKey(u))) byKey.set(typeKey(u), u.trim());
    const wanted = [...byKey].filter(([k]) => !current[k] || current[k].status === 'error');
    if (wanted.length === 0) return;
    const put = (k: string, entry: TypeOptions) => {
      // Una respuesta de otra conexión, otros tipos o una pestaña ya cerrada no vale.
      if (get().key !== key || (get().byTab[tabId] === undefined && entry.status !== 'loading')) return;
      set((s) => ({ byTab: { ...s.byTab, [tabId]: { ...s.byTab[tabId], [k]: entry } } }));
    };
    for (const [k, usage] of wanted) {
      put(k, { status: 'loading', options: [], capReached: false, error: null });
      api
        .sqlOptions(usage)
        .then((r) => put(k, { status: 'ready', options: r.options, capReached: r.capReached, error: null }))
        .catch((e: unknown) => put(k, { status: 'error', options: [], capReached: false, error: e instanceof Error ? e.message : String(e) }));
    }
  },
}));

/** Q-116: al cerrar una pestaña se olvidan sus opciones. */
useTabs.subscribe((state) => {
  const byTab = useTypeOptions.getState().byTab;
  const open = new Set(state.tabs.map((t) => t.id));
  const gone = Object.keys(byTab).filter((id) => !open.has(id));
  if (gone.length === 0) return;
  const rest = { ...byTab };
  for (const id of gone) delete rest[id];
  useTypeOptions.setState({ byTab: rest });
});
