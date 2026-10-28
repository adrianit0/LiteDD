import { useState } from 'react';
import { api, type WorkflowNoteInfo } from '../../api';
import { openNote } from '../../actions';
import { copyText } from '../../clipboard';
import { useUi } from '../../stores/uiStore';
import type { NodeRun } from '../../stores/workflowRunStore';
import {
  chain,
  connect,
  isEditableInView,
  isNamed,
  KIND_LABEL,
  label,
  nameProblem,
  proposeName,
  referenceWarnings,
  removeEdge,
  rowProblem,
  setFieldValue,
  updateNode,
  type FieldsByNode,
  type NodeValues,
  type WfNode,
  type WfRow,
  type Workflow,
} from '../../workflow/model';
import { elapsedText, toMarkdownTable } from '../../sql/results';
import { HttpResponseView } from '../http/HttpResponseView';
import { ResultsTable } from '../sql/ResultsTable';
import { NotePicker } from './NotePicker';
import { noteProblem } from './WorkflowCanvas';

interface Props {
  workflow: Workflow;
  node: WfNode;
  editMode: boolean;
  notes: Record<string, WorkflowNoteInfo>;
  fields: FieldsByNode;
  /** Valores de consulta de la pestaña (W-50). */
  values: NodeValues;
  run: NodeRun | undefined;
  onChange: (next: Workflow) => void;
  onValue: (nodeId: string, field: string, value: string) => void;
  onRemove: (id: string) => void;
}

const copy = (text: string, what: string) => copyText(text, `${what} copiado`);

/** W-23 a W-28 en edición; W-50, W-72 en consulta: el panel del nodo seleccionado. */
export function NodePanel({ workflow, node, editMode, notes, fields, values, run, onChange, onValue, onRemove }: Props) {
  const [picking, setPicking] = useState(false);
  const info = node.noteId ? notes[node.noteId] : undefined;
  const problem = noteProblem(node, notes);
  const update = (changes: Partial<WfNode>) => onChange(updateNode(workflow, node.id, changes));
  const next = workflow.edges.find((e) => e.from === node.id)?.to ?? '';

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

  /** Un campo con sus avisos de referencias (W-36) y, en consulta, el valor usado (W-72). */
  const field = (name: string, value: string, onInput: (v: string) => void, type?: string, readOnly = false) => {
    const warnings = editMode ? referenceWarnings(workflow, node.id, value) : [];
    const used = run?.values?.[name];
    const id = `wf-${node.id}-field-${name}`;
    return (
      <div key={name} className="sql-field wf-field">
        <label htmlFor={id}>
          <span className="sql-field-name">{name}</span>
          {type && <span className="sql-field-type">{type}</span>}
        </label>
        <input id={id} value={value} readOnly={readOnly} onChange={(e) => onInput(e.target.value)} />
        {warnings.map((w) => (
          <span key={w} className="wf-warning">{w}</span>
        ))}
        {!editMode && run?.values && name in run.values && (
          <span className="wf-used muted">
            Usado: <code>{used === null ? 'null' : used}</code>
          </span>
        )}
      </div>
    );
  };

  return (
    <aside className="wf-panel" aria-label={`Nodo ${label(node)}`}>
      <header className="wf-panel-head">
        <strong>{KIND_LABEL[node.kind]}</strong>
        {isNamed(node) && !editMode && <span> · {node.name}</span>}
        {run && run.status !== 'running' && run.millis !== undefined && <span className="muted"> · {elapsedText(run.millis)}</span>}
      </header>

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

      {editMode ? (
        <>
          {fieldNames.map((f) =>
            field(f.name, node.values?.[f.name] ?? '', (v) => onChange(setFieldValue(workflow, fields, node.id, f.name, v)), f.type),
          )}
          {node.kind === 'wait' && field('seconds', node.seconds ?? '', (v) => update({ seconds: v }))}
          {node.kind === 'input' && <RowsEditor workflow={workflow} nodeId={node.id} rows={node.rows ?? []} onRows={(rows) => update({ rows })} />}
        </>
      ) : (
        <>
          {fieldNames.map((f) => field(f.name, values[node.id]?.[f.name] ?? '', (v) => onValue(node.id, f.name, v), f.type, !editableInView))}
          {node.kind === 'wait' && field('seconds', values[node.id]?.seconds ?? '', (v) => onValue(node.id, 'seconds', v), undefined, !editableInView)}
          {node.kind === 'input' &&
            (node.rows ?? []).map((r) => field(r.name, values[node.id]?.[r.name] ?? '', (v) => onValue(node.id, r.name, v)))}
          {!editableInView && node.kind !== 'input' && isNamed(node) && (
            <p className="muted wf-locked">Valores fijados: se cambian en edición.</p>
          )}
        </>
      )}

      {editMode && node.kind !== 'finish' && (
        // W-17: unir sin ratón.
        <div className="sql-field wf-field">
          <label htmlFor={`wf-${node.id}-next`}>
            <span>Sale hacia</span>
          </label>
          <select
            id={`wf-${node.id}-next`}
            value={next}
            onChange={(e) => onChange(e.target.value ? connect(workflow, node.id, e.target.value) : removeEdge(workflow, node.id))}
          >
            <option value="">— Ninguno —</option>
            {workflow.nodes
              .filter((n) => n.id !== node.id && n.kind !== 'start')
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {label(n)}
                </option>
              ))}
          </select>
        </div>
      )}

      {editMode && isNamed(node) && (
        <button type="button" className="wf-remove" onClick={() => onRemove(node.id)}>
          Eliminar nodo
        </button>
      )}

      {!editMode && run && <NodeResult run={run} />}
      {!editMode && !run && isNamed(node) && chain(workflow).some((n) => n.id === node.id) && (
        <p className="muted">Sin resultados: pulsa «Ejecutar».</p>
      )}

      {picking && (node.kind === 'http' || node.kind === 'sql') && (
        <NotePicker type={node.kind} onPick={(id) => void pick(id)} onClose={() => setPicking(false)} />
      )}
    </aside>
  );
}

/** W-28: filas de un Input, que se añaden, quitan y reordenan. */
function RowsEditor({ workflow, nodeId, rows, onRows }: { workflow: Workflow; nodeId: string; rows: WfRow[]; onRows: (rows: WfRow[]) => void }) {
  const set = (i: number, change: Partial<WfRow>) => onRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const swap = (i: number, j: number) => {
    const copyRows = [...rows];
    [copyRows[i], copyRows[j]] = [copyRows[j], copyRows[i]];
    onRows(copyRows);
  };
  return (
    <div className="wf-rows" role="group" aria-label="Valores del Input">
      {rows.map((r, i) => (
        <div key={i} className="wf-row">
          <input aria-label={`Nombre del valor ${i + 1}`} placeholder="nombre" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input aria-label={`Valor ${i + 1}`} placeholder="valor" value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
          <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => swap(i, i - 1)}>↑</button>
          <button type="button" aria-label="Bajar" disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)}>↓</button>
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

/** W-72: la respuesta HTTP, la tabla SQL o el error del nodo. */
function NodeResult({ run }: { run: NodeRun }) {
  if (run.status === 'running') return <p className="muted">En curso…</p>;
  return (
    <div className="wf-result">
      {run.error && <p className="wf-problem" role="status">{run.error.message}</p>}
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
