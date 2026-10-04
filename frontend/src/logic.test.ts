import { ancestorsOf, visibleRows } from './tree';
import { matchShortcut, type KeyLike } from './keyboard';
import { formatDateTime, formatDecimal } from './format';
import type { TreeNode } from './types';

const node = (id: string, parentId: string | null, position: number, type: 'md' | 'sql' = 'md'): TreeNode => ({
  id,
  parentId,
  position,
  type,
  title: id,
  favorite: false,
  tags: [],
});

const nodes = [node('b', null, 1), node('a', null, 0), node('a2', 'a', 1, 'sql'), node('a1', 'a', 0), node('a1x', 'a1', 0)];

describe('árbol', () => {
  it('N-01 muestra las notas en orden y oculta las hijas de los nodos plegados', () => {
    expect(visibleRows(nodes, new Set()).map((r) => r.node.id)).toEqual(['a', 'a1', 'a1x', 'a2', 'b']);
    const folded = visibleRows(nodes, new Set(['a1']));
    expect(folded.map((r) => r.node.id)).toEqual(['a', 'a1', 'a2', 'b']);
    expect(folded[1]).toMatchObject({ hasChildren: true, expanded: false, depth: 1 });
    expect(folded[3]).toMatchObject({ hasChildren: false, expanded: false });
  });

  it('N-02 admite cualquier profundidad', () => {
    const deep = [node('n0', null, 0)];
    for (let i = 1; i < 5000; i++) deep.push(node(`n${i}`, `n${i - 1}`, 0, i % 2 ? 'sql' : 'md'));
    const rows = visibleRows(deep, new Set());
    expect(rows).toHaveLength(5000);
    expect(rows[4999].depth).toBe(4999);
  });

  it('U-05 la ruta de una nota va de la raíz a la madre', () => {
    expect(ancestorsOf(nodes, 'a1x').map((n) => n.id)).toEqual(['a', 'a1']);
    expect(ancestorsOf(nodes, 'a')).toEqual([]);
  });
});

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('atajos', () => {
  it('N-12 Ctrl+E cambia de modo y N-41 Ctrl+S guarda', () => {
    expect(matchShortcut(key('e', { ctrlKey: true }))).toBe('toggleMode');
    expect(matchShortcut(key('s', { ctrlKey: true }))).toBe('save');
  });

  it('N-05 Alt+N y Alt+Mayús+N crean notas; U-01 Alt+B oculta el panel', () => {
    expect(matchShortcut(key('n', { altKey: true }))).toBe('newMarkdown');
    expect(matchShortcut(key('N', { altKey: true, shiftKey: true }))).toBe('newSql');
    expect(matchShortcut(key('b', { altKey: true }))).toBe('toggleSidebar');
  });

  it('P-04 Alt+W cierra la pestaña; Alt+RePág y Alt+AvPág cambian de pestaña', () => {
    expect(matchShortcut(key('w', { altKey: true }))).toBe('closeTab');
    expect(matchShortcut(key('PageUp', { altKey: true }))).toBe('previousTab');
    expect(matchShortcut(key('PageDown', { altKey: true }))).toBe('nextTab');
  });

  it('U-09 no usa atajos reservados del navegador', () => {
    for (const k of ['n', 't', 'w', 'Tab']) {
      expect(matchShortcut(key(k, { ctrlKey: true }))).toBeNull();
      expect(matchShortcut(key(k, { ctrlKey: true, shiftKey: true }))).toBeNull();
    }
  });
});

describe('U-03 formatos en español', () => {
  it('fechas dd/MM/yyyy HH:mm', () => {
    const d = new Date(2026, 9, 4, 9, 5);
    expect(formatDateTime(d.toISOString())).toBe('04/10/2026 09:05');
  });

  it('coma decimal', () => {
    expect(formatDecimal(1.236, 2)).toBe('1,24');
  });
});
