import { api, ApiError, DEFAULT_CONFIG } from '../api';
import { AUTOSAVE_DELAY, isDirty, isSplit, paneTabs, sessionSnapshot, useTabs, visibleIdOf } from './tabsStore';
import { useTree } from './treeStore';
import { useDialogs } from './dialogStore';
import { useUi } from './uiStore';
import type { Note } from '../types';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      getNote: vi.fn(),
      saveNote: vi.fn(),
      tree: vi.fn(),
      getSession: vi.fn(),
      putSession: vi.fn(),
      putSettings: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  parentId: null,
  position: 0,
  type: 'md',
  title: 'Guía',
  description: '',
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
  mocked.saveNote.mockImplementation(async (id, title, content, baseVersion) => note({ id, title, content, version: baseVersion + 1 }));
}

const s = () => useTabs.getState();
const active = () => s().tabs.find((t) => t.id === s().activeId)!;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocked.putSession.mockResolvedValue({ tabs: [] });
  mocked.getNote.mockImplementation(async (id) => note({ id, title: id === 'n1' ? 'Guía' : `Nota ${id}` }));
  useTree.setState({ nodes: [note()] });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  await s().open('n1');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pestañas', () => {
  it('N-10 las notas existentes se abren en consulta', () => {
    expect(active()).toMatchObject({ noteId: 'n1', mode: 'view', status: 'saved' });
  });

  it('P-02 clic sobre una nota abierta activa su primera pestaña', async () => {
    await s().open('n2');
    expect(s().tabs).toHaveLength(2);
    await s().open('n1');
    expect(s().tabs).toHaveLength(2);
    expect(active().noteId).toBe('n1');
  });

  it('P-03 N-03 clic central abre siempre una pestaña nueva de la misma nota', async () => {
    await s().open('n1', { newTab: true });
    expect(s().tabs.map((t) => t.noteId)).toEqual(['n1', 'n1']);
    expect(s().activeId).toBe(s().tabs[1].id);
  });

  it('P-04 cerrar activa la pestaña de la derecha o, si no hay, la de la izquierda', async () => {
    await s().open('n2');
    await s().open('n3');
    const [a, b, c] = s().tabs;
    s().activate(b.id);
    await s().close(b.id);
    expect(s().activeId).toBe(c.id);
    await s().close(c.id);
    expect(s().activeId).toBe(a.id);
    await s().close(a.id);
    expect(s().activeId).toBeNull();
  });

  it('P-05 reordenar mueve la pestaña a la posición de otra', async () => {
    await s().open('n2');
    await s().open('n3');
    const [a, , c] = s().tabs;
    s().reorder(c.id, a.id);
    expect(s().tabs.map((t) => t.noteId)).toEqual(['n3', 'n1', 'n2']);
  });

  it('P-06 P-07 cada pestaña tiene su modo y su texto; no se sincronizan', async () => {
    await s().open('n1', { newTab: true });
    const [a, b] = s().tabs;
    await s().toggleMode(a.id);
    s().edit(a.id, { content: 'solo en A' });
    s().setScroll(b.id, 300);
    const [a2, b2] = s().tabs;
    expect(a2.mode).toBe('edit');
    expect(b2.mode).toBe('view');
    expect(b2.content).toBe('hola');
    expect(b2.scroll).toBe(300);
  });

  it('P-07 N-42 la otra pestaña de la misma nota recibe un conflicto al guardar', async () => {
    serverSaves();
    await s().open('n1', { newTab: true });
    const [a, b] = s().tabs;
    s().edit(a.id, { content: 'desde A' });
    await s().saveNow(a.id);
    mocked.saveNote.mockRejectedValueOnce(new ApiError(409, 'conflict', 'cambió', note({ content: 'desde A', version: 2 })));
    s().edit(b.id, { content: 'desde B' });
    await s().saveNow(b.id);
    expect(s().tabs[1].status).toBe('conflict');
  });

  it('P-08 cerrar una pestaña guarda lo pendiente', async () => {
    serverSaves();
    s().edit(active().id, { content: 'pendiente' });
    await s().close(active().id);
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'pendiente', 1);
    expect(s().tabs).toHaveLength(0);
  });

  it('P-08 si no se puede guardar, pregunta antes de cerrar', async () => {
    mocked.saveNote.mockRejectedValue(new ApiError(500, 'internal_error', 'fallo', null));
    s().edit(active().id, { content: 'pendiente' });
    const closing = s().close(active().id);
    await vi.waitFor(() => expect(useDialogs.getState().current?.title).toBe('Cambios sin guardar'));
    useDialogs.getState().answer('cancel');
    await closing;
    expect(s().tabs).toHaveLength(1);
  });

  it('P-11 cerrar las demás, cerrar las de la derecha y duplicar', async () => {
    await s().open('n2');
    await s().open('n3');
    await s().open('n4');
    const [, b] = s().tabs;
    await s().closeRight(b.id);
    expect(s().tabs.map((t) => t.noteId)).toEqual(['n1', 'n2']);
    await s().duplicate(b.id);
    expect(s().tabs.map((t) => t.noteId)).toEqual(['n1', 'n2', 'n2']);
    expect(s().activeId).toBe(s().tabs[2].id);
    await s().closeOthers(b.id);
    expect(s().tabs.map((t) => t.id)).toEqual([b.id]);
  });

  it('P-13 renombrar actualiza el título en las demás pestañas y en el árbol', async () => {
    serverSaves();
    await s().open('n1', { newTab: true });
    const [a] = s().tabs;
    s().edit(a.id, { title: 'Nuevo título' });
    await s().saveNow(a.id);
    expect(s().tabs.map((t) => t.title)).toEqual(['Nuevo título', 'Nuevo título']);
    expect(useTree.getState().nodes[0].title).toBe('Nuevo título');
  });

  it('N-54 eliminar una nota cierra todas sus pestañas', async () => {
    await s().open('n2');
    await s().open('n1', { newTab: true });
    s().dropNote('n1');
    expect(s().tabs.map((t) => t.noteId)).toEqual(['n2']);
  });

  it('cambiar de pestaña con Alt+RePág y Alt+AvPág es circular', async () => {
    await s().open('n2');
    s().cycle(1);
    expect(active().noteId).toBe('n1');
    s().cycle(-1);
    expect(active().noteId).toBe('n2');
  });
});

