import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../App';
import { MapperAnalysisPanel } from './MapperView';
import { api } from '../../api';
import { useTabs } from '../../stores/tabsStore';
import { useTree } from '../../stores/treeStore';
import { useUi } from '../../stores/uiStore';
import type { Note, TreeNode } from '../../types';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
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
      analyzeMapper: vi.fn(),
      tags: vi.fn(),
      httpCredentials: vi.fn().mockResolvedValue({ hasPassword: false }),
    },
  };
});

vi.mock('../../presence', () => ({ startPresence: () => () => {} }));

const mocked = vi.mocked(api);

const MAPPER = '<mapper namespace="demo.BookMapper">\n  <select id="byAuthor">SELECT * FROM book WHERE author_id = #{authorId,int}</select>\n</mapper>';

const node = (over: Partial<TreeNode>): TreeNode => ({
  id: 'x',
  parentId: null,
  position: 0,
  type: 'xml',
  title: 'Libros',
  description: '',
  favorite: false,
  tags: [],
  statementId: null,
  statementKind: null,
  ...over,
});

const asNote = (n: TreeNode, content: string, version = 1): Note => ({
  ...n,
  content,
  version,
  createdAt: '2026-10-12T08:00:00Z',
  updatedAt: '2026-10-12T08:00:00Z',
});

const xml = node({});
const byAuthor = node({ id: 'c1', parentId: 'x', type: 'sql', title: 'byAuthor', statementId: 'byAuthor', statementKind: 'select' });
const rename = node({ id: 'c2', parentId: 'x', position: 1, type: 'sql', title: 'rename', statementId: 'rename', statementKind: 'update' });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocked.tree.mockResolvedValue([xml, byAuthor, rename]);
  mocked.getSettings.mockResolvedValue({});
  mocked.putSettings.mockResolvedValue({});
  mocked.getSession.mockResolvedValue({ tabs: [] });
  mocked.putSession.mockResolvedValue({ tabs: [] });
  mocked.analyze.mockResolvedValue({ variables: [], kind: 'statement', forbiddenClause: null, errors: [], lastValues: {} });
  mocked.analyzeMapper.mockResolvedValue({ statements: [{ id: 'byAuthor', kind: 'select' }], errors: [] });
  mocked.connectionStatus.mockResolvedValue({ state: 'not_configured', user: null, host: null, port: null, schema: null, message: null });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  useTree.setState({ nodes: [] });
  useUi.setState({ sidebarVisible: true, collapsed: new Set() });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 280, height: 600 }));
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
});

async function openTab(note: Note) {
  await act(async () => {
    await useTabs.getState().open(note.id, { note, preview: true });
  });
  await act(async () => {});
}

const menuOf = async (name: RegExp) => {
  fireEvent.contextMenu(await screen.findByRole('treeitem', { name }));
  const labels = screen.getAllByRole('menuitem').map((i) => i.textContent ?? '');
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  return labels;
};

