import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { api, ApiError, DEFAULT_CONFIG } from './api';
import { useTabs } from './stores/tabsStore';
import { useTree } from './stores/treeStore';
import { useUi } from './stores/uiStore';
import type { Note } from './types';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    api: {
      getNote: vi.fn(),
      saveNote: vi.fn(),
      tree: vi.fn(),
      createNote: vi.fn(),
      getSettings: vi.fn(),
      putSettings: vi.fn(),
      getSession: vi.fn(),
      putSession: vi.fn(),
      connectionStatus: vi.fn(),
      analyze: vi.fn(),
      tags: vi.fn(),
    },
  };
});

// La presencia tiene sus propias pruebas (presence.test.ts).
vi.mock('./presence', () => ({ startPresence: () => () => {} }));

const mocked = vi.mocked(api);

const created: Note = {
  id: 'nuevo',
  parentId: null,
  position: 0,
  type: 'md',
  title: 'Sin título',
  description: '',
  content: '',
  favorite: false,
  tags: [],
  version: 1,
  createdAt: '2026-10-04T08:00:00Z',
  updatedAt: '2026-10-04T08:00:00Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocked.tree.mockResolvedValue([]);
  mocked.getSettings.mockResolvedValue({});
  mocked.putSettings.mockResolvedValue({});
  mocked.createNote.mockResolvedValue(created);
  mocked.getSession.mockResolvedValue({ tabs: [] });
  mocked.analyze.mockResolvedValue({ variables: [], kind: 'query', forbiddenClause: null, errors: [], lastValues: {} });
  mocked.connectionStatus.mockResolvedValue({ state: 'not_configured', user: null, host: null, port: null, schema: null, message: null });
  mocked.putSession.mockResolvedValue({ tabs: [] });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  useTree.setState({ nodes: [] });
  useUi.setState({ sidebarVisible: true });
});