describe('sesión', () => {
  it('P-09 restaura pestañas, orden, activa, modo y desplazamiento, sin resultados', async () => {
    useTabs.setState({ tabs: [], activeId: null, restored: false });
    mocked.getSession.mockResolvedValue({
      tabs: [
        { id: 't1', noteId: 'n2', mode: 'edit', active: false, state: { scroll: 40 } },
        { id: 't2', noteId: 'n1', mode: 'view', active: true, state: null },
      ],
    });
    await s().restore();
    expect(s().tabs.map((t) => [t.id, t.noteId, t.mode, t.scroll])).toEqual([
      ['t1', 'n2', 'edit', 40],
      ['t2', 'n1', 'view', 0],
    ]);
    expect(s().activeId).toBe('t2');
    expect(s().tabs[0].note?.title).toBe('Nota n2');
  });

  it('P-09 una nota que ya no existe se descarta al restaurar', async () => {
    useTabs.setState({ tabs: [], activeId: null, restored: false });
    mocked.getSession.mockResolvedValue({ tabs: [{ id: 't1', noteId: 'borrada', mode: 'view', active: true, state: null }] });
    mocked.getNote.mockRejectedValueOnce(new ApiError(404, 'not_found', 'La nota no existe', null));
    await s().restore();
    expect(s().tabs).toHaveLength(0);
  });

  it('P-09 la sesión se guarda tras cada cambio', async () => {
    useTabs.setState({ restored: true });
    await s().open('n2');
    await vi.advanceTimersByTimeAsync(500);
    expect(mocked.putSession).toHaveBeenLastCalledWith(sessionSnapshot(s().tabs, s().activeId));
    expect(mocked.putSession.mock.lastCall![0].map((t) => t.noteId)).toEqual(['n1', 'n2']);
  });
});

