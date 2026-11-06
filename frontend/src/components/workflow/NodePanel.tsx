import { useState } from 'react';
import { api, type WorkflowNoteInfo } from '../../api';
import { openNote } from '../../actions';
import { copyText } from '../../clipboard';
import { useUi } from '../../stores/uiStore';
import { runOf, type Execution, type NodeRun } from '../../stores/workflowRunStore';
import {
  assignmentProblem,
  conditionProblem,
  flow,
  isEditableInView,
  isNamed,
  KIND_LABEL,
  label,
  nameProblem,
  nextOf,
  outsOf,
  proposeName,
  referenceWarnings,
  removeEdge,
  rowProblem,
  setFieldValue,
  updateNode,
  wouldCycle,
  type FieldsByNode,
  type NodeValues,
  type Out,
  type WfAssignment,
  type WfNode,
  type WfRow,
  type Workflow,
} from '../../workflow/model';
import { elapsedText, toMarkdownTable } from '../../sql/results';
import { HttpResponseView } from '../http/HttpResponseView';
import { ResultsTable } from '../sql/ResultsTable';
import { NotePicker } from './NotePicker';
import { noteProblem } from './WorkflowCanvas';
import { EnteredValue, enteredValue, fieldLabel, IterationPicker } from './ExecutionSummary';

interface Props {
  workflow: Workflow;
  node: WfNode;
  editMode: boolean;
  notes: Record<string, WorkflowNoteInfo>;
  fields: FieldsByNode;
  /** Valores de consulta de la pestaña (W-50). */
  values: NodeValues;
  /** W-75: la ejecución que se ve; solo en consulta. */
  execution: Execution | undefined;
  /** W-79: la vuelta que se ve. */
  iteration: string;
  onIteration: (key: string | null) => void;
  onChange: (next: Workflow) => void;
  /** W-12, W-17: unir una salida con otro nodo, sin cerrar ciclos. */
  onConnect: (from: string, out: Out, to: string) => void;
  onValue: (nodeId: string, field: string, value: string) => void;
  onRemove: (id: string) => void;
}

const copy = (text: string, what: string) => copyText(text, `${what} copiado`);

/** W-17, W-90: el texto de cada «Sale hacia». */
const NEXT_LABEL: Record<string, string> = { '': 'Sale hacia', yes: 'Si se cumple, sale hacia', no: 'Si no, sale hacia' };

/** W-50: Condición, Bucle y Cambiar valor son parte del diseño: solo se cambian en edición. */
const DESIGN_ONLY = new Set(['condition', 'foreach', 'set']);

