import type { NoteType } from '../types';

const LABELS: Record<NoteType, [string, string]> = {
  md: ['MD', 'Markdown'],
  sql: ['SQL', 'SQL'],
  http: ['HTTP', 'HTTP'],
  xml: ['XML', 'XML MyBatis'],
  board: ['PIZ', 'Pizarra'],
  workflow: ['WF', 'Workflow'],
};

/** N-100: tipos cuyo icono va en gris cuando la nota no tiene contenido. */
const GREY_WHEN_EMPTY: ReadonlySet<NoteType> = new Set(['md', 'sql', 'xml']);

/** Icono de tipo de nota (N-01, P-01, H-01, M-01, B-01, W-84); en gris si la nota está vacía (N-100). */
export function TypeIcon({ type, empty = false }: { type: NoteType; empty?: boolean }) {
  const [text, label] = LABELS[type];
  const grey = empty && GREY_WHEN_EMPTY.has(type);
  return (
    <span className={`type-icon type-${type}${grey ? ' type-empty' : ''}`} role="img" aria-label={grey ? `${label} vacía` : label}>
      {text}
    </span>
  );
}
