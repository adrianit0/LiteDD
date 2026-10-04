import { create } from 'zustand';
import { api } from '../api';

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
  load: () => Promise<void>;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  toggleCollapsed: (id: string) => void;
  expand: (id: string) => void;
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

const clamp = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));

export const useUi = create<UiState>((set, get) => ({
  sidebarView: 'tree',
  setSidebarView: (view) => set({ sidebarView: view }),
  sidebarWidth: SIDEBAR_DEFAULT,
  sidebarVisible: true,
  collapsed: new Set(),
  notices: [],
  quickSearchOpen: false,
  setQuickSearch: (open) => set({ quickSearchOpen: open }),
  focusTagsFor: null,
  setFocusTags: (noteId) => set({ focusTagsFor: noteId }),

  async load() {
    const s = await api.getSettings();
    set({
      sidebarWidth: typeof s['ui.sidebarWidth'] === 'number' ? clamp(s['ui.sidebarWidth']) : SIDEBAR_DEFAULT,
      sidebarVisible: s['ui.sidebarVisible'] !== false,
      collapsed: new Set(Array.isArray(s['ui.collapsed']) ? (s['ui.collapsed'] as string[]) : []),
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

  notify(text, kind = 'info') {
    const id = ++noticeId;
    set({ notices: [...get().notices, { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 4000);
  },

  dismiss(id) {
    set({ notices: get().notices.filter((n) => n.id !== id) });
  },
}));
