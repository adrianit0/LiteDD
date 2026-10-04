import { descendantIds, dropDestination, keyboardDestination, moveCandidates, normalize, zoneAt } from './treeOps';
import type { TreeNode } from './types';

const n = (id: string, parentId: string | null, position: number): TreeNode => ({
  id,
  parentId,
  position,
  type: 'md',
  title: id,
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
