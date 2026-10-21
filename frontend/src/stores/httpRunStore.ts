import { create } from 'zustand';
import { api, ApiError, type HttpResult } from '../api';
import { askConfirmKey } from './confirmKeyStore';
import { profileOf, useHttpProfile } from './httpProfileStore';
import { isDirty, useTabs } from './tabsStore';
import { useUi } from './uiStore';

/**
 * Llamada de una pestaña HTTP. Solo vive en memoria: la respuesta no se guarda y se pierde al cerrar la
 * pestaña (H-36).
 */
export interface HttpRun {
  running: { executionId: string; startedAt: number } | null;
  result: HttpResult | null;
  /** Error de la propia petición a LiteDD (A-02): falta la URL base, nota no válida… */
  error: { code: string; message: string } | null;
}

const EMPTY_RUN: HttpRun = { running: null, result: null, error: null };

interface HttpRunState {
  runs: Record<string, HttpRun>;
  /** H-30 */
  execute: (tabId: string) => Promise<void>;
  cancel: (tabId: string) => Promise<void>;
}

export const useHttpRuns = create<HttpRunState>((set, get) => {
  const run = (tabId: string) => get().runs[tabId] ?? EMPTY_RUN;
  const patch = (tabId: string, changes: Partial<HttpRun>) => set({ runs: { ...get().runs, [tabId]: { ...run(tabId), ...changes } } });

  return {
    runs: {},

    async execute(tabId) {
      if (run(tabId).running) return;
      const tabs = useTabs.getState();
      // P-14: enviar fija la pestaña. A-04: se ejecuta lo guardado.
      tabs.pin(tabId);
      await tabs.saveNow(tabId);
      const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
      if (!tab?.note) return;
      if (isDirty(tab)) {
        patch(tabId, { error: { code: 'unsaved', message: 'La nota tiene cambios sin guardar. Resuelve el guardado antes de enviar.' } });
        return;
      }
      // H-63: se envía al perfil que se ve. H-69: si el perfil pide la clave, se pide en cada envío.
      const profile = profileOf(useUi.getState().config.http, useHttpProfile.getState().active);
      let askKey = profile.requireKey;
      let keyError: string | null = null;
      for (;;) {
        let key: string | undefined;
        if (askKey) {
          const typed = await askConfirmKey(profile.name, keyError);
          if (typed === null) return;
          key = typed;
        }
        const executionId = crypto.randomUUID();
        patch(tabId, { running: { executionId, startedAt: performance.now() }, error: null });
        try {
          const result = await api.httpExecute(tab.noteId, tab.note.version, executionId, profile.id, key);
          if (get().runs[tabId]) patch(tabId, { result, running: null });
          return;
        } catch (e) {
          if (!get().runs[tabId]) return;
          // Clave incorrecta, o el perfil la pide aunque los ajustes de la ventana no lo sabían: se vuelve a pedir.
          if (e instanceof ApiError && (e.code === 'confirm_key_wrong' || e.code === 'confirm_key_required')) {
            patch(tabId, { running: null });
            askKey = true;
            keyError = e.code === 'confirm_key_wrong' ? e.message : null;
            continue;
          }
          if (e instanceof ApiError && e.code === 'profile_changed') void useHttpProfile.getState().load().catch(() => {});
          const error = e instanceof ApiError ? { code: e.code, message: e.message } : { code: 'error', message: String(e) };
          patch(tabId, { error, running: null });
          return;
        }
      }
    },

    async cancel(tabId) {
      const running = run(tabId).running;
      if (!running) return;
      await api.httpCancel(running.executionId).catch(() => {});
    },
  };
});

/** H-36: al cerrar una pestaña se cancela lo que esté en curso y se olvida la respuesta. */
useTabs.subscribe((state) => {
  const runs = useHttpRuns.getState().runs;
  const open = new Set(state.tabs.map((t) => t.id));
  const gone = Object.keys(runs).filter((id) => !open.has(id));
  if (gone.length === 0) return;
  const rest = { ...runs };
  for (const id of gone) {
    const running = runs[id].running;
    if (running) void api.httpCancel(running.executionId).catch(() => {});
    delete rest[id];
  }
  useHttpRuns.setState({ runs: rest });
});

export function useHttpRun(tabId: string): HttpRun {
  return useHttpRuns((s) => s.runs[tabId] ?? EMPTY_RUN);
}
