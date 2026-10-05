import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { api } from '../api';
import { SearchBox, SearchResults } from './SearchPanel';
import { QuickSearch } from './QuickSearch';
import { FavoriteButton, TagEditor } from './NoteMeta';
import { HistoryDialog } from './HistoryDialog';
import { MarkdownView } from './MarkdownView';
import { useSearch, SEARCH_DELAY } from '../stores/searchStore';
import { useTree } from '../stores/treeStore';
import { useTabs } from '../stores/tabsStore';
import { useUi } from '../stores/uiStore';
import { useAttachments } from '../markdown/attachments';
import { NO_FILTERS } from '../search';
import { imageDrop, noteLinkSource } from '../editor/noteExtensions';
import { prepareSvg } from '../markdown/mermaid';
import type { Note, TreeNode } from '../types';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      search: vi.fn(),
      tags: vi.fn(),
      tree: vi.fn(),
      getNote: vi.fn(),
      saveNote: vi.fn(),
      setFavorite: vi.fn(),
      setTags: vi.fn(),
      versions: vi.fn(),
      restoreVersion: vi.fn(),
      putSession: vi.fn(),
      attachmentDataUrl: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

const node = (id: string, title: string, parentId: string | null = null): TreeNode => ({
  id,
  parentId,
  position: 0,
  type: 'md',
  title,
  description: '',
  favorite: false,
  tags: [],
});

const note = (over: Partial<Note> = {}): Note => ({
  ...node('n1', 'Préstamos'),
  content: 'texto',
  version: 3,
  createdAt: '2026-10-04T08:00:00Z',
  updatedAt: '2026-10-04T08:00:00Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.tree.mockResolvedValue([]);
  mocked.putSession.mockResolvedValue({ tabs: [] });
  mocked.tags.mockResolvedValue([{ name: 'demo', count: 2 }, { name: 'libros', count: 1 }]);
  useSearch.setState({ query: '', filters: NO_FILTERS, filtersOpen: false, results: [], loading: false, error: null });
  useTree.setState({ nodes: [node('root', 'Guía'), node('n1', 'Préstamos', 'root')] });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
});

describe('búsqueda', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('N-70 busca mientras se escribe, con un retraso corto', async () => {
    mocked.search.mockResolvedValue([]);
    render(<SearchBox />);
    const box = screen.getByRole('searchbox', { name: 'Buscar en las notas' });
    fireEvent.change(box, { target: { value: 'pre' } });
    fireEvent.change(box, { target: { value: 'prest' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEARCH_DELAY + 10);
    });
    expect(mocked.search).toHaveBeenCalledTimes(1);
    expect(mocked.search).toHaveBeenCalledWith('q=prest');
  });

  it('N-72 los filtros se combinan en la petición', async () => {
    mocked.search.mockResolvedValue([]);
    render(<SearchBox />);
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    await act(async () => {});
    fireEvent.change(screen.getByRole('combobox', { name: 'Tipo' }), { target: { value: 'sql' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Solo favoritas' }));
    fireEvent.click(screen.getByRole('button', { name: /demo/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEARCH_DELAY + 10);
    });
    const params = new URLSearchParams(mocked.search.mock.lastCall![0]);
    expect([params.get('type'), params.get('favorite'), params.get('tags')]).toEqual(['sql', 'true', 'demo']);
  });

  it('N-71 lista plana con título, ruta y fragmento resaltado', () => {
    useSearch.setState({
      query: 'tabla',
      results: [
        {
          id: 'n1',
          parentId: 'root',
          type: 'md',
          title: 'Préstamos',
          favorite: true,
          updatedAt: '',
          fragment: 'la \u0002tabla\u0003 loan',
          titleMarked: null,
        },
      ],
    });
    render(<SearchResults />);
    const hit = screen.getByRole('button', { name: /Préstamos/ });
    expect(hit.textContent).toContain('Guía');
    expect(within(hit).getByText('tabla').tagName).toBe('MARK');
  });
});

describe('N-73 búsqueda rápida', () => {
  it('filtra por título sin acentos e Intro abre la nota', async () => {
    mocked.getNote.mockResolvedValue(note());
    useUi.setState({ quickSearchOpen: true });
    render(<QuickSearch />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Título de la nota' }), { target: { value: 'presta' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Préstamos')]);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    });
    expect(useUi.getState().quickSearchOpen).toBe(false);
    expect(mocked.getNote).toHaveBeenCalledWith('n1');
  });
});

