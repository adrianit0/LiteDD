import type { NoteType } from '../types';

/**
 * W-19: soltar una nota del árbol sobre un workflow en edición (ADR-0041). El árbol usa dnd-kit y el lienzo está fuera
 * de su contexto: al soltar fuera del árbol, el árbol busca bajo el puntero un lienzo en edición y le envía este
 * evento DOM.
 */
export const NOTE_DROP = 'litedd-note-drop';

export interface NoteDropDetail {
  noteId: string;
  type: NoteType;
  clientX: number;
  clientY: number;
}

/** Solo las notas HTTP y SQL se convierten en nodos. */
export function droppable(type: NoteType): type is 'http' | 'sql' {
  return type === 'http' || type === 'sql';
}

/** El lienzo en edición que hay bajo el puntero, si lo hay. */
function canvasAt(clientX: number, clientY: number): HTMLElement | null {
  const elements = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(clientX, clientY) : [];
  for (const el of elements) {
    const canvas = el.closest<HTMLElement>('.wf-canvas.editable');
    if (canvas) return canvas;
  }
  return null;
}

let marked: HTMLElement | null = null;

/** Mientras se arrastra, el lienzo que recibiría la nota se resalta. null deja de resaltar. */
export function markDropTarget(point: { clientX: number; clientY: number; type: NoteType } | null): void {
  const canvas = point && droppable(point.type) ? canvasAt(point.clientX, point.clientY) : null;
  if (canvas === marked) return;
  marked?.classList.remove('drop-target');
  canvas?.classList.add('drop-target');
  marked = canvas;
}

/** Envía la nota al lienzo en edición bajo el puntero. Devuelve si había uno que la acepte. */
export function dropNote(detail: NoteDropDetail): boolean {
  markDropTarget(null);
  if (!droppable(detail.type)) return false;
  const canvas = canvasAt(detail.clientX, detail.clientY);
  if (!canvas) return false;
  canvas.dispatchEvent(new CustomEvent<NoteDropDetail>(NOTE_DROP, { detail }));
  return true;
}
