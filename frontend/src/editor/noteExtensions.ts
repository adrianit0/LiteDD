import { autocompletion, startCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { linkCandidates, noteLink } from '../markdown/links';
import type { TreeNode } from '../types';

/**
 * N-90: al escribir «[[» aparece un autocompletado de notas que inserta [Título](litedd://note/<id>).
 */
export function noteLinkSource(nodes: () => TreeNode[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[[^\]\n]*/);
    if (!match) return null;
    const typed = match.text.slice(2);
    return {
      from: match.from + 2,
      filter: false,
      options: linkCandidates(nodes(), typed).map((n) => ({
        label: n.title,
        type: n.type === 'sql' ? 'class' : 'text',
        detail: n.type === 'sql' ? 'SQL' : 'MD',
        apply: (view: EditorView, _completion: unknown, _from: number, to: number) => {
          const insert = noteLink(n);
          view.dispatch({ changes: { from: match.from, to, insert }, selection: { anchor: match.from + insert.length } });
        },
      })),
    };
  };
}

export function noteLinkCompletion(nodes: () => TreeNode[]): Extension {
  return autocompletion({ override: [noteLinkSource(nodes)], icons: false });
}

/** Botón «enlace a nota» de la barra: escribe «[[» y abre el autocompletado. */
export function startNoteLink(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({ changes: { from, to, insert: '[[' }, selection: { anchor: from + 2 } });
  view.focus();
  startCompletion(view);
}

/**
 * N-92: pegar o arrastrar imágenes. upload devuelve el identificador del adjunto, o null si no se pudo.
 */
export function imageDrop(upload: (file: File) => Promise<string | null>): Extension {
  const insertImages = async (view: EditorView, files: File[], at: number) => {
    let pos = at;
    for (const file of files) {
      const id = await upload(file);
      if (!id) continue;
      const text = `![](litedd://attachment/${id})`;
      view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
      pos += text.length;
    }
  };
  const images = (list: FileList | undefined | null) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'));

  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = images(event.clipboardData?.files);
      if (files.length === 0) return false;
      event.preventDefault();
      void insertImages(view, files, view.state.selection.main.head);
      return true;
    },
    drop(event, view) {
      const files = images(event.dataTransfer?.files);
      if (files.length === 0) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      void insertImages(view, files, pos);
      return true;
    },
  });
}
