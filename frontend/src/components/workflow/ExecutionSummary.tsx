import { iterationFailed, runOf, type Execution, type NodeRun } from '../../stores/workflowRunStore';
import { elapsedText } from '../../sql/results';
import { isNamed, referencedNames, type Workflow } from '../../workflow/model';
import { STATE_TEXT, type NodeState } from './WorkflowCanvas';

/** W-75: hora de inicio de una ejecución. */
export function executionTime(e: Execution): string {
  return new Date(e.at).toLocaleTimeString('es-ES', { hour12: false });
}

/** W-71, W-79: la vuelta de cada Bucle en una vuelta: «Bucle1 2 de 10», «Bucle2 3 de 5». */
export function loopProgress(workflow: Workflow, execution: Execution, key: string): string[] {
  if (key === '') return [];
  const parts = key.split('.');
  return parts.map((k, i) => {
    const info = execution.iterations.find((x) => x.key === parts.slice(0, i + 1).join('.'));
    const name = workflow.nodes.find((n) => n.id === info?.nodeId)?.name ?? 'Bucle';
    return `${name} ${k} de ${info?.total ?? '?'}`;
  });
}

/** W-79: el selector de la vuelta que se ve, con una marca en las que tienen algún error. */
export function IterationPicker({ workflow, execution, value, onChange }: {
  workflow: Workflow;
  execution: Execution;
  value: string;
  onChange: (key: string | null) => void;
}) {
  if (execution.iterations.length === 0) return null;
  const last = execution.iterations.at(-1)!.key;
  return (
    <label className="wf-iterations">
      <span className="muted">Iteración</span>
      <select value={value} onChange={(e) => onChange(e.target.value === last ? null : e.target.value)}>
        {execution.iterations.map((x) => (
          <option key={x.key} value={x.key}>
            {iterationFailed(execution, x.key) ? '✗ ' : ''}
            {loopProgress(workflow, execution, x.key).join(' · ')}
          </option>
        ))}
      </select>
    </label>
  );
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

/** Nombre visible de un campo en el panel y el resumen. */
export function fieldLabel(field: string, kind: string): string {
  if (field === 'seconds' && kind === 'wait') return 'Segundos';
  if (field === 'user' && kind === 'login') return 'Usuario';
  if (field === 'condition' && kind === 'condition') return 'Condición';
  if (field === 'list' && kind === 'foreach') return 'Lista';
  return field;
}

/** W-76: lo que entró en un campo; en un Bucle, cuántos elementos tenía la lista (W-72). */
export function enteredValue(r: NodeRun | undefined, field: string): string | null | undefined {
  if (r?.items !== undefined && field === 'list') return r.items === 1 ? '1 elemento' : `${r.items} elementos`;
  return r?.values?.[field];
}

function stateOf(r: NodeRun | undefined, execution: Execution, live: boolean): NodeState {
  if (r) return r.status;
  return execution.end || !live ? 'skipped' : 'pending';
}

/**
 * W-77, W-79: sin nodo seleccionado, el resumen de la ejecución elegida: las vueltas con error y cada nodo con su
 * estado en la vuelta elegida, su tiempo y sus campos con referencias, con lo escrito y lo que entró.
 */
export function ExecutionSummary({ workflow, execution, live, iteration, onIteration, onSelect }: {
  workflow: Workflow;
  execution: Execution;
  live: boolean;
  iteration: string;
  onIteration: (key: string | null) => void;
  onSelect: (nodeId: string) => void;
}) {
  const nodes = execution.chain.flatMap((id) => workflow.nodes.filter((n) => n.id === id && isNamed(n)));
  const failed = execution.iterations.filter((x) => iterationFailed(execution, x.key));
  const last = execution.iterations.at(-1)?.key;
  return (
    <aside className="wf-panel" aria-label="Resumen de la ejecución">
      <header className="wf-panel-head">
        <strong>Ejecución de las {executionTime(execution)}</strong>
        <div className={`wf-end ${execution.end?.status ?? ''}`}>{execution.end?.message ?? (live ? 'En curso' : 'Interrumpida')}</div>
      </header>
      <IterationPicker workflow={workflow} execution={execution} value={iteration} onChange={onIteration} />
      {failed.length > 0 && (
        <div className="wf-failed" role="group" aria-label="Iteraciones con error">
          <span className="muted">Con error:</span>
          {failed.map((x) => (
            <button key={x.key} type="button" className="link-button" onClick={() => onIteration(x.key === last ? null : x.key)}>
              {x.key.split('.').join(' · ')}
            </button>
          ))}
        </div>
      )}
      <ul className="wf-summary">
        {nodes.map((n) => {
          const r = runOf(execution, n.id, iteration);
          const state = stateOf(r, execution, live);
          const refs = Object.entries(r?.raw ?? {}).filter(([, raw]) => referencedNames(raw).length > 0);
          return (
            <li key={n.id}>
              <div className="wf-summary-node">
                <button type="button" className="link-button" onClick={() => onSelect(n.id)}>
                  {n.name}
                </button>
                <span className={`wf-state ${state}`}>{STATE_TEXT[state]}</span>
                {r?.branch && <span className="muted">→ {r.branch === 'yes' ? 'Sí' : 'No'}</span>}
                {r?.millis !== undefined && <span className="muted">{elapsedText(r.millis)}</span>}
              </div>
              {r?.error && <div className="wf-problem">{r.error.message}</div>}
              {refs.length > 0 && (
                <ul className="wf-summary-refs">
                  {refs.map(([field, raw]) => (
                    <li key={field}>
                      <span className="wf-field-name">{fieldLabel(field, n.kind)}</span>:{' '}
                      <EnteredValue raw={raw} value={enteredValue(r, field)} missing={r?.missing} />
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
