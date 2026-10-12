import {
  EXPAND_ON_HOVER_MS,
  createHoverExpander,
  descendantIds,
  dropDestination,
  keyboardDestination,
  moveCandidates,
  normalize,
  zoneAt,
} from './treeOps';
import type { TreeNode } from './types';

const n = (id: string, parentId: string | null, position: number): TreeNode => ({
  id,
  parentId,
  position,
  type: 'md',
  title: id,
  description: '',
  favorite: false,
  tags: [],
});

// A(A1(A11(A111)), A2), B, C
const nodes = [
  n('A', null, 0),
  n('A1', 'A', 0),
  n('A11', 'A1', 0),
  n('A111', 'A11', 0),
  n('A2', 'A', 1),
  n('B', null, 1),
  n('C', null, 2),
];

describe('N-60 zonas de soltado', () => {
  it('antes, dentro y después según la altura del puntero', () => {
    expect(zoneAt(0.1)).toBe('before');
    expect(zoneAt(0.5)).toBe('inside');
    expect(zoneAt(0.9)).toBe('after');
  });

  it('antes y después de una hermana', () => {
    expect(dropDestination(nodes, 'C', 'A', 'before')).toEqual({ parentId: null, position: 0 });
    expect(dropDestination(nodes, 'A', 'C', 'after')).toEqual({ parentId: null, position: 2 });
    expect(dropDestination(nodes, 'A', 'B', 'after')).toEqual({ parentId: null, position: 1 });
  });

  it('dentro: hija al final', () => {
    expect(dropDestination(nodes, 'C', 'A', 'inside')).toEqual({ parentId: 'A', position: 2 });
    expect(dropDestination(nodes, 'A1', 'A', 'inside')).toEqual({ parentId: 'A', position: 1 });
  });

  it('a otro nivel', () => {
    expect(dropDestination(nodes, 'B', 'A11', 'after')).toEqual({ parentId: 'A1', position: 1 });
  });

  it('sin cambios devuelve null', () => {
    expect(dropDestination(nodes, 'A', 'B', 'before')).toBeNull();
    expect(dropDestination(nodes, 'A2', 'A', 'inside')).toBeNull();
  });
});

describe('N-62 no se puede soltar sobre sí misma ni sobre una descendiente', () => {
  it.each(['before', 'after', 'inside'] as const)('zona %s', (zone) => {
    expect(dropDestination(nodes, 'A', 'A', zone)).toBeNull();
    expect(dropDestination(nodes, 'A', 'A1', zone)).toBeNull();
    expect(dropDestination(nodes, 'A', 'A111', zone)).toBeNull();
  });

  it('N-61 las descendientes incluyen todos los niveles', () => {
    expect([...descendantIds(nodes, 'A')].sort()).toEqual(['A1', 'A11', 'A111', 'A2']);
  });
});

describe('N-63 mover con el teclado', () => {
  it('Alt+↑ y Alt+↓ entre hermanas', () => {
    expect(keyboardDestination(nodes, 'B', 'up')).toEqual({ parentId: null, position: 0 });
    expect(keyboardDestination(nodes, 'B', 'down')).toEqual({ parentId: null, position: 2 });
    expect(keyboardDestination(nodes, 'A', 'up')).toBeNull();
    expect(keyboardDestination(nodes, 'C', 'down')).toBeNull();
  });

  it('Alt+→ la hace hija de la hermana anterior, al final', () => {
    expect(keyboardDestination(nodes, 'B', 'right')).toEqual({ parentId: 'A', position: 2 });
    expect(keyboardDestination(nodes, 'A', 'right')).toBeNull();
  });

  it('Alt+← la saca al nivel de su madre, justo después', () => {
    expect(keyboardDestination(nodes, 'A1', 'left')).toEqual({ parentId: null, position: 1 });
    expect(keyboardDestination(nodes, 'A11', 'left')).toEqual({ parentId: 'A', position: 1 });
    expect(keyboardDestination(nodes, 'A', 'left')).toBeNull();
  });
});

describe('N-64 «Mover a…»', () => {
  it('excluye la nota y sus descendientes', () => {
    expect(moveCandidates(nodes, 'A1').map((x) => x.id)).toEqual(['A', 'A2', 'B', 'C']);
  });

  it('la búsqueda no distingue mayúsculas ni acentos', () => {
    expect(normalize('Guía DE Uso')).toBe('guia de uso');
  });
});

describe('N-65 desplegar al mantener el arrastre', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('despliega un nodo plegado tras 600 ms sobre él', () => {
    const expand = vi.fn();
    const hover = createHoverExpander(expand);
    hover.over('A', true);
    vi.advanceTimersByTime(EXPAND_ON_HOVER_MS - 1);
    hover.over('A', true);
    expect(expand).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expand).toHaveBeenCalledWith('A');
  });

  it('no despliega si el puntero se va antes o el nodo no está plegado', () => {
    const expand = vi.fn();
    const hover = createHoverExpander(expand);
    hover.over('A', true);
    vi.advanceTimersByTime(300);
    hover.over('B', false);
    vi.advanceTimersByTime(EXPAND_ON_HOVER_MS * 2);
    hover.over('C', true);
    hover.clear();
    vi.advanceTimersByTime(EXPAND_ON_HOVER_MS * 2);
    expect(expand).not.toHaveBeenCalled();
  });
});

describe('M-20 M-22 notas XML MyBatis en el árbol', () => {
  const xml: TreeNode = { ...n('X', null, 3), type: 'xml' };
  const child: TreeNode = { ...n('X1', 'X', 0), type: 'sql', statementId: 'byAuthor', statementKind: 'select' };
  const all = [...nodes, xml, child];

  it('no se suelta nada dentro de la nota XML ni de sus hijas', () => {
    expect(dropDestination(all, 'B', 'X', 'inside')).toBeNull();
    expect(dropDestination(all, 'B', 'X1', 'before')).toBeNull();
    expect(dropDestination(all, 'B', 'X1', 'inside')).toBeNull();
    // Antes o después de la nota XML, sí.
    expect(dropDestination(all, 'B', 'X', 'after')).toEqual({ parentId: null, position: 3 });
  });

  it('las hijas generadas no se mueven; la nota XML sí', () => {
    expect(dropDestination(all, 'X1', 'B', 'after')).toBeNull();
    expect(keyboardDestination(all, 'X1', 'left')).toBeNull();
    expect(dropDestination(all, 'X', 'A', 'inside')).toEqual({ parentId: 'A', position: 2 });
  });

  it('Alt+→ no mete una nota dentro de la nota XML anterior', () => {
    const after: TreeNode = n('D', null, 4);
    expect(keyboardDestination([...all, after], 'D', 'right')).toBeNull();
    expect(keyboardDestination([...all, after], 'D', 'up')).toEqual({ parentId: null, position: 3 });
  });

  it('«Mover a…» no ofrece la nota XML ni sus hijas como destino', () => {
    const ids = moveCandidates(all, 'B').map((x) => x.id);
    expect(ids).not.toContain('X');
    expect(ids).not.toContain('X1');
    expect(ids).toContain('A');
  });
});
