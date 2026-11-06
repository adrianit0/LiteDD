import { create } from 'zustand';
import { api, ApiError, type WorkflowEvent, type WorkflowRows, type HttpResult, type NodeStatus } from '../api';
import { askConfirmKey } from './confirmKeyStore';
import { profileOf, useHttpProfile } from './httpProfileStore';
import { isDirty, useTabs } from './tabsStore';
import { useUi } from './uiStore';
import { flow, parseWorkflow, valuesToSend, type NodeValues } from '../workflow/model';

/** W-70, W-72, W-76: el estado de un nodo en una ejecución, lo que entró y lo que salió. */
export interface NodeRun {
  status: NodeStatus;
  startedAt?: number;
  millis?: number;
  /** W-78: lo escrito en cada campo. */
  raw?: Record<string, string>;
  values?: Record<string, string | null>;
  /** W-78: referencias que no existían. */
  missing?: string[];
  error?: { code: string; message: string };
  http?: HttpResult;
  sql?: WorkflowRows;
  /** W-70: la salida que tomó una Condición. */
  branch?: 'yes' | 'no';
  /** W-72: los elementos de un Bucle. */
  items?: number;
}

/** W-78, W-79: una vuelta de un Bucle. key: la vuelta de cada Bucle en curso, separadas por puntos («2.3»). */
export interface IterationInfo {
  key: string;
  nodeId: string;
  total: number;
  /** El elemento como texto. */
  item: string;
}

/** W-74: una ejecución del workflow, con su hora de inicio, su flujo, el estado de cada nodo en cada vuelta y su final. */
export interface Execution {
  id: string;
  /** Hora de inicio (Date.now()). */
  at: number;
  /** Los nodos del flujo (W-15). */
  chain: string[];
  /** Por nodo, su resultado en cada vuelta; '' es fuera de todo Bucle. */
  nodes: Record<string, Record<string, NodeRun>>;
  /** W-79: las vueltas, en el orden en que empezaron. */
  iterations: IterationInfo[];
  /** W-71: el nodo en curso y su vuelta. */
  current: { nodeId: string; key: string } | null;
  end: { status: 'finished' | 'stopped' | 'cancelled'; errors: number; millis: number; message: string } | null;
}

/** Ejecuciones de un workflow en una pestaña. Solo viven en memoria y se pierden al cerrarla (W-73). */
export interface WorkflowRun {
  running: { executionId: string; startedAt: number } | null;
  /** W-74: la más reciente primero, como mucho MAX_EXECUTIONS. */
  executions: Execution[];
  /** W-75: la ejecución que se ve; null es la más reciente. */
  viewing: string | null;
  /** W-79: la vuelta que se ve; null es la última. */
  iteration: string | null;
  /** Error de la petición a LiteDD (A-02), con los motivos de W-61 en details. No es una ejecución. */
  error: { code: string; message: string; details?: string[] } | null;
}

/** W-74 */
export const MAX_EXECUTIONS = 20;
const EMPTY_RUN: WorkflowRun = { running: null, executions: [], viewing: null, iteration: null, error: null };
const controllers = new Map<string, AbortController>();

/** W-75: la ejecución que se ve: la elegida o, si no, la más reciente. */
export function viewedExecution(run: WorkflowRun): Execution | undefined {
  return (run.viewing ? run.executions.find((e) => e.id === run.viewing) : undefined) ?? run.executions[0];
}

/** W-78: la clave de una vuelta: [2, 3] es «2.3»; fuera de todo Bucle, ''. */
export function iterationKey(iteration: number[] | undefined): string {
  return iteration ? iteration.join('.') : '';
}

/** W-79: la vuelta que se ve: la elegida o, si no, la última que empezó; '' si no hay vueltas. */
export function viewedIteration(run: WorkflowRun, execution: Execution | undefined): string {
  if (!execution) return '';
  if (run.iteration !== null && execution.iterations.some((i) => i.key === run.iteration)) return run.iteration;
  return execution.iterations.at(-1)?.key ?? '';
}

/** W-79: el resultado de un nodo en la vuelta key o, si no se ejecutó en ella, en la que la contiene. */
export function runOf(execution: Execution, nodeId: string, key: string): NodeRun | undefined {
  const runs = execution.nodes[nodeId];
  if (!runs) return undefined;
  for (let k = key; ; k = k.includes('.') ? k.slice(0, k.lastIndexOf('.')) : '') {
    if (runs[k]) return runs[k];
    if (k === '') return undefined;
  }
}

