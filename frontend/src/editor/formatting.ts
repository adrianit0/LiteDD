import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';

/**
 * Acciones de la barra de formato (N-20). Cada una envuelve la selección o inserta una plantilla
 * en el cursor, y quita el formato si ya está aplicado (N-21). Son funciones puras sobre el estado.
 */
export type FormatAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'codeBlock'
  | 'link'
  | 'noteLink'
  | 'image'
  | 'table'
  | 'hr';

const INLINE: Partial<Record<FormatAction, { marker: string; placeholder: string }>> = {
  bold: { marker: '**', placeholder: 'texto' },
  italic: { marker: '*', placeholder: 'texto' },
  strike: { marker: '~~', placeholder: 'texto' },
  code: { marker: '`', placeholder: 'código' },
};

type LineKind = 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'task' | 'quote';

const LINE_PREFIX: Record<LineKind, RegExp> = {
  h1: /^# /,
  h2: /^## /,
  h3: /^### /,
  bullet: /^[-*+] (?!\[[ xX]\] )/,
  ordered: /^\d+\. /,
  task: /^[-*+] \[[ xX]\] /,
  quote: /^> ?/,
};

const HEADING_ANY = /^#{1,6} /;
const LIST_ANY = /^([-*+] \[[ xX]\] |[-*+] |\d+\. )/;

export function applyFormat(state: EditorState, action: FormatAction): TransactionSpec {
  const inline = INLINE[action];
  if (inline) return toggleInline(state, inline.marker, inline.placeholder);
  switch (action) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'bullet':
    case 'ordered':
    case 'task':
    case 'quote':
      return toggleLines(state, action);
    case 'codeBlock':
      return toggleCodeBlock(state);
    case 'link':
      return toggleLink(state, '', 'url');
    case 'noteLink':
      return toggleLink(state, '', 'litedd://note/');
    case 'image':
      return toggleLink(state, '!', 'url');
    case 'table':
      return insertBlock(state, '| Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |');
    case 'hr':
      return insertBlock(state, '---');
    default:
      return {};
  }
}

function toggleInline(state: EditorState, marker: string, placeholder: string): TransactionSpec {
  const { from, to } = state.selection.main;
  const text = state.sliceDoc(from, to);
  const m = marker.length;

  // La selección incluye los marcadores: **texto**
  if (text.length >= 2 * m && hasMarker(leadingRun(text, marker[0]), marker) && hasMarker(trailingRun(text, marker[0]), marker)) {
    const inner = text.slice(m, text.length - m);
    return {
      changes: { from, to, insert: inner },
      selection: EditorSelection.range(from, from + inner.length),
    };
  }
  // Los marcadores rodean la selección: **|texto|**
  const runBefore = trailingRun(state.sliceDoc(Math.max(0, from - 6), from), marker[0]);
  const runAfter = leadingRun(state.sliceDoc(to, to + 6), marker[0]);
  if (hasMarker(runBefore, marker) && hasMarker(runAfter, marker)) {
    return {
      changes: [
        { from: from - m, to: from, insert: '' },
        { from: to, to: to + m, insert: '' },
      ],
      selection: EditorSelection.range(from - m, to - m),
    };
  }
  if (from === to) {
    return {
      changes: { from, insert: marker + placeholder + marker },
      selection: EditorSelection.range(from + m, from + m + placeholder.length),
    };
  }
  return {
    changes: { from, to, insert: marker + text + marker },
    selection: EditorSelection.range(from + m, to + m),
  };
}

/**
 * ¿Una racha de n caracteres iguales contiene el marcador? Para «*» la cursiva exige una racha impar
 * («*», «***»), porque «**» es negrita; para «**» basta con dos o más.
 */
function hasMarker(run: number, marker: string): boolean {
  if (marker === '*') return run % 2 === 1;
  if (marker === '**') return run >= 2;
  return run >= marker.length && run % marker.length === 0;
}

function leadingRun(text: string, ch: string): number {
  let n = 0;
  while (n < text.length && text[n] === ch) n++;
  return n;
}

