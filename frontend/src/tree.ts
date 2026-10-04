import type { TreeNode } from './types';

export interface VisibleRow {
  node: TreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

/** Hijas de cada nota (null = raíz), ordenadas por posición. */
export function childrenOf(nodes: TreeNode[]): Map<string | null, TreeNode[]> {
  const map = new Map<string | null, TreeNode[]>();
  for (const n of nodes) {
    const list = map.get(n.parentId) ?? [];
    list.push(n);
    map.set(n.parentId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position);
  return map;
}

/** Filas visibles del árbol en orden, omitiendo las hijas de los nodos plegados (N-01). */
export function visibleRows(nodes: TreeNode[], collapsed: ReadonlySet<string>): VisibleRow[] {
  const children = childrenOf(nodes);
  const rows: VisibleRow[] = [];
  // Recorrido iterativo: el árbol no tiene límite de profundidad (N-02).
  const stack: { node: TreeNode; depth: number }[] = [];
  const roots = children.get(null) ?? [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ node: roots[i], depth: 0 });
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    const kids = children.get(node.id) ?? [];
    const expanded = kids.length > 0 && !collapsed.has(node.id);
    rows.push({ node, depth, hasChildren: kids.length > 0, expanded });
    if (expanded) {
      for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], depth: depth + 1 });
    }
  }
  return rows;
}

/** Antepasados de una nota, de la raíz a la madre. */
export function ancestorsOf(nodes: TreeNode[], id: string): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: TreeNode[] = [];
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null) {
    const node = byId.get(current);
    if (!node || path.includes(node)) break;
    path.unshift(node);
    current = node.parentId;
  }
  return path;
}
