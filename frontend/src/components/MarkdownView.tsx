import { useMemo, type MouseEvent } from 'react';
import { renderMarkdown } from '../markdown/render';

interface Props {
  content: string;
  /** newTab: clic central (P-03). */
  onOpenNote: (id: string, newTab: boolean) => void;
}

/** N-11, N-30 a N-33: vista renderizada de una nota Markdown. */
export function MarkdownView({ content, onOpenNote }: Props) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // N-31: las casillas de tareas no se pueden marcar en consulta.
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      e.preventDefault();
      return;
    }
    const a = target.closest('a');
    if (!a) return;
    e.preventDefault();
    const noteId = a.dataset.noteId;
    if (noteId) {
      onOpenNote(noteId, false);
      return;
    }
    // N-32: los enlaces externos se abren en el navegador.
    const href = a.getAttribute('href');
    if (href && /^(https?:|mailto:)/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
  };

  // N-32, P-03: clic central sobre un enlace a nota abre una pestaña nueva.
  const onAuxClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (e.button !== 1 || !a) return;
    e.preventDefault();
    if (a.dataset.noteId) onOpenNote(a.dataset.noteId, true);
  };

  if (content.trim() === '') {
    return <p className="muted view-empty">Nota vacía. Pulsa «Editar» o Ctrl+E para escribir.</p>;
  }
  return <div className="markdown" onClick={onClick} onAuxClick={onAuxClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
