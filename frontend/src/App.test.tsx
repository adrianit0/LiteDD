import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { api, ApiError, DEFAULT_CONFIG } from './api';
import { useTabs } from './stores/tabsStore';
import { useTree } from './stores/treeStore';
import { useUi } from './stores/uiStore';
import { useHttpProfile } from './stores/httpProfileStore';
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
      httpCredentials: vi.fn().mockResolvedValue({ passwords: { local: false }, hasConfirmKey: false }),
      httpProfile: vi.fn(),
      setHttpProfile: vi.fn(),
      duplicateNote: vi.fn(),
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
  mocked.httpProfile.mockResolvedValue({ active: 'local' });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  useTree.setState({ nodes: [] });
  useUi.setState({ sidebarVisible: true });
  useHttpProfile.setState({ active: 'local' });
});

describe('U-12 selector de perfil de las notas HTTP', () => {
  it('U-12 H-62 sin la casilla de preproducción no aparece', async () => {
    render(<App />);
    await act(async () => {});
    expect(screen.queryByRole('combobox', { name: 'Destino de las notas HTTP' })).toBeNull();
  });

  it('U-12 H-63 aparece a la izquierda de la conexión, elige el perfil activo y avisa fuera de Local', async () => {
    const pre1 = { id: 'pre1', name: 'PRE1', baseUrl: 'https://pre1.litedd-demo.test/demo/', user: '', requireKey: true };
    const http = { ...DEFAULT_CONFIG.http, preproduction: true, profiles: [...DEFAULT_CONFIG.http.profiles, pre1] };
    mocked.getSettings.mockResolvedValue({ config: { ...DEFAULT_CONFIG, http } });
    mocked.setHttpProfile.mockResolvedValue({ active: 'pre1' });
    render(<App />);
    const select = await screen.findByRole<HTMLSelectElement>('combobox', { name: 'Destino de las notas HTTP' });
    expect([...select.options].map((o) => o.textContent)).toEqual(['Local', 'PRE1']);
    const connection = await screen.findByRole('button', { name: /Sin conexión configurada/ });
    expect(select.compareDocumentPosition(connection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(select.value).toBe('local');
    expect(select.className).not.toContain('profile-preproduction');

    await act(async () => {
      fireEvent.change(select, { target: { value: 'pre1' } });
    });
    expect(mocked.setHttpProfile).toHaveBeenCalledWith('pre1');
    expect(select.value).toBe('pre1');
    // Propuesta A de ADR-0028: color de aviso fuera de Local.
    expect(select.className).toContain('profile-preproduction');
  });
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

  it('N-05 el botón «+ Nuevo» abre un menú flotante con los cuatro tipos de nota', async () => {
    render(<App />);
    await act(async () => {});
    const button = screen.getByRole('button', { name: '+ Nuevo' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((i) => i.firstChild?.textContent)).toEqual([
      'Nota Markdown',
      'Nota SQL',
      'Nota HTTP',
      'Nota MyBatis',
    ]);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(mocked.createNote).not.toHaveBeenCalled();
  });

  it('N-05 N-06 «Nuevo → Nota Markdown» crea en la raíz y abre en edición con el título seleccionado', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Nota Markdown/ }));
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

  it('N-05 H-01 «Nuevo → Nota HTTP» crea una nota HTTP sin modos; Ctrl+E no hace nada y Ctrl+Intro la envía', async () => {
    const httpNote = { ...created, type: 'http' as const, content: '{"endpoint":"/x","login":"none"}' };
    mocked.createNote.mockResolvedValue(httpNote);
    mocked.saveNote.mockResolvedValue(httpNote);
    const execute = vi.fn().mockResolvedValue({ phase: 'request', error: { code: 'connection_refused', message: 'Error: connect ECONNREFUSED 127.0.0.1:8080' } });
    (api as unknown as { httpExecute: typeof execute }).httpExecute = execute;
    (api as unknown as { appVersion: () => Promise<string> }).appVersion = () => Promise.resolve('0.1.0');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Nota HTTP' }));
    });
    expect(mocked.createNote).toHaveBeenCalledWith(null, 'http');
    expect(screen.getByLabelText('Endpoint')).toBeTruthy();
    const mode = useTabs.getState().tabs[0].mode;
    await act(async () => {
      fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    });
    expect(useTabs.getState().tabs[0].mode).toBe(mode);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    });
    expect(execute).toHaveBeenCalledWith('nuevo', 1, expect.any(String), 'local', undefined);
    expect(screen.getByRole('alert').textContent).toBe('Error: connect ECONNREFUSED 127.0.0.1:8080');
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

  it('N-09 «Contraer todo» pliega las notas con hijas y «Localizar nota abierta» despliega sus madres y la enfoca', async () => {
    mocked.tree.mockResolvedValue([
      { ...created, id: 'a', title: 'Raíz' },
      { ...created, id: 'b', parentId: 'a', title: 'Capítulo' },
      { ...created, id: 'c', parentId: 'b', title: 'Página' },
      { ...created, id: 'd', position: 1, title: 'Otra' },
    ]);
    mocked.getNote.mockResolvedValue({ ...created, id: 'c', parentId: 'b', title: 'Página', content: 'texto' });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 280, height: 600 }));
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
    render(<App />);
    await screen.findByRole('treeitem', { name: /Página/ });
    const locate = screen.getByRole<HTMLButtonElement>('button', { name: 'Localizar nota abierta' });
    expect(locate.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Contraer todo' }));
    expect([...useUi.getState().collapsed].sort()).toEqual(['a', 'b']);
    expect(screen.getAllByRole('treeitem').map((r) => r.querySelector('.tree-title')?.textContent)).toEqual(['Raíz', 'Otra']);

    await act(async () => {
      await useTabs.getState().open('c');
    });
    expect(locate.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(locate);
      await new Promise((r) => requestAnimationFrame(r));
    });
    expect(useUi.getState().collapsed.size).toBe(0);
    const row = screen.getByRole('treeitem', { name: /Página/ });
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(row);
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

  it('N-04 N-08 el menú contextual del árbol ofrece «Duplicar» y abre la copia', async () => {
    mocked.tree.mockResolvedValue([{ ...created, id: 'a', title: 'Libros' }]);
    mocked.duplicateNote.mockResolvedValue({ ...created, id: 'a2', title: 'Libros (2)' });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 280, height: 600 }));
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
    render(<App />);
    const row = await screen.findByRole('treeitem', { name: /Libros/ });
    fireEvent.contextMenu(row);
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items.indexOf('Duplicar')).toBe(items.findIndex((t) => t?.startsWith('Renombrar')) + 1);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));
    });
    expect(mocked.duplicateNote).toHaveBeenCalledWith('a');
    expect(screen.getByRole('tab', { name: /Libros \(2\)/ })).toBeTruthy();
  });

  it('N-04 «Nuevo» del menú contextual despliega a la derecha los tipos y crea la nota como hija', async () => {
    mocked.tree.mockResolvedValue([{ ...created, id: 'a', title: 'Libros' }]);
    mocked.createNote.mockResolvedValue({ ...created, id: 'b', type: 'sql', parentId: 'a' });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 280, height: 600 }));
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
    render(<App />);
    fireEvent.contextMenu(await screen.findByRole('treeitem', { name: /Libros/ }));
    const labels = screen.getAllByRole('menuitem').map((i) => i.firstChild?.textContent);
    expect(labels[0]).toBe('Nuevo');
    expect(labels.some((l) => l?.startsWith('Nueva nota') || l?.startsWith('Nota '))).toBe(false);
    const nuevo = screen.getByRole('menuitem', { name: /^Nuevo/ });
    // Flecha derecha abre el submenú y flecha izquierda vuelve a «Nuevo».
    nuevo.focus();
    fireEvent.keyDown(nuevo, { key: 'ArrowRight' });
    const submenu = screen.getByRole('menu', { name: 'Nuevo' });
    expect(within(submenu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Nota Markdown', 'Nota SQL', 'Nota HTTP', 'Nota MyBatis']);
    fireEvent.keyDown(within(submenu).getAllByRole('menuitem')[0], { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: 'Nuevo' })).toBeNull();
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseEnter(nuevo.parentElement!);
    await act(async () => {
      fireEvent.click(within(screen.getByRole('menu', { name: 'Nuevo' })).getByRole('menuitem', { name: 'Nota SQL' }));
    });
    expect(mocked.createNote).toHaveBeenCalledWith('a', 'sql');
    expect(screen.queryByRole('menu')).toBeNull();
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
    expect(screen.getByRole('button', { name: '+ Nuevo' })).toBeTruthy();
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
