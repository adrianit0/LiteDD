import { create } from 'zustand';
import { api, ApiError, type ExecuteRequest } from '../api';
import type { Analysis, ExecuteResponse } from '../sql/types';
import { initialValues } from '../sql/values';
import { defaultSqlState, isDirty, useTabs } from './tabsStore';

/** Error de una ejecución, con el cuerpo de A-02 (Q-90 a Q-98). */
export interface RunError {
  code: string;
  message: string;
  details: unknown;
}

/**
 * Estado de ejecución de una pestaña SQL. Solo vive en memoria: los resultados no se guardan (Q-67)
 * y se liberan al cerrar la pestaña (P-08).
 */
export interface SqlRun {
  analysis: Analysis | null;
  running: { executionId: string; startedAt: number } | null;
  result: ExecuteResponse | null;
  /** Página del resultado mostrado. */
  page: number;
  /** Q-42: tiempo total de la última ejecución, medido en la interfaz. */
  elapsedMs: number | null;
  total: number | null;
  counting: boolean;
  error: RunError | null;
  /** Q-22, Q-93: errores por variable. */
  fieldErrors: Record<string, string>;
}

const EMPTY_RUN: SqlRun = {
  analysis: null,
  running: null,
  result: null,
  page: 1,
  elapsedMs: null,
  total: null,
  counting: false,
  error: null,
  fieldErrors: {},
};

interface SqlRunState {
  runs: Record<string, SqlRun>;
  analyze: (tabId: string) => Promise<void>;
  /** Q-40: solo se ejecuta a petición. page por defecto 1. */
  execute: (tabId: string, page?: number) => Promise<void>;
  cancel: (tabId: string) => Promise<void>;
  count: (tabId: string) => Promise<void>;
}

const now = () => performance.now();

function toRunError(e: unknown): RunError {
  if (e instanceof ApiError) return { code: e.code, message: e.message, details: e.details };
  return { code: 'error', message: e instanceof Error ? e.message : 'Error desconocido', details: null };
}

export const useSqlRuns = create<SqlRunState>((set, get) => {
  const run = (tabId: string) => get().runs[tabId] ?? EMPTY_RUN;
  const patch = (tabId: string, changes: Partial<SqlRun>) =>
    set({ runs: { ...get().runs, [tabId]: { ...run(tabId), ...changes } } });

  const tabOf = (tabId: string) => useTabs.getState().tabs.find((t) => t.id === tabId);

  /** A-04: se ejecuta el contenido guardado; si hay cambios, se guardan antes. */
  const request = async (tabId: string, page: number, executionId: string): Promise<ExecuteRequest | null> => {
    // P-14: ejecutar fija la pestaña.
    useTabs.getState().pin(tabId);
    await useTabs.getState().saveNow(tabId);
    const tab = tabOf(tabId);
    if (!tab?.note) return null;
    if (isDirty(tab)) {
      patch(tabId, { error: { code: 'unsaved', message: 'La nota tiene cambios sin guardar. Resuelve el guardado antes de ejecutar.', details: null } });
      return null;
    }
    const sql = tab.sql ?? defaultSqlState();
    return {
      noteId: tab.noteId,
      version: tab.note.version,
      executionId,
      values: sql.values,
      page,
      pageSize: sql.pageSize,
      sort: sql.sort,
    };
  };

  return {
    runs: {},

    async analyze(tabId) {
      const tab = tabOf(tabId);
      if (!tab?.note) return;
      try {
        const analysis = await api.analyze(tab.note.content, tab.noteId);
        patch(tabId, { analysis });
        // Q-24: una pestaña sin valores propios parte de los últimos ejecutados.
        if (tabOf(tabId)?.sql === null) {
          useTabs.getState().setSql(tabId, { ...defaultSqlState(), values: initialValues(analysis.lastValues) });
        }
      } catch (e) {
        patch(tabId, { error: toRunError(e) });
      }
    },

    async execute(tabId, page = 1) {
      if (run(tabId).running) return;
      const executionId = crypto.randomUUID();
      const startedAt = now();
      patch(tabId, { running: { executionId, startedAt }, error: null, fieldErrors: {} });
      try {
        const req = await request(tabId, page, executionId);
        if (!req) return;
        const result = await api.execute(req);
        useTabs.getState().setSql(tabId, { page });
        patch(tabId, { result, page, elapsedMs: now() - startedAt, total: result.total ?? null });
      } catch (e) {
        const err = toRunError(e);
        if (err.code === 'invalid_values') {
          patch(tabId, { fieldErrors: (err.details ?? {}) as Record<string, string>, error: err });
        } else {
          patch(tabId, { error: err });
        }
      } finally {
        if (get().runs[tabId]) patch(tabId, { running: null });
      }
    },

    async cancel(tabId) {
      const running = run(tabId).running;
      if (!running) return;
      try {
        await api.cancel(running.executionId);
      } catch {
        // La ejecución terminará por su cuenta o por el tiempo máximo.
      }
    },

    async count(tabId) {
      const executionId = crypto.randomUUID();
      patch(tabId, { counting: true, error: null });
      try {
        const req = await request(tabId, 1, executionId);
        if (!req) return;
        const { total } = await api.count(req);
        patch(tabId, { total });
      } catch (e) {
        patch(tabId, { error: toRunError(e) });
      } finally {
        if (get().runs[tabId]) patch(tabId, { counting: false });
      }
    },
  };
});

/** P-08: al cerrar una pestaña se cancela lo que esté en curso y se liberan sus resultados. */
useTabs.subscribe((state) => {
  const runs = useSqlRuns.getState().runs;
  const open = new Set(state.tabs.map((t) => t.id));
  const gone = Object.keys(runs).filter((id) => !open.has(id));
  if (gone.length === 0) return;
  for (const id of gone) {
    const running = runs[id].running;
    if (running) void api.cancel(running.executionId).catch(() => {});
  }
  const rest = { ...runs };
  for (const id of gone) delete rest[id];
  useSqlRuns.setState({ runs: rest });
});

export function useSqlRun(tabId: string): SqlRun {
  return useSqlRuns((s) => s.runs[tabId] ?? EMPTY_RUN);
}
