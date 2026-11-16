import { localDate } from './important';
import type { NoteType } from './types';

/** N-72: filtros combinables. */
export type DateRange = '' | 'today' | '7d' | '30d';

export interface SearchFilters {
  type: NoteType | '';
  tags: string[];
  favorite: boolean;
  since: DateRange;
  /** N-99: solo las importantes vigentes hoy. */
  important: boolean;
  /** N-84: incluye las notas obsoletas. No es un filtro: por sí solo no activa la búsqueda. */
  obsolete: boolean;
}

export const NO_FILTERS: SearchFilters = { type: '', tags: [], favorite: false, since: '', important: false, obsolete: false };

export interface SearchHit {
  id: string;
  parentId: string | null;
  type: NoteType;
  title: string;
  favorite: boolean;
  updatedAt: string;
  obsolete?: boolean;
  /** N-89 */
  importantUntil?: string | null;
  /** Lo encontrado va entre \u0002 y \u0003 (N-71). */
  fragment: string | null;
  titleMarked: string | null;
}

export function hasFilters(f: SearchFilters): boolean {
  return f.type !== '' || f.tags.length > 0 || f.favorite || f.important || f.since !== '';
}

/** Fecha mínima de modificación: hoy desde medianoche local, o los últimos 7 o 30 días. */
export function sinceFor(range: DateRange, now: Date): string | null {
  if (range === '') return null;
  const d = new Date(now);
  if (range === 'today') d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - (range === '7d' ? 7 : 30));
  return d.toISOString();
}

export function searchParams(query: string, f: SearchFilters, now: Date): string {
  const p = new URLSearchParams();
  if (query.trim() !== '') p.set('q', query.trim());
  if (f.type) p.set('type', f.type);
  if (f.tags.length > 0) p.set('tags', f.tags.join(','));
  if (f.favorite) p.set('favorite', 'true');
  const since = sinceFor(f.since, now);
  if (since) p.set('since', since);
  // N-99: «hoy» lo pone la interfaz, que conoce la hora local (ADR-0047).
  if (f.important) p.set('important', localDate(now));
  if (f.obsolete) p.set('obsolete', 'true');
  return p.toString();
}

export interface Segment {
  text: string;
  mark: boolean;
}

/** Trocea un texto con marcas \u0002…\u0003 sin interpretarlo como HTML. */
export function splitMarked(text: string): Segment[] {
  const out: Segment[] = [];
  let mark = false;
  let current = '';
  for (const ch of text) {
    if (ch === '\u0002' || ch === '\u0003') {
      if (current) out.push({ text: current, mark });
      current = '';
      mark = ch === '\u0002';
    } else {
      current += ch;
    }
  }
  if (current) out.push({ text: current, mark });
  return out;
}