describe('guardado por pestaña', () => {
  it('N-40 guarda 1,5 s después de la última pulsación', async () => {
    serverSaves();
    const id = active().id;
    s().edit(id, { content: 'h' });
    await vi.advanceTimersByTimeAsync(1000);
    s().edit(id, { content: 'ho' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY - 100);
    expect(mocked.saveNote).not.toHaveBeenCalled();
    expect(active().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(200);
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'ho', 1);
    expect(active()).toMatchObject({ status: 'saved' });
    expect(active().note!.version).toBe(2);
  });

  it('N-41 saveNow guarda de inmediato y no repite si no hay cambios', async () => {
    serverSaves();
    s().edit(active().id, { content: 'nuevo' });
    await s().saveNow(active().id);
    await s().saveNow(active().id);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);
  });

  it('N-12 N-40 cambiar de modo guarda lo pendiente', async () => {
    serverSaves();
    const id = active().id;
    await s().toggleMode(id);
    s().edit(id, { content: 'cambio' });
    await s().toggleMode(id);
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'cambio', 1);
    expect(active().mode).toBe('view');
  });

  it('N-42 un 409 abre el conflicto; «Recargar» toma la versión guardada', async () => {
    const theirs = note({ content: 'de otro', version: 5 });
    mocked.saveNote.mockRejectedValueOnce(new ApiError(409, 'conflict', 'cambió', theirs));
    const id = active().id;
    s().edit(id, { content: 'mío' });
    await s().saveNow(id);
    expect(active().status).toBe('conflict');
    s().edit(id, { content: 'otra cosa' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);
    await s().resolveConflict(id, 'reload');
    expect(active()).toMatchObject({ content: 'de otro', status: 'saved' });
    expect(active().note!.version).toBe(5);
  });

  it('N-42 «Sobrescribir» guarda lo local sobre la versión del otro', async () => {
    const theirs = note({ content: 'de otro', version: 5 });
    mocked.saveNote.mockRejectedValueOnce(new ApiError(409, 'conflict', 'cambió', theirs));
    const id = active().id;
    s().edit(id, { content: 'mío' });
    await s().saveNow(id);
    serverSaves();
    await s().resolveConflict(id, 'overwrite');
    expect(mocked.saveNote).toHaveBeenLastCalledWith('n1', 'Guía', 'mío', 5);
    expect(active().note!.version).toBe(6);
    expect(isDirty(active())).toBe(false);
  });

  it('N-43 «Actualizar» recarga la nota desde el disco', async () => {
    mocked.getNote.mockResolvedValueOnce(note({ content: 'del disco', version: 3 }));
    const id = active().id;
    s().edit(id, { content: 'local' });
    await s().reload(id);
    expect(active()).toMatchObject({ content: 'del disco', status: 'saved' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2);
    expect(mocked.saveNote).not.toHaveBeenCalled();
  });

  it('N-40 al cerrar la ventana se envía lo pendiente de todas las pestañas', async () => {
    serverSaves();
    await s().open('n2');
    for (const t of s().tabs) s().edit(t.id, { content: `último ${t.noteId}` });
    s().flushOnUnload();
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'último n1', 1, { keepalive: true });
    expect(mocked.saveNote).toHaveBeenCalledWith('n2', 'Nota n2', 'último n2', 1, { keepalive: true });
  });
});

