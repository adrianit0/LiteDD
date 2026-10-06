import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { renderMarkdown } from '../markdown/render';
import { attachmentIds } from '../markdown/links';
import { useAttachments } from '../markdown/attachments';
import { renderMermaidBlocks } from '../markdown/mermaid';
import { useTree } from '../stores/treeStore';
import { copyText } from '../clipboard';

/** N-34: copia el código de un bloque, sin los números de línea. */
function copyCode(button: Element) {
  const code = button.closest('.code-block')?.querySelector('pre.hljs code')?.textContent ?? '';
  return copyText(code.replace(/\n$/, ''), 'Código copiado');
}

interface Props {
  content: string;
  /** newTab: clic central (P-03). */
  onOpenNote: (id: string, newTab: boolean) => void;
}

/** N-11, N-30 a N-33, N-91 a N-93: vista renderizada de una nota Markdown. */
export function MarkdownView({ content, onOpenNote }: Props) {
  const nodes = useTree((s) => s.nodes);
  const urls = useAttachments((s) => s.urls);
  const container = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => attachmentIds(content), [content]);

  useEffect(() => {
    if (ids.length > 0) useAttachments.getState().load(ids);
  }, [ids]);

  const html = useMemo(() => {
    const active = new Set(nodes.map((n) => n.id));
    return renderMarkdown(content, { noteExists: (id) => active.has(id), attachmentUrl: (id) => urls[id] });
  }, [content, nodes, urls]);

  // N-30: los diagramas se dibujan después, con Mermaid cargado solo si hace falta.
  useEffect(() => {
    if (container.current) void renderMermaidBlocks(container.current);
  }, [html]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // N-31: las casillas de tareas no se pueden marcar en consulta.
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      e.preventDefault();
      return;
    }
    const copy = target.closest('.code-copy');
    if (copy) {
      void copyCode(copy);
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
  return <div className="markdown" ref={container} onClick={onClick} onAuxClick={onAuxClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