/** W-77, W-79: si algún nodo falló en la vuelta key o en las que contiene. */
export function iterationFailed(execution: Execution, key: string): boolean {
  return Object.values(execution.nodes).some((runs) =>
    Object.entries(runs).some(([k, r]) => r.status === 'error' && (k === key || k.startsWith(`${key}.`))),
  );
}

interface WorkflowRunState {
  runs: Record<string, WorkflowRun>;
  /** W-60 */
  execute: (tabId: string, values: NodeValues) => Promise<void>;
  cancel: (tabId: string) => Promise<void>;
  /** W-75 */
  view: (tabId: string, executionId: string | null) => void;
  /** W-79 */
  viewIteration: (tabId: string, key: string | null) => void;
}

export const useWorkflowRuns = create<WorkflowRunState>((set, get) => {
  const run = (tabId: string) => get().runs[tabId] ?? EMPTY_RUN;
  const patch = (tabId: string, changes: Partial<WorkflowRun>) =>
    set({ runs: { ...get().runs, [tabId]: { ...run(tabId), ...changes } } });
  const patchExecution = (tabId: string, id: string, change: (e: Execution) => Execution) =>
    patch(tabId, { executions: run(tabId).executions.map((e) => (e.id === id ? change(e) : e)) });

  /** W-70, W-71, W-79: cada evento cambia el estado de un nodo en una vuelta, empieza una vuelta o termina la ejecución. */
  const apply = (tabId: string, id: string, e: WorkflowEvent) => {
    if (!get().runs[tabId]) return;
    if (e.type === 'start') patchExecution(tabId, id, (x) => ({ ...x, chain: e.chain, nodes: {}, iterations: [], current: null }));
    else if (e.type === 'iteration') {
      const info: IterationInfo = { key: iterationKey(e.iteration), nodeId: e.nodeId, total: e.total, item: e.item };
      patchExecution(tabId, id, (x) => ({ ...x, iterations: [...x.iterations, info] }));
    } else if (e.type === 'node') {
      const key = iterationKey(e.iteration);
      patchExecution(tabId, id, (x) => {
        const before = x.nodes[e.nodeId]?.[key];
        const next: NodeRun =
          e.status === 'running'
            ? { status: 'running', startedAt: performance.now() }
            : { status: e.status, millis: e.millis, raw: e.raw, values: e.values, missing: e.missing, error: e.error,
                http: e.http, sql: e.sql, branch: e.branch, items: e.items, startedAt: before?.startedAt };
        return {
          ...x,
          nodes: { ...x.nodes, [e.nodeId]: { ...x.nodes[e.nodeId], [key]: next } },
          current: e.status === 'running' ? { nodeId: e.nodeId, key } : null,
        };
      });
    } else if (e.type === 'end') {
      patchExecution(tabId, id, (x) => ({ ...x, end: e }));
      patch(tabId, { running: null });
    }
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
      const anyHttp = flow(workflow).some((n) => n.kind === 'http' || n.kind === 'login');
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
        // W-74, W-75: la ejecución nueva va la primera y es la que se ve.
        const execution: Execution = { id: executionId, at: Date.now(), chain: [], nodes: {}, iterations: [], current: null, end: null };
        patch(tabId, {
          running: { executionId, startedAt: performance.now() },
          executions: [execution, ...run(tabId).executions].slice(0, MAX_EXECUTIONS),
          viewing: null,
          iteration: null,
          error: null,
        });
        const forget = () => patch(tabId, { executions: run(tabId).executions.filter((x) => x.id !== executionId) });
        try {
          await api.workflowExecute(
            { noteId: tab.noteId, version: tab.note.version, executionId, profileId: profile.id, confirmKey: key, values: valuesToSend(workflow, values) },
            (e) => apply(tabId, executionId, e),
            controller.signal,
          );
          if (get().runs[tabId] && run(tabId).running) {
            // El flujo se cortó sin el evento final.
            patch(tabId, { running: null, error: { code: 'interrupted', message: 'Se perdió el contacto con la ejecución.' } });
          }
          return;
        } catch (e) {
          if (!get().runs[tabId]) return;
          // W-74: lo que falla antes de empezar no es una ejecución.
          forget();
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

    view(tabId, executionId) {
      patch(tabId, { viewing: executionId, iteration: null });
    },

    viewIteration(tabId, key) {
      patch(tabId, { iteration: key });
    },
  };
});

/** W-73: al cerrar una pestaña se cancela lo que esté en curso y se olvidan sus ejecuciones. */
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
