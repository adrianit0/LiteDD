import { useHttpRuns } from './stores/httpRunStore';
import { useSqlRuns } from './stores/sqlRunStore';
import { isDirty, useTabs } from './stores/tabsStore';
import { useWorkflowRuns } from './stores/workflowRunStore';

const anyRunning = (runs: Record<string, { running: unknown }>) => Object.values(runs).some((r) => r.running !== null);

/** R-41: lo que impide reiniciar sin perder trabajo. */
export function updateBlockers(): string[] {
  const out: string[] = [];
  if (useTabs.getState().tabs.some(isDirty)) out.push('hay pestañas sin guardar');
  if (anyRunning(useSqlRuns.getState().runs)) out.push('hay una consulta en marcha');
  if (anyRunning(useHttpRuns.getState().runs)) out.push('hay una llamada HTTP en marcha');
  if (anyRunning(useWorkflowRuns.getState().runs)) out.push('hay un workflow en marcha');
  return out;
}
