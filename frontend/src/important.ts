import type { TreeNode } from './types';

/** Notas importantes con fecha de fin (N-89, N-97 a N-99, ADR-0047). Las fechas son días locales AAAA-MM-DD. */

const pad = (n: number) => String(n).padStart(2, '0');

/** El día local de esa fecha, AAAA-MM-DD. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** El día local que cae `days` días después. */
export function dateInDays(days: number, now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

/** N-97: la nota es importante hasta el final del día de su fecha; al siguiente deja de serlo sola. */
export function isImportant(node: Pick<TreeNode, 'importantUntil'>, now: Date = new Date()): boolean {
  return !!node.importantUntil && node.importantUntil >= localDate(now);
}

/** AAAA-MM-DD como dd/MM/aaaa (U-03). */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-');
  return y && m && d ? `${d}/${m}/${y}` : day;
}

/** N-98: el texto del resalte, o null si la nota no es importante hoy. */
export function importantLabel(node: Pick<TreeNode, 'importantUntil'>, now: Date = new Date()): string | null {
  return isImportant(node, now) ? `Importante hasta el ${formatDay(node.importantUntil!)}` : null;
}
