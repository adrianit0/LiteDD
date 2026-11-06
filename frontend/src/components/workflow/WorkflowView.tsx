import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useTabs, type Tab } from '../../stores/tabsStore';
import { runOf, useWorkflowRun, useWorkflowRuns, viewedExecution, viewedIteration } from '../../stores/workflowRunStore';
import { useUi } from '../../stores/uiStore';
import { elapsedText } from '../../sql/results';
import type { NoteType } from '../../types';
import {
  addNoteNode,
  connect,
  editedValues,
  flow,
  initialTabValues,
  insertNode,
  isEditableInView,
  label,
  moveNode,
  openOutputs,
  parseWorkflow,
  pruneValues,
  removeEdge,
  removeNode,
  savedValues,
  serializeWorkflow,
  setEdgePoints,
  setTabValue,
  unifyFields,
  wouldCycle,
  type FieldsByNode,
  type NodeKind,
  type NodeValues,
  type WfOptions,
  type Workflow,
} from '../../workflow/model';
import { droppable } from '../../workflow/noteDrop';
import { useWorkflowAnalysis } from '../../workflow/useAnalysis';
import { NodePanel } from './NodePanel';
import { WorkflowCanvas, type NodeStateView } from './WorkflowCanvas';
import { ExecutionSummary, executionTime, loopProgress } from './ExecutionSummary';

/** W-14: los botones para añadir nodos, en dos grupos: llamadas y valores, y control del flujo. */
const ADD: [NodeKind, string][][] = [
  [
    ['login', '+ Login'],
    ['http', '+ HTTP'],
    ['sql', '+ SQL'],
    ['wait', '+ Espera'],
    ['input', '+ Input'],
  ],
  [
    ['condition', '+ Condición'],
    ['foreach', '+ Bucle'],
    ['break', '+ Break'],
    ['set', '+ Cambiar valor'],
  ],
];

const OPTIONS: [keyof WfOptions, string][] = [
  ['sameInputs', 'Mismos inputs tendrá mismo valor'],
  ['stopOnError', 'Parar si error'],
  ['stopOnMissing', 'Parar si no existe input'],
  ['lockValues', 'Fijar valores de input'],
];