/** W-23 a W-29, W-90 a W-97 en edición; W-50, W-72, W-79 en consulta: el panel del nodo seleccionado. */
export function NodePanel(props: Props) {
  const { workflow, node, editMode, notes, fields, values, execution, iteration, onChange, onValue, onRemove } = props;
  const [picking, setPicking] = useState(false);
  const info = node.noteId ? notes[node.noteId] : undefined;
  const problem = noteProblem(node, notes);
  const update = (changes: Partial<WfNode>) => onChange(updateNode(workflow, node.id, changes));
  const run = execution ? runOf(execution, node.id, iteration) : undefined;

  /** W-22, W-23, W-24: al elegir la nota, sus valores y, si el nombre es el de serie, uno a partir del título. */
  const pick = async (noteId: string) => {
    try {
      const { notes: [picked] } = await api.workflowAnalyze([noteId]);
      const initial = Object.fromEntries(Object.entries(picked?.values ?? {}).map(([f, v]) => [f, v ?? '']));
      const auto = !node.name || /^(Http|Sql)\d+$/.test(node.name);
      onChange(updateNode(workflow, node.id, {
        noteId,
        values: initial,
        name: auto ? proposeName(workflow, node.kind, picked?.title ?? '', node.id) : node.name,
      }));
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo leer la nota', 'error');
    }
  };

  const fieldNames = node.kind === 'http' || node.kind === 'sql' ? (info?.fields ?? []) : [];
  const editableInView = isEditableInView(workflow, node);

  /** Un campo con sus avisos (W-36, W-91) y, en consulta, lo que entró en la ejecución y la vuelta elegidas (W-76). */
  const field = (name: string, value: string, onInput: (v: string) => void, type?: string, readOnly = false, problem?: string | null) => {
    const warnings = editMode ? referenceWarnings(workflow, node.id, value) : [];
    const id = `wf-${node.id}-field-${name}`;
    const entered = enteredValue(run, name);
    return (
      <div key={name} className="sql-field wf-field">
        <label htmlFor={id}>
          <span className="sql-field-name">{fieldLabel(name, node.kind)}</span>
          {type && <span className="sql-field-type">{type}</span>}
        </label>
        <input
          id={id}
          value={value}
          readOnly={readOnly}
          className={DESIGN_ONLY.has(node.kind) ? 'wf-code' : undefined}
          placeholder={node.kind === 'login' ? 'Vacío: el usuario del perfil' : node.kind === 'foreach' ? '$Query1' : undefined}
          onChange={(e) => onInput(e.target.value)}
        />
        {editMode && problem && <span className="sql-field-error">{problem}</span>}
        {warnings.map((w) => (
          <span key={w} className="wf-warning">{w}</span>
        ))}
        {!editMode && run && entered !== undefined && (
          <span className="wf-used muted">
            Entró: <EnteredValue raw={run.raw?.[name] ?? ''} value={entered} missing={run.missing} />
          </span>
        )}
      </div>
    );
  };

  /** W-17, W-90: un selector por salida; no ofrece los nodos con los que se cerraría un ciclo (W-12). */
  const nextSelect = (out: Out) => {
    const id = `wf-${node.id}-next${out ? `-${out}` : ''}`;
    const current = nextOf(workflow, node.id, out) ?? '';
    return (
      <div key={out ?? ''} className="sql-field wf-field">
        <label htmlFor={id}>
          <span>{NEXT_LABEL[out ?? '']}</span>
        </label>
        <select
          id={id}
          value={current}
          onChange={(e) => (e.target.value ? props.onConnect(node.id, out, e.target.value) : onChange(removeEdge(workflow, node.id, out)))}
        >
          <option value="">— Ninguno —</option>
          {workflow.nodes
            .filter((n) => n.id !== node.id && n.kind !== 'start' && (n.id === current || !wouldCycle(workflow, node.id, n.id)))
            .map((n) => (
              <option key={n.id} value={n.id}>
                {label(n)}
              </option>
            ))}
        </select>
      </div>
    );
  };

  /** W-93, W-79: el elemento del Bucle en la vuelta que se ve. */
  const item = node.kind === 'foreach' && execution
    ? [...execution.iterations].reverse().find((x) => x.nodeId === node.id && (iteration === x.key || iteration.startsWith(`${x.key}.`)))
    : undefined;

  return (
    <aside className="wf-panel" aria-label={`Nodo ${label(node)}`}>
      <header className="wf-panel-head">
        <strong>{KIND_LABEL[node.kind]}</strong>
        {isNamed(node) && !editMode && <span> · {node.name}</span>}
        {run && run.status !== 'running' && run.millis !== undefined && <span className="muted"> · {elapsedText(run.millis)}</span>}
      </header>

      {!editMode && execution && (
        <IterationPicker workflow={workflow} execution={execution} value={iteration} onChange={props.onIteration} />
      )}

      {editMode && isNamed(node) && (
        <div className="sql-field wf-field">
          <label htmlFor={`wf-${node.id}-name`}>
            <span>Nombre</span>
          </label>
          <input id={`wf-${node.id}-name`} value={node.name ?? ''} onChange={(e) => update({ name: e.target.value })} />
          {nameProblem(workflow, node) && <span className="sql-field-error">{nameProblem(workflow, node)}</span>}
        </div>
      )}

      {(node.kind === 'http' || node.kind === 'sql') && (
        <div className="wf-note">
          {editMode ? (
            <button type="button" onClick={() => setPicking(true)}>
              {info?.title ? `Nota: ${info.title}` : 'Elegir nota…'}
            </button>
          ) : (
            info?.title && <span>Nota: {info.title}</span>
          )}
          {node.noteId && info?.state === 'active' && (
            <button type="button" className="link-button" onClick={() => void openNote(node.noteId!, true)}>
              Abrir nota
            </button>
          )}
          {node.kind === 'http' && info?.method && (
            <code className="wf-endpoint">
              {info.method} {info.endpoint}
            </code>
          )}
          {problem && <p className="wf-problem">{problem}</p>}
        </div>
      )}

      {node.kind === 'login' && (
        // W-29
        <p className="muted wf-note">Hace el login con la nota de login de «Ajustes». Los nodos HTTP siguientes usan su sesión.</p>
      )}
      {node.kind === 'condition' && (
        // W-90 a W-92
        <p className="muted wf-note">Sigue por «Sí» si se cumple y por «No» si no. Ejemplo: <code>$Conn1.data.total &gt; 0 &amp;&amp; $Input1.tipo == "A"</code></p>
      )}
      {node.kind === 'foreach' && (
        // W-93, W-94
        <p className="muted wf-note">Repite lo que le sigue, hasta Finish, una vez por elemento de la lista. En cada vuelta, <code>${node.name || 'Bucle1'}</code> vale el elemento.</p>
      )}
      {node.kind === 'break' && (
        // W-96
        <p className="muted wf-note">Termina el Bucle en curso, sin más vueltas, y sigue por su salida.</p>
      )}
      {node.kind === 'set' && (
        // W-97, W-98
        <p className="muted wf-note">Cambia un valor de un nodo anterior para usarlo después. El valor se lee como JSON si lo es: <code>54</code> es un número y <code>"54"</code>, un texto.</p>
      )}

      {editMode ? (
        <>
          {fieldNames.map((f) =>
            field(f.name, node.values?.[f.name] ?? '', (v) => onChange(setFieldValue(workflow, fields, node.id, f.name, v)), f.type),
          )}
          {node.kind === 'login' && field('user', node.values?.user ?? '', (v) => update({ values: { ...node.values, user: v } }))}
          {node.kind === 'wait' && field('seconds', node.seconds ?? '', (v) => update({ seconds: v }))}
          {node.kind === 'input' && <RowsEditor workflow={workflow} nodeId={node.id} rows={node.rows ?? []} onRows={(rows) => update({ rows })} />}
          {node.kind === 'condition' &&
            field('condition', node.condition ?? '', (v) => update({ condition: v }), undefined, false, conditionProblem(node.condition ?? ''))}
          {node.kind === 'foreach' &&
            field('list', node.list ?? '', (v) => update({ list: v }), undefined, false, (node.list ?? '').trim() === '' ? 'Falta la lista' : null)}
          {node.kind === 'set' && (
            <AssignmentsEditor workflow={workflow} nodeId={node.id} rows={node.assignments ?? []} onRows={(assignments) => update({ assignments })} />
          )}
        </>
      ) : (
        <>
          {fieldNames.map((f) => field(f.name, values[node.id]?.[f.name] ?? '', (v) => onValue(node.id, f.name, v), f.type, !editableInView))}
          {node.kind === 'login' && field('user', values[node.id]?.user ?? '', (v) => onValue(node.id, 'user', v), undefined, !editableInView)}
          {node.kind === 'wait' && field('seconds', values[node.id]?.seconds ?? '', (v) => onValue(node.id, 'seconds', v), undefined, !editableInView)}
          {node.kind === 'input' &&
            (node.rows ?? []).map((r) => field(r.name, values[node.id]?.[r.name] ?? '', (v) => onValue(node.id, r.name, v)))}
          {node.kind === 'condition' && field('condition', node.condition ?? '', () => {}, undefined, true)}
          {node.kind === 'foreach' && field('list', node.list ?? '', () => {}, undefined, true)}
          {node.kind === 'set' && (node.assignments ?? []).map((a) => field(a.target, a.value, () => {}, undefined, true))}
          {DESIGN_ONLY.has(node.kind) ? (
            <p className="muted wf-locked">Se cambia en edición.</p>
          ) : (
            !editableInView && node.kind !== 'input' && isNamed(node) && node.kind !== 'break' && (
              <p className="muted wf-locked">Valores fijados: se cambian en edición.</p>
            )
          )}
        </>
      )}

      {editMode && outsOf(node).map((out) => nextSelect(out))}

      {editMode && isNamed(node) && (
        <button type="button" className="wf-remove" onClick={() => onRemove(node.id)}>
          Eliminar nodo
        </button>
      )}

      {!editMode && item && (
        <div className="wf-item">
          <span className="muted">Elemento de la vuelta {item.key.split('.').at(-1)} de {item.total}:</span> <code>{item.item}</code>
        </div>
      )}
      {!editMode && run && <NodeResult run={run} />}
      {!editMode && !run && isNamed(node) && flow(workflow).some((n) => n.id === node.id) && (
        <p className="muted">{execution ? 'No se ejecutó en esta vuelta.' : 'Sin resultados: pulsa «Ejecutar».'}</p>
      )}

      {picking && (node.kind === 'http' || node.kind === 'sql') && (
        <NotePicker type={node.kind} onPick={(id) => void pick(id)} onClose={() => setPicking(false)} />
      )}
    </aside>
  );
}