describe('App', () => {
  it('muestra la pantalla vacía «LiteDD» con el panel de notas', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'LiteDD' })).toBeTruthy();
    expect(screen.getByText('No hay ninguna nota abierta.')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Panel de notas' })).toBeTruthy();
    // C-02: sin conexión configurada, aviso que no bloquea.
    expect(await screen.findByRole('button', { name: /Sin conexión configurada/ })).toBeTruthy();
  });

  it('N-05 N-06 «Nueva nota Markdown» crea en la raíz y abre en edición con el título seleccionado', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+ Nueva nota Markdown' }));
    const input = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Título' });
    expect(mocked.createNote).toHaveBeenCalledWith(null, 'md');
    expect(input.value).toBe('Sin título');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Sin título'.length]);
    // N-20: en edición aparece la barra de formato con todos sus botones.
    expect(screen.getByRole('toolbar', { name: 'Formato' }).querySelectorAll('button')).toHaveLength(17);
  });

  it('N-05 Alt+Mayús+N crea una nota SQL', async () => {
    mocked.createNote.mockResolvedValue({ ...created, type: 'sql' });
    render(<App />);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'N', altKey: true, shiftKey: true });
    });
    expect(mocked.createNote).toHaveBeenCalledWith(null, 'sql');
  });

  it('N-01 N-03 el árbol muestra las notas y un clic abre la nota', async () => {
    mocked.tree.mockResolvedValue([{ ...created, id: 'a', title: 'Libros', type: 'sql' }]);
    mocked.getNote.mockResolvedValue({ ...created, id: 'a', title: 'Libros', type: 'sql', content: 'SELECT 1' });
    // jsdom no calcula tamaños: el árbol virtualizado necesita un contenedor con altura.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 280, height: 600 }));
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
    render(<App />);
    const row = await screen.findByRole('treeitem', { name: /Libros/ });
    expect(row.querySelector('[aria-label="SQL"]')).toBeTruthy();
    await act(async () => {
      fireEvent.click(row);
    });
    expect(mocked.getNote).toHaveBeenCalledWith('a');
    // U-06: una nota SQL en consulta muestra su vista ejecutable; Q-40: sin ejecutar.
    expect(await screen.findByRole('button', { name: 'Ejecutar' })).toBeTruthy();
    expect(mocked.analyze).toHaveBeenCalledWith('SELECT 1', 'a');
  });

  it('N-40 el guardado que cambia el título en el árbol no quita el foco al campo que se está editando', async () => {
    mocked.tree.mockResolvedValue([{ ...created, id: 'a', title: 'Libros' }]);
    mocked.getNote.mockResolvedValue({ ...created, id: 'a', title: 'Libros', content: 'texto' });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 280, height: 600 }));
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
    render(<App />);
    const row = await screen.findByRole('treeitem', { name: /Libros/ });
    await act(async () => {
      fireEvent.click(row);
    });
    mocked.tags.mockResolvedValue([]);
    const field = await screen.findByLabelText<HTMLInputElement>('Añadir etiqueta');
    field.focus();
    await act(async () => {
      useTree.getState().applyNote({ id: 'a', title: 'Libros nuevos' });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(document.activeElement).toBe(field);
  });

  it('N-46 con el guardado manual hay botón «Guardar» y cerrar la ventana con cambios pide confirmación', async () => {
    mocked.saveNote.mockImplementation(async (id, title, content, baseVersion) => ({ ...created, id, title, content, version: baseVersion + 1 }));
    render(<App />);
    await act(async () => {
      await useTabs.getState().open('a', { note: { ...created, id: 'a', title: 'Libros' } });
    });
    // Después de la carga inicial, que aplica los ajustes del servidor.
    act(() => useUi.setState({ config: { ...DEFAULT_CONFIG, autosave: false } }));
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Guardar' });
    expect(save.disabled).toBe(true);

    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    act(() => useTabs.getState().edit(useTabs.getState().activeId!, { content: 'cambio' }));
    expect(save.disabled).toBe(false);
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    await act(async () => {
      fireEvent.click(save);
    });
    expect(mocked.saveNote).toHaveBeenCalledWith('a', 'Libros', 'cambio', 1);
    useUi.setState({ config: DEFAULT_CONFIG });
  });

  it('N-40 con el guardado automático no hay botón «Guardar»', async () => {
    render(<App />);
    await act(async () => {
      await useTabs.getState().open('a', { note: { ...created, id: 'a', title: 'Libros' } });
    });
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
  });

  it('N-07 P-14 el árbol muestra la descripción; un clic abre en cursiva y el doble clic la fija', async () => {
    mocked.tree.mockResolvedValue([
      { ...created, id: 'a', title: 'Libros', description: 'Préstamos y devoluciones' },
      { ...created, id: 'b', title: 'Autores', position: 1 },
    ]);
    mocked.getNote.mockImplementation(async (id) =>
      id === 'a' ? { ...created, id: 'a', title: 'Libros', description: 'Préstamos y devoluciones' } : { ...created, id, title: 'Autores' },
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 280, height: 600 }));
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
    render(<App />);
    const row = await screen.findByRole('treeitem', { name: /Libros/ });
    expect(row.querySelector('.tree-description')?.textContent).toBe('Préstamos y devoluciones');
    expect(row.classList.contains('described')).toBe(true);

    await act(async () => {
      fireEvent.click(row);
    });
    expect(screen.getByRole('tab', { name: /Libros/ }).classList.contains('preview')).toBe(true);
    // N-07: en consulta la descripción se ve bajo el título.
    expect(screen.getByText('Préstamos y devoluciones', { selector: '.note-description' })).toBeTruthy();

    // Otra nota sustituye a la provisional.
    await act(async () => {
      fireEvent.click(screen.getByRole('treeitem', { name: /Autores/ }));
    });
    expect(screen.queryByRole('tab', { name: /Libros/ })).toBeNull();
    const tab = screen.getByRole('tab', { name: /Autores/ });
    expect(tab.classList.contains('preview')).toBe(true);
    fireEvent.doubleClick(tab);
    expect(screen.getByRole('tab', { name: /Autores/ }).classList.contains('preview')).toBe(false);

    // Doble clic en el árbol fija la pestaña de esa nota.
    const libros = screen.getByRole('treeitem', { name: /Libros/ });
    await act(async () => {
      fireEvent.click(libros);
    });
    fireEvent.doubleClick(libros);
    expect(screen.getByRole('tab', { name: /Libros/ }).classList.contains('preview')).toBe(false);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('N-07 en edición la descripción va entre el título y las etiquetas y se puede cambiar', async () => {
    render(<App />);
    await act(async () => {
      await useTabs.getState().open('a', { note: { ...created, id: 'a', title: 'Libros', description: 'Antes' } });
    });
    await act(async () => {
      await useTabs.getState().toggleMode(useTabs.getState().activeId!);
    });
    const input = screen.getByLabelText<HTMLInputElement>('Descripción');
    expect(input.value).toBe('Antes');
    expect(input.maxLength).toBe(200);
    const title = screen.getByLabelText('Título');
    const tags = screen.getByLabelText('Añadir etiqueta');
    expect(title.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Después' } });
    expect(useTabs.getState().tabs[0].description).toBe('Después');
    expect(useTabs.getState().tabs[0].status).toBe('pending');
  });

  it('U-01 Alt+B oculta y muestra el panel izquierdo', async () => {
    render(<App />);
    await act(async () => {});
    await act(async () => {
      fireEvent.keyDown(window, { key: 'b', altKey: true });
    });
    expect(screen.queryByRole('complementary', { name: 'Panel de notas' })).toBeNull();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'b', altKey: true });
    });
    expect(screen.getByRole('complementary', { name: 'Panel de notas' })).toBeTruthy();
  });

  it('N-11 N-32 en consulta se ve el Markdown y un enlace a nota la abre', async () => {
    mocked.getNote.mockResolvedValue({ ...created, id: 'destino', title: 'Destino', content: 'texto destino' });
    render(<App />);
    await act(async () => {
      await useTabs.getState().open('origen', {
        note: { ...created, id: 'origen', title: 'Origen', content: '# Hola\n\n[ir](litedd://note/destino)' },
      });
    });
    expect(screen.getByRole('heading', { name: 'Hola' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'ir' }));
    });
    expect(mocked.getNote).toHaveBeenCalledWith('destino');
    expect(await screen.findByText('texto destino')).toBeTruthy();
    expect(useTabs.getState().tabs.map((t) => t.noteId)).toEqual(['origen', 'destino']);

    // P-03: clic central sobre el enlace abre otra pestaña aunque la nota ya esté abierta.
    await act(async () => {
      useTabs.getState().activate(useTabs.getState().tabs[0].id);
    });
    await act(async () => {
      fireEvent(screen.getByRole('link', { name: 'ir' }), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    });
    expect(useTabs.getState().tabs.map((t) => t.noteId)).toEqual(['origen', 'destino', 'destino']);
  });

  it('P-01 P-12 la barra muestra icono, título, estado y cierre; sin pestañas vuelve la pantalla vacía', async () => {
    render(<App />);
    await act(async () => {
      await useTabs.getState().open('a', { note: { ...created, id: 'a', title: 'Libros', type: 'sql' } });
    });
    const tab = screen.getByRole('tab', { name: /Libros/ });
    expect(tab.querySelector('[aria-label="SQL"]')).toBeTruthy();
    expect(tab.querySelector('[aria-label="Guardado"]')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar Libros' }));
    });
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('No hay ninguna nota abierta.')).toBeTruthy();
  });

  it('P-10 un menú lista todas las pestañas y activa la elegida', async () => {
    render(<App />);
    await act(async () => {
      for (const t of ['Uno', 'Dos', 'Tres']) await useTabs.getState().open(t, { note: { ...created, id: t, title: t } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Todas las pestañas' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Uno', 'Dos', 'Tres']);
    await act(async () => {
      fireEvent.click(items[0]);
    });
    expect(useTabs.getState().tabs.find((t) => t.id === useTabs.getState().activeId)?.noteId).toBe('Uno');
  });

  it('P-04 clic central sobre una pestaña la cierra', async () => {
    render(<App />);
    await act(async () => {
      await useTabs.getState().open('a', { note: { ...created, id: 'a', title: 'Libros' } });
    });
    await act(async () => {
      fireEvent(screen.getByRole('tab', { name: /Libros/ }), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    });
    expect(useTabs.getState().tabs).toHaveLength(0);
  });

  it('N-52 el botón «Papelera» muestra la papelera en el panel y «Volver al árbol» la cierra', async () => {
    const trash = vi.fn().mockResolvedValue([{ id: 'x', parentId: null, type: 'md', title: 'Vieja', deletedAt: '2026-10-04T08:00:00Z' }]);
    (api as unknown as { trash: typeof trash }).trash = trash;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Papelera/ }));
    expect(await screen.findByText('Vieja')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restaurar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar definitivamente' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vaciar la papelera' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al árbol' }));
    expect(screen.getByRole('button', { name: '+ Nueva nota Markdown' })).toBeTruthy();
  });

  it('U-10 U-11 el botón ⚙ abre «Ajustes» y sin contacto aparece la banda', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeTruthy();
    act(() => useUi.getState().setContactLost(true));
    expect(screen.getByRole('alert').textContent).toContain('Sin contacto con LiteDD');
    act(() => useUi.getState().setContactLost(false));
    expect(screen.queryByText(/Sin contacto con LiteDD/)).toBeNull();
  });

  it('U-11 sin contacto, el guardado fallido no lanza avisos y el texto sigue en la pestaña', async () => {
    mocked.saveNote.mockRejectedValueOnce(new ApiError(0, 'network', 'No hay contacto con el servidor', null));
    await act(async () => {
      await useTabs.getState().open('a', { note: { ...created, id: 'a' } });
    });
    const id = useTabs.getState().activeId!;
    useTabs.getState().edit(id, { content: 'texto sin guardar' });
    await act(async () => {
      await useTabs.getState().saveNow(id);
    });
    const tab = useTabs.getState().tabs[0];
    expect(tab.status).toBe('error');
    expect(tab.content).toBe('texto sin guardar');
    expect(useUi.getState().notices.filter((n) => n.kind === 'error')).toHaveLength(0);
  });
});
