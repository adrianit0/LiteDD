import { create } from 'zustand';
import { api, ApiError, type SessionTab, type SqlTabState } from '../api';
import type { Mode, Note } from '../types';
import { useTree } from './treeStore';
import { useUi } from './uiStore';
import { ask } from './dialogStore';

/**
 * Pestañas abiertas (P-01 a P-13). Cada pestaña tiene su copia de la nota, su modo, su guardado y su
 * desplazamiento (P-06). Dos pestañas de la misma nota no se sincronizan en vivo (P-07).
 */
export const AUTOSAVE_DELAY = 1500;
const SESSION_DELAY = 400;

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

export interface Tab {
  id: string;
  noteId: string;
  mode: Mode;
  scroll: number;
  /** null mientras se carga. */
  note: Note | null;
  title: string;
  /** N-07 */
  description: string;
  content: string;
  status: SaveStatus;
  /** N-42: versión guardada por otro cuando hay conflicto. */
  conflict: Note | null;
  /** N-06: seleccionar el título al abrir una nota nueva. */
  focusTitle: boolean;
  /** P-06: valores, tamaño de página, orden y página de una nota SQL; null hasta que se analiza. */
  sql: SqlTabState | null;
  /** P-14: pestaña provisional (en cursiva) que se sustituye al abrir otra nota. */
  preview: boolean;
}

/** U-10: el tamaño de página inicial sale de los ajustes. */
export function defaultSqlState(): SqlTabState {
  return { values: {}, pageSize: useUi.getState().config.defaultPageSize, sort: null, page: 1 };
}

interface OpenOptions {
  /** P-03: abrir siempre en una pestaña nueva. */
  newTab?: boolean;
  mode?: Mode;
  focusTitle?: boolean;
  /** Nota ya cargada, para no pedirla otra vez. */
  note?: Note;
  /** P-14: abrir como pestaña provisional. */
  preview?: boolean;
}

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  restored: boolean;
  restore: () => Promise<void>;
  open: (noteId: string, options?: OpenOptions) => Promise<void>;
  activate: (id: string) => void;
  cycle: (step: 1 | -1) => void;
  close: (id: string) => Promise<void>;
  closeOthers: (id: string) => Promise<void>;
  closeRight: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  reorder: (fromId: string, toId: string) => void;
  /** N-54: cierra las pestañas de una nota eliminada, sin guardar. */
  dropNote: (noteId: string) => void;
  edit: (id: string, changes: { title?: string; description?: string; content?: string }) => void;
  /** P-14: la pestaña provisional pasa a ser fija. */
  pin: (id: string) => void;
  saveNow: (id: string) => Promise<void>;
  /** N-45: sustituye la nota de una pestaña por la versión restaurada. */
  applyRestored: (id: string, note: Note) => void;
  /** N-80, N-81: etiquetas y favorita sin cambiar la versión, en todas las pestañas de la nota. */
  applyMeta: (note: Note) => void;
  saveNote: (noteId: string) => Promise<void>;
  toggleMode: (id: string) => Promise<void>;
  reload: (id: string) => Promise<void>;
  resolveConflict: (id: string, choice: 'reload' | 'overwrite') => Promise<void>;
  setScroll: (id: string, scroll: number) => void;
  setSql: (id: string, changes: Partial<SqlTabState>) => void;
  flushOnUnload: () => void;
  /** U-11: al recuperar el contacto se guarda lo que quedó pendiente. */
  savePending: () => Promise<void>;
}

export function isDirty(tab: Tab): boolean {
  return (
    tab.note !== null &&
    (tab.title !== tab.note.title || tab.description !== tab.note.description || tab.content !== tab.note.content)
  );
}

