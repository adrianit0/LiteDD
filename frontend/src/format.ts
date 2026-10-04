/** U-03: formatos en español. */

const pad = (n: number) => String(n).padStart(2, '0');

/** dd/MM/yyyy HH:mm en hora local. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Número con coma decimal: 1,24. */
export function formatDecimal(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}
