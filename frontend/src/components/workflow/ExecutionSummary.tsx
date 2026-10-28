import type { Execution, NodeRun } from '../../stores/workflowRunStore';
import { elapsedText } from '../../sql/results';
import { isNamed, referencedNames, type Workflow } from '../../workflow/model';
import { STATE_TEXT, type NodeState } from './WorkflowCanvas';

/** W-75: hora de inicio de una ejecución. */
export function executionTime(e: Execution): string {
  return new Date(e.at).toLocaleTimeString('es-ES', { hour12: false });
}

/** Las referencias que no existían y que aparecen en lo escrito en un campo. */
function missingIn(raw: string, missing: string[] | undefined): string[] {
  return (missing ?? []).filter((m) => raw.includes(m));
}

/**
 * W-76: lo que entró en un campo. Con referencias, lo escrito y el valor; las que no existían, en color de aviso.
 */
export function EnteredValue({ raw, value, missing }: { raw: string; value: string | null | undefined; missing?: string[] }) {
  const shown = value === null || value === undefined ? 'null' : value;
  if (referencedNames(raw).length === 0) return <code>{shown}</code>;
  return (
    <span className="wf-entered">
      <code>{raw}</code> → <code>{shown}</code>
      {missingIn(raw, missing).map((m) => (
        <span key={m} className="wf-warning">
          <code>{m}</code> no existe → null
        </span>
      ))}
    </span>
  );
}

function stateOf(r: NodeRun | undefined, execution: Execution, live: boolean): NodeState {
  if (r) return r.status;
  return execution.end || !live ? 'skipped' : 'pending';
}

/**
 * W-77: sin nodo seleccionado, el resumen de la ejecución elegida: cada nodo con su estado, su tiempo y sus campos con
 * referencias, con lo escrito y lo que entró.
 */
export function ExecutionSummary({ workflow, execution, live, onSelect }: {
  workflow: Workflow;
  execution: Execution;
  live: boolean;
  onSelect: (nodeId: string) => void;
}) {
  const nodes = execution.chain.flatMap((id) => workflow.nodes.filter((n) => n.id === id && isNamed(n)));
  return (
    <aside className="wf-panel" aria-label="Resumen de la ejecución">
      <header className="wf-panel-head">
        <strong>Ejecución de las {executionTime(execution)}</strong>
        <div className={`wf-end ${execution.end?.status ?? ''}`}>{execution.end?.message ?? (live ? 'En curso' : 'Interrumpida')}</div>
      </header>
      <ul className="wf-summary">
        {nodes.map((n) => {
          const r = execution.nodes[n.id];
          const state = stateOf(r, execution, live);
          const refs = Object.entries(r?.raw ?? {}).filter(([, raw]) => referencedNames(raw).length > 0);
          return (
            <li key={n.id}>
              <div className="wf-summary-node">
                <button type="button" className="link-button" onClick={() => onSelect(n.id)}>
                  {n.name}
                </button>
                <span className={`wf-state ${state}`}>{STATE_TEXT[state]}</span>
                {r?.millis !== undefined && <span className="muted">{elapsedText(r.millis)}</span>}
              </div>
              {r?.error && <div className="wf-problem">{r.error.message}</div>}
              {refs.length > 0 && (
                <ul className="wf-summary-refs">
                  {refs.map(([field, raw]) => (
                    <li key={field}>
                      <span className="wf-field-name">{field === 'seconds' ? 'Segundos' : field === 'user' && n.kind === 'login' ? 'Usuario' : field}</span>:{' '}
                      <EnteredValue raw={raw} value={r?.values?.[field]} missing={r?.missing} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
