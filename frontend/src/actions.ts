import { api, ApiError } from './api';
import { useTabs } from './stores/tabsStore';
import { useTree } from './stores/treeStore';
import { useUi } from './stores/uiStore';
import { ask } from './stores/dialogStore';
import type { Destination } from './treeOps';
import type { NoteType } from './types';

function fail(e: unknown, fallback: string) {
  useUi.getState().notify(e instanceof Error ? e.message : fallback, 'error');
}

/**
 * N-03, P-02, P-03, P-14: clic abre o activa, en una pestaña provisional; clic central abre siempre una
 * pestaña nueva y fija.
 */
export async function openNote(id: string, newTab = false): Promise<void> {
  try {
    await useTabs.getState().open(id, { newTab, preview: !newTab });
  } catch (e) {
    fail(e, 'No se pudo abrir la nota');
  }
}

/** N-05, N-06: crea la nota al final y la abre en edición con el título seleccionado. */
export async function createAndOpen(parentId: string | null, type: NoteType): Promise<void> {
  try {
    if (parentId) useUi.getState().expand(parentId);
    const note = await useTree.getState().create(parentId, type);
    await useTabs.getState().open(note.id, { newTab: true, mode: 'edit', focusTitle: true, note });
  } catch (e) {
    fail(e, 'No se pudo crear la nota');
  }
}

/** N-13: renombrar desde el árbol (F2). */
export async function renameNote(id: string, title: string): Promise<void> {
  const clean = title.trim();
  if (clean === '') return;
  const tabs = useTabs.getState();
  try {
    const open = tabs.tabs.find((t) => t.noteId === id && t.note);
    if (open) {
      tabs.edit(open.id, { title: clean });
      await tabs.saveNow(open.id);
      return;
    }
    const note = await api.getNote(id);
    if (note.title === clean) return;
    const saved = await api.saveNote(id, clean, note.content, note.version);
    useTree.getState().applyNote(saved);
  } catch (e) {
    fail(e instanceof ApiError && e.status === 409 ? new Error('La nota cambió mientras se renombraba. Inténtalo de nuevo.') : e, 'No se pudo renombrar');
  }
}

/** N-60 a N-64: mueve la nota con toda su descendencia. */
export async function moveNote(id: string, dest: Destination): Promise<void> {
  try {
    await api.moveNote(id, dest.parentId, dest.position);
    if (dest.parentId) useUi.getState().expand(dest.parentId);
  } catch (e) {
    fail(e, 'No se pudo mover la nota');
  } finally {
    await useTree.getState().load();
  }
}

/** N-50, N-51, N-54: a la papelera tras confirmar; con hijas, solo subiéndolas un nivel. */
export async function deleteNote(id: string): Promise<void> {
  const { nodes } = useTree.getState();
  const node = nodes.find((n) => n.id === id);
  if (!node) return;
  const children = nodes.filter((n) => n.parentId === id).length;

  const choice =
    children === 0
      ? await ask({
          title: 'Eliminar nota',
          body: `«${node.title}» irá a la papelera.`,
          options: [
            { value: 'delete', label: 'Eliminar', primary: true },
            { value: 'cancel', label: 'Cancelar' },
          ],
          cancelValue: 'cancel',
        })
      : await ask({
          title: 'La nota tiene hijas',
          body: `«${node.title}» tiene ${children === 1 ? 'una hija' : `${children} hijas`}. No se eliminan en cascada: pueden subir un nivel y ocupar su lugar.`,
          options: [
            { value: 'promote', label: 'Subir las hijas un nivel y eliminar', primary: true },
            { value: 'cancel', label: 'Cancelar' },
          ],
          cancelValue: 'cancel',
        });
  if (choice === 'cancel') return;

  try {
    // Lo que se estuviera escribiendo se guarda antes, para que llegue a la papelera.
    await useTabs.getState().saveNote(id);
    await api.deleteNote(id, choice === 'promote');
    useTabs.getState().dropNote(id);
    useUi.getState().notify(`«${node.title}» se ha movido a la papelera`);
  } catch (e) {
    fail(e, 'No se pudo eliminar la nota');
  } finally {
    await useTree.getState().load();
  }
}

/** N-81 */
export async function toggleFavorite(id: string): Promise<void> {
  const node = useTree.getState().nodes.find((n) => n.id === id);
  if (!node) return;
  try {
    const note = await api.setFavorite(id, !node.favorite);
    useTabs.getState().applyMeta(note);
    await useTree.getState().load();
  } catch (e) {
    fail(e, 'No se pudo cambiar la favorita');
  }
}

/** N-80 */
export async function saveTags(id: string, tags: string[]): Promise<void> {
  try {
    const note = await api.setTags(id, tags);
    useTabs.getState().applyMeta(note);
    await useTree.getState().load();
  } catch (e) {
    fail(e, 'No se pudieron guardar las etiquetas');
  }
}

/** N-80: «Etiquetas…» abre la nota y lleva el foco a sus etiquetas. */
export async function editTags(id: string): Promise<void> {
  await openNote(id);
  useUi.getState().setFocusTags(id);
}

/** N-53 */
export async function restoreNote(id: string): Promise<boolean> {
  try {
    const note = await api.restore(id);
    useUi.getState().notify(`«${note.title}» se ha restaurado`);
    await useTree.getState().load();
    return true;
  } catch (e) {
    fail(e, 'No se pudo restaurar la nota');
    return false;
  }
}

/** N-52, N-55: eliminación definitiva tras confirmar. */
export async function purgeNote(id: string, title: string): Promise<boolean> {
  const choice = await ask({
    title: 'Eliminar definitivamente',
    body: `«${title}» se borrará para siempre, con su historial. No se puede deshacer.`,
    options: [
      { value: 'purge', label: 'Eliminar definitivamente', primary: true },
      { value: 'cancel', label: 'Cancelar' },
    ],
    cancelValue: 'cancel',
  });
  if (choice !== 'purge') return false;
  try {
    await api.purge(id);
    return true;
  } catch (e) {
    fail(e, 'No se pudo eliminar la nota');
    return false;
  }
}

/** N-52 */
export async function emptyTrash(count: number): Promise<boolean> {
  const choice = await ask({
    title: 'Vaciar la papelera',
    body: `Se borrarán para siempre ${count === 1 ? 'una nota' : `${count} notas`}. No se puede deshacer.`,
    options: [
      { value: 'empty', label: 'Vaciar la papelera', primary: true },
      { value: 'cancel', label: 'Cancelar' },
    ],
    cancelValue: 'cancel',
  });
  if (choice !== 'empty') return false;
  try {
    await api.emptyTrash();
    return true;
  } catch (e) {
    fail(e, 'No se pudo vaciar la papelera');
    return false;
  }
}
