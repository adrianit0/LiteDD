import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { api } from '../../api';
import { BoardView } from './BoardView';
import { NotePane } from '../NotePane';
import { HistoryDialog } from '../HistoryDialog';
import { MarkdownView } from '../MarkdownView';
import { SearchBox } from '../SearchPanel';
import { TypeIcon } from '../TypeIcon';
import { setFlusher, useTabs } from '../../stores/tabsStore';
import { useTree } from '../../stores/treeStore';
import { useUi } from '../../stores/uiStore';
import { useBoards } from '../../markdown/boards';
import { noteLinkSource } from '../../editor/noteExtensions';
import type { Note, NoteType, TreeNode } from '../../types';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      tree: vi.fn(),
      tags: vi.fn(),
      search: vi.fn(),
      getNote: vi.fn(),
      saveNote: vi.fn(),
      versions: vi.fn(),
      restoreVersion: vi.fn(),
      putSession: vi.fn(),
      attachmentDataUrl: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

// PNG de 1 × 1 en base64: suficiente para la interfaz, que no lo decodifica en jsdom.
const PNG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const node = (id: string, title: string, type: NoteType = 'md'): TreeNode => ({
  id,
  parentId: null,
  position: 0,
  type,
  title,
  description: '',
  favorite: false,
  tags: [],
});

const board = (over: Partial<Note> = {}): Note => ({
  ...node('b1', 'Esquema', 'board'),
  content: PNG_A,
  version: 2,
  createdAt: '2026-10-22T08:00:00Z',
  updatedAt: '2026-10-22T08:00:00Z',
  ...over,
});

beforeAll(() => {
  // jsdom no dibuja: sin contexto 2D, el lienzo no se carga y la interfaz sigue funcionando.
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.tree.mockResolvedValue([]);
  mocked.putSession.mockResolvedValue({ tabs: [] });
  mocked.tags.mockResolvedValue([]);
  mocked.search.mockResolvedValue([]);
  useTree.setState({ nodes: [node('b1', 'Esquema', 'board'), node('m1', 'Informe'), node('e1', 'Vacía', 'board')] });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  useBoards.setState({ boards: {} });
  useUi.setState({ notices: [] });
});

async function openBoard(mode: 'view' | 'edit', note = board()) {
  await useTabs.getState().open(note.id, { note, mode });
  const tab = useTabs.getState().tabs[0];
  render(<NotePane tab={tab} />);
  return tab;
}

describe('B-01 tipo pizarra', () => {
  it('B-01 icono propio con nombre accesible', () => {
    render(<TypeIcon type="board" />);
    expect(screen.getByRole('img', { name: 'Pizarra' }).textContent).toBe('PIZ');
  });

  it('B-33 el filtro de tipo ofrece «Pizarra»', async () => {
    render(<SearchBox />);
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    await act(async () => {});
    const select = screen.getByRole('combobox', { name: 'Tipo' });
    expect(within(select).getByRole('option', { name: 'Pizarra' }).getAttribute('value')).toBe('board');
  });
});

describe('B-02, B-04 consulta', () => {
  it('B-02 la pizarra se ve como imagen y se abre en el visor', async () => {
    await openBoard('view');
    expect(screen.getByRole<HTMLImageElement>('img', { name: 'Esquema' }).src).toBe(PNG_A);
    // Sin lienzo ni herramientas: en consulta no se puede pintar.
    expect(screen.queryByRole('toolbar', { name: 'Herramientas de la pizarra' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    fireEvent.click(screen.getByTitle('Ampliar la pizarra'));
    expect(screen.getByRole('dialog', { name: 'Imagen: Esquema' })).toBeTruthy();
  });

  it('B-02 una pizarra vacía invita a dibujar', () => {
    render(<BoardView title="Esquema" content="" />);
    expect(screen.getByText('Pizarra vacía. Pulsa «Editar» o Ctrl+E para dibujar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copiar imagen' })).toBeNull();
  });

  it('B-04 «Copiar imagen» copia un PNG al portapapeles', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Promise<Blob>>) {}
      },
    );
    render(<BoardView title="Esquema" content={PNG_A} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar imagen' }));
    });
    const item = write.mock.lastCall![0][0] as { items: Record<string, Promise<Blob>> };
    expect((await item.items['image/png']).type).toBe('image/png');
    expect(useUi.getState().notices.map((n) => n.text)).toContain('Imagen copiada');
    vi.unstubAllGlobals();
  });

  it('B-04 «Descargar PNG» descarga el fichero con el título como nombre', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:pizarra');
    URL.revokeObjectURL = vi.fn();
    let downloaded = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    render(<BoardView title="Esquema: v2" content={PNG_A} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Descargar PNG' }));
    });
    expect(downloaded).toBe('Esquema v2.png');
    click.mockRestore();
  });
});

