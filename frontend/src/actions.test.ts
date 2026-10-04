import { api } from './api';
import { deleteNote, emptyTrash, moveNote, purgeNote, restoreNote } from './actions';
import { useDialogs } from './stores/dialogStore';
import { useTabs } from './stores/tabsStore';
import { useTree } from './stores/treeStore';
import type { Note, TreeNode } from './types';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    api: {
      tree: vi.fn(),
      getNote: vi.fn(),
      saveNote: vi.fn(),
      deleteNote: vi.fn(),
      moveNote: vi.fn(),
      restore: vi.fn(),
      purge: vi.fn(),
      emptyTrash: vi.fn(),
      putSession: vi.fn(),
      putSettings: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

const node = (id: string, parentId: string | null, position: number): TreeNode => ({
  id,
  parentId,
  position,
  type: 'md',
  title: id,
  favorite: false,
  tags: [],
});

const note = (id: string): Note => ({ ...node(id, null, 0), content: '', version: 1, createdAt: '', updatedAt: '' });

const nodes = [node('A', null, 0), node('A1', 'A', 0), node('A2', 'A', 1), node('B', null, 1)];

/** Espera al diálogo y elige una opción. */
async function answer(title: string, value: string) {
  await vi.waitFor(() => expect(useDialogs.getState().current?.title).toBe(title));
  useDialogs.getState().answer(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.tree.mockResolvedValue(nodes);
  mocked.deleteNote.mockResolvedValue(undefined);
  mocked.purge.mockResolvedValue(undefined);
  mocked.emptyTrash.mockResolvedValue(undefined);
  mocked.putSession.mockResolvedValue({ tabs: [] });
  useTree.setState({ nodes });
  useTabs.setState({ tabs: [], activeId: null });
});

describe('eliminar', () => {
  it('N-50 una nota sin hijas va a la papelera tras confirmar', async () => {
    const done = deleteNote('B');
    await answer('Eliminar nota', 'delete');
    await done;
    expect(mocked.deleteNote).toHaveBeenCalledWith('B', false);
  });

  it('N-50 cancelar no elimina nada', async () => {
    const done = deleteNote('B');
    await answer('Eliminar nota', 'cancel');
    await done;
    expect(mocked.deleteNote).not.toHaveBeenCalled();
  });

  it('N-51 una nota con hijas solo ofrece subirlas un nivel o cancelar', async () => {
    const done = deleteNote('A');
    await vi.waitFor(() => expect(useDialogs.getState().current).not.toBeNull());
    const dialog = useDialogs.getState().current!;
    expect(dialog.title).toBe('La nota tiene hijas');
    expect(dialog.options.map((o) => o.label)).toEqual(['Subir las hijas un nivel y eliminar', 'Cancelar']);
    useDialogs.getState().answer('promote');
    await done;
    expect(mocked.deleteNote).toHaveBeenCalledWith('A', true);
  });

  it('N-54 eliminar cierra las pestañas de la nota', async () => {
    mocked.getNote.mockImplementation(async (id) => note(id));
    await useTabs.getState().open('B');
    await useTabs.getState().open('A1');
    const done = deleteNote('B');
    await answer('Eliminar nota', 'delete');
    await done;
    expect(useTabs.getState().tabs.map((t) => t.noteId)).toEqual(['A1']);
  });
});

describe('papelera', () => {
  it('N-53 restaurar recarga el árbol', async () => {
    mocked.restore.mockResolvedValue(note('B'));
    expect(await restoreNote('B')).toBe(true);
    expect(mocked.tree).toHaveBeenCalled();
  });

  it('N-52 N-55 eliminar definitivamente y vaciar piden confirmación', async () => {
    let done: Promise<boolean> = purgeNote('B', 'B');
    await answer('Eliminar definitivamente', 'cancel');
    expect(await done).toBe(false);
    expect(mocked.purge).not.toHaveBeenCalled();

    done = purgeNote('B', 'B');
    await answer('Eliminar definitivamente', 'purge');
    expect(await done).toBe(true);
    expect(mocked.purge).toHaveBeenCalledWith('B');

    done = emptyTrash(3);
    await answer('Vaciar la papelera', 'empty');
    expect(await done).toBe(true);
    expect(mocked.emptyTrash).toHaveBeenCalled();
  });
});

describe('mover', () => {
  it('N-61 mover pide al servidor el destino y recarga el árbol', async () => {
    mocked.moveNote.mockResolvedValue(note('B'));
    await moveNote('B', { parentId: 'A', position: 2 });
    expect(mocked.moveNote).toHaveBeenCalledWith('B', 'A', 2);
    expect(mocked.tree).toHaveBeenCalled();
  });
});
