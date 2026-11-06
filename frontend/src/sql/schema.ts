import { create } from 'zustand';
import { autocompletion, type CompletionSource } from '@codemirror/autocomplete';
import { MySQL, schemaCompletionSource } from '@codemirror/lang-sql';
import type { Extension } from '@codemirror/state';
import { api, type ConnectionStatus } from '../api';
import { useConnection } from '../stores/connectionStore';
import type { SchemaTable } from './types';

/**
 * Q-84: fuente de autocompletado de tablas y columnas. Tras «tabla.» o «alias.» propone las columnas de esa tabla.
 * Solo tablas y columnas, sin palabras clave (ADR-0043).
 */
export function schemaSource(tables: SchemaTable[]): CompletionSource {
  const schema: Record<string, string[]> = {};
  for (const t of tables) schema[t.name] = t.columns;
  return schemaCompletionSource({ dialect: MySQL, schema });
}

export function schemaCompletion(tables: SchemaTable[]): Extension {
  return autocompletion({ override: [schemaSource(tables)], icons: false });
}

/** Q-85: la conexión de la que se leyó el esquema; si cambia, se vuelve a pedir. */
export function connectionKey(status: ConnectionStatus | null): string {
  if (!status) return '';
  return [status.state, status.user, status.host, status.port, status.schema].join('|');
}

interface SchemaState {
  tables: SchemaTable[];
  /** Conexión de la última lectura correcta; null si no hay ninguna o falló. */
  loadedKey: string | null;
  /** Algún editor lo ha pedido: solo entonces se vuelve a leer al cambiar la conexión. */
  wanted: boolean;
  /** Q-85: lee el esquema si no está ya en memoria para la conexión actual. */
  ensure: () => Promise<void>;
}

export const useSqlSchema = create<SchemaState>((set, get) => ({
  tables: [],
  loadedKey: null,
  wanted: false,

  async ensure() {
    const key = connectionKey(useConnection.getState().status);
    set({ wanted: true });
    if (get().loadedKey === key) return;
    try {
      const { tables } = await api.sqlSchema();
      // Si la conexión cambió mientras tanto, la suscripción de abajo vuelve a pedirlo.
      if (connectionKey(useConnection.getState().status) === key) set({ tables, loadedKey: key });
    } catch {
      // Sin conexión no se propone nada y el editor funciona igual.
      set({ tables: [], loadedKey: null });
    }
  },
}));

useConnection.subscribe((state, previous) => {
  if (connectionKey(state.status) === connectionKey(previous.status)) return;
  if (useSqlSchema.getState().wanted) void useSqlSchema.getState().ensure();
});