describe('B-03, B-10 edición', () => {
  it('B-10 en edición hay barra de herramientas y lienzo, sin editor de texto', async () => {
    await openBoard('edit');
    const toolbar = screen.getByRole('toolbar', { name: 'Herramientas de la pizarra' });
    for (const name of ['Pincel', 'Goma', 'Texto', 'Relleno', 'Selección']) {
      expect(within(toolbar).getByRole('button', { name })).toBeTruthy();
    }
    expect(within(toolbar).getByRole('button', { name: 'Pincel' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Goma' }));
    expect(within(toolbar).getByRole('button', { name: 'Goma' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(toolbar).getByRole('button', { name: 'Pincel' }).getAttribute('aria-pressed')).toBe('false');
    // B-13: 12 colores de la paleta y el selector del sistema.
    expect(within(within(toolbar).getByRole('group', { name: 'Color' })).getAllByRole('button')).toHaveLength(12);
    expect(within(toolbar).getByLabelText('Otro color')).toBeTruthy();
    expect(within(toolbar).getByRole('slider', { name: /Grosor/ })).toBeTruthy();
    expect(within(toolbar).getByRole('combobox', { name: /Letra/ })).toBeTruthy();
    // B-18: sin pasos, no hay nada que deshacer.
    expect(within(toolbar).getByRole<HTMLButtonElement>('button', { name: /Deshacer/ }).disabled).toBe(true);
    expect(within(toolbar).getByRole('button', { name: 'Copiar imagen' })).toBeTruthy();
    expect(screen.getByRole('application', { name: 'Lienzo de la pizarra' })).toBeTruthy();
    expect(screen.queryByRole('toolbar', { name: 'Formato' })).toBeNull();
  });

  it('B-30 al guardar, la pestaña recibe antes lo que el lienzo aún no había entregado', async () => {
    const tab = await openBoard('edit');
    mocked.saveNote.mockResolvedValue(board({ content: PNG_B, version: 3 }));
    setFlusher(tab.id, () => useTabs.getState().edit(tab.id, { content: PNG_B }));
    await act(async () => {
      await useTabs.getState().saveNow(tab.id);
    });
    expect(mocked.saveNote).toHaveBeenCalledWith('b1', 'Esquema', PNG_B, 2);
    expect(useTabs.getState().tabs[0].status).toBe('saved');
    setFlusher(tab.id, null);
  });

  it('B-32 el historial de una pizarra muestra miniaturas', async () => {
    mocked.versions.mockResolvedValue([
      { id: 9, title: 'Esquema', content: PNG_B, savedAt: '2026-10-22T10:00:00Z' },
      { id: 8, title: 'Esquema', content: '', savedAt: '2026-10-22T09:00:00Z' },
    ]);
    await useTabs.getState().open('b1', { note: board() });
    render(<HistoryDialog tab={useTabs.getState().tabs[0]} onClose={() => {}} />);
    await act(async () => {});
    const options = screen.getAllByRole('option');
    expect(options[0].querySelector<HTMLImageElement>('img.history-thumb')!.src).toBe(PNG_B);
    expect(options[1].textContent).toContain('(vacía)');
    expect(screen.getByRole<HTMLImageElement>('img', { name: /Pizarra del/ }).src).toBe(PNG_B);
  });
});

describe('B-40 a B-43 pizarras en notas Markdown', () => {
  it('B-40 «![[» ofrece solo pizarras e inserta la imagen; «[[» sigue ofreciendo todas', () => {
    const doc = 'Ver ![[esq';
    const state = EditorState.create({ doc, selection: { anchor: doc.length } });
    const result = noteLinkSource(() => useTree.getState().nodes)(new CompletionContext(state, doc.length, false));
    expect(result!.options.map((o) => o.label)).toEqual(['Esquema']);
    const view = new EditorView({ state, parent: document.body });
    const apply = result!.options[0].apply as (v: EditorView, c: unknown, from: number, to: number) => void;
    apply(view, result!.options[0], result!.from, doc.length);
    expect(view.state.doc.toString()).toBe('Ver ![Esquema](litedd://note/b1)');
    view.destroy();

    const plain = EditorState.create({ doc: '[[', selection: { anchor: 2 } });
    const all = noteLinkSource(() => useTree.getState().nodes)(new CompletionContext(plain, 2, false));
    expect(all!.options.map((o) => o.label)).toEqual(['Esquema', 'Informe', 'Vacía']);
  });

  it('B-41 muestra la última versión guardada y cambia al guardar la pizarra en otra pestaña', async () => {
    mocked.getNote.mockResolvedValue(board());
    render(<MarkdownView content="Antes ![Esquema](litedd://note/b1)" onOpenNote={() => {}} />);
    await act(async () => {});
    expect(mocked.getNote).toHaveBeenCalledWith('b1');
    expect(screen.getByRole<HTMLImageElement>('img', { name: 'Esquema' }).src).toBe(PNG_A);

    mocked.saveNote.mockResolvedValue(board({ content: PNG_B, version: 3 }));
    await useTabs.getState().open('b1', { note: board(), mode: 'edit' });
    const tab = useTabs.getState().tabs[0];
    useTabs.getState().edit(tab.id, { content: PNG_B });
    await act(async () => {
      await useTabs.getState().saveNow(tab.id);
    });
    expect(screen.getByRole<HTMLImageElement>('img', { name: 'Esquema' }).src).toBe(PNG_B);
  });

  it('B-42 el clic abre el visor y el clic central abre la pizarra en otra pestaña', async () => {
    mocked.getNote.mockResolvedValue(board());
    const onOpenNote = vi.fn();
    render(<MarkdownView content="![Esquema](litedd://note/b1)" onOpenNote={onOpenNote} />);
    await act(async () => {});
    const img = screen.getByRole('img', { name: 'Esquema' });
    fireEvent(img, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(onOpenNote).toHaveBeenCalledWith('b1', true);
    fireEvent.click(img);
    expect(screen.getByRole('dialog', { name: 'Imagen: Esquema' })).toBeTruthy();
  });

  it('B-43 avisos para una pizarra borrada, una nota que no es pizarra y una pizarra vacía', async () => {
    mocked.getNote.mockImplementation(async (id: string) => (id === 'e1' ? board({ id: 'e1', title: 'Vacía', content: '' }) : board()));
    const { container } = render(
      <MarkdownView
        content={'![Borrada](litedd://note/gone) ![Informe](litedd://note/m1) ![Vacía](litedd://note/e1)'}
        onOpenNote={() => {}}
      />,
    );
    await act(async () => {});
    const broken = [...container.querySelectorAll<HTMLElement>('.board-broken')];
    expect(broken.map((b) => [b.textContent, b.title])).toEqual([
      ['Borrada', 'La pizarra no existe o está en la papelera'],
      ['Informe', 'La nota no es una pizarra'],
    ]);
    expect(container.querySelector('.board-empty')!.textContent).toBe('Pizarra vacía');
    // Solo se piden las pizarras que siguen en el árbol.
    expect(mocked.getNote.mock.calls.map((c) => c[0])).toEqual(['e1']);
  });
});