/** N-07: la descripción solo viaja si cambió; si falta, el servidor conserva la actual. */
function descriptionChange(tab: Tab): { description: string } | undefined {
  return tab.note && tab.description !== tab.note.description ? { description: tab.description } : undefined;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Map<string, Promise<void>>();

function newTabId(): string {
  return crypto.randomUUID();
}

function blankTab(noteId: string, mode: Mode, note: Note | null, focusTitle = false, preview = false): Tab {
  return {
    id: newTabId(),
    noteId,
    mode,
    scroll: 0,
    note,
    title: note?.title ?? '',
    description: note?.description ?? '',
    content: note?.content ?? '',
    status: 'saved',
    conflict: null,
    focusTitle,
    sql: null,
    preview,
  };
}

/** N-40, N-46: con el guardado manual no hay guardado al escribir, al perder el foco ni al cerrar la ventana. */
export function autosaveEnabled(): boolean {
  return useUi.getState().config.autosave;
}

export const useTabs = create<TabsState>((set, get) => {
  const tab = (id: string) => get().tabs.find((t) => t.id === id);
  const patch = (id: string, changes: Partial<Tab>) =>
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...changes } : t)) });

  const schedule = (id: string) => {
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => void get().saveNow(id), AUTOSAVE_DELAY));
  };

  const load = async (id: string, noteId: string) => {
    try {
      const note = await api.getNote(noteId);
      if (tab(id)) patch(id, { note, title: note.title, description: note.description, content: note.content });
    } catch (e) {
      remove(id);
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo abrir la nota', 'error');
    }
  };

  /** Quita la pestaña y activa la de la derecha o, si no hay, la de la izquierda. */
  const remove = (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    const tabs = get().tabs;
    const index = tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const rest = tabs.filter((t) => t.id !== id);
    let activeId = get().activeId;
    if (activeId === id) activeId = (rest[index] ?? rest[index - 1])?.id ?? null;
    set({ tabs: rest, activeId });
  };

  const doSave = async (id: string) => {
    const t = tab(id);
    if (!t || !t.note || !isDirty(t)) {
      if (t?.status === 'pending') patch(id, { status: 'saved' });
      return;
    }
    patch(id, { status: 'saving' });
    try {
      const title = t.title.trim() === '' ? t.note.title : t.title;
      const change = descriptionChange(t);
      const saved = await api.saveNote(t.noteId, title, t.content, t.note.version, ...(change ? [change] : []));
      const current = tab(id);
      if (!current) return;
      patch(id, { note: saved });
      applyRename(saved, id);
      if (isDirty(tab(id)!)) {
        patch(id, { status: 'pending' });
        if (autosaveEnabled()) schedule(id);
      } else {
        patch(id, { status: 'saved' });
      }
    } catch (e) {
      if (!tab(id)) return;
      if (e instanceof ApiError && e.status === 409) {
        patch(id, { status: 'conflict', conflict: e.details as Note });
      } else {
        patch(id, { status: 'error' });
        // U-11: sin contacto lo indica la banda; el texto sigue en memoria.
        if (!(e instanceof ApiError && e.status === 0)) {
          useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
        }
      }
    }
  };

  /** P-13: el título nuevo llega al árbol y a las demás pestañas de la nota, si no lo están editando. */
  const applyRename = (saved: Note, sourceTabId?: string) => {
    useTree.getState().applyNote(saved);
    set({
      tabs: get().tabs.map((t) =>
        t.id !== sourceTabId && t.noteId === saved.id && t.note && t.title === t.note.title
          ? { ...t, title: saved.title, note: { ...t.note, title: saved.title } }
          : t,
      ),
    });
  };

  /**
   * P-08: antes de cerrar se guarda; si no se puede, se pregunta. N-46: con el guardado manual se
   * pregunta antes si guardar, salir sin guardar o cancelar.
   */
  const closeSafely = async (id: string): Promise<boolean> => {
    const pending = tab(id);
    if (pending && !autosaveEnabled() && isDirty(pending) && pending.status !== 'conflict') {
      const choice = await ask({
        title: 'Cambios sin guardar',
        body: `«${pending.title || pending.note?.title}» tiene cambios sin guardar. ¿Quieres guardarlos antes de cerrar?`,
        options: [
          { value: 'save', label: 'Guardar', primary: true },
          { value: 'discard', label: 'Salir sin guardar' },
          { value: 'cancel', label: 'Cancelar' },
        ],
        cancelValue: 'cancel',
      });
      if (choice === 'cancel') return false;
      if (choice === 'discard') {
        remove(id);
        return true;
      }
    }
    await get().saveNow(id);
    const t = tab(id);
    if (t && isDirty(t)) {
      const choice = await ask({
        title: 'Cambios sin guardar',
        body: `«${t.title || t.note?.title}» tiene cambios que no se han podido guardar. Si cierras la pestaña, se pierden.`,
        options: [
          { value: 'close', label: 'Cerrar sin guardar' },
          { value: 'cancel', label: 'Cancelar', primary: true },
        ],
        cancelValue: 'cancel',
      });
      if (choice !== 'close') return false;
    }
    remove(id);
    return true;
  };

  return {
    tabs: [],
    activeId: null,
    restored: false,

    async restore() {
      try {
        const session = await api.getSession();
        const tabs: Tab[] = session.tabs.map((s) => ({
          ...blankTab(s.noteId, s.mode, null),
          id: s.id,
          scroll: s.state?.scroll ?? 0,
          sql: s.state?.sql ?? null,
          preview: s.state?.preview === true,
        }));
        // Lo que se haya abierto mientras se restauraba se conserva detrás.
        const opened = get().tabs;
        const active = get().activeId ?? session.tabs.find((s) => s.active)?.id ?? tabs[0]?.id ?? null;
        set({ tabs: [...tabs, ...opened], activeId: active });
        // P-09: los resultados no se restauran; las notas se piden de nuevo.
        await Promise.all(tabs.map((t) => load(t.id, t.noteId)));
      } finally {
        set({ restored: true });
      }
    },

    async open(noteId, options = {}) {
      if (!options.newTab) {
        // P-02: si ya está abierta, se activa la primera pestaña que la contiene.
        const existing = get().tabs.find((t) => t.noteId === noteId);
        if (existing) {
          set({ activeId: existing.id });
          if (options.mode && options.mode !== existing.mode) await get().toggleMode(existing.id);
          return;
        }
      }
      // N-10: las notas existentes se abren en consulta.
      const t = blankTab(noteId, options.mode ?? 'view', options.note ?? null, options.focusTitle, options.preview === true);
      // P-14: una pestaña provisional sustituye a la provisional anterior, en su sitio.
      const previous = options.preview ? get().tabs.find((x) => x.preview) : undefined;
      if (previous) {
        clearTimeout(timers.get(previous.id));
        set({ tabs: get().tabs.map((x) => (x.id === previous.id ? t : x)), activeId: t.id });
      } else {
        set({ tabs: [...get().tabs, t], activeId: t.id });
      }
      if (!options.note) await load(t.id, noteId);
    },

    activate(id) {
      if (tab(id)) set({ activeId: id });
    },

    cycle(step) {
      const { tabs, activeId } = get();
      if (tabs.length === 0) return;
      const index = tabs.findIndex((t) => t.id === activeId);
      set({ activeId: tabs[(index + step + tabs.length) % tabs.length].id });
    },

    async close(id) {
      await closeSafely(id);
    },

    async closeOthers(id) {
      for (const t of get().tabs.filter((x) => x.id !== id)) {
        if (!(await closeSafely(t.id))) return;
      }
      set({ activeId: id });
    },

    async closeRight(id) {
      const tabs = get().tabs;
      const index = tabs.findIndex((t) => t.id === id);
      for (const t of tabs.slice(index + 1)) {
        if (!(await closeSafely(t.id))) return;
      }
      if (!tab(get().activeId ?? '')) set({ activeId: id });
    },

    async duplicate(id) {
      await get().saveNow(id);
      const source = tab(id);
      if (!source) return;
      const copy: Tab = {
        ...source,
        id: newTabId(),
        status: isDirty(source) ? 'pending' : source.status,
        focusTitle: false,
        preview: false,
      };
      const tabs = get().tabs;
      const index = tabs.findIndex((t) => t.id === id);
      set({ tabs: [...tabs.slice(0, index + 1), copy, ...tabs.slice(index + 1)], activeId: copy.id });
    },

    reorder(fromId, toId) {
      const tabs = [...get().tabs];
      const from = tabs.findIndex((t) => t.id === fromId);
      const to = tabs.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      set({ tabs });
    },

    dropNote(noteId) {
      for (const t of get().tabs.filter((x) => x.noteId === noteId)) remove(t.id);
    },

    edit(id, changes) {
      const t = tab(id);
      if (!t || !t.note || t.status === 'conflict') return;
      // P-14: modificar la nota fija la pestaña.
      patch(id, { ...changes, status: 'pending', focusTitle: false, preview: false });
      if (autosaveEnabled()) schedule(id);
    },

    async saveNow(id) {
      clearTimeout(timers.get(id));
      if (tab(id)?.status === 'conflict') return;
      while (inFlight.has(id)) await inFlight.get(id);
      const t = tab(id);
      if (!t || !isDirty(t)) {
        if (t?.status === 'pending') patch(id, { status: 'saved' });
        return;
      }
      const p = doSave(id).finally(() => inFlight.delete(id));
      inFlight.set(id, p);
      await p;
    },

    async saveNote(noteId) {
      for (const t of get().tabs.filter((x) => x.noteId === noteId)) await get().saveNow(t.id);
    },

    pin(id) {
      if (tab(id)?.preview) patch(id, { preview: false });
    },

    async toggleMode(id) {
      // P-14: «Editar» fija la pestaña.
      get().pin(id);
      // N-12, N-40: al cambiar de modo se guarda.
      await get().saveNow(id);
      const t = tab(id);
      if (!t) return;
      if (t.mode === 'edit' && t.note && !isDirty(t) && t.status !== 'conflict') {
        // N-44: al salir del modo edición se guarda una versión si algo cambió.
        try {
          await api.saveNote(t.noteId, t.note.title, t.note.content, t.note.version, { snapshot: true });
        } catch {
          // El historial no debe impedir cambiar de modo.
        }
      }
      const current = tab(id);
      if (current) patch(id, { mode: current.mode === 'edit' ? 'view' : 'edit', focusTitle: false });
    },

    applyRestored(id, note) {
      clearTimeout(timers.get(id));
      patch(id, { note, title: note.title, description: note.description, content: note.content, status: 'saved', conflict: null });
      applyRename(note, id);
    },

    applyMeta(note) {
      set({
        tabs: get().tabs.map((t) =>
          t.noteId === note.id && t.note ? { ...t, note: { ...t.note, tags: note.tags, favorite: note.favorite } } : t,
        ),
      });
    },

    async reload(id) {
      const t = tab(id);
      if (!t) return;
      clearTimeout(timers.get(id));
      // P-14: «Actualizar» fija la pestaña.
      get().pin(id);
      const note = await api.getNote(t.noteId);
      patch(id, { note, title: note.title, description: note.description, content: note.content, status: 'saved', conflict: null });
      useTree.getState().applyNote(note);
    },

    async resolveConflict(id, choice) {
      const t = tab(id);
      const theirs = t?.conflict;
      if (!t || !theirs) return;
      if (choice === 'reload') {
        patch(id, {
          note: theirs,
          title: theirs.title,
          description: theirs.description,
          content: theirs.content,
          status: 'saved',
          conflict: null,
        });
        applyRename(theirs, id);
        return;
      }
      // Sobrescribir: se guarda lo local partiendo de la versión del otro.
      patch(id, { note: theirs, status: 'pending', conflict: null });
      await get().saveNow(id);
    },

    setSql(id, changes) {
      const t = tab(id);
      if (t) patch(id, { sql: { ...(t.sql ?? defaultSqlState()), ...changes } });
    },

    setScroll(id, scroll) {
      if (tab(id) && tab(id)!.scroll !== scroll) patch(id, { scroll });
    },

    async savePending() {
      for (const t of get().tabs) {
        if (!t.note || !isDirty(t) || t.status === 'conflict') continue;
        // N-46: con el guardado manual solo se repiten los guardados que se pidieron y fallaron.
        if (autosaveEnabled() || t.status === 'error') await get().saveNow(t.id);
      }
    },

    flushOnUnload() {
      // N-46: con el guardado manual, al cerrar la ventana avisa el navegador (beforeunload).
      if (!autosaveEnabled()) return;
      for (const t of get().tabs) {
        if (!t.note || !isDirty(t) || t.status === 'conflict') continue;
        const title = t.title.trim() === '' ? t.note.title : t.title;
        void api.saveNote(t.noteId, title, t.content, t.note.version, { keepalive: true, ...descriptionChange(t) }).catch(() => {});
      }
    },
  };
});

/** Pestaña activa, para los componentes. */
export function useActiveTab(): Tab | undefined {
  return useTabs((s) => s.tabs.find((t) => t.id === s.activeId));
}

/** P-09: la sesión se guarda en cada cambio de pestañas, orden, activa, modo o desplazamiento. */
export function sessionSnapshot(tabs: Tab[], activeId: string | null): SessionTab[] {
  return tabs.map((t) => ({
    id: t.id,
    noteId: t.noteId,
    mode: t.mode,
    active: t.id === activeId,
    state: { scroll: t.scroll, sql: t.sql, preview: t.preview },
  }));
}

let sessionTimer: ReturnType<typeof setTimeout> | undefined;
let lastSession = '';

useTabs.subscribe((state) => {
  if (!state.restored) return;
  const snapshot = sessionSnapshot(state.tabs, state.activeId);
  const serialized = JSON.stringify(snapshot);
  if (serialized === lastSession) return;
  lastSession = serialized;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    api.putSession(snapshot).catch(() => {
      // Se reintentará con el siguiente cambio.
      lastSession = '';
    });
  }, SESSION_DELAY);
});
