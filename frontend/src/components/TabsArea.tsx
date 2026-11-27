import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { isSplit, paneTabs, useTabs, useVisibleTab, type Side } from '../stores/tabsStore';
import { SPLIT_MAX, SPLIT_MIN, useUi } from '../stores/uiStore';
import { NotePane } from './NotePane';
import { PANE_NAME, TabBar } from './TabBar';

const RIGHT_ZONE = 'zone:right';
const sideOfBar = (id: string): Side | null => (id === 'bar:left' ? 'left' : id === 'bar:right' ? 'right' : null);

/**
 * P-15: el puntero sobre la zona derecha abre la vista dividida; sobre una barra, elige la pestaña más cercana
 * de esa barra; fuera de ellas, se queda en la barra de la pestaña arrastrada.
 */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const zone = within.find((c) => c.id === RIGHT_ZONE);
  if (zone) return [zone];
  const tabs = useTabs.getState().tabs;
  const bar = within.find((c) => sideOfBar(String(c.id)) !== null);
  const dragged = tabs.find((t) => t.id === args.active.id);
  const side = bar ? sideOfBar(String(bar.id)) : dragged?.side === 'right' ? 'right' : 'left';
  const ids = new Set(paneTabs(tabs, side ?? 'left').map((t) => t.id));
  const closest = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => ids.has(String(c.id))) });
  return closest.length > 0 ? closest : bar ? [bar] : [];
};

/** Área de notas: un panel o, con la vista dividida, dos con su separador (P-15 a P-18, ADR-0053). */
export function TabsArea() {
  const tabs = useTabs((s) => s.tabs);
  const ratio = useUi((s) => s.splitRatio);
  const split = isSplit(tabs);
  const [dragging, setDragging] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  // Una distancia mínima evita que un clic se tome por un arrastre.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false);
    if (!e.over) return;
    const store = useTabs.getState();
    const id = String(e.active.id);
    const overId = String(e.over.id);
    if (overId === RIGHT_ZONE) {
      store.moveToSide(id, 'right');
      return;
    }
    const barSide = sideOfBar(overId);
    if (barSide) {
      store.moveToSide(id, barSide);
      return;
    }
    const from = store.tabs.find((t) => t.id === id);
    const to = store.tabs.find((t) => t.id === overId);
    if (!from || !to || id === overId) return;
    if ((from.side === 'right') === (to.side === 'right')) {
      store.reorder(id, overId);
      return;
    }
    // P-15: en la otra barra, antes o después de la pestaña según el lado de su centro en que se suelte.
    const side: Side = to.side === 'right' ? 'right' : 'left';
    const index = paneTabs(store.tabs, side).findIndex((t) => t.id === overId);
    const dropped = e.active.rect.current.translated;
    const after = dropped ? dropped.left + dropped.width / 2 > e.over.rect.left + e.over.rect.width / 2 : false;
    store.moveToSide(id, side, index + (after ? 1 : 0));
  };

  // P-15: sin vista dividida, la zona derecha solo sirve si queda alguna pestaña a la izquierda.
  const canOpenRight = !split && tabs.length > 1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={() => setDragging(true)}
      onDragCancel={() => setDragging(false)}
      onDragEnd={onDragEnd}
    >
      <div className={`panes${split ? ' split' : ''}`} ref={area}>
        <Pane side="left" split={split} style={split ? { flex: `0 0 calc(${ratio * 100}% - 3px)` } : undefined} />
        {split && <SplitResizer area={area} ratio={ratio} />}
        {split && <Pane side="right" split={split} />}
        {canOpenRight && <RightDropZone visible={dragging} />}
      </div>
    </DndContext>
  );
}

/** P-16: pulsar o escribir en un panel le da el foco. */
function Pane({ side, split, style }: { side: Side; split: boolean; style?: CSSProperties }) {
  const tab = useVisibleTab(side);
  const focused = useTabs((s) => tab !== undefined && s.activeId === tab.id);
  const focus = () => {
    if (tab) useTabs.getState().activate(tab.id);
  };
  return (
    <div
      className={`pane${split && focused ? ' focused' : ''}`}
      style={style}
      role={split ? 'region' : undefined}
      aria-label={split ? `Panel ${PANE_NAME[side]}` : undefined}
      onPointerDownCapture={focus}
      onFocusCapture={focus}
    >
      <TabBar side={side} />
      {tab && <NotePane key={tab.id} tab={tab} />}
    </div>
  );
}

/** P-18: separador que reparte el ancho entre los dos paneles. */
function SplitResizer({ area, ratio }: { area: RefObject<HTMLDivElement | null>; ratio: number }) {
  const drag = useRef(false);
  const setRatio = (r: number) => useUi.getState().setSplitRatio(r);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = area.current?.getBoundingClientRect();
    if (!drag.current || !rect || rect.width === 0) return;
    setRatio((e.clientX - rect.left) / rect.width);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') setRatio(ratio - step);
    else if (e.key === 'ArrowRight') setRatio(ratio + step);
    else return;
    e.preventDefault();
  };
  return (
    <div
      className="split-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Reparto de los paneles"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={SPLIT_MIN * 100}
      aria-valuemax={SPLIT_MAX * 100}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = false)}
      onKeyDown={onKeyDown}
    />
  );
}

/** P-15: zona de la mitad derecha; solo se ve mientras se arrastra una pestaña, y no recibe clics. */
function RightDropZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: RIGHT_ZONE });
  return (
    <div ref={setNodeRef} className={`split-drop-zone${visible ? ' visible' : ''}${isOver ? ' over' : ''}`} aria-hidden="true">
      {visible && <span>Soltar aquí para abrir a la derecha</span>}
    </div>
  );
}
