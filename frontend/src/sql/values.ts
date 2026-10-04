import type { SqlType } from './types';

/**
 * Conversión entre lo que guarda el formulario (texto de la API: yyyy-MM-dd HH:mm:ss) y lo que usan
 * los controles del navegador (datetime-local: yyyy-MM-ddTHH:mm:ss).
 */
export function toControl(type: SqlType, value: string): string {
  return type === 'datetime' ? value.replace(' ', 'T') : value;
}

export function fromControl(type: SqlType, value: string): string {
  if (type !== 'datetime' || value === '') return value;
  const v = value.replace('T', ' ');
  // Sin segundos, el navegador los omite: se completan.
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
}

/** Valores iniciales de una pestaña: los últimos ejecutados de la nota (Q-24), sin nulos. */
export function initialValues(lastValues: Record<string, string | null> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(lastValues ?? {})) out[k] = v ?? '';
  return out;
}

/** Etiqueta del tipo en el formulario (Q-20). */
export function typeLabel(type: SqlType, elementType: SqlType | null): string {
  return type === 'list' && elementType && elementType !== 'string' ? `list<${elementType}>` : type;
}
