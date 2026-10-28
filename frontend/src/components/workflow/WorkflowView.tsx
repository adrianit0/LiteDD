import { useEffect, useMemo, useState } from 'react';
import { useTabs, type Tab } from '../../stores/tabsStore';
import { useWorkflowRun, useWorkflowRuns } from '../../stores/workflowRunStore';
import { useUi } from '../../stores/uiStore';
import { elapsedText } from '../../sql/results';
import {
  chain,
  connect,
  initialTabValues,
  insertNode,
  isEditableInView,
  isNamed,
  moveNode,
  parseWorkflow,
  pruneValues,
  reachesFinish,
  removeEdge,
  removeNode,
  savedValues,
  serializeWorkflow,
  setTabValue,
  unifyFields,
  editedValues,
  type FieldsByNode,
  type NodeKind,
  type NodeValues,
  type WfOptions,
  type Workflow,
} from '../../workflow/model';
import { useWorkflowAnalysis } from '../../workflow/useAnalysis';
import { NodePanel } from './NodePanel';
import { WorkflowCanvas, type NodeState } from './WorkflowCanvas';

const ADD: [NodeKind, string][] = [
  ['http', '+ HTTP'],
  ['sql', '+ SQL'],
  ['wait', '+ Espera'],
  ['input', '+ Input'],
];

const OPTIONS: [keyof WfOptions, string][] = [
  ['sameInputs', 'Mismos inputs tendrá mismo valor'],
  ['stopOnError', 'Parar si error'],
  ['stopOnMissing', 'Parar si no existe input'],
  ['lockValues', 'Fijar valores de input'],
];

