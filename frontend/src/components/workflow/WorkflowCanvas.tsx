import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { WorkflowNoteInfo } from '../../api';
import { chain, fieldsOf, GRID, isNamed, KIND_LABEL, label, tabOrder, type FieldsByNode, type NodeValues, type WfNode, type Workflow } from '../../workflow/model';
import { elapsedText } from '../../sql/results';

/** Estado visible de un nodo durante o después de una ejecución (W-70). */
export type NodeState = 'pending' | 'running' | 'ok' | 'error' | 'cancelled' | 'skipped';

interface Props {
  workflow: Workflow;
  editable: boolean;
  notes: Record<string, WorkflowNoteInfo>;
  fields: FieldsByNode;
  /** Valores que se muestran en los nodos: los guardados en edición o los de la pestaña en consulta (W-25). */
  values: NodeValues;
  selectedNode: string | null;
  selectedEdge: string | null;
  states: Record<string, { state: NodeState; millis?: number; startedAt?: number }>;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (from: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (from: string) => void;
}

const NODE_W = 176;
const CIRCLE = 56;
/** Altura de la entrada y la salida de cada nodo, medida desde arriba. */
const PORT_Y = 28;
const MAX_FIELDS = 4;
const MARGIN = 96;

function width(n: WfNode): number {
  return isNamed(n) ? NODE_W : CIRCLE;
}

/** W-26: lo que le pasa a la nota de un nodo, o null. */
export function noteProblem(n: WfNode, notes: Record<string, WorkflowNoteInfo>): string | null {
  if (n.kind !== 'http' && n.kind !== 'sql') return null;
  if (!n.noteId) return 'Sin nota';
  const info = notes[n.noteId];
  if (!info) return null;
  if (info.state === 'trash') return 'La nota está en la papelera';
  if (info.state === 'missing') return 'La nota no existe';
  if (info.type !== n.kind) return `La nota no es ${KIND_LABEL[n.kind]}`;
  if (info.error) return info.error;
  if (n.kind === 'sql' && info.executable === false) return 'No es una consulta';
  return null;
}

/** W-10 a W-17, W-25, W-70: el lienzo con los nodos y las flechas. */
export function WorkflowCanvas(props: Props) {
  const { workflow, editable, notes, fields, values, selectedNode, selectedEdge, states } = props;
  const canvas = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);

  const inChain = new Set(chain(workflow).map((n) => n.id));
  const position = (n: WfNode) => (drag?.id === n.id ? { x: drag.x, y: drag.y } : { x: n.x, y: n.y });
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  const maxX = Math.max(...workflow.nodes.map((n) => position(n).x + width(n))) + MARGIN;
  const maxY = Math.max(...workflow.nodes.map((n) => position(n).y + 140)) + MARGIN;

