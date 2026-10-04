import { api, ApiError } from '../api';
import { AUTOSAVE_DELAY, useNote } from './noteStore';
import { useTree } from './treeStore';
import type { Note } from '../types';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { getNote: vi.fn(), saveNote: vi.fn(), tree: vi.fn(), createNote: vi.fn(), getSettings: vi.fn(), putSettings: vi.fn() } };
});

const mocked = vi.mocked(api);

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  parentId: null,
  position: 0,
  type: 'md',
  title: 'Guía',
  content: 'hola',
  favorite: false,
  tags: [],
  version: 1,
  createdAt: '2026-10-04T08:00:00Z',
  updatedAt: '2026-10-04T08:00:00Z',
  ...over,
});

/** El servidor de prueba incrementa la versión en cada guardado. */
function serverSaves() {
  mocked.saveNote.mockImplementation(async (id, title, content, baseVersion) =>
    note({ id, title, content, version: baseVersion + 1 }),
  );
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useTree.setState({ nodes: [note()] });
  await useNote.getState().openNote(note());
  useNote.setState({ note: null });
  await useNote.getState().openNote(note());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('noteStore', () => {
  it('N-10 las notas existentes se abren en consulta', () => {
    expect(useNote.getState().mode).toBe('view');
    expect(useNote.getState().status).toBe('saved');
  });

  it('N-40 guarda 1,5 s después de la última pulsación', async () => {
    serverSaves();
    const s = useNote.getState();
    s.edit({ content: 'h' });
    await vi.advanceTimersByTimeAsync(1000);
    s.edit({ content: 'ho' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY - 100);
    expect(mocked.saveNote).not.toHaveBeenCalled();
    expect(useNote.getState().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(200);
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'ho', 1);
    expect(useNote.getState().status).toBe('saved');
    expect(useNote.getState().note!.version).toBe(2);
  });

  it('N-41 saveNow guarda de inmediato y no repite si no hay cambios', async () => {
    serverSaves();
    useNote.getState().edit({ content: 'nuevo' });
    await useNote.getState().saveNow();
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);
    await useNote.getState().saveNow();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);
  });

  it('N-12 N-40 cambiar de modo guarda lo pendiente', async () => {
    serverSaves();
    await useNote.getState().toggleMode();
    expect(useNote.getState().mode).toBe('edit');
    useNote.getState().edit({ content: 'cambio' });
    await useNote.getState().toggleMode();
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'cambio', 1);
    expect(useNote.getState().mode).toBe('view');
  });

  it('N-13 P-13 renombrar actualiza el título en el árbol', async () => {
    serverSaves();
    useNote.getState().edit({ title: 'Nuevo título' });
    await useNote.getState().saveNow();
    expect(useTree.getState().nodes[0].title).toBe('Nuevo título');
  });

  it('N-42 un 409 abre el conflicto; «Recargar» toma la versión guardada', async () => {
    const theirs = note({ content: 'de otro', version: 5 });
    mocked.saveNote.mockRejectedValueOnce(new ApiError(409, 'conflict', 'cambió', theirs));
    useNote.getState().edit({ content: 'mío' });
    await useNote.getState().saveNow();
    expect(useNote.getState().status).toBe('conflict');
    expect(useNote.getState().conflict).toEqual(theirs);

    // Mientras hay conflicto no se guarda nada más.
    useNote.getState().edit({ content: 'otra cosa' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);

    await useNote.getState().resolveConflict('reload');
    expect(useNote.getState().content).toBe('de otro');
    expect(useNote.getState().note!.version).toBe(5);
    expect(useNote.getState().status).toBe('saved');
  });

  it('N-42 «Sobrescribir» guarda lo local sobre la versión del otro', async () => {
    const theirs = note({ content: 'de otro', version: 5 });
    mocked.saveNote.mockRejectedValueOnce(new ApiError(409, 'conflict', 'cambió', theirs));
    useNote.getState().edit({ content: 'mío' });
    await useNote.getState().saveNow();
    serverSaves();
    await useNote.getState().resolveConflict('overwrite');
    expect(mocked.saveNote).toHaveBeenLastCalledWith('n1', 'Guía', 'mío', 5);
    expect(useNote.getState().note!.version).toBe(6);
    expect(useNote.getState().status).toBe('saved');
  });

  it('N-43 «Actualizar» recarga la nota desde el disco', async () => {
    mocked.getNote.mockResolvedValueOnce(note({ content: 'del disco', version: 3 }));
    useNote.getState().edit({ content: 'local' });
    await useNote.getState().reload();
    expect(useNote.getState().content).toBe('del disco');
    expect(useNote.getState().status).toBe('saved');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    expect(mocked.saveNote).not.toHaveBeenCalled();
  });

  it('N-40 al cerrar la ventana se envía lo pendiente con keepalive', () => {
    serverSaves();
    useNote.getState().edit({ content: 'último' });
    useNote.getState().flushOnUnload();
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'último', 1, { keepalive: true });
  });

  it('N-40 abrir otra nota guarda antes la actual', async () => {
    serverSaves();
    mocked.getNote.mockResolvedValueOnce(note({ id: 'n2', title: 'Otra' }));
    useNote.getState().edit({ content: 'pendiente' });
    await useNote.getState().open('n2');
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'pendiente', 1);
    expect(useNote.getState().note!.id).toBe('n2');
  });
});