describe('guardado manual (N-46)', () => {
  beforeEach(() => {
    useUi.setState({ config: { ...DEFAULT_CONFIG, autosave: false } });
  });

  afterEach(() => {
    useUi.setState({ config: DEFAULT_CONFIG });
  });

  it('N-46 sin guardado automático, escribir no guarda; Ctrl+S (saveNow) sí', async () => {
    serverSaves();
    s().edit(active().id, { content: 'manual' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 3);
    expect(mocked.saveNote).not.toHaveBeenCalled();
    expect(active().status).toBe('pending');
    await s().saveNow(active().id);
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'manual', 1);
    expect(active().status).toBe('saved');
  });

  it('N-46 cambiar de modo guarda también con el guardado manual', async () => {
    serverSaves();
    await s().toggleMode(active().id);
    s().edit(active().id, { content: 'al cambiar' });
    await s().toggleMode(active().id);
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'al cambiar', 1);
  });

  it('N-46 cerrar con cambios pregunta: «Cancelar» la deja abierta', async () => {
    s().edit(active().id, { content: 'pendiente' });
    const closing = s().close(active().id);
    await vi.waitFor(() => expect(useDialogs.getState().current?.title).toBe('Cambios sin guardar'));
    expect(useDialogs.getState().current?.options.map((o) => o.label)).toEqual(['Guardar', 'Salir sin guardar', 'Cancelar']);
    useDialogs.getState().answer('cancel');
    await closing;
    expect(s().tabs).toHaveLength(1);
    expect(active().content).toBe('pendiente');
    expect(mocked.saveNote).not.toHaveBeenCalled();
  });

  it('N-46 «Salir sin guardar» cierra sin guardar', async () => {
    s().edit(active().id, { content: 'pendiente' });
    const closing = s().close(active().id);
    await vi.waitFor(() => expect(useDialogs.getState().current).not.toBeNull());
    useDialogs.getState().answer('discard');
    await closing;
    expect(s().tabs).toHaveLength(0);
    expect(mocked.saveNote).not.toHaveBeenCalled();
  });

  it('N-46 «Guardar» guarda y cierra', async () => {
    serverSaves();
    s().edit(active().id, { content: 'pendiente' });
    const closing = s().close(active().id);
    await vi.waitFor(() => expect(useDialogs.getState().current).not.toBeNull());
    useDialogs.getState().answer('save');
    await closing;
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Guía', 'pendiente', 1);
    expect(s().tabs).toHaveLength(0);
  });

  it('N-46 cerrar sin cambios no pregunta', async () => {
    await s().close(active().id);
    expect(useDialogs.getState().current).toBeNull();
    expect(s().tabs).toHaveLength(0);
  });

  it('N-46 al cerrar la ventana no se guarda nada; al recuperar el contacto solo se repiten los guardados fallidos', async () => {
    serverSaves();
    await s().open('n2');
    const [first, second] = s().tabs;
    s().edit(first.id, { content: 'sin pedir' });
    s().flushOnUnload();
    expect(mocked.saveNote).not.toHaveBeenCalled();

    mocked.saveNote.mockRejectedValueOnce(new ApiError(0, 'network', 'sin contacto', null));
    s().edit(second.id, { content: 'pedido' });
    await s().saveNow(second.id);
    expect(s().tabs[1].status).toBe('error');
    mocked.saveNote.mockClear();
    await s().savePending();
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);
    expect(mocked.saveNote).toHaveBeenCalledWith('n2', 'Nota n2', 'pedido', 1);
  });
});

describe('descripción (N-07)', () => {
  it('N-07 editar la descripción deja cambios pendientes y se guarda solo si cambió', async () => {
    serverSaves();
    s().edit(active().id, { description: 'Resumen' });
    expect(isDirty(active())).toBe(true);
    await s().saveNow(active().id);
    expect(mocked.saveNote).toHaveBeenLastCalledWith('n1', 'Guía', 'hola', 1, { description: 'Resumen' });
  });
});

