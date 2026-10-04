import { api, ApiError } from './api';
import { useNote } from './stores/noteStore';
import { useTree } from './stores/treeStore';
import { useUi } from './stores/uiStore';
import type { NoteType } from './types';

/** N-05, N-06: crea la nota al final y la abre en edición con el título seleccionado. */
export async function createAndOpen(parentId: string | null, type: NoteType): Promise<void> {
  try {
    if (parentId) useUi.getState().expand(parentId);
    const note = await useTree.getState().create(parentId, type);
    await useNote.getState().openNote(note, { mode: 'edit', focusTitle: true });
  } catch (e) {
    useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo crear la nota', 'error');
  }
}

/** N-13: renombrar desde el árbol (F2). */
export async function renameNote(id: string, title: string): Promise<void> {
  const clean = title.trim();
  if (clean === '') return;
  const open = useNote.getState();
  try {
    if (open.note?.id === id) {
      open.edit({ title: clean });
      await open.saveNow();
      return;
    }
    const note = await api.getNote(id);
    if (note.title === clean) return;
    const saved = await api.saveNote(id, clean, note.content, note.version);
    useTree.getState().applyNote(saved);
  } catch (e) {
    const text =
      e instanceof ApiError && e.status === 409
        ? 'La nota cambió mientras se renombraba. Inténtalo de nuevo.'
        : e instanceof Error
          ? e.message
          : 'No se pudo renombrar';
    useUi.getState().notify(text, 'error');
  }
}

export async function openNote(id: string): Promise<void> {
  try {
    await useNote.getState().open(id);
  } catch (e) {
    useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo abrir la nota', 'error');
  }
}
