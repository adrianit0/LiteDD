import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { WorkflowNoteInfo } from '../../api';
import type { NoteType } from '../../types';
import {
  conditionProblem,
  edgeKey,
  fieldsOf,
  flow,
  GRID,
  isNamed,
  KIND_LABEL,
  label,
  outsOf,
  tabOrder,
  type FieldsByNode,
  type NodeValues,
  type Out,
  type WfEdge,
  type WfNode,
  type WfPoint,
  type Workflow,
} from '../../workflow/model';
import { NOTE_DROP, type NoteDropDetail } from '../../workflow/noteDrop';
import { elapsedText } from '../../sql/results';

/** Estado visible de un nodo durante o después de una ejecución (W-70). */
export type NodeState = 'pending' | 'running' | 'ok' | 'error' | 'cancelled' | 'skipped';

export interface NodeStateView {
  state: NodeState;
  millis?: number;
  startedAt?: number;
  /** W-70: la salida que tomó una Condición. */
  branch?: 'yes' | 'no';
}

interface Props {
  workflow: Workflow;
  editable: boolean;
  notes: Record<string, WorkflowNoteInfo>;
  fields: FieldsByNode;
  /** Valores que se muestran en los nodos: los guardados en edición o los de la pestaña en consulta (W-25). */
  values: NodeValues;
  selectedNode: string | null;
  /** La clave de la flecha seleccionada (edgeKey). */
  selectedEdge: string | null;
  states: Record<string, NodeStateView>;
  /** W-15: las salidas del flujo sin flecha. */
  openOutputs: { id: string; out: Out }[];
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (key: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (from: string, out: Out, to: string) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (from: string, out: Out) => void;
  /** W-18 */
  onEdgePoints: (from: string, out: Out, points: WfPoint[]) => void;
  /** W-19: una nota soltada desde el árbol, en coordenadas del lienzo. */
  onNoteDrop: (noteId: string, type: NoteType, x: number, y: number) => void;
}

const NODE_W = 176;
const CIRCLE = 56;
/** Altura de la entrada y la salida de cada nodo, medida desde arriba. */
const PORT_Y = 28;
/** W-90: alturas de las salidas «Sí» y «No» de una Condición. */
const PORT_YES = 20;
const PORT_NO = 46;
const MAX_FIELDS = 4;
const MARGIN = 96;
/** Lo que hay que mover el puntero sobre una flecha para que se cree un codo y no sea un clic. */
const BEND_THRESHOLD = 4;

function width(n: WfNode): number {
  return isNamed(n) ? NODE_W : CIRCLE;
}

function portY(n: WfNode, out: Out): number {
  if (n.kind !== 'condition') return PORT_Y;
  return out === 'no' ? PORT_NO : PORT_YES;
}

const OUT_LABEL: Record<'yes' | 'no', string> = { yes: 'Sí', no: 'No' };

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

/** La distancia de p al segmento a-b. */
function distance(p: WfPoint, a: WfPoint, b: WfPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** W-18: un codo nuevo va en el tramo más cercano al puntero. */
function insertionIndex(p: WfPoint, start: WfPoint, points: WfPoint[], end: WfPoint): number {
  const all = [start, ...points, end];
  let best = 0;
  for (let i = 1; i < all.length - 1; i++) {
    if (distance(p, all[i], all[i + 1]) < distance(p, all[best], all[best + 1])) best = i;
  }
  return best;
}

function snapPoint(p: WfPoint): WfPoint {
  return { x: Math.max(0, Math.round(p.x / GRID) * GRID), y: Math.max(0, Math.round(p.y / GRID) * GRID) };
}

/** Un codo que se arrastra: la flecha, sus codos mientras dura y cuál se mueve. */
interface Bend {
  from: string;
  out: Out;
  points: WfPoint[];
  index: number;
  /** Una flecha sin tocar todavía crea el codo al superar BEND_THRESHOLD. */
  pending: { at: WfPoint; index: number } | null;
  moved: boolean;
}

/** W-10 a W-19, W-25, W-70, W-90: el lienzo con los nodos y las flechas. */
export function WorkflowCanvas(props: Props) {
  const { workflow, editable, notes, fields, values, selectedNode, selectedEdge, states } = props;
  const canvas = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const [link, setLink] = useState<{ from: string; out: Out; x: number; y: number } | null>(null);
  const [bend, setBend] = useState<Bend | null>(null);
  const onNoteDrop = useRef(props.onNoteDrop);
  onNoteDrop.current = props.onNoteDrop;

  // W-19: el árbol envía la nota soltada como un evento DOM.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const listener = (e: Event) => {
      const { noteId, type, clientX, clientY } = (e as CustomEvent<NoteDropDetail>).detail;
      const r = el.getBoundingClientRect();
      onNoteDrop.current(noteId, type, clientX - r.left - NODE_W / 2, clientY - r.top - PORT_Y);
    };
    el.addEventListener(NOTE_DROP, listener);
    return () => el.removeEventListener(NOTE_DROP, listener);
  }, []);

  const inFlow = new Set(flow(workflow).map((n) => n.id));
  const open = new Set(props.openOutputs.map((o) => edgeKey(o.id, o.out)));
  const position = (n: WfNode) => (drag?.id === n.id ? { x: drag.x, y: drag.y } : { x: n.x, y: n.y });
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  const pointsOf = (e: WfEdge) => (bend && bend.from === e.from && bend.out === e.out ? bend.points : e.points ?? []);
  const allPoints = workflow.edges.flatMap((e) => pointsOf(e));
  const maxX = Math.max(...workflow.nodes.map((n) => position(n).x + width(n)), ...allPoints.map((p) => p.x)) + MARGIN;
  const maxY = Math.max(...workflow.nodes.map((n) => position(n).y + 140), ...allPoints.map((p) => p.y)) + MARGIN;

  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startDrag = (e: PointerEvent<HTMLDivElement>, n: WfNode) => {
    props.onSelectNode(n.id);
    if (!editable || e.button !== 0) return;
    const p = point(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
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

  const startLink = (e: PointerEvent<HTMLSpanElement>, n: WfNode, out: Out) => {
    e.stopPropagation();
    if (!editable || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setLink({ from: n.id, out, ...point(e) });
  };

  const endLink = (e: PointerEvent) => {
    if (!link) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-node-id]');
    const to = target?.dataset.nodeId;
    if (to && to !== link.from) props.onConnect(link.from, link.out, to);
    setLink(null);
  };

  /** W-18: pulsar una flecha la selecciona; arrastrarla crea un codo en ese tramo. */
  const startBend = (e: PointerEvent<SVGPathElement>, edge: WfEdge, start: WfPoint, end: WfPoint) => {
    e.stopPropagation();
    props.onSelectNode(null);
    props.onSelectEdge(edgeKey(edge.from, edge.out));
    if (!editable || e.button !== 0) return;
    const at = point(e);
    const points = edge.points ?? [];
    // Se captura en el propio elemento: los movimientos llegan al lienzo por burbujeo y el clic sigue siendo suyo.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setBend({ from: edge.from, out: edge.out, points, index: -1, pending: { at, index: insertionIndex(at, start, points, end) }, moved: false });
  };

  /** W-18: arrastrar un codo lo mueve. */
  const startHandle = (e: PointerEvent<SVGCircleElement>, edge: WfEdge, index: number) => {
    e.stopPropagation();
    if (!editable || e.button !== 0) return;
    // En el propio codo, para que el doble clic le llegue a él y no al lienzo.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setBend({ from: edge.from, out: edge.out, points: edge.points ?? [], index, pending: null, moved: false });
  };

  const moveBend = (e: PointerEvent) => {
    if (!bend) return;
    const p = point(e);
    if (bend.pending) {
      if (Math.hypot(p.x - bend.pending.at.x, p.y - bend.pending.at.y) < BEND_THRESHOLD) return;
      const points = [...bend.points];
      points.splice(bend.pending.index, 0, snapPoint(p));
      setBend({ ...bend, points, index: bend.pending.index, pending: null, moved: true });
      return;
    }
    setBend({ ...bend, points: bend.points.map((q, i) => (i === bend.index ? snapPoint(p) : q)), moved: true });
  };

  const endBend = () => {
    if (!bend) return;
    if (bend.moved) props.onEdgePoints(bend.from, bend.out, bend.points);
    setBend(null);
  };

  const removePoint = (edge: WfEdge, index: number) =>
    props.onEdgePoints(edge.from, edge.out, (edge.points ?? []).filter((_, i) => i !== index));

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

  /** W-18: con codos, tramos rectos; sin ellos, una curva. */
  const edgePath = (start: WfPoint, points: WfPoint[], end: WfPoint) => {
    if (points.length > 0) return `M ${[start, ...points, end].map((p) => `${p.x} ${p.y}`).join(' L ')}`;
    const bendX = Math.max(40, Math.abs(end.x - start.x) / 2);
    return `M ${start.x} ${start.y} C ${start.x + bendX} ${start.y}, ${end.x - bendX} ${end.y}, ${end.x} ${end.y}`;
  };

  const outPoint = (n: WfNode, out: Out) => {
    const p = position(n);
    return { x: p.x + width(n), y: p.y + portY(n, out) };
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
        moveBend(e);
        if (link) setLink({ ...link, ...point(e) });
      }}
      onPointerUp={(e) => {
        endDrag();
        endBend();
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
          const pb = position(b);
          const start = outPoint(a, e.out);
          const end = { x: pb.x, y: pb.y + PORT_Y };
          const points = pointsOf(e);
          const d = edgePath(start, points, end);
          const key = edgeKey(e.from, e.out);
          const selected = selectedEdge === key;
          const loose = !inFlow.has(e.from) || !inFlow.has(e.to);
          const outText = e.out ? ` por «${OUT_LABEL[e.out]}»` : '';
          return (
            <g key={key}>
              <path className={`wf-edge${selected ? ' selected' : ''}${loose ? ' loose' : ''}`} d={d}
                markerEnd={`url(#${selected ? 'wf-arrow-selected' : 'wf-arrow'})`} />
              {editable && (
                <path
                  className="wf-edge-hit"
                  d={d}
                  tabIndex={0}
                  role="button"
                  aria-label={`Flecha de ${label(a)}${outText} a ${label(b)}`}
                  aria-pressed={selected}
                  onPointerDown={(ev) => startBend(ev, e, start, end)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Delete' || ev.key === 'Backspace') {
                      ev.preventDefault();
                      props.onDeleteEdge(e.from, e.out);
                    } else if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      props.onSelectEdge(key);
                    }
                  }}
                />
              )}
              {editable && selected &&
                points.map((p, i) => (
                  // W-18: los codos de la flecha seleccionada; doble clic quita uno.
                  <circle
                    key={i}
                    className="wf-bend"
                    cx={p.x}
                    cy={p.y}
                    r={5}
                    aria-label={`Codo ${i + 1}`}
                    onPointerDown={(ev) => startHandle(ev, e, i)}
                    onDoubleClick={(ev) => {
                      ev.stopPropagation();
                      removePoint(e, i);
                    }}
                  />
                ))}
            </g>
          );
        })}
        {link && (() => {
          const a = byId.get(link.from)!;
          return <path className="wf-edge selected" d={edgePath(outPoint(a, link.out), [], { x: link.x, y: link.y })} />;
        })()}
      </svg>

      {tabOrder(workflow).map((n) => {
        const p = position(n);
        const st = states[n.id];
        const problem = noteProblem(n, notes) ?? (editable && n.kind === 'condition' ? conditionProblem(n.condition ?? '') : null);
        const info = n.noteId ? notes[n.noteId] : undefined;
        const names = n.kind === 'set' ? (n.assignments ?? []).map((a) => a.target) : fieldsOf(n, fields);
        const shown = names.slice(0, MAX_FIELDS);
        const classes = [
          'wf-node',
          `wf-kind-${n.kind}`,
          isNamed(n) ? 'box' : 'circle',
          selectedNode === n.id ? 'selected' : '',
          inFlow.has(n.id) ? '' : 'loose',
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
            aria-label={`${KIND_LABEL[n.kind]}${isNamed(n) ? ` ${n.name ?? ''}` : ''}${st ? `, ${STATE_TEXT[st.state]}` : ''}${
              st?.branch ? `, salió por «${OUT_LABEL[st.branch]}»` : ''}`}
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
                  {st && <StateMark state={st.state} millis={st.millis} startedAt={st.startedAt} branch={st.branch} />}
                </div>
                <div className="wf-node-sub muted">
                  {n.kind === 'http' && info?.title && `${info.title} · ${info.method ?? ''} ${info.endpoint ?? ''}`}
                  {n.kind === 'sql' && info?.title}
                  {n.kind === 'wait' && `${n.seconds || '?'} s`}
                  {n.kind === 'input' && `${(n.rows ?? []).length} valores`}
                  {/* W-29 */}
                  {n.kind === 'login' && `Usuario: ${values[n.id]?.user || 'el del perfil'}`}
                  {n.kind === 'condition' && <code>{n.condition}</code>}
                  {n.kind === 'foreach' && <>Lista: <code>{n.list}</code></>}
                  {n.kind === 'break' && 'Termina el bucle'}
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
                {n.kind === 'set' && shown.length > 0 && (
                  <ul className="wf-node-fields">
                    {(n.assignments ?? []).slice(0, MAX_FIELDS).map((a, i) => (
                      <li key={i}>
                        <span className="wf-field-name">{a.target}</span> = {a.value}
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
            {outsOf(n).map((out) => (
              <span
                key={out ?? ''}
                className={`wf-port out${out ? ` ${out}` : ''}${inFlow.has(n.id) && open.has(edgeKey(n.id, out)) ? ' open' : ''}`}
                style={{ top: portY(n, out) - 6 }}
                aria-hidden="true"
                data-out={out}
                title={editable ? `${out ? `«${OUT_LABEL[out]}»: ` : ''}arrastra hasta otro nodo para unirlos` : undefined}
                onPointerDown={(e) => startLink(e, n, out)}
              >
                {out && <span className="wf-port-label">{OUT_LABEL[out]}</span>}
              </span>
            ))}
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

function StateMark({ state, millis, startedAt, branch }: NodeStateView) {
  const icon = state === 'ok' ? '✓' : state === 'error' ? '✗' : state === 'running' ? '…' : state === 'cancelled' ? '■' : '';
  const time = state === 'running' && startedAt !== undefined ? elapsedText(performance.now() - startedAt)
    : millis !== undefined ? elapsedText(millis) : '';
  return (
    <span className={`wf-state ${state}`}>
      {icon} {branch ? `→ ${OUT_LABEL[branch]}` : time}
    </span>
  );
}
