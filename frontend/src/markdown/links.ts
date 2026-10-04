import { normalize } from '../treeOps';
import type { TreeNode } from '../types';

export const NOTE_PREFIX = 'litedd://note/';
export const ATTACHMENT_PREFIX = 'litedd://attachment/';

/** N-90: [Título](litedd://note/<id>), con los corchetes del título escapados. */
export function noteLink(node: Pick<TreeNode, 'id' | 'title'>): string {
  const title = node.title.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  return `[${title}](${NOTE_PREFIX}${node.id})`;
}

/** Notas que encajan con lo escrito tras «[[», sin distinguir mayúsculas ni acentos. */
export function linkCandidates(nodes: TreeNode[], typed: string, limit = 50): TreeNode[] {
  const q = normalize(typed.trim());
  const matches = nodes.filter((n) => q === '' || normalize(n.title).includes(q));
  // Primero las que empiezan por lo escrito.
  matches.sort((a, b) => Number(!normalize(a.title).startsWith(q)) - Number(!normalize(b.title).startsWith(q)) || a.title.localeCompare(b.title));
  return matches.slice(0, limit);
}

/** N-92: identificadores de los adjuntos citados en un texto. */
export function attachmentIds(source: string): string[] {
  const ids = new Set<string>();
  for (const m of source.matchAll(/litedd:\/\/attachment\/([0-9a-f-]{36})/g)) ids.add(m[1]);
  return [...ids];
}

/** N-92: tipos y tamaño admitidos al pegar o arrastrar. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function imageProblem(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Solo se admiten imágenes PNG, JPEG, GIF y WebP';
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen supera el máximo de 10 MB';
  return null;
}
