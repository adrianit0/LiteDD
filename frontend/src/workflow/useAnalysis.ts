import { useEffect, useState } from 'react';
import { api, type WorkflowNoteInfo } from '../api';
import type { NodeValues } from './model';

export interface WorkflowAnalysisState {
  loaded: boolean;
  /** Por identificador de nota. */
  notes: Record<string, WorkflowNoteInfo>;
  /** W-51: valores de la última ejecución, por nodo y campo. */
  lastValues: NodeValues;
}

/**
 * W-23 a W-26, W-51: las notas de los nodos, en una sola llamada. Se vuelve a pedir al cambiar las notas usadas o el
 * modo de la pestaña, para recoger los cambios de variables de esas notas.
 */
export function useWorkflowAnalysis(workflowId: string, noteIds: string[], refresh: unknown): WorkflowAnalysisState {
  const [state, setState] = useState<WorkflowAnalysisState>({ loaded: false, notes: {}, lastValues: {} });
  const key = [...new Set(noteIds)].sort().join(',');
  useEffect(() => {
    let alive = true;
    api
      .workflowAnalyze(key === '' ? [] : key.split(','), workflowId)
      .then((a) => {
        if (!alive) return;
        const lastValues: NodeValues = {};
        for (const [node, fields] of Object.entries(a.lastValues ?? {})) {
          lastValues[node] = Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, v ?? '']));
        }
        setState({ loaded: true, notes: Object.fromEntries(a.notes.map((n) => [n.id, n])), lastValues });
      })
      .catch(() => {
        if (alive) setState((s) => ({ ...s, loaded: true }));
      });
    return () => {
      alive = false;
    };
  }, [workflowId, key, refresh]);
  return state;
}
