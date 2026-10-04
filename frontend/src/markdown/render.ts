import MarkdownIt, { type StateCore, type Token } from 'markdown-it';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

/**
 * Markdown GFM a HTML saneado (N-30, S-15). Las direcciones litedd:// se resuelven antes de
 * sanear (N-93). No se generan atributos style: la CSP no los permite (S-14).
 */
const NOTE_LINK = 'litedd://note/';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code: string, lang: string): string {
    const language = lang && hljs.getLanguage(lang) ? lang : null;
    const body = language
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : escapeHtml(code);
    return `<pre class="hljs"><code>${body}</code></pre>`;
  },
});

// markdown-it solo admite ciertos esquemas; litedd:// es interno y se resuelve abajo.
const defaultValidateLink = md.validateLink.bind(md);
md.validateLink = (url: string) => url.startsWith(NOTE_LINK) || defaultValidateLink(url);

const TASK = /^\[([ xX])\] /;

md.core.ruler.push('litedd', (state: StateCore) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Alineación de tablas con clases en lugar de style.
    if (t.type === 'th_open' || t.type === 'td_open') {
      const style = String(t.attrGet('style') ?? '');
      if (style) {
        const align = /text-align:(\w+)/.exec(style)?.[1];
        t.attrs = (t.attrs ?? []).filter(([name]) => name !== 'style');
        if (align) t.attrJoin('class', `align-${align}`);
      }
    }

    // Listas de tareas: «- [ ] texto» con casilla de solo lectura (N-31).
    if (t.type === 'inline' && tokens[i - 1]?.type === 'paragraph_open' && tokens[i - 2]?.type === 'list_item_open') {
      const first = t.children?.[0];
      const match = first?.type === 'text' ? TASK.exec(first.content) : null;
      if (first && match) {
        first.content = first.content.slice(match[0].length);
        const checkbox = new state.Token('html_inline', '', 0);
        checkbox.content = `<input type="checkbox" class="task-checkbox" disabled${match[1] === ' ' ? '' : ' checked'}> `;
        t.children!.unshift(checkbox);
        tokens[i - 2].attrJoin('class', 'task-list-item');
      }
    }

    // Enlaces a notas (N-32, N-93).
    if (t.type === 'inline') resolveLinks(t.children ?? []);
  }
});

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resolveLinks(children: Token[]) {
  for (const c of children) {
    if (c.type !== 'link_open') continue;
    const href = String(c.attrGet('href') ?? '');
    if (href.startsWith(NOTE_LINK)) {
      c.attrSet('href', '#');
      c.attrSet('data-note-id', decodeURIComponent(href.slice(NOTE_LINK.length)));
      c.attrJoin('class', 'note-link');
    }
  }
}

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source), { ADD_ATTR: ['data-note-id'] });
}
