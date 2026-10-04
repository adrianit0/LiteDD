import { childrenOf } from './tree';
import type { TreeNode } from './types';

/** Destino de un movimiento: posición entre las nuevas hermanas, sin contar la propia nota. */
export interface Destination {
  parentId: string | null;
  position: number;
}

export type DropZone = 'before' | 'after' | 'inside';
export type KeyboardMove = 'up' | 'down' | 'left' | 'right';

/** Identificadores de todas las descendientes de una nota. */
export function descendantIds(nodes: TreeNode[], id: string): Set<string> {
  const children = childrenOf(nodes);
  const out = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const n = stack.pop()!;
    out.add(n.id);
    stack.push(...(children.get(n.id) ?? []));
  }
  return out;
}

/** Zona de soltado según la altura relativa del puntero sobre el nodo (N-60). */
export function zoneAt(ratio: number): DropZone {
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'inside';
}

/**
 * N-60, N-62: adónde va una nota soltada sobre otra. null si el destino no es válido
 * (sobre sí misma o una descendiente) o si no cambia nada.
 */
export function dropDestination(nodes: TreeNode[], dragId: string, targetId: string, zone: DropZone): Destination | null {
  if (dragId === targetId || descendantIds(nodes, dragId).has(targetId)) return null;
  const drag = nodes.find((n) => n.id === dragId);
  const target = nodes.find((n) => n.id === targetId);
  if (!drag || !target) return null;
  const children = childrenOf(nodes);

  let dest: Destination;
  if (zone === 'inside') {
    const kids = (children.get(target.id) ?? []).filter((n) => n.id !== dragId);
    dest = { parentId: target.id, position: kids.length };
  } else {
    const siblings = (children.get(target.parentId) ?? []).filter((n) => n.id !== dragId);
    const index = siblings.findIndex((n) => n.id === target.id);
    dest = { parentId: target.parentId, position: zone === 'before' ? index : index + 1 };
  }
  return isNoOp(drag, dest) ? null : dest;
}

/** N-63: Alt+↑ y Alt+↓ entre hermanas; Alt+→ hija de la anterior; Alt+← al nivel de su madre, justo después. */
export function keyboardDestination(nodes: TreeNode[], id: string, move: KeyboardMove): Destination | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const children = childrenOf(nodes);
  const siblings = children.get(node.parentId) ?? [];
  const index = siblings.findIndex((n) => n.id === id);

  switch (move) {
    case 'up':
      return index > 0 ? { parentId: node.parentId, position: index - 1 } : null;
    case 'down':
      return index < siblings.length - 1 ? { parentId: node.parentId, position: index + 1 } : null;
    case 'right': {
      const previous = siblings[index - 1];
      if (!previous) return null;
      return { parentId: previous.id, position: (children.get(previous.id) ?? []).length };
    }
    case 'left': {
      if (node.parentId === null) return null;
      const parent = nodes.find((n) => n.id === node.parentId);
      if (!parent) return null;
      const parentSiblings = children.get(parent.parentId) ?? [];
      return { parentId: parent.parentId, position: parentSiblings.findIndex((n) => n.id === parent.id) + 1 };
    }
  }
}

/** N-64: destinos posibles de «Mover a…», sin la propia nota ni sus descendientes. */
export function moveCandidates(nodes: TreeNode[], id: string): TreeNode[] {
  const excluded = descendantIds(nodes, id);
  excluded.add(id);
  return nodes.filter((n) => !excluded.has(n.id));
}

/** Texto comparable sin mayúsculas ni acentos. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function isNoOp(node: TreeNode, dest: Destination): boolean {
  return node.parentId === dest.parentId && node.position === dest.position;
}

/** N-65: tiempo sobre un nodo plegado para desplegarlo durante un arrastre. */
export const EXPAND_ON_HOVER_MS = 600;

/**
 * N-65: despliega un nodo plegado cuando el arrastre se mantiene sobre él. over() se llama en cada
 * movimiento; solo cuenta el tiempo mientras el nodo bajo el puntero no cambia.
 */
export function createHoverExpander(expand: (id: string) => void, delay = EXPAND_ON_HOVER_MS) {
  let current: { id: string; timer: ReturnType<typeof setTimeout> | undefined } | null = null;
  return {
    over(id: string | null, collapsedWithChildren: boolean) {
      if (current?.id === id) return;
      this.clear();
      if (id === null) return;
      current = { id, timer: collapsedWithChildren ? setTimeout(() => expand(id), delay) : undefined };
    },
    clear() {
      if (current?.timer) clearTimeout(current.timer);
      current = null;
    },
  };
}