/** Reordenar filas: intercambia las de las posiciones i y j. */
function swapped<T>(rows: T[], i: number, j: number): T[] {
  const copyRows = [...rows];
  [copyRows[i], copyRows[j]] = [copyRows[j], copyRows[i]];
  return copyRows;
}

/** W-28: filas de un Input, que se añaden, quitan y reordenan. */
function RowsEditor({ workflow, nodeId, rows, onRows }: { workflow: Workflow; nodeId: string; rows: WfRow[]; onRows: (rows: WfRow[]) => void }) {
  const set = (i: number, change: Partial<WfRow>) => onRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  return (
    <div className="wf-rows" role="group" aria-label="Valores del Input">
      {rows.map((r, i) => (
        <div key={i} className="wf-row">
          <input aria-label={`Nombre del valor ${i + 1}`} placeholder="nombre" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input aria-label={`Valor ${i + 1}`} placeholder="valor" value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
          <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => onRows(swapped(rows, i, i - 1))}>↑</button>
          <button type="button" aria-label="Bajar" disabled={i === rows.length - 1} onClick={() => onRows(swapped(rows, i, i + 1))}>↓</button>
          <button type="button" aria-label="Quitar" onClick={() => onRows(rows.filter((_, j) => j !== i))}>×</button>
          {rowProblem(rows, i) && <span className="sql-field-error">{rowProblem(rows, i)}</span>}
          {referenceWarnings(workflow, nodeId, r.value).map((w) => (
            <span key={w} className="wf-warning">{w}</span>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => onRows([...rows, { name: `valor${rows.length + 1}`, value: '' }])}>
        Añadir valor
      </button>
    </div>
  );
}

/** W-97: filas «destino = valor» de Cambiar valor, que se añaden, quitan y reordenan. */
function AssignmentsEditor({ workflow, nodeId, rows, onRows }: {
  workflow: Workflow;
  nodeId: string;
  rows: WfAssignment[];
  onRows: (rows: WfAssignment[]) => void;
}) {
  const set = (i: number, change: Partial<WfAssignment>) => onRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  return (
    <div className="wf-rows" role="group" aria-label="Cambios">
      {rows.map((r, i) => (
        <div key={i} className="wf-row">
          <input aria-label={`Destino ${i + 1}`} placeholder="$Http1.data.valor" value={r.target} onChange={(e) => set(i, { target: e.target.value })} />
          <input aria-label={`Nuevo valor ${i + 1}`} placeholder="$Input1.nuevo" value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
          <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => onRows(swapped(rows, i, i - 1))}>↑</button>
          <button type="button" aria-label="Bajar" disabled={i === rows.length - 1} onClick={() => onRows(swapped(rows, i, i + 1))}>↓</button>
          <button type="button" aria-label="Quitar" onClick={() => onRows(rows.filter((_, j) => j !== i))}>×</button>
          {assignmentProblem(rows, i) && <span className="sql-field-error">{assignmentProblem(rows, i)}</span>}
          {referenceWarnings(workflow, nodeId, `${r.target} ${r.value}`).map((w) => (
            <span key={w} className="wf-warning">{w}</span>
          ))}
        </div>
      ))}
      <button type="button" onClick={() => onRows([...rows, { target: '', value: '' }])}>
        Añadir cambio
      </button>
    </div>
  );
}

/** W-72: la respuesta HTTP, la tabla SQL, la salida de una Condición o el error del nodo. */
function NodeResult({ run }: { run: NodeRun }) {
  if (run.status === 'running') return <p className="muted">En curso…</p>;
  return (
    <div className="wf-result">
      {run.error && <p className="wf-problem" role="status">{run.error.message}</p>}
      {run.branch && <p>Salió por «{run.branch === 'yes' ? 'Sí' : 'No'}».</p>}
      {run.http && <HttpResponseView result={run.http} />}
      {run.sql && (
        <>
          <div className="sql-runbar">
            <span className="sql-timing">{run.sql.rows.length} filas</span>
            <button type="button" onClick={() => void copy(toMarkdownTable(run.sql!.columns, run.sql!.rows), 'Tabla')}>
              Copiar tabla
            </button>
          </div>
          {run.sql.capReached && <p className="sql-warning">Se ha alcanzado el tope de filas.</p>}
          <ResultsTable
            columns={run.sql.columns}
            rows={run.sql.rows}
            firstRowNumber={1}
            truncatedCells={[]}
            sort={null}
            onSort={null}
            onOpenCell={() => {}}
            onCopyCell={(value) => void copy(value ?? 'NULL', 'Valor')}
          />
        </>
      )}
    </div>
  );
}