/** W-01 a W-73: un workflow en edición (diseño) o en consulta (valores, ejecución y resultados). */
export function WorkflowView({ tab, editMode }: { tab: Tab; editMode: boolean }) {
  const store = useTabs.getState();
  const workflow = useMemo(() => parseWorkflow(tab.content), [tab.content]);
  const noteIds = workflow.nodes.flatMap((n) => (n.noteId ? [n.noteId] : []));
  const analysis = useWorkflowAnalysis(tab.noteId, noteIds, tab.mode);
  const run = useWorkflowRun(tab.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [, setTick] = useState(0);

  /** W-23, W-24: los campos de cada nodo son las variables de su nota, si se conocen. */
  const fields = useMemo<FieldsByNode>(() => {
    const out: FieldsByNode = {};
    for (const n of workflow.nodes) {
      const info = n.noteId ? analysis.notes[n.noteId] : undefined;
      if ((n.kind === 'http' || n.kind === 'sql') && info?.state === 'active' && info.type === n.kind && info.fields) {
        out[n.id] = info.fields.map((f) => f.name);
      }
    }
    return out;
  }, [workflow, analysis.notes]);

  // W-51: al abrir el workflow en una pestaña se proponen los valores de la última ejecución.
  useEffect(() => {
    if (analysis.loaded && !tab.workflow) {
      store.setWorkflow(tab.id, { values: initialTabValues(workflow, fields, analysis.lastValues) });
    }
    // Solo cuando llega el análisis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.loaded, tab.id]);

  /** Valores de consulta: los de la pestaña y, donde falten o estén fijados (W-44), los guardados. */
  const values = useMemo<NodeValues>(() => {
    const saved = savedValues(workflow, fields);
    const tabValues = tab.workflow?.values ?? {};
    const out: NodeValues = {};
    for (const n of workflow.nodes) {
      if (!saved[n.id]) continue;
      const own = isEditableInView(workflow, n) ? tabValues[n.id] : undefined;
      out[n.id] = Object.fromEntries(Object.entries(saved[n.id]).map(([f, v]) => [f, own?.[f] ?? v]));
    }
    return out;
  }, [workflow, fields, tab.workflow]);

  // W-60: cronómetro en vivo y Esc para cancelar.
  useEffect(() => {
    if (!run.running) return;
    const timer = setInterval(() => setTick((t) => t + 1), 100);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void useWorkflowRuns.getState().cancel(tab.id);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [run.running, tab.id]);

  /** Cada cambio de edición se guarda como cualquier nota y pasa a la consulta de la pestaña (W-51). */
  const change = (next: Workflow) => {
    const pruned = pruneValues(next, fields);
    store.edit(tab.id, { content: serializeWorkflow(pruned) });
    store.setWorkflow(tab.id, { values: editedValues(workflow, pruned, fields, tab.workflow?.values ?? {}) });
  };

  const setValue = (nodeId: string, field: string, value: string) =>
    store.setWorkflow(tab.id, { values: setTabValue(workflow, fields, values, nodeId, field, value) });

  const add = (kind: NodeKind) => {
    const result = insertNode(workflow, kind, selected);
    if (!result) {
      useUi.getState().notify('Un workflow tiene como máximo 100 nodos', 'error');
      return;
    }
    change(result.workflow);
    setSelected(result.id);
    setSelectedEdge(null);
  };

  const setOption = (key: keyof WfOptions, checked: boolean) => {
    const next = { ...workflow, options: { ...workflow.options, [key]: checked } };
    // W-41: al marcarla, cada nombre toma el valor del primer nodo de la cadena.
    change(key === 'sameInputs' && checked ? unifyFields(next, fields) : next);
  };

  const remove = (id: string) => {
    change(removeNode(workflow, id));
    if (selected === id) setSelected(null);
  };

  const execute = () => void useWorkflowRuns.getState().execute(tab.id, values);

  /** W-70: estado de cada nodo de la cadena en la última ejecución. */
  const states = useMemo(() => {
    const out: Record<string, { state: NodeState; millis?: number; startedAt?: number }> = {};
    if (editMode) return out;
    for (const id of run.chain) {
      const r = run.nodes[id];
      if (r) out[id] = { state: r.status, millis: r.millis, startedAt: r.startedAt };
      else if (run.running) out[id] = { state: 'pending' };
      else if (run.end) out[id] = { state: 'skipped' };
    }
    return out;
  }, [editMode, run]);

  const named = run.chain.filter((id) => workflow.nodes.some((n) => n.id === id && isNamed(n)));
  const current = named.findIndex((id) => run.nodes[id]?.status === 'running');
  const done = named.filter((id) => run.nodes[id] && run.nodes[id].status !== 'running').length;
  const inputs = chain(workflow).filter((n) => n.kind === 'input' && (n.rows ?? []).length > 0);
  const node = selected ? workflow.nodes.find((n) => n.id === selected) : undefined;

  return (
    <div className={`wf-view ${editMode ? 'editing' : 'viewing'}`}>
      {editMode ? (
        <div className="wf-toolbar" role="toolbar" aria-label="Workflow">
          <div className="wf-add">
            {ADD.map(([kind, text]) => (
              <button key={kind} type="button" onClick={() => add(kind)}>
                {text}
              </button>
            ))}
          </div>
          <div className="wf-options" role="group" aria-label="Casillas">
            {OPTIONS.map(([key, text]) => (
              <label key={key}>
                <input type="checkbox" checked={workflow.options[key]} onChange={(e) => setOption(key, e.target.checked)} /> {text}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <>
          {inputs.length > 0 && (
            // W-50
            <div className="sql-form wf-inputs" role="group" aria-label="Input">
              {inputs.map((n) => (
                <fieldset key={n.id} className="wf-input-group">
                  <legend>{n.name}</legend>
                  {(n.rows ?? []).map((r) => (
                    <div key={r.name} className="sql-field">
                      <label htmlFor={`wf-in-${n.id}-${r.name}`}>
                        <span className="sql-field-name">{r.name}</span>
                      </label>
                      <input
                        id={`wf-in-${n.id}-${r.name}`}
                        value={values[n.id]?.[r.name] ?? ''}
                        onChange={(e) => setValue(n.id, r.name, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            execute();
                          }
                        }}
                      />
                    </div>
                  ))}
                </fieldset>
              ))}
            </div>
          )}
          <div className="sql-runbar wf-runbar" role="toolbar" aria-label="Ejecución">
            <button
              type="button"
              className="primary"
              onClick={execute}
              disabled={run.running !== null || !reachesFinish(workflow)}
              title={reachesFinish(workflow) ? 'Ctrl+Intro' : 'La cadena no llega de Start a Finish'}
              aria-keyshortcuts="Control+Enter"
            >
              Ejecutar
            </button>
            {run.running && (
              <button type="button" onClick={() => void useWorkflowRuns.getState().cancel(tab.id)} aria-keyshortcuts="Escape" title="Esc">
                Cancelar
              </button>
            )}
            {(run.running || run.end) && (
              <span className="sql-chrono" role="timer" aria-live="off">
                {run.running ? elapsedText(performance.now() - run.running.startedAt) : elapsedText(run.end!.millis)}
              </span>
            )}
            {run.running && named.length > 0 && (
              <span className="muted">
                Nodo {Math.min(named.length, current >= 0 ? current + 1 : done + 1)} de {named.length}
              </span>
            )}
            {run.end && (
              <span className={`wf-end ${run.end.status}`} role="status">
                {run.end.message}
              </span>
            )}
            <span className="sql-runbar-spacer" />
            {!workflow.options.lockValues || inputs.length > 0 ? (
              <button
                type="button"
                onClick={() => store.setWorkflow(tab.id, { values: savedValues(workflow, fields) })}
                title="Vuelve a los valores guardados en edición"
              >
                Restablecer
              </button>
            ) : null}
          </div>
          {run.error && (
            <div className="sql-errors" role="alert">
              <p>{run.error.details && run.error.details.length > 0 ? 'No se puede ejecutar:' : run.error.message}</p>
              {run.error.details && (
                <ul>
                  {run.error.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!reachesFinish(workflow) && (
            <p className="sql-warning" role="status">
              La cadena no llega de Start a Finish. Pulsa «Editar» para unir los nodos.
            </p>
          )}
        </>
      )}

      <div className="wf-main">
        <div className="wf-scroll">
          <WorkflowCanvas
            workflow={workflow}
            editable={editMode}
            notes={analysis.notes}
            fields={fields}
            values={editMode ? savedValues(workflow, fields) : values}
            selectedNode={selected}
            selectedEdge={selectedEdge}
            states={states}
            onSelectNode={(id) => {
              setSelected(id);
              if (id) setSelectedEdge(null);
            }}
            onSelectEdge={setSelectedEdge}
            onMove={(id, x, y) => change(moveNode(workflow, id, x, y))}
            onConnect={(from, to) => change(connect(workflow, from, to))}
            onDeleteNode={remove}
            onDeleteEdge={(from) => {
              change(removeEdge(workflow, from));
              setSelectedEdge(null);
            }}
          />
        </div>
        {node && (
          <NodePanel
            key={node.id}
            workflow={workflow}
            node={node}
            editMode={editMode}
            notes={analysis.notes}
            fields={fields}
            values={values}
            run={editMode ? undefined : run.nodes[node.id]}
            onChange={change}
            onValue={setValue}
            onRemove={remove}
          />
        )}
      </div>
    </div>
  );
}
