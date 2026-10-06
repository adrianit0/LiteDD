import type { NoteType } from '../types';

const LABELS: Record<NoteType, [string, string]> = { md: ['MD', 'Markdown'], sql: ['SQL', 'SQL'], http: ['HTTP', 'HTTP'] };

/** Icono de tipo de nota (N-01, P-01, H-01). */
export function TypeIcon({ type }: { type: NoteType }) {
  const [text, label] = LABELS[type];
  return (
    <span className={`type-icon type-${type}`} role="img" aria-label={label}>
      {text}
    </span>
  );
}
