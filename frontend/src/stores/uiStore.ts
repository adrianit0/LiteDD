import { create } from 'zustand';
import { api, DEFAULT_CONFIG, type AppConfig } from '../api';

/** Estado de interfaz guardado en la tabla setting (ADR-0005): panel (U-01) y plegado (N-01). */
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 280;
const PERSIST_DELAY = 400;

export interface Notice {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

export type SidebarView = 'tree' | 'trash';

/** U-10: categorías de «Ajustes», en su orden. */
export type SettingsCategory = 'general' | 'connection' | 'sql' | 'http' | 'environments' | 'data';

interface UiState {
  /** ADR-0009: el panel izquierdo muestra el árbol o la papelera. */
  sidebarView: SidebarView;
  setSidebarView: (view: SidebarView) => void;
  sidebarWidth: number;
  sidebarVisible: boolean;
  collapsed: ReadonlySet<string>;
  notices: Notice[];
  /** N-73 */
  quickSearchOpen: boolean;
  setQuickSearch: (open: boolean) => void;
  /** N-80: el menú contextual «Etiquetas…» lleva el foco al editor de etiquetas de esa nota. */
  focusTagsFor: string | null;
  setFocusTags: (noteId: string | null) => void;
  /** U-10 */
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  settingsOpen: boolean;
  /** U-13: la categoría con la que se abre «Ajustes». */
  settingsCategory: SettingsCategory;
  setSettingsOpen: (open: boolean, category?: SettingsCategory) => void;
  /** M-65 */
  constantsOpen: boolean;
  setConstantsOpen: (open: boolean) => void;
  /** M-67: cambia al guardar las constantes, para volver a analizar las notas SQL abiertas. */
  constantsVersion: number;
  constantsSaved: () => void;
  /** U-11: sin contacto con el servidor. */
  contactLost: boolean;
  setContactLost: (lost: boolean) => void;
  load: () => Promise<void>;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  toggleCollapsed: (id: string) => void;
  expand: (id: string) => void;
  /** N-09: pliega todas las notas indicadas (las que tienen hijas). */
  collapseAll: (ids: string[]) => void;
  /** N-09: despliega las madres de la nota y pide al árbol que la muestre y le dé el foco. */
  revealNote: (id: string, ancestorIds: string[]) => void;
  /** N-09: última petición de localizar; seq distingue dos peticiones seguidas de la misma nota. */
  reveal: { id: string; seq: number } | null;
  notify: (text: string, kind?: Notice['kind']) => void;
  dismiss: (id: number) => void;
}

let pending: Record<string, unknown> = {};
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let noticeId = 0;

function persist(changes: Record<string, unknown>) {
  pending = { ...pending, ...changes };
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const batch = pending;
    pending = {};
    api.putSettings(batch).catch(() => {
      // El estado de interfaz no es crítico; se reintentará en el siguiente cambio.
      pending = { ...batch, ...pending };
    });
  }, PERSIST_DELAY);
}

/** Un config.json anterior no trae todos los campos. */
function withDefaults(config: Partial<AppConfig>): AppConfig {
  return { ...DEFAULT_CONFIG, ...config, http: { ...DEFAULT_CONFIG.http, ...(config.http ?? {}) } };
}

const clamp = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));

export const useUi = create<UiState>((set, get) => ({
  sidebarView: 'tree',
  setSidebarView: (view) => set({ sidebarView: view }),
  sidebarWidth: SIDEBAR_DEFAULT,
  sidebarVisible: true,
  collapsed: new Set(),
  reveal: null,
  notices: [],
  quickSearchOpen: false,
  setQuickSearch: (open) => set({ quickSearchOpen: open }),
  focusTagsFor: null,
  setFocusTags: (noteId) => set({ focusTagsFor: noteId }),
  config: DEFAULT_CONFIG,
  setConfig: (config) => set({ config }),
  settingsOpen: false,
  settingsCategory: 'general',
  setSettingsOpen: (open, category = 'general') => set({ settingsOpen: open, settingsCategory: category }),
  constantsOpen: false,
  setConstantsOpen: (open) => set({ constantsOpen: open }),
  constantsVersion: 0,
  constantsSaved: () => set({ constantsVersion: get().constantsVersion + 1 }),
  contactLost: false,
  setContactLost: (lost) => {
    if (get().contactLost !== lost) set({ contactLost: lost });
  },

  async load() {
    const s = await api.getSettings();
    set({
      sidebarWidth: typeof s['ui.sidebarWidth'] === 'number' ? clamp(s['ui.sidebarWidth']) : SIDEBAR_DEFAULT,
      sidebarVisible: s['ui.sidebarVisible'] !== false,
      collapsed: new Set(Array.isArray(s['ui.collapsed']) ? (s['ui.collapsed'] as string[]) : []),
      config: s.config && typeof s.config === 'object' ? withDefaults(s.config as Partial<AppConfig>) : DEFAULT_CONFIG,
    });
  },

  setSidebarWidth(width) {
    const w = clamp(width);
    set({ sidebarWidth: w });
    persist({ 'ui.sidebarWidth': w });
  },

  toggleSidebar() {
    const visible = !get().sidebarVisible;
    set({ sidebarVisible: visible });
    persist({ 'ui.sidebarVisible': visible });
  },

  toggleCollapsed(id) {
    const next = new Set(get().collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ collapsed: next });
    persist({ 'ui.collapsed': [...next] });
  },

  expand(id) {
    if (!get().collapsed.has(id)) return;
    get().toggleCollapsed(id);
  },

  collapseAll(ids) {
    const next = new Set(ids);
    set({ collapsed: next });
    persist({ 'ui.collapsed': [...next] });
  },

  revealNote(id, ancestorIds) {
    const current = get().collapsed;
    if (ancestorIds.some((a) => current.has(a))) {
      const next = new Set(current);
      for (const a of ancestorIds) next.delete(a);
      set({ collapsed: next });
      persist({ 'ui.collapsed': [...next] });
    }
    set({ reveal: { id, seq: (get().reveal?.seq ?? 0) + 1 } });
  },

  notify(text, kind = 'info') {
    const id = ++noticeId;
    set({ notices: [...get().notices, { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 4000);
  },

  dismiss(id) {
    set({ notices: get().notices.filter((n) => n.id !== id) });
  },
}));
