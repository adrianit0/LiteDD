import { create } from 'zustand';
import { api } from '../api';
import type { Note, NoteType, TreeNode } from '../types';

interface TreeState {
  nodes: TreeNode[];
  loaded: boolean;
  load: () => Promise<void>;
  /** N-05 (raíz, al final) y N-04 (hija, al final). */
  create: (parentId: string | null, type: NoteType) => Promise<Note>;
  /** Refleja en el árbol los cambios de una nota guardada (título). */
  applyNote: (note: Pick<Note, 'id' | 'title'>) => void;
}

export const useTree = create<TreeState>((set, get) => ({
  nodes: [],
  loaded: false,

  async load() {
    set({ nodes: await api.tree(), loaded: true });
  },

  async create(parentId, type) {
    const note = await api.createNote(parentId, type);
    const { content: _content, version: _version, createdAt: _c, updatedAt: _u, ...node } = note;
    set({ nodes: [...get().nodes, node] });
    return note;
  },

  applyNote(note) {
    set({ nodes: get().nodes.map((n) => (n.id === note.id ? { ...n, title: note.title } : n)) });
  },
}));
