import { useEffect, useRef } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder, type KeyBinding } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { MySQL, sql } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';
import { applyFormat, type FormatAction } from './formatting';
import { mybatisHighlight } from './mybatis';
import { insertSnippet, type SnippetKind } from '../sql/snippets';
import type { NoteType } from '../types';

interface Props {
  type: NoteType;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** P-06: desplazamiento inicial y avisos de desplazamiento de esta pestaña. */
  initialScroll?: number;
  onScroll?: (top: number) => void;
  /** Recibe las funciones para aplicar formatos desde la barra y para dar el foco al editor. */
  onReady?: (controls: EditorControls) => void;
}

export interface EditorControls {
  format: (action: FormatAction) => void;
  /** Q-81: inserciones del editor SQL. */
  snippet: (kind: SnippetKind) => void;
  focus: () => void;
}

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--bg)', color: 'var(--text)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
    '.cm-content': { padding: '16px 0', caretColor: 'var(--accent)' },
    '.cm-line': { padding: '0 20px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'var(--selection)',
    },
    '.cm-placeholder': { color: 'var(--text-muted)' },
    // Q-80: etiquetas MyBatis, #{} y ${} en otro color.
    '.cm-mb-tag': { color: 'var(--link)' },
    '.cm-mb-param': { color: 'var(--warning)' },
    '.cm-mb-textual': { color: 'var(--error)', fontWeight: '600' },
    '.cm-mb-comment': { color: 'var(--text-muted)', fontStyle: 'italic' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--accent)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--link)' },
  { tag: tags.monospace, color: 'var(--code)' },
  { tag: tags.quote, color: 'var(--text-muted)' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.meta], color: 'var(--text-muted)' },
  // SQL (Q-80)
  { tag: tags.keyword, color: 'var(--accent)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--code)' },
  { tag: tags.number, color: 'var(--code)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: tags.typeName, color: 'var(--link)' },
]);

/** N-22: Ctrl+B y Ctrl+I; Intro continúa la lista y el tabulador sangra. */
export function markdownBindings(format: (action: FormatAction) => void): KeyBinding[] {
  const run = (action: FormatAction) => () => {
    format(action);
    return true;
  };
  return [{ key: 'Mod-b', run: run('bold') }, { key: 'Mod-i', run: run('italic') }, ...markdownKeymap, indentWithTab];
}

/**
 * Editor de texto plano (N-11): Markdown con barra de formato y atajos (N-20 a N-22), o SQL de MySQL con
 * resaltado de MyBatis (Q-80).
 */
export function NoteEditor({ type, value, onChange, onBlur, onReady, initialScroll = 0, onScroll }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onBlur, onScroll });
  callbacks.current = { onChange, onBlur, onScroll };

  useEffect(() => {
    const format = (action: FormatAction) => {
      const v = view.current;
      if (!v) return;
      v.dispatch(applyFormat(v.state, action));
      v.focus();
    };
    const snippet = (kind: SnippetKind) => {
      const v = view.current;
      if (!v) return;
      v.dispatch(insertSnippet(v.state, kind));
      v.focus();
    };

    const extensions: Extension[] = [
      history(),
      indentOnInput(),
      EditorView.lineWrapping,
      theme,
      syntaxHighlighting(highlight),
      placeholder(type === 'md' ? 'Escribe en Markdown…' : 'Escribe la consulta…'),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        blur: () => callbacks.current.onBlur(),
        scroll: (_event, view) => callbacks.current.onScroll?.(view.scrollDOM.scrollTop),
      }),
      EditorView.contentAttributes.of({ 'aria-label': 'Contenido de la nota', spellcheck: 'false' }),
    ];
    if (type === 'md') {
      extensions.push(markdown(), keymap.of(markdownBindings(format)));
    } else {
      extensions.push(sql({ dialect: MySQL }), mybatisHighlight, keymap.of([indentWithTab]));
    }
    extensions.push(keymap.of([...defaultKeymap, ...historyKeymap]));

    // S-14: la CSP no admite elementos <style>. Dentro de un shadow root CodeMirror usa hojas de
    // estilo construidas (adoptedStyleSheets), que la CSP sí permite.
    const shadow = host.current!.shadowRoot ?? host.current!.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    container.style.height = '100%';
    shadow.replaceChildren(container);

    const v = new EditorView({
      parent: container,
      root: shadow,
      state: EditorState.create({ doc: value, extensions }),
    });
    view.current = v;
    requestAnimationFrame(() => {
      v.scrollDOM.scrollTop = initialScroll;
    });
    onReady?.({ format, snippet, focus: () => v.focus() });
    return () => {
      v.destroy();
      view.current = null;
    };
    // El editor se crea una vez por tipo; el contenido externo se sincroniza abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Recargar, resolver un conflicto o restaurar cambian el contenido desde fuera.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="editor" ref={host} />;
}
