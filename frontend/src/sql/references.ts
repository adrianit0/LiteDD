import { create } from 'zustand';
import { api, type Reference } from '../api';
import { useConnection } from '../stores/connectionStore';
import { connectionKey } from './schema';
import type { Column, ForeignKey, LookupResult } from './types';

/** Q-104: el ratón o la selección se quedan este tiempo en la celda antes de consultar. */
export const REFERENCE_DELAY_MS = 400;

/** Q-100: una referencia nueva nace en azul cerúleo. */
export const DEFAULT_REFERENCE_COLOR = '#007ba7';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Q-102: la referencia de cada columna, o null. Una columna se marca si sale tal cual de una columna con clave foránea
 * hacia la tabla objetivo de una referencia.
 */
export function columnReferences(columns: Column[], foreignKeys: ForeignKey[], references: Reference[]): (Reference | null)[] {
  return columns.map((c) => {
    if (!c.table || !c.column) return null;
    const key = foreignKeys.find((k) => same(k.table, c.table!) && same(k.column, c.column!));
    return key ? (references.find((r) => same(r.table, key.referencedTable)) ?? null) : null;
  });
}

/** Q-106: lo consultado se recuerda por tabla objetivo y valor. */
export function lookupKey(table: string, value: string): string {
  return `${table.toLowerCase()}\u0000${value}`;
}

/** Q-105: el texto de cada valor de la fila, con su etiqueta si hay varias columnas. */
export function lookupLines(result: LookupResult): { label: string | null; value: string | null }[] {
  if (!result.row) return [];
  const row = result.row;
  return result.columns.map((label, i) => ({ label: result.columns.length === 1 ? null : label, value: row[i] ?? null }));
}

/** Q-100: aviso de una fila de «Ajustes → Referencias», o null si es válida. */
export function referenceProblem(reference: Reference, all: Reference[]): string | null {
  const table = reference.table.trim();
  if (table === '') return 'Falta la tabla objetivo';
  if (all.filter((r) => same(r.table.trim(), table)).length > 1) return 'Tabla objetivo repetida';
  if (!reference.noteId) return 'Elige una nota SQL';
  return null;
}

/** Q-103: las tablas objetivo, para saber si cambiaron. */
function targetsKey(references: Reference[]): string {
  return references
    .map((r) => r.table.toLowerCase())
    .sort()
    .join('\u0000');
}

interface ForeignKeysState {
  foreignKeys: ForeignKey[];
  /** Conexión y tablas objetivo de la última lectura correcta; null si no hay ninguna o falló. */
  loadedKey: string | null;
  /** Lectura en curso, para no pedir dos veces lo mismo. */
  loadingKey: string | null;
  /** Q-103: lee las claves foráneas si no están ya en memoria para la conexión y las referencias actuales. */
  ensure: (references: Reference[]) => Promise<void>;
}

export const useForeignKeys = create<ForeignKeysState>((set, get) => ({
  foreignKeys: [],
  loadedKey: null,
  loadingKey: null,

  async ensure(references) {
    if (references.length === 0) {
      // Sin referencias no se pide nada.
      set({ foreignKeys: [], loadedKey: null });
      return;
    }
    const key = `${connectionKey(useConnection.getState().status)}\u0001${targetsKey(references)}`;
    if (get().loadedKey === key || get().loadingKey === key) return;
    // Las claves de otra conexión u otras referencias ya no valen.
    if (get().loadedKey !== null) set({ foreignKeys: [], loadedKey: null });
    set({ loadingKey: key });
    try {
      const { foreignKeys } = await api.sqlReferences();
      if (get().loadingKey === key) set({ foreignKeys, loadedKey: key });
    } catch {
      // Sin conexión no se marca nada; se vuelve a pedir con los siguientes resultados.
      if (get().loadingKey === key) set({ foreignKeys: [], loadedKey: null });
    } finally {
      if (get().loadingKey === key) set({ loadingKey: null });
    }
  },
}));
