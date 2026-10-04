import { Decoration, MatchDecorator, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

/**
 * Q-80: resaltado de etiquetas MyBatis y de tokens #{} y ${} sobre el SQL. ${} va en otro color,
 * porque es sustitución textual (Q-17).
 */
export const MYBATIS_TOKEN =
  /\$\{[^}\n]*\}|#\{[^}\n]*\}|<\/?(?:if|where|choose|when|otherwise|trim|set|foreach|bind|select|insert|update|delete|include)\b[^>]*>|<!\[CDATA\[|\]\]>|<!--[\s\S]*?-->/g;

/** Clase CSS de un fragmento reconocido por MYBATIS_TOKEN. */
export function mybatisClass(token: string): string {
  if (token.startsWith('${')) return 'cm-mb-textual';
  if (token.startsWith('#{')) return 'cm-mb-param';
  if (token.startsWith('<!--')) return 'cm-mb-comment';
  return 'cm-mb-tag';
}

const decorator = new MatchDecorator({
  regexp: MYBATIS_TOKEN,
  decoration: (m) => Decoration.mark({ class: mybatisClass(m[0]) }),
});

export const mybatisHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorator.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = decorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);