describe('notas XML MyBatis', () => {
  it('M-01 N-05 «Nuevo → Nota MyBatis» crea una nota xml en la raíz', async () => {
    mocked.tree.mockResolvedValue([]);
    mocked.createNote.mockResolvedValue(asNote(node({ id: 'nueva', title: 'Sin título' }), ''));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Nuevo' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Nota MyBatis' }));
    });
    expect(mocked.createNote).toHaveBeenCalledWith(null, 'xml');
  });

  it('N-04 M-20 M-22 menú de la nota XML sin nuevas hijas y de la hija solo duplicar, favorita y etiquetas', async () => {
    render(<App />);
    const parentMenu = await menuOf(/Libros/);
    expect(parentMenu.some((l) => l.startsWith('Nuevo'))).toBe(false);
    expect(parentMenu).toEqual(expect.arrayContaining(['Duplicar', 'Mover a…']));
    expect(parentMenu.some((l) => l.startsWith('Eliminar'))).toBe(true);

    const childMenu = await menuOf(/byAuthor/);
    expect(childMenu).toEqual(['Duplicar', 'Marcar como favorita', 'Etiquetas…']);
  });

  it('M-24 la hija de escritura lleva la marca en el árbol', async () => {
    render(<App />);
    const row = await screen.findByRole('treeitem', { name: /rename/ });
    expect(within(row).getByText('UPDATE')).toBeTruthy();
    expect(within(await screen.findByRole('treeitem', { name: /byAuthor/ })).queryByText('SELECT')).toBeNull();
  });

  it('M-20 M-21 la hija generada no se edita ni se elimina y enlaza a su nota XML', async () => {
    mocked.getNote.mockResolvedValue(asNote(xml, MAPPER));
    render(<App />);
    await screen.findByRole('treeitem', { name: /Libros/ });
    await openTab(asNote(rename, 'UPDATE book SET title = #{t}'));

    for (const name of ['Editar', 'Historial', 'Eliminar']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('textbox', { name: 'Título' })).toBeNull();
    // M-23: no ejecutable, solo «Generar SQL».
    expect(await screen.findByRole('button', { name: 'Generar SQL' })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    });
    expect(useTabs.getState().tabs[0].mode).toBe('view');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '«Libros»' }));
    });
    expect(useTabs.getState().tabs.some((t) => t.noteId === 'x')).toBe(true);
  });

  it('M-42 en consulta la nota XML lista sus sentencias con enlace y muestra el XML', async () => {
    mocked.getNote.mockResolvedValue(asNote(byAuthor, 'SELECT 1'));
    render(<App />);
    await screen.findByRole('treeitem', { name: /Libros/ });
    await openTab(asNote(xml, MAPPER));

    const list = screen.getByRole('region', { name: 'Sentencias generadas' });
    expect(within(list).getByRole('button', { name: 'rename' })).toBeTruthy();
    expect(within(list).getByText('UPDATE')).toBeTruthy();
    const source = screen.getByLabelText('Mapper');
    expect(source.textContent).toBe(MAPPER);
    expect(within(source).getByText('#{authorId,int}').className).toBe('cm-mb-param');

    await act(async () => {
      fireEvent.click(within(list).getByRole('button', { name: 'byAuthor' }));
    });
    expect(useTabs.getState().tabs.some((t) => t.noteId === 'c1')).toBe(true);
  });

  it('M-42 avisa si el mapper guardado tiene errores', async () => {
    mocked.analyzeMapper.mockResolvedValue({
      statements: [],
      errors: [{ code: 'xml', message: 'XML no válido en la línea 2, columna 5: …', line: 2, column: 5, variable: null }],
    });
    render(<App />);
    await screen.findByRole('treeitem', { name: /Libros/ });
    await openTab(asNote(xml, '<mapper>'));
    expect(await screen.findByText(/las sentencias generadas no se han actualizado/)).toBeTruthy();
    expect(screen.getByText(/XML no válido en la línea 2/)).toBeTruthy();
  });

  it('M-41 M-05 en edición lista en vivo las sentencias y pide el análisis sin contar la propia nota', async () => {
    vi.useFakeTimers();
    try {
      mocked.analyzeMapper.mockResolvedValue({ statements: [{ id: 'rename', kind: 'update' }], errors: [] });
      render(<MapperAnalysisPanel content={MAPPER} noteId="x" />);
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(mocked.analyzeMapper).toHaveBeenCalledWith(MAPPER, 'x');
      const panel = screen.getByRole('region', { name: 'Análisis del mapper' });
      expect(within(panel).getByText('rename')).toBeTruthy();
      expect(within(panel).getByText('UPDATE').className).toContain('write');
    } finally {
      vi.useRealTimers();
    }
  });

  it('M-15 guardar la nota XML recarga las pestañas de sus hijas y cierra las de sentencias borradas', async () => {
    render(<App />);
    await screen.findByRole('treeitem', { name: /Libros/ });
    await openTab(asNote(byAuthor, 'SELECT 1', 1));
    await act(async () => {
      await useTabs.getState().open('c2', { note: asNote(rename, 'UPDATE book SET year = 1', 1), newTab: true });
    });
    await act(async () => {
      await useTabs.getState().open('x', { note: asNote(xml, MAPPER), newTab: true });
    });

    const xmlTab = useTabs.getState().tabs.find((t) => t.noteId === 'x')!;
    mocked.saveNote.mockResolvedValue(asNote(xml, MAPPER + ' ', 2));
    mocked.tree.mockResolvedValue([xml, byAuthor]);
    mocked.getNote.mockResolvedValue(asNote(byAuthor, 'SELECT 2', 2));
    await act(async () => {
      useTabs.getState().edit(xmlTab.id, { content: MAPPER + ' ' });
      await useTabs.getState().saveNow(xmlTab.id);
    });
    await act(async () => {});

    const tabs = useTabs.getState().tabs;
    expect(tabs.some((t) => t.noteId === 'c2')).toBe(false);
    expect(tabs.find((t) => t.noteId === 'c1')?.content).toBe('SELECT 2');
  });

  it('M-17 guardar una nota XML recarga también las hijas de otros mappers', async () => {
    const other = node({ id: 'y', position: 1, title: 'Autores' });
    const withAuthor = node({ id: 'c3', parentId: 'y', type: 'sql', title: 'withAuthor', statementId: 'withAuthor', statementKind: 'select' });
    mocked.tree.mockResolvedValue([xml, byAuthor, rename, other, withAuthor]);
    render(<App />);
    await screen.findByRole('treeitem', { name: /Libros/ });
    await openTab(asNote(withAuthor, 'SELECT a.name', 1));
    await act(async () => {
      await useTabs.getState().open('x', { note: asNote(xml, MAPPER), newTab: true });
    });

    const xmlTab = useTabs.getState().tabs.find((t) => t.noteId === 'x')!;
    mocked.saveNote.mockResolvedValue(asNote(xml, MAPPER + ' ', 2));
    mocked.getNote.mockResolvedValue(asNote(withAuthor, 'SELECT a.name, a.country', 2));
    await act(async () => {
      useTabs.getState().edit(xmlTab.id, { content: MAPPER + ' ' });
      await useTabs.getState().saveNow(xmlTab.id);
    });
    await act(async () => {});

    expect(useTabs.getState().tabs.find((t) => t.noteId === 'c3')?.content).toBe('SELECT a.name, a.country');
  });
});