function trailingRun(text: string, ch: string): number {
  let n = 0;
  while (n < text.length && text[text.length - 1 - n] === ch) n++;
  return n;
}

function selectedLines(state: EditorState) {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  const lines = [];
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
  return lines;
}

function toggleLines(state: EditorState, kind: LineKind): TransactionSpec {
  const lines = selectedLines(state);
  const pattern = LINE_PREFIX[kind];
  const allHave = lines.every((l) => pattern.test(l.text));
  const changes = lines.map((line, i) => {
    const text = line.text;
    let stripped = text;
    if (allHave) {
      stripped = text.replace(pattern, '');
      return { from: line.from, to: line.to, insert: stripped };
    }
    if (kind.startsWith('h')) stripped = text.replace(HEADING_ANY, '');
    else if (kind === 'quote') stripped = text;
    else stripped = text.replace(LIST_ANY, '');
    const prefix =
      kind === 'h1'
        ? '# '
        : kind === 'h2'
          ? '## '
          : kind === 'h3'
            ? '### '
            : kind === 'bullet'
              ? '- '
              : kind === 'ordered'
                ? `${i + 1}. `
                : kind === 'task'
                  ? '- [ ] '
                  : '> ';
    return { from: line.from, to: line.to, insert: prefix + stripped };
  });
  const spec: TransactionSpec = { changes };
  if (state.selection.main.empty) {
    // Cursor al final de la línea modificada.
    const line = lines[0];
    const delta = changes[0].insert.length - (line.to - line.from);
    return { ...spec, selection: EditorSelection.cursor(line.to + delta) };
  }
  return spec;
}

function toggleCodeBlock(state: EditorState): TransactionSpec {
  const lines = selectedLines(state);
  const first = lines[0];
  const last = lines[lines.length - 1];
  const doc = state.doc;
  // Ya está dentro de un bloque: las líneas de alrededor son vallas.
  if (first.number > 1 && last.number < doc.lines) {
    const above = doc.line(first.number - 1);
    const below = doc.line(last.number + 1);
    if (/^```/.test(above.text) && /^```\s*$/.test(below.text)) {
      return {
        changes: [
          { from: above.from, to: first.from, insert: '' },
          { from: last.to, to: below.to, insert: '' },
        ],
      };
    }
  }
  if (state.selection.main.empty && first.text === '') {
    return {
      changes: { from: first.from, insert: '```\n\n```' },
      selection: EditorSelection.cursor(first.from + 4),
    };
  }
  return {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' },
    ],
  };
}

const LINK = /^(!?)\[([^\]]*)\]\(([^)]*)\)$/;

function toggleLink(state: EditorState, bang: string, urlPlaceholder: string): TransactionSpec {
  const { from, to } = state.selection.main;
  const text = state.sliceDoc(from, to);
  const match = LINK.exec(text);
  if (match && match[1] === bang) {
    return {
      changes: { from, to, insert: match[2] },
      selection: EditorSelection.range(from, from + match[2].length),
    };
  }
  if (from === to) {
    const label = bang ? 'descripción' : 'texto';
    const insert = `${bang}[${label}](${urlPlaceholder})`;
    const start = from + bang.length + 1;
    return { changes: { from, insert }, selection: EditorSelection.range(start, start + label.length) };
  }
  const insert = `${bang}[${text}](${urlPlaceholder})`;
  const urlStart = from + bang.length + text.length + 3;
  return {
    changes: { from, to, insert },
    selection: EditorSelection.range(urlStart, urlStart + urlPlaceholder.length),
  };
}

/** Inserta un bloque en su propia línea, separado por líneas en blanco. */
function insertBlock(state: EditorState, block: string): TransactionSpec {
  const line = state.doc.lineAt(state.selection.main.head);
  const at = line.to;
  const before = line.text.trim() === '' ? (line.number > 1 ? '\n' : '') : '\n\n';
  const insert = `${before}${block}\n`;
  return {
    changes: { from: at, insert },
    selection: EditorSelection.cursor(at + insert.length),
  };
}
