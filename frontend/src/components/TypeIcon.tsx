import type { NoteType } from '../types';

/** Icono de tipo de nota (N-01, P-01). */
export function TypeIcon({ type }: { type: NoteType }) {
  return (
    <span className={`type-icon type-${type}`} role="img" aria-label={type === 'md' ? 'Markdown' : 'SQL'}>
      {type === 'md' ? 'MD' : 'SQL'}
    </span>
  );
}