describe('pestañas provisionales (P-14)', () => {
  beforeEach(async () => {
    useTabs.setState({ tabs: [], activeId: null });
    await s().open('n1', { preview: true });
  });

  it('P-14 abrir otra nota sustituye a la pestaña provisional en su sitio', async () => {
    await s().open('fija', { newTab: true });
    await s().open('n2', { preview: true });
    expect(s().tabs.map((t) => [t.noteId, t.preview])).toEqual([
      ['n2', true],
      ['fija', false],
    ]);
    expect(active().noteId).toBe('n2');
  });

  it('P-14 modificar, «Editar», «Actualizar» o fijarla hacen que permanezca', async () => {
    serverSaves();
    s().edit(active().id, { content: 'cambio' });
    expect(active().preview).toBe(false);

    await s().open('n2', { preview: true });
    await s().toggleMode(active().id);
    expect(active().preview).toBe(false);

    await s().open('n3', { preview: true });
    await s().reload(active().id);
    expect(active().preview).toBe(false);

    await s().open('n4', { preview: true });
    s().pin(active().id);
    expect(active().preview).toBe(false);

    await s().open('n5', { preview: true });
    expect(s().tabs.map((t) => t.noteId)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
  });

  it('P-02 P-14 una nota ya abierta se activa y la provisional sigue', async () => {
    await s().open('n2', { newTab: true });
    await s().open('n1', { preview: true });
    expect(s().tabs).toHaveLength(2);
    expect(active()).toMatchObject({ noteId: 'n1', preview: true });
  });

  it('P-09 P-14 la sesión guarda y restaura si la pestaña es provisional', async () => {
    expect(sessionSnapshot(s().tabs, s().activeId)[0].state).toMatchObject({ preview: true });
    mocked.getSession.mockResolvedValue({
      tabs: [{ id: 't1', noteId: 'n1', mode: 'view', active: true, state: { scroll: 0, sql: null, preview: true } }],
    });
    useTabs.setState({ tabs: [], activeId: null, restored: false });
    await s().restore();
    expect(active().preview).toBe(true);
  });
});

describe('N-82 N-88 marca de obsoleta y última ejecución (ADR-0046)', () => {
  it('refreshMeta trae la última ejecución correcta sin tocar lo que se está editando', async () => {
    s().edit(active().id, { content: 'a medias' });
    mocked.getNote.mockResolvedValue(note({ content: 'del servidor', lastRunAt: '2026-11-01T12:00:00Z', obsolete: true, replacedBy: 'n2' }));
    await s().refreshMeta('n1');
    expect(active().note).toMatchObject({ lastRunAt: '2026-11-01T12:00:00Z', obsolete: true, replacedBy: 'n2' });
    expect(active().content).toBe('a medias');

    // Si la lectura falla, la pestaña sigue como estaba.
    mocked.getNote.mockRejectedValue(new Error('sin servidor'));
    await s().refreshMeta('n1');
    expect(active().note?.lastRunAt).toBe('2026-11-01T12:00:00Z');
  });
});

describe('vista dividida (ADR-0053)', () => {
  const ids = (side: 'left' | 'right') => paneTabs(s().tabs, side).map((t) => t.noteId);
  const visible = (side: 'left' | 'right') => s().tabs.find((t) => t.id === visibleIdOf(s().tabs, s().shown, s().activeId, side))?.noteId;
  const byNote = (noteId: string) => s().tabs.find((t) => t.noteId === noteId)!;

  beforeEach(async () => {
    await s().open('n2');
    await s().open('n3');
  });

  it('P-15 mover a la derecha abre el panel derecho con la pestaña y deja la izquierda con su vecina', () => {
    s().moveToSide(byNote('n3').id, 'right');
    expect(ids('left')).toEqual(['n1', 'n2']);
    expect(ids('right')).toEqual(['n3']);
    expect(isSplit(s().tabs)).toBe(true);
    expect(visible('left')).toBe('n2');
    expect(visible('right')).toBe('n3');
    expect(active().noteId).toBe('n3');
  });

  it('P-15 la única pestaña de la izquierda no se mueve, para no dejar el panel vacío', () => {
    s().moveToSide(byNote('n2').id, 'right');
    s().moveToSide(byNote('n3').id, 'right');
    s().moveToSide(byNote('n1').id, 'right');
    expect(ids('left')).toEqual(['n1']);
    expect(ids('right')).toEqual(['n2', 'n3']);
  });

  it('P-15 el panel derecho desaparece sin pestañas; sin las de la izquierda, las de la derecha pasan a la izquierda', async () => {
    s().moveToSide(byNote('n3').id, 'right');
    s().moveToSide(byNote('n3').id, 'left');
    expect(isSplit(s().tabs)).toBe(false);
    expect(ids('left')).toEqual(['n1', 'n2', 'n3']);

    s().moveToSide(byNote('n2').id, 'right');
    s().moveToSide(byNote('n3').id, 'right');
    await s().close(byNote('n1').id);
    expect(isSplit(s().tabs)).toBe(false);
    expect(ids('left')).toEqual(['n2', 'n3']);
    expect(visible('left')).toBe('n3');
    expect(active().noteId).toBe('n3');
  });

  it('P-15 mover a una posición del otro panel la coloca en su sitio y la fija', async () => {
    await s().open('n4', { preview: true });
    s().moveToSide(byNote('n3').id, 'right');
    s().moveToSide(byNote('n2').id, 'right');
    s().moveToSide(byNote('n4').id, 'right', 1);
    expect(ids('right')).toEqual(['n3', 'n4', 'n2']);
    expect(byNote('n4').preview).toBe(false);
  });

  it('P-16 activar una pestaña da el foco a su panel; el otro conserva su pestaña visible', () => {
    s().moveToSide(byNote('n3').id, 'right');
    s().activate(byNote('n1').id);
    expect(active().noteId).toBe('n1');
    expect(visible('right')).toBe('n3');
    s().activate(byNote('n3').id);
    expect(visible('left')).toBe('n1');
  });

  it('P-17 Alt+RePág y Alt+AvPág recorren solo el panel con el foco', () => {
    s().moveToSide(byNote('n3').id, 'right');
    s().activate(byNote('n2').id);
    s().cycle(1);
    expect(active().noteId).toBe('n1');
    s().cycle(1);
    expect(active().noteId).toBe('n2');
  });

  it('P-17 las pestañas nuevas se abren en el panel con el foco y una nota abierta en el otro activa la suya', async () => {
    s().moveToSide(byNote('n3').id, 'right');
    await s().open('n4');
    expect(ids('right')).toEqual(['n3', 'n4']);
    await s().open('n1');
    expect(active().noteId).toBe('n1');
    expect(visible('right')).toBe('n4');
    await s().open('n5', { newTab: true });
    expect(ids('left')).toEqual(['n1', 'n2', 'n5']);
  });

  it('P-17 P-14 hay una pestaña provisional por panel', async () => {
    s().moveToSide(byNote('n3').id, 'right');
    await s().open('p1', { preview: true });
    s().activate(byNote('n1').id);
    await s().open('p2', { preview: true });
    await s().open('p3', { preview: true });
    expect(ids('left')).toEqual(['n1', 'n2', 'p3']);
    expect(ids('right')).toEqual(['n3', 'p1']);
  });

  it('P-17 cerrar, cerrar las demás, cerrar las de la derecha y duplicar actúan dentro del panel', async () => {
    await s().open('n4');
    s().moveToSide(byNote('n3').id, 'right');
    s().moveToSide(byNote('n4').id, 'right');
    await s().open('n5');
    // Cerrar la visible del panel derecho muestra su vecina del mismo panel.
    await s().close(byNote('n5').id);
    expect(visible('right')).toBe('n4');
    expect(visible('left')).toBe('n2');

    await s().duplicate(byNote('n3').id);
    expect(ids('right')).toEqual(['n3', 'n3', 'n4']);
    await s().closeRight(byNote('n1').id);
    expect(ids('left')).toEqual(['n1']);
    expect(ids('right')).toEqual(['n3', 'n3', 'n4']);
    await s().closeOthers(byNote('n4').id);
    expect(ids('left')).toEqual(['n1']);
    expect(ids('right')).toEqual(['n4']);
  });

  it('P-17 reordenar arrastrando dentro de un panel no toca el otro', () => {
    s().moveToSide(byNote('n2').id, 'right');
    s().reorder(byNote('n3').id, byNote('n1').id);
    expect(ids('left')).toEqual(['n3', 'n1']);
    expect(ids('right')).toEqual(['n2']);
  });

  it('P-09 la sesión guarda el panel de cada pestaña y la visible de cada panel, y los restaura', async () => {
    s().moveToSide(byNote('n3').id, 'right');
    s().activate(byNote('n1').id);
    const snapshot = sessionSnapshot(s().tabs, s().activeId, s().shown);
    expect(snapshot.map((t) => [t.noteId, t.active, t.state?.side, t.state?.shown])).toEqual([
      ['n1', true, 'left', true],
      ['n2', false, 'left', false],
      ['n3', false, 'right', true],
    ]);
    mocked.getSession.mockResolvedValue({ tabs: snapshot });
    useTabs.setState({ tabs: [], activeId: null, restored: false });
    await s().restore();
    expect(ids('left')).toEqual(['n1', 'n2']);
    expect(ids('right')).toEqual(['n3']);
    expect(active().noteId).toBe('n1');
    expect(visible('right')).toBe('n3');
  });

  it('P-09 una sesión sin paneles se restaura entera a la izquierda', async () => {
    mocked.getSession.mockResolvedValue({
      tabs: [
        { id: 't1', noteId: 'n2', mode: 'view', active: true, state: { scroll: 0 } },
        { id: 't2', noteId: 'n1', mode: 'view', active: false, state: null },
      ],
    });
    useTabs.setState({ tabs: [], activeId: null, restored: false });
    await s().restore();
    expect(isSplit(s().tabs)).toBe(false);
    expect(ids('left')).toEqual(['n2', 'n1']);
  });
});
