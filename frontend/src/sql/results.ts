import { formatDecimal } from '../format';
import type { Column, Sort } from './types';

/** Q-64: en la tabla, como mucho 200 caracteres. */
export const CELL_LIMIT = 200;

/** Texto visible de una celda y si se ha recortado. */
export function cellDisplay(value: string | null): { text: string; clipped: boolean } {
  if (value === null) return { text: 'NULL', clipped: false };
  if (value.length <= CELL_LIMIT) return { text: value, clipped: false };
  return { text: `${value.slice(0, CELL_LIMIT)}…`, clipped: true };
}

/** Q-42: «1,24 s (servidor 1,19 s) · 20 filas». */
export function timingText(totalMs: number, serverMs: number | undefined, rows: number): string {
  const total = `${formatDecimal(totalMs / 1000, 2)} s`;
  const server = serverMs === undefined ? '' : ` (servidor ${formatDecimal(serverMs / 1000, 2)} s)`;
  return `${total}${server} · ${rows === 1 ? '1 fila' : `${rows} filas`}`;
}

/** Cronómetro en vivo (Q-41): «3,4 s». */
export function elapsedText(ms: number): string {
  return `${formatDecimal(ms / 1000, 1)} s`;
}

/** Q-59: rango visible, «21–40». */
export function rangeText(page: number, pageSize: number | null, rows: number): string {
  if (rows === 0) return '0';
  const first = pageSize === null ? 1 : (page - 1) * pageSize + 1;
  return `${first}–${first + rows - 1}`;
}

/** Q-56: ascendente, descendente, sin orden. */
export function nextSort(current: Sort | null, column: number): Sort | null {
  if (!current || current.column !== column) return { column, direction: 'asc' };
  if (current.direction === 'asc') return { column, direction: 'desc' };
  return null;
}

/**
 * Q-66: filas cargadas como tabla Markdown GFM. La barra vertical se escapa, los saltos de línea
 * pasan a <br> y los nulos a NULL.
 */
export function toMarkdownTable(columns: Column[], rows: (string | null)[][]): string {
  const cell = (v: string | null) => (v === null ? 'NULL' : v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'));
  const header = `| ${columns.map((c) => cell(c.label)).join(' | ')} |`;
  const separator = `| ${columns.map((c) => (c.numeric ? '---:' : '---')).join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(cell).join(' | ')} |`);
  return [header, separator, ...body].join('\n');
}

/** Ancho de columna en píxeles según su contenido, con un tope. */
export function columnWidth(column: Column, rows: (string | null)[][], index: number): number {
  let chars = column.label.length;
  const sample = Math.min(rows.length, 200);
  for (let i = 0; i < sample; i++) {
    const v = rows[i][index];
    chars = Math.max(chars, v === null ? 4 : Math.min(v.length, 60));
  }
  return Math.min(480, Math.max(64, Math.round(chars * 7.8 + 24)));
}
