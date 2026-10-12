import type { SqlError } from './sql/types';
import type { StatementKind, TreeNode } from './types';

/** M-41: sentencias y errores de un mapper, como los devuelve /api/mybatis/analyze. */
export interface MapperAnalysis {
  statements: { id: string; kind: StatementKind }[];
  errors: SqlError[];
}

/** M-20: hija generada de una nota XML MyBatis, de solo lectura. */
export function isGenerated(node: Pick<TreeNode, 'statementId'> | null | undefined): boolean {
  return node?.statementId != null;
}

/** N-02, M-20, M-22: ni la nota XML ni sus hijas generadas admiten otras hijas. */
export function acceptsChildren(node: Pick<TreeNode, 'type' | 'statementId'> | null | undefined): boolean {
  return node != null && node.type !== 'xml' && !isGenerated(node);
}

/** M-24: marca de las sentencias de escritura; null en las SELECT. */
export function writeMark(kind: StatementKind | null | undefined): string | null {
  return kind && kind !== 'select' ? kind.toUpperCase() : null;
}

/**
 * M-41, M-42: resaltado del mapper. Tokens #{} y ${}, cualquier etiqueta XML, CDATA, comentarios,
 * declaración y DOCTYPE.
 */
export const MAPPER_TOKEN =
  /\$\{[^}\n]*\}|#\{[^}\n]*\}|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<!\[CDATA\[|\]\]>|<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*)?\/?>/g;

/** El texto del mapper partido en fragmentos con la clase CSS de cada token (la misma que en el editor). */
export function mapperTokens(content: string, classOf: (token: string) => string): { text: string; className: string | null }[] {
  const out: { text: string; className: string | null }[] = [];
  let last = 0;
  for (const m of content.matchAll(MAPPER_TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: content.slice(last, at), className: null });
    out.push({ text: m[0], className: classOf(m[0]) });
    last = at + m[0].length;
  }
  if (last < content.length) out.push({ text: content.slice(last), className: null });
  return out;
}