  const point = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startDrag = (e: PointerEvent<HTMLDivElement>, n: WfNode) => {
    props.onSelectNode(n.id);
    if (!editable || e.button !== 0) return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y, x: n.x, y: n.y });
  };

  const moveDrag = (e: PointerEvent) => {
    if (!drag) return;
    const p = point(e);
    const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID);
    setDrag({ ...drag, x: snap(p.x - drag.dx), y: snap(p.y - drag.dy) });
  };

  const endDrag = () => {
    if (!drag) return;
    const n = byId.get(drag.id);
    if (n && (n.x !== drag.x || n.y !== drag.y)) props.onMove(drag.id, drag.x, drag.y);
    setDrag(null);
  };

  const startLink = (e: PointerEvent<HTMLSpanElement>, n: WfNode) => {
    e.stopPropagation();
    if (!editable || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setLink({ from: n.id, ...point(e) });
  };

  const endLink = (e: PointerEvent) => {
    if (!link) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-node-id]');
    const to = target?.dataset.nodeId;
    if (to && to !== link.from) props.onConnect(link.from, to);
    setLink(null);
  };

  const onNodeKey = (e: KeyboardEvent, n: WfNode) => {
    // Los atajos globales, como Ctrl+Intro (W-60) o Ctrl+E, siguen funcionando con el foco en un nodo.
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Enter' || e.key === ' ') {
      props.onSelectNode(n.id);
    } else if (editable && (e.key === 'Delete' || e.key === 'Backspace') && isNamed(n)) {
      props.onDeleteNode(n.id);
    } else if (editable && e.key.startsWith('Arrow')) {
      // W-11: con el teclado, una celda de la rejilla.
      const dx = e.key === 'ArrowLeft' ? -GRID : e.key === 'ArrowRight' ? GRID : 0;
      const dy = e.key === 'ArrowUp' ? -GRID : e.key === 'ArrowDown' ? GRID : 0;
      props.onSelectNode(n.id);
      props.onMove(n.id, n.x + dx, n.y + dy);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
    const bend = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div
      ref={canvas}
      className={`wf-canvas${editable ? ' editable' : ''}`}
      style={{ width: maxX, height: maxY }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          props.onSelectNode(null);
          props.onSelectEdge(null);
        }
      }}
      onPointerMove={(e) => {
        moveDrag(e);
        if (link) setLink({ ...link, ...point(e) });
      }}
      onPointerUp={(e) => {
        endDrag();
        endLink(e);
      }}
    >
      <svg className="wf-edges" width={maxX} height={maxY} aria-hidden={false} role="group" aria-label="Flechas">
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="wf-arrow-head" />
          </marker>
          <marker id="wf-arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="wf-arrow-head selected" />
          </marker>
        </defs>
        {workflow.edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const pa = position(a);
          const pb = position(b);
          const d = edgePath(pa.x + width(a), pa.y + PORT_Y, pb.x, pb.y + PORT_Y);
          const selected = selectedEdge === e.from;
          const loose = !inChain.has(e.from) || !inChain.has(e.to);
          return (
            <g key={`${e.from}-${e.to}`}>
              <path className={`wf-edge${selected ? ' selected' : ''}${loose ? ' loose' : ''}`} d={d}
                markerEnd={`url(#${selected ? 'wf-arrow-selected' : 'wf-arrow'})`} />
              {editable && (
                <path
                  className="wf-edge-hit"
                  d={d}
                  tabIndex={0}
                  role="button"
                  aria-label={`Flecha de ${label(a)} a ${label(b)}`}
                  aria-pressed={selected}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    props.onSelectNode(null);
                    props.onSelectEdge(e.from);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Delete' || ev.key === 'Backspace') {
                      ev.preventDefault();
                      props.onDeleteEdge(e.from);
                    } else if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      props.onSelectEdge(e.from);
                    }
                  }}
                />
              )}
            </g>
          );
        })}
        {link && (() => {
          const a = byId.get(link.from)!;
          const pa = position(a);
          return <path className="wf-edge selected" d={edgePath(pa.x + width(a), pa.y + PORT_Y, link.x, link.y)} />;
        })()}
      </svg>

      {tabOrder(workflow).map((n) => {
        const p = position(n);
        const st = states[n.id];
        const problem = noteProblem(n, notes);
        const info = n.noteId ? notes[n.noteId] : undefined;
        const names = fieldsOf(n, fields);
        const shown = names.slice(0, MAX_FIELDS);
        const classes = [
          'wf-node',
          `wf-kind-${n.kind}`,
          isNamed(n) ? 'box' : 'circle',
          selectedNode === n.id ? 'selected' : '',
          inChain.has(n.id) ? '' : 'loose',
          st ? `state-${st.state}` : '',
        ].filter(Boolean).join(' ');
        return (
          <div
            key={n.id}
            data-node-id={n.id}
            className={classes}
            style={{ left: p.x, top: p.y }}
            role="button"
            tabIndex={0}
            aria-label={`${KIND_LABEL[n.kind]}${isNamed(n) ? ` ${n.name ?? ''}` : ''}${st ? `, ${STATE_TEXT[st.state]}` : ''}`}
            aria-pressed={selectedNode === n.id}
            onPointerDown={(e) => startDrag(e, n)}
            onClick={() => props.onSelectNode(n.id)}
            onKeyDown={(e) => onNodeKey(e, n)}
          >
            {isNamed(n) ? (
              <>
                <div className="wf-node-head">
                  <span className="wf-node-kind">{KIND_LABEL[n.kind]}</span>
                  <span className="wf-node-name">{n.name || '(sin nombre)'}</span>
                  {st && <StateMark state={st.state} millis={st.millis} startedAt={st.startedAt} />}
                </div>
                <div className="wf-node-sub muted">
                  {n.kind === 'http' && info?.title && `${info.title} · ${info.method ?? ''} ${info.endpoint ?? ''}`}
                  {n.kind === 'sql' && info?.title}
                  {n.kind === 'wait' && `${n.seconds || '?'} s`}
                  {n.kind === 'input' && `${(n.rows ?? []).length} valores`}
                  {/* W-29 */}
                  {n.kind === 'login' && `Usuario: ${values[n.id]?.user || 'el del perfil'}`}
                </div>
                {problem && <div className="wf-node-problem">{problem}</div>}
                {(n.kind === 'http' || n.kind === 'sql' || n.kind === 'input') && shown.length > 0 && (
                  <ul className="wf-node-fields">
                    {shown.map((f) => (
                      <li key={f}>
                        <span className="wf-field-name">{f}</span> = {values[n.id]?.[f] ?? ''}
                      </li>
                    ))}
                    {names.length > MAX_FIELDS && <li className="muted">+{names.length - MAX_FIELDS}</li>}
                  </ul>
                )}
              </>
            ) : (
              <span className="wf-circle-label">{KIND_LABEL[n.kind]}</span>
            )}
            {n.kind !== 'start' && <span className="wf-port in" aria-hidden="true" />}
            {n.kind !== 'finish' && (
              <span className="wf-port out" aria-hidden="true" title={editable ? 'Arrastra hasta otro nodo para unirlos' : undefined}
                onPointerDown={(e) => startLink(e, n)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const STATE_TEXT: Record<NodeState, string> = {
  pending: 'pendiente',
  running: 'en curso',
  ok: 'correcto',
  error: 'error',
  cancelled: 'cancelado',
  skipped: 'no ejecutado',
};

function StateMark({ state, millis, startedAt }: { state: NodeState; millis?: number; startedAt?: number }) {
  const icon = state === 'ok' ? '✓' : state === 'error' ? '✗' : state === 'running' ? '…' : state === 'cancelled' ? '■' : '';
  const time = state === 'running' && startedAt !== undefined ? elapsedText(performance.now() - startedAt)
    : millis !== undefined ? elapsedText(millis) : '';
  return (
    <span className={`wf-state ${state}`}>
      {icon} {time}
    </span>
  );
}