describe('etiquetas y favoritas', () => {
  it('N-81 la estrella marca y desmarca la favorita', async () => {
    mocked.setFavorite.mockResolvedValue(note({ favorite: true }));
    render(<FavoriteButton note={note()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Marcar como favorita' }));
    });
    // El árbol tiene la nota sin favorita: se pide marcarla.
    expect(mocked.setFavorite).toHaveBeenCalledWith('n1', true);
  });

  it('N-80 Intro añade una etiqueta, el aspa la quita y hay autocompletado', async () => {
    mocked.setTags.mockResolvedValue(note({ tags: ['demo', 'nueva'] }));
    render(<TagEditor note={note({ tags: ['demo'] })} />);
    const input = screen.getByRole('combobox', { name: 'Añadir etiqueta' });
    await act(async () => {
      fireEvent.focus(input);
    });
    expect([...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(['libros']);
    fireEvent.change(input, { target: { value: 'nueva' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(mocked.setTags).toHaveBeenLastCalledWith('n1', ['demo', 'nueva']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Quitar la etiqueta demo' }));
    });
    expect(mocked.setTags).toHaveBeenLastCalledWith('n1', []);
  });
});

describe('historial', () => {
  it('N-45 lista versiones con fecha y vista previa, y restaura una', async () => {
    mocked.versions.mockResolvedValue([
      { id: 9, title: 'Préstamos', content: 'versión nueva', savedAt: '2026-10-04T10:00:00Z' },
      { id: 8, title: 'Préstamos', content: 'versión vieja', savedAt: '2026-10-04T09:00:00Z' },
    ]);
    mocked.restoreVersion.mockResolvedValue(note({ content: 'versión vieja', version: 4 }));
    await useTabs.getState().open('n1', { note: note() });
    const tab = useTabs.getState().tabs[0];
    const onClose = vi.fn();
    render(<HistoryDialog tab={tab} onClose={onClose} />);
    await act(async () => {});
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[1].textContent).toContain('versión vieja');
    fireEvent.click(within(options[1]).getByRole('button'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restaurar esta versión' }));
    });
    expect(mocked.restoreVersion).toHaveBeenCalledWith('n1', 8, 3);
    expect(useTabs.getState().tabs[0].content).toBe('versión vieja');
    expect(onClose).toHaveBeenCalled();
  });

  it('N-44 al salir del modo edición se pide guardar una versión', async () => {
    mocked.saveNote.mockResolvedValue(note());
    await useTabs.getState().open('n1', { note: note(), mode: 'edit' });
    await useTabs.getState().toggleMode(useTabs.getState().tabs[0].id);
    expect(mocked.saveNote).toHaveBeenCalledWith('n1', 'Préstamos', 'texto', 3, { snapshot: true });
  });
});

describe('enlaces entre notas', () => {
  it('N-90 «[[» ofrece las notas e inserta el enlace', () => {
    const doc = 'Ver [[prest';
    const state = EditorState.create({ doc, selection: { anchor: doc.length } });
    const result = noteLinkSource(() => useTree.getState().nodes)(new CompletionContext(state, doc.length, false));
    expect(result!.options.map((o) => o.label)).toEqual(['Préstamos']);
    const view = new EditorView({ state, parent: document.body });
    const apply = result!.options[0].apply as (v: EditorView, c: unknown, from: number, to: number) => void;
    apply(view, result!.options[0], result!.from, doc.length);
    expect(view.state.doc.toString()).toBe('Ver [Préstamos](litedd://note/n1)');
    view.destroy();
  });

  it('N-90 sin «[[» no hay sugerencias', () => {
    const state = EditorState.create({ doc: 'texto [x]', selection: { anchor: 9 } });
    expect(noteLinkSource(() => [])(new CompletionContext(state, 9, false))).toBeNull();
  });

  it('N-91 un enlace a una nota que no está en el árbol se ve tachado', () => {
    render(<MarkdownView content="[sí](litedd://note/n1) [no](litedd://note/borrada)" onOpenNote={() => {}} />);
    expect(screen.getByRole('link', { name: 'sí' }).className).not.toContain('broken');
    expect(screen.getByRole('link', { name: 'no' }).className).toContain('broken');
  });
});

describe('imágenes', () => {
  it('N-92 pegar una imagen la sube e inserta la referencia', async () => {
    const upload = vi.fn().mockResolvedValue('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90');
    const view = new EditorView({ state: EditorState.create({ doc: 'Foto: ', selection: { anchor: 6 }, extensions: [imageDrop(upload)] }), parent: document.body });
    const file = new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
    await act(async () => {
      view.contentDOM.dispatchEvent(event);
    });
    expect(upload).toHaveBeenCalledWith(file);
    expect(view.state.doc.toString()).toBe('Foto: ![](litedd://attachment/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90)');
    view.destroy();
  });

  it('N-93 la vista descarga el adjunto con el token y lo muestra como URL data:', async () => {
    const id = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
    useAttachments.setState({ urls: {}, failed: {} });
    mocked.attachmentDataUrl.mockResolvedValue('data:image/png;base64,AAAA');
    render(<MarkdownView content={`![foto](litedd://attachment/${id})`} onOpenNote={() => {}} />);
    await act(async () => {});
    expect(mocked.attachmentDataUrl).toHaveBeenCalledWith(id);
    expect(screen.getByRole('img', { name: 'foto' }).getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });
});

describe('Mermaid', () => {
  it('N-30 S-15 ADR-0016 el SVG se sanea y sus estilos salen del marcado', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" style="max-width: 200px"><style>.node{fill:red}</style>' +
      '<g class="node" style="opacity: 0.5"><rect width="10" height="10"/></g><script>alert(1)</script>' +
      '<a href="javascript:alert(1)"><text>x</text></a></svg>';
    const prepared = prepareSvg(svg)!;
    expect(prepared.css).toContain('.node{fill:red}');
    expect(prepared.root.querySelector('style')).toBeNull();
    expect(prepared.root.querySelector('script')).toBeNull();
    expect(prepared.root.querySelector('[style]')).toBeNull();
    expect(prepared.root.getAttribute('style')).toBeNull();
    expect(prepared.inline.map(([, s]) => s)).toEqual(['max-width: 200px', 'opacity: 0.5']);
    expect(prepared.root.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript');
  });
});
