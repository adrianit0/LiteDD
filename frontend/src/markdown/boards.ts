import { create } from 'zustand';
import { api } from '../api';
import type { Note } from '../types';

/**
 * B-41: última versión guardada de las pizarras que muestran las notas Markdown. Se piden de nuevo cada vez que se
 * muestra la nota y se actualizan al guardar una pizarra desde cualquier pestaña.
 */
interface BoardCache {
  /** Contenido de cada pizarra; null si no existe, está en la papelera o no es una pizarra. */
  boards: Record<string, string | null>;
  load: (ids: string[]) => void;
  remember: (note: Note) => void;
}

const pending = new Set<string>();

export const useBoards = create<BoardCache>((set, get) => ({
  boards: {},

  load(ids) {
    for (const id of ids) {
      if (pending.has(id)) continue;
      pending.add(id);
      api
        .getNote(id)
        .then((note) => set({ boards: { ...get().boards, [id]: note.type === 'board' ? note.content : null } }))
        .catch(() => set({ boards: { ...get().boards, [id]: null } }))
        .finally(() => pending.delete(id));
    }
  },

  remember(note) {
    if (note.type === 'board') set({ boards: { ...get().boards, [note.id]: note.content } });
  },
}));
