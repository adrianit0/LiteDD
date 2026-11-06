import { act, fireEvent, render, screen } from '@testing-library/react';
import { api } from '../api';
import { NotePane } from './NotePane';
import { useTabs } from '../stores/tabsStore';
import { useTree } from '../stores/treeStore';
import { useUi } from '../stores/uiStore';
import type { Note, TreeNode } from '../types';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      tree: vi.fn(),
      tags: vi.fn(),
      search: vi.fn(),
      getNote: vi.fn(),
      saveNote: vi.fn(),
      versions: vi.fn(),
      putSession: vi.fn(),
      attachmentDataUrl: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

const node: TreeNode = {
  id: 'n1',
  parentId: null,
  position: 0,
  type: 'md',
  title: 'Cuaderno',
  description: '',
  favorite: false,
  tags: [],
};

const CONTENT = '# Hoy\n\n- [ ] revisar préstamos\n- [x] cerrar informe';

const note = (over: Partial<Note> = {}): Note => ({
  ...node,
  content: CONTENT,
  version: 1,
  createdAt: '2026-11-06T08:00:00Z',
  updatedAt: '2026-11-06T08:00:00Z',
  ...over,
});

/** Como App: la pestaña se lee del almacén en cada cambio. */
function Pane() {
  const tab = useTabs((s) => s.tabs[0]);
  return tab ? <NotePane tab={tab} /> : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.tree.mockResolvedValue([node]);
  mocked.tags.mockResolvedValue([]);
  mocked.putSession.mockResolvedValue({ tabs: [] });
  mocked.saveNote.mockImplementation(async (_id, title, content, version) => note({ title, content, version: version + 1 }));
  useTree.setState({ nodes: [node] });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  useUi.setState({ notices: [], config: { ...useUi.getState().config, autosave: true } });
});

async function openView() {
  await useTabs.getState().open('n1', { note: note(), mode: 'view' });
  render(<Pane />);
}

describe('N-31 casillas de tareas en consulta', () => {
  it('N-31 pulsar una casilla la marca en el Markdown y guarda la nota al momento', async () => {
    await openView();
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: 'revisar préstamos' });
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(box);
    });
    expect(mocked.saveNote).toHaveBeenCalledTimes(1);
    expect(mocked.saveNote.mock.calls[0][2]).toBe('# Hoy\n\n- [x] revisar préstamos\n- [x] cerrar informe');
    // Sin versión del historial: no es salir del modo edición (N-44).
    expect(mocked.saveNote.mock.calls[0][4]).toBeUndefined();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'revisar préstamos' }).checked).toBe(true);
    expect(useTabs.getState().tabs[0].mode).toBe('view');
    expect(screen.getByRole('status').textContent).toBe('Guardado');

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'cerrar informe' }));
    });
    expect(mocked.saveNote.mock.calls[1][2]).toBe('# Hoy\n\n- [x] revisar préstamos\n- [ ] cerrar informe');
  });

  it('N-31 N-46 con el guardado manual la nota queda con cambios sin guardar', async () => {
    useUi.setState({ config: { ...useUi.getState().config, autosave: false } });
    await openView();
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'revisar préstamos' }));
    });
    expect(mocked.saveNote).not.toHaveBeenCalled();
    expect(useTabs.getState().tabs[0].content).toContain('- [x] revisar préstamos');
    expect(screen.getByRole('status').textContent).toBe('Cambios sin guardar');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(mocked.saveNote.mock.calls[0][2]).toContain('- [x] revisar préstamos');
  });
});
