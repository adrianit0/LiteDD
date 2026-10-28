import { create } from 'zustand';
import { api, ApiError, type WorkflowEvent, type WorkflowRows, type HttpResult, type NodeStatus } from '../api';
import { askConfirmKey } from './confirmKeyStore';
import { profileOf, useHttpProfile } from './httpProfileStore';
import { isDirty, useTabs } from './tabsStore';
import { useUi } from './uiStore';
import { chain, parseWorkflow, valuesToSend, type NodeValues } from '../workflow/model';

/** W-70, W-72: el estado y el resultado de un nodo en la última ejecución de la pestaña. */
export interface NodeRun {
  status: NodeStatus;
  startedAt?: number;
  millis?: number;
  values?: Record<string, string | null>;
  error?: { code: string; message: string };
  http?: HttpResult;
  sql?: WorkflowRows;
}

/** Ejecución de un workflow en una pestaña. Solo vive en memoria y se pierde al cerrarla (W-73). */
export interface WorkflowRun {
  running: { executionId: string; startedAt: number } | null;
  chain: string[];
  nodes: Record<string, NodeRun>;
  end: { status: 'finished' | 'stopped' | 'cancelled'; errors: number; millis: number; message: string } | null;
  /** Error de la petición a LiteDD (A-02), con los motivos de W-61 en details. */
  error: { code: string; message: string; details?: string[] } | null;
}

const EMPTY_RUN: WorkflowRun = { running: null, chain: [], nodes: {}, end: null, error: null };
const controllers = new Map<string, AbortController>();

interface WorkflowRunState {
  runs: Record<string, WorkflowRun>;
  /** W-60 */
  execute: (tabId: string, values: NodeValues) => Promise<void>;
  cancel: (tabId: string) => Promise<void>;
}

export const useWorkflowRuns = create<WorkflowRunState>((set, get) => {
  const run = (tabId: string) => get().runs[tabId] ?? EMPTY_RUN;
  const patch = (tabId: string, changes: Partial<WorkflowRun>) =>
    set({ runs: { ...get().runs, [tabId]: { ...run(tabId), ...changes } } });

  /** W-70, W-71: cada evento cambia el estado de un nodo o de la ejecución. */
  const apply = (tabId: string, e: WorkflowEvent) => {
    if (!get().runs[tabId]) return;
    if (e.type === 'start') patch(tabId, { chain: e.chain, nodes: {} });
    else if (e.type === 'node') {
      const previous = run(tabId).nodes[e.nodeId];
      const next: NodeRun =
        e.status === 'running'
          ? { status: 'running', startedAt: performance.now() }
          : { status: e.status, millis: e.millis, values: e.values, error: e.error, http: e.http, sql: e.sql, startedAt: previous?.startedAt };
      patch(tabId, { nodes: { ...run(tabId).nodes, [e.nodeId]: next } });
    } else if (e.type === 'end') patch(tabId, { end: e, running: null });
  };

  return {
    runs: {},

    async execute(tabId, values) {
      if (run(tabId).running) return;
      const tabs = useTabs.getState();
      // P-14: ejecutar fija la pestaña. A-04, W-60: se ejecuta lo guardado.
      tabs.pin(tabId);
      await tabs.saveNow(tabId);
      const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
      if (!tab?.note) return;
      if (isDirty(tab)) {
        patch(tabId, { error: { code: 'unsaved', message: 'El workflow tiene cambios sin guardar. Resuelve el guardado antes de ejecutar.' } });
        return;
      }
      const workflow = parseWorkflow(tab.note.content);
      const anyHttp = chain(workflow).some((n) => n.kind === 'http');
      // W-63: el perfil que se ve; si pide la clave, se pide una sola vez para toda la ejecución.
      const profile = profileOf(useUi.getState().config.http, useHttpProfile.getState().active);
      let askKey = anyHttp && profile.requireKey;
      let keyError: string | null = null;
      for (;;) {
        let key: string | undefined;
        if (askKey) {
          const typed = await askConfirmKey(profile.name, keyError);
          if (typed === null) return;
          key = typed;
        }
        const executionId = crypto.randomUUID();
        const controller = new AbortController();
        controllers.set(tabId, controller);
        patch(tabId, { running: { executionId, startedAt: performance.now() }, chain: [], nodes: {}, end: null, error: null });
        try {
          await api.workflowExecute(
            { noteId: tab.noteId, version: tab.note.version, executionId, profileId: profile.id, confirmKey: key, values: valuesToSend(workflow, values) },
            (e) => apply(tabId, e),
            controller.signal,
          );
          if (get().runs[tabId] && run(tabId).running) {
            // El flujo se cortó sin el evento final.
            patch(tabId, { running: null, error: { code: 'interrupted', message: 'Se perdió el contacto con la ejecución.' } });
          }
          return;
        } catch (e) {
          if (!get().runs[tabId]) return;
          if (e instanceof ApiError && (e.code === 'confirm_key_wrong' || e.code === 'confirm_key_required')) {
            patch(tabId, { running: null });
            askKey = true;
            keyError = e.code === 'confirm_key_wrong' ? e.message : null;
            continue;
          }
          if (e instanceof ApiError && e.code === 'profile_changed') void useHttpProfile.getState().load().catch(() => {});
          const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as string[]) : undefined;
          const error = e instanceof ApiError ? { code: e.code, message: e.message, details } : { code: 'error', message: String(e) };
          patch(tabId, { error, running: null });
          return;
        } finally {
          if (controllers.get(tabId) === controller) controllers.delete(tabId);
        }
      }
    },

    async cancel(tabId) {
      const running = run(tabId).running;
      if (!running) return;
      await api.workflowCancel(running.executionId).catch(() => {});
    },
  };
});

/** W-73: al cerrar una pestaña se cancela lo que esté en curso y se olvidan los resultados. */
useTabs.subscribe((state) => {
  const runs = useWorkflowRuns.getState().runs;
  const open = new Set(state.tabs.map((t) => t.id));
  const gone = Object.keys(runs).filter((id) => !open.has(id));
  if (gone.length === 0) return;
  const rest = { ...runs };
  for (const id of gone) {
    const running = runs[id].running;
    if (running) void api.workflowCancel(running.executionId).catch(() => {});
    controllers.get(id)?.abort();
    controllers.delete(id);
    delete rest[id];
  }
  useWorkflowRuns.setState({ runs: rest });
});

export function useWorkflowRun(tabId: string): WorkflowRun {
  return useWorkflowRuns((s) => s.runs[tabId] ?? EMPTY_RUN);
}
