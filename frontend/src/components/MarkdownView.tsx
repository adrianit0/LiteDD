import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { renderMarkdown, type BoardState } from '../markdown/render';
import { attachmentIds, noteIds } from '../markdown/links';
import { useAttachments } from '../markdown/attachments';
import { useBoards } from '../markdown/boards';
import { renderMermaidBlocks } from '../markdown/mermaid';
import { useTree } from '../stores/treeStore';
import { copyText } from '../clipboard';
import { ImageViewer } from './ImageViewer';

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

/** N-11, N-30 a N-35, N-91 a N-93, B-41 a B-43: vista renderizada de una nota Markdown. */
export function MarkdownView({ content, onOpenNote }: Props) {
  const nodes = useTree((s) => s.nodes);
  const urls = useAttachments((s) => s.urls);
  const boards = useBoards((s) => s.boards);
  const container = useRef<HTMLDivElement>(null);
  const ids = useMemo(() => attachmentIds(content), [content]);
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (ids.length > 0) useAttachments.getState().load(ids);
  }, [ids]);

  // B-41: cada vez que se muestra la nota se pide la última versión de sus pizarras.
  const boardIds = useMemo(() => {
    const types = new Map(nodes.map((n) => [n.id, n.type]));
    return noteIds(content).filter((id) => types.get(id) === 'board');
  }, [content, nodes]);
  const boardKey = boardIds.join(',');
  useEffect(() => {
    if (boardKey) useBoards.getState().load(boardKey.split(','));
  }, [boardKey]);

  const html = useMemo(() => {
    const types = new Map(nodes.map((n) => [n.id, n.type]));
    // B-43: una nota que no está en el árbol no existe o está en la papelera.
    const board = (id: string): BoardState => {
      const type = types.get(id);
      if (type === undefined) return { state: 'missing' };
      if (type !== 'board') return { state: 'notBoard' };
      const url = boards[id];
      if (url === undefined) return { state: 'loading' };
      if (url === null) return { state: 'missing' };
      return url === '' ? { state: 'empty' } : { state: 'ready', url };
    };
    return renderMarkdown(content, { noteExists: (id) => types.has(id), attachmentUrl: (id) => urls[id], board });
  }, [content, nodes, urls, boards]);

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
    // N-35: una imagen que no es enlace se abre en el visor.
    if (!a && target instanceof HTMLImageElement && target.getAttribute('src')) {
      setImage({ src: target.src, alt: target.alt });
      return;
    }
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

  // N-32, P-03: clic central sobre un enlace a nota abre una pestaña nueva. B-42: también sobre una pizarra.
  const onAuxClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1) return;
    const target = e.target as HTMLElement;
    const a = target.closest('a');
    if (a) {
      e.preventDefault();
      if (a.dataset.noteId) onOpenNote(a.dataset.noteId, true);
      return;
    }
    const board = target.closest<HTMLElement>('[data-board-id]');
    if (board?.dataset.boardId) {
      e.preventDefault();
      onOpenNote(board.dataset.boardId, true);
    }
  };

  if (content.trim() === '') {
    return <p className="muted view-empty">Nota vacía. Pulsa «Editar» o Ctrl+E para escribir.</p>;
  }
  return (
    <>
      <div className="markdown" ref={container} onClick={onClick} onAuxClick={onAuxClick} dangerouslySetInnerHTML={{ __html: html }} />
      {image && <ImageViewer src={image.src} alt={image.alt} onClose={() => setImage(null)} />}
    </>
  );
}