/** W-01 a W-79, W-90 a W-99: un workflow en edición (diseño) o en consulta (valores, ejecución, resultados y ejecuciones). */
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
  const change = (next: Workflow, before: Workflow = workflow) => {
    const pruned = pruneValues(next, fields);
    const current = useTabs.getState().tabs.find((t) => t.id === tab.id);
    store.edit(tab.id, { content: serializeWorkflow(pruned) });
    store.setWorkflow(tab.id, { values: editedValues(before, pruned, fields, current?.workflow?.values ?? {}) });
  };

  const setValue = (nodeId: string, field: string, value: string) =>
    store.setWorkflow(tab.id, { values: setTabValue(workflow, fields, values, nodeId, field, value) });

  const tooMany = () => useUi.getState().notify('Un workflow tiene como máximo 100 nodos', 'error');

  const add = (kind: NodeKind) => {
    const result = insertNode(workflow, kind, selected);
    if (!result) {
      tooMany();
      return;
    }
    change(result.workflow);
    setSelected(result.id);
    setSelectedEdge(null);
  };

  /** W-12: una flecha que cerraría un ciclo no se crea y se avisa. */
  const link = (current: Workflow, from: string, out: 'yes' | 'no' | undefined, to: string) => {
    if (wouldCycle(current, from, to)) {
      useUi.getState().notify('Esa flecha cerraría un ciclo: solo el Bucle repite', 'error');
      return;
    }
    change(connect(current, from, out, to), current);
  };

  /** W-19: una nota HTTP o SQL soltada desde el árbol se convierte en un nodo donde se suelta. */
  const dropNote = async (noteId: string, type: NoteType, x: number, y: number) => {
    if (!editMode || !droppable(type)) return;
    try {
      const { notes: [picked] } = await api.workflowAnalyze([noteId]);
      const initial = Object.fromEntries(Object.entries(picked?.values ?? {}).map(([f, v]) => [f, v ?? '']));
      // Lo guardado puede haber cambiado mientras se analizaba la nota.
      const latest = parseWorkflow(useTabs.getState().tabs.find((t) => t.id === tab.id)?.content ?? tab.content);
      const result = addNoteNode(latest, type, noteId, picked?.title ?? '', initial, x, y);
      if (!result) {
        tooMany();
        return;
      }
      change(result.workflow, latest);
      setSelected(result.id);
      setSelectedEdge(null);
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo leer la nota', 'error');
    }
  };

  const setOption = (key: keyof WfOptions, checked: boolean) => {
    const next = { ...workflow, options: { ...workflow.options, [key]: checked } };
    // W-41: al marcarla, cada nombre toma el valor del primer nodo del flujo.
    change(key === 'sameInputs' && checked ? unifyFields(next, fields) : next);
  };

  const remove = (id: string) => {
    change(removeNode(workflow, id));
    if (selected === id) setSelected(null);
  };

  const execute = () => void useWorkflowRuns.getState().execute(tab.id, values);

  /** W-75, W-79: la ejecución y la vuelta que se ven, y si la ejecución es la que está en curso. */
  const viewed = viewedExecution(run);
  const iteration = viewedIteration(run, viewed);
  const live = run.running !== null && viewed?.id === run.running.executionId;
  const viewIteration = (key: string | null) => useWorkflowRuns.getState().viewIteration(tab.id, key);

  /** W-70, W-79: estado de cada nodo del flujo en la vuelta que se ve. */
  const states = useMemo(() => {
    const out: Record<string, NodeStateView> = {};
    if (editMode || !viewed) return out;
    for (const id of viewed.chain) {
      const r = runOf(viewed, id, iteration);
      if (r) out[id] = { state: r.status, millis: r.millis, startedAt: r.startedAt, branch: r.branch };
      else out[id] = { state: live ? 'pending' : 'skipped' };
    }
    return out;
  }, [editMode, viewed, live, iteration]);

  const open = openOutputs(workflow);
  const canRun = open.length === 0;
  const inputs = flow(workflow).filter((n) => n.kind === 'input' && (n.rows ?? []).length > 0);
  const node = selected ? workflow.nodes.find((n) => n.id === selected) : undefined;
  const runningNode = live && viewed?.current ? workflow.nodes.find((n) => n.id === viewed.current!.nodeId) : undefined;

  return (
    <div className={`wf-view ${editMode ? 'editing' : 'viewing'}`}>
      {editMode ? (
        <div className="wf-toolbar" role="toolbar" aria-label="Workflow">
          {ADD.map((group, i) => (
            <div key={i} className="wf-add">
              {group.map(([kind, text]) => (
                <button key={kind} type="button" onClick={() => add(kind)}>
                  {text}
                </button>
              ))}
            </div>
          ))}
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
          <div className="sql-runbar wf-runbar" role="toolbar" aria-label="Barra de ejecución">
            <button
              type="button"
              className="primary"
              onClick={execute}
              disabled={run.running !== null || !canRun}
              title={canRun ? 'Ctrl+Intro' : 'El flujo tiene salidas sin flecha'}
              aria-keyshortcuts="Control+Enter"
            >
              Ejecutar
            </button>
            {run.running && (
              <button type="button" onClick={() => void useWorkflowRuns.getState().cancel(tab.id)} aria-keyshortcuts="Escape" title="Esc">
                Cancelar
              </button>
            )}
            {(live || viewed?.end) && (
              <span className="sql-chrono" role="timer" aria-live="off">
                {live ? elapsedText(performance.now() - run.running!.startedAt) : elapsedText(viewed!.end!.millis)}
              </span>
            )}
            {runningNode && (
              // W-71: el nodo en curso y la vuelta de cada Bucle.
              <span className="muted wf-progress">
                {[label(runningNode), ...loopProgress(workflow, viewed!, viewed!.current!.key)].join(' · ')}
              </span>
            )}
            {viewed?.end && (
              <span className={`wf-end ${viewed.end.status}`} role="status">
                {viewed.end.message}
              </span>
            )}
            <span className="sql-runbar-spacer" />
            {run.executions.length > 0 && (
              // W-75
              <label className="wf-executions">
                <span className="muted">Ejecución</span>
                <select
                  value={viewed?.id ?? ''}
                  onChange={(e) => useWorkflowRuns.getState().view(tab.id, e.target.value === run.executions[0]?.id ? null : e.target.value)}
                >
                  {run.executions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {executionTime(x)} · {x.end ? `${x.end.message} · ${elapsedText(x.end.millis)}` : x.id === run.running?.executionId ? 'En curso' : 'Interrumpida'}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
          {!canRun && (
            <p className="sql-warning" role="status">
              El flujo tiene salidas sin flecha. Pulsa «Editar» para unirlas.
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
            openOutputs={open}
            onSelectNode={(id) => {
              setSelected(id);
              if (id) setSelectedEdge(null);
            }}
            onSelectEdge={setSelectedEdge}
            onMove={(id, x, y) => change(moveNode(workflow, id, x, y))}
            onConnect={(from, out, to) => link(workflow, from, out, to)}
            onDeleteNode={remove}
            onDeleteEdge={(from, out) => {
              change(removeEdge(workflow, from, out));
              setSelectedEdge(null);
            }}
            onEdgePoints={(from, out, points) => change(setEdgePoints(workflow, from, out, points))}
            onNoteDrop={(noteId, type, x, y) => void dropNote(noteId, type, x, y)}
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
            execution={editMode ? undefined : viewed}
            iteration={iteration}
            onIteration={viewIteration}
            onChange={change}
            onConnect={(from, out, to) => link(workflow, from, out, to)}
            onValue={setValue}
            onRemove={remove}
          />
        )}
        {!node && !editMode && viewed && (
          // W-77
          <ExecutionSummary workflow={workflow} execution={viewed} live={live} iteration={iteration} onIteration={viewIteration}
            onSelect={setSelected} />
        )}
      </div>
    </div>
  );
}
