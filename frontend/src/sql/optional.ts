import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';

/** Raíz de cada `#{…}` o `${…}` (Q-10). */
const VARIABLE = /[#$]\{\s*([A-Za-z_$][\w$]*)/g;
/** `IN #{lista}` o `IN #{lista,tipo}` (también `javaType=tipo`). */
const IN_LIST = /\b(IN)\s*#\{\s*([A-Za-z_$][\w$]*)\s*(?:,\s*(?:javaType\s*=\s*)?([\w.]+)\s*)?\}/gi;
const STATEMENT_OPEN = /<(select|insert|update|delete)\b[^>]*>/gi;
const STATEMENT_CLOSE = /<\/(select|insert|update|delete)\s*>/gi;
const HAS_CLAUSE = /<(where|set|trim)\b|\b(WHERE|SET)\b/i;
const COMMENT = /<!--[\s\S]*?-->/g;
const INDENT = '  ';

/** Q-86: la línea como `<if>` con una comparación por variable, o null si no se convierte. */
function convertLine(text: string, indent: string): string | null {
  const lead = /^[ \t]*/.exec(text)![0];
  const body = text.slice(lead.length).trimEnd();
  if (!body || body.startsWith('<')) return null;
  const names = [...new Set([...body.matchAll(VARIABLE)].map((m) => m[1]))];
  if (names.length === 0) return null;
  const converted = body.replace(IN_LIST, (_all, keyword: string, name: string, type?: string) => {
    const itemType = type && type.toLowerCase() !== 'list' ? `,${type}` : '';
    return `${keyword} <foreach collection="${name}" item="item" open="(" separator="," close=")">#{item${itemType}}</foreach>`;
  });
  const at = indent + lead;
  const test = names.map((n) => `${n} != null`).join(' and ');
  return `${at}<if test="${test}">\n${at}${INDENT}${converted}\n${at}</if>`;
}

/** Q-87: texto de la sentencia que rodea [from, to): su etiqueta en una nota XML o la nota entera. */
function statementAround(doc: string, from: number, to: number): string {
  const lastBefore = (re: RegExp) => {
    let found: RegExpExecArray | null = null;
    for (const m of doc.slice(0, from).matchAll(re)) found = m as RegExpExecArray;
    return found;
  };
  const open = lastBefore(STATEMENT_OPEN);
  const closeBefore = lastBefore(STATEMENT_CLOSE);
  if (!open || (closeBefore && closeBefore.index! > open.index!)) return doc.slice(0, from) + doc.slice(to);
  const after = doc.slice(to).search(STATEMENT_CLOSE);
  const end = after < 0 ? doc.length : to + after;
  return doc.slice(open.index! + open[0].length, from) + doc.slice(to, end);
}

/**
 * Q-86, Q-87: convierte en condiciones opcionales las líneas que toca la selección (o la del cursor) y,
 * si la sentencia no tiene cláusula, las envuelve en `<where>`. Devuelve null si no hay nada que convertir.
 */
export function makeOptional(state: EditorState): TransactionSpec | null {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from);
  let last = state.doc.lineAt(to);
  if (to > from && to === last.from && last.number > first.number) last = state.doc.line(last.number - 1);

  const lines: string[] = [];
  for (let n = first.number; n <= last.number; n++) lines.push(state.doc.line(n).text);

  const doc = state.doc.toString();
  const statement = statementAround(doc, first.from, last.to).replace(COMMENT, '');
  const withWhere = !HAS_CLAUSE.test(statement);
  const converted = lines.map((text) => convertLine(text, withWhere ? INDENT : ''));
  const start = converted.findIndex((c) => c !== null);
  if (start < 0) return null;
  const end = converted.length - 1 - [...converted].reverse().findIndex((c) => c !== null);

  // Q-87: el <where> abarca de la primera a la última línea convertida; las de fuera no se tocan.
  const out = lines.map((text, i) => {
    if (converted[i] !== null) return converted[i]!;
    if (withWhere && i > start && i < end && text.trim()) return INDENT + text;
    return text;
  });
  if (withWhere) {
    const base = /^[ \t]*/.exec(lines[start])![0];
    out[start] = `${base}<where>\n${out[start]}`;
    out[end] = `${out[end]}\n${base}</where>`;
  }
  const insert = out.join('\n');
  return {
    changes: { from: first.from, to: last.to, insert },
    selection: EditorSelection.cursor(first.from + insert.length),
    userEvent: 'input',
  };
}
