import { create } from 'zustand';
import { api, ApiError } from '../api';
import type { Mode, Note } from '../types';
import { useTree } from './treeStore';
import { useUi } from './uiStore';

/**
 * Nota abierta en el área principal, con su modo y el guardado automático (N-10 a N-13, N-40 a N-43).
 * Hasta el Sprint 2 hay una sola nota abierta; en el Sprint 2 este estado pasa a ser por pestaña.
 */
export const AUTOSAVE_DELAY = 1500;

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

interface NoteState {
  note: Note | null;
  title: string;
  content: string;
  mode: Mode;
  status: SaveStatus;
  /** N-42: versión guardada por otro cuando hay conflicto. */
  conflict: Note | null;
  /** N-06: seleccionar el título al abrir una nota nueva. */
  focusTitle: boolean;
  open: (id: string, options?: { mode?: Mode; focusTitle?: boolean }) => Promise<void>;
  openNote: (note: Note, options?: { mode?: Mode; focusTitle?: boolean }) => Promise<void>;
  edit: (changes: { title?: string; content?: string }) => void;
  saveNow: () => Promise<void>;
  toggleMode: () => Promise<void>;
  reload: () => Promise<void>;
  resolveConflict: (choice: 'reload' | 'overwrite') => Promise<void>;
  flushOnUnload: () => void;
  isDirty: () => boolean;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;

export const useNote = create<NoteState>((set, get) => {
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void get().saveNow(), AUTOSAVE_DELAY);
  };

  const doSave = async () => {
    const { note, title, content } = get();
    if (!note || !get().isDirty()) {
      if (get().status === 'pending') set({ status: 'saved' });
      return;
    }
    set({ status: 'saving' });
    try {
      const saved = await api.saveNote(note.id, title.trim() === '' ? note.title : title, content, note.version);
      if (get().note?.id !== saved.id) return;
      set({ note: saved });
      useTree.getState().applyNote(saved);
      // Si se escribió mientras se guardaba, queda pendiente otra vez.
      if (get().isDirty()) {
        set({ status: 'pending' });
        schedule();
      } else {
        set({ status: 'saved' });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        set({ status: 'conflict', conflict: e.details as Note });
      } else {
        set({ status: 'error' });
        useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
      }
    }
  };

  return {
    note: null,
    title: '',
    content: '',
    mode: 'view',
    status: 'saved',
    conflict: null,
    focusTitle: false,

    isDirty() {
      const { note, title, content } = get();
      return note !== null && (title !== note.title || content !== note.content);
    },

    async open(id, options) {
      if (get().note?.id === id) {
        if (options?.mode && options.mode !== get().mode) await get().toggleMode();
        return;
      }
      await get().saveNow();
      const note = await api.getNote(id);
      await get().openNote(note, options);
    },

    async openNote(note, options) {
      if (get().note && get().note!.id !== note.id) await get().saveNow();
      clearTimeout(timer);
      set({
        note,
        title: note.title,
        content: note.content,
        // N-10: las notas existentes se abren en consulta.
        mode: options?.mode ?? 'view',
        status: 'saved',
        conflict: null,
        focusTitle: options?.focusTitle ?? false,
      });
    },

    edit(changes) {
      if (!get().note || get().status === 'conflict') return;
      set({ ...changes, status: 'pending', focusTitle: false });
      schedule();
    },

    async saveNow() {
      clearTimeout(timer);
      if (get().status === 'conflict') return;
      while (inFlight) await inFlight;
      if (!get().isDirty()) {
        if (get().status === 'pending') set({ status: 'saved' });
        return;
      }
      inFlight = doSave().finally(() => {
        inFlight = null;
      });
      await inFlight;
    },

    async toggleMode() {
      // N-12, N-40: al cambiar de modo se guarda.
      await get().saveNow();
      set({ mode: get().mode === 'edit' ? 'view' : 'edit', focusTitle: false });
    },

    async reload() {
      const current = get().note;
      if (!current) return;
      clearTimeout(timer);
      const note = await api.getNote(current.id);
      set({ note, title: note.title, content: note.content, status: 'saved', conflict: null });
      useTree.getState().applyNote(note);
    },

    async resolveConflict(choice) {
      const theirs = get().conflict;
      if (!theirs) return;
      if (choice === 'reload') {
        set({ note: theirs, title: theirs.title, content: theirs.content, status: 'saved', conflict: null });
        useTree.getState().applyNote(theirs);
        return;
      }
      // Sobrescribir: se guarda lo local partiendo de la versión del otro.
      set({ note: { ...get().note!, version: theirs.version, title: theirs.title, content: theirs.content }, status: 'pending', conflict: null });
      await get().saveNow();
    },

    flushOnUnload() {
      const { note, title, content } = get();
      if (!note || !get().isDirty() || get().status === 'conflict') return;
      void api.saveNote(note.id, title.trim() === '' ? note.title : title, content, note.version, { keepalive: true }).catch(() => {});
    },
  };
});
