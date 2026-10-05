import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { useTree } from '../stores/treeStore';
import { useUi } from '../stores/uiStore';
import { useActiveTab, useTabs } from '../stores/tabsStore';
import { visibleRows, type VisibleRow } from '../tree';
import {
  createHoverExpander,
  dropDestination,
  keyboardDestination,
  zoneAt,
  type Destination,
  type DropZone,
  type KeyboardMove,
} from '../treeOps';
import { createAndOpen, deleteNote, editTags, moveNote, openNote, renameNote, toggleFavorite } from '../actions';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { MoveDialog } from './MoveDialog';
import { TypeIcon } from './TypeIcon';

const ROW_HEIGHT = 28;
/** N-07: fila con la descripción debajo del título. */
const ROW_HEIGHT_DESCRIBED = 42;
const INDENT = 16;
const ARROW_MOVES: Record<string, KeyboardMove> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

interface MenuState {
  id: string;
  x: number;
  y: number;
}

interface DropTarget {
  id: string;
  zone: DropZone;
  dest: Destination | null;
}

function sameDest(a: Destination | null, b: Destination | null): boolean {
  return a === b || (a !== null && b !== null && a.parentId === b.parentId && a.position === b.position);
}

/** Árbol virtualizado de notas (N-01 a N-06, N-13, N-60 a N-65), manejable con teclado (U-08). */
export function Tree() {
  const nodes = useTree((s) => s.nodes);
  const collapsed = useUi((s) => s.collapsed);
  const openId = useActiveTab()?.noteId;
  const rows = useMemo(() => visibleRows(nodes, collapsed), [nodes, collapsed]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const hover = useRef(createHoverExpander((id) => useUi.getState().expand(id)));
  const scroller = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (rows[index]?.node.description ? ROW_HEIGHT_DESCRIBED : ROW_HEIGHT),
    overscan: 12,
  });

  const focusIndex = Math.max(0, rows.findIndex((r) => r.node.id === (focusId ?? openId)));

  // N-07: la altura de una fila depende de si tiene descripción; se recalcula al cambiar las filas.
  useEffect(() => {
    virtualizer.measure();
  }, [rows, virtualizer]);

  // Lleva el foco del teclado a la fila activa cuando cambia. Solo si el foco ya está en el árbol (o en
  // ningún sitio): un cambio de filas, como el título nuevo tras un guardado, no se lo quita al editor.
  useEffect(() => {
    if (!focusId) return;
    const index = rows.findIndex((r) => r.node.id === focusId);
    if (index < 0) return;
    const active = document.activeElement;
    if (active && active !== document.body && !scroller.current?.contains(active)) return;
    virtualizer.scrollToIndex(index);
    requestAnimationFrame(() => {
      const current = document.activeElement;
      if (current && current !== document.body && !scroller.current?.contains(current)) return;
      scroller.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusId)}"]`)?.focus();
    });
  }, [focusId, rows, virtualizer]);

  const moveFocus = (index: number) => {
    const row = rows[Math.min(rows.length - 1, Math.max(0, index))];
    if (row) setFocusId(row.node.id);
  };

  const menuItems = (id: string): MenuItem[] => [
    { label: 'Nueva nota Markdown hija', onSelect: () => void createAndOpen(id, 'md') },
    { label: 'Nueva nota SQL hija', onSelect: () => void createAndOpen(id, 'sql') },
    { label: 'Renombrar', shortcut: 'F2', onSelect: () => setRenamingId(id) },
    {
      label: nodes.find((n) => n.id === id)?.favorite ? 'Quitar de favoritas' : 'Marcar como favorita',
      onSelect: () => void toggleFavorite(id),
    },
    { label: 'Etiquetas…', onSelect: () => void editTags(id) },
    { label: 'Mover a…', onSelect: () => setMovingId(id) },
    { label: 'Eliminar', shortcut: 'Supr', onSelect: () => void deleteNote(id) },
  ];

  const openMenuAt = (e: KeyboardEvent, id: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ id, x: rect.left + 24, y: rect.bottom });
  };

  const onKeyDown = (e: KeyboardEvent, row: VisibleRow, index: number) => {
    if (renamingId) return;
    const ui = useUi.getState();
    // N-63: Alt+flechas mueven la nota.
    if (e.altKey && ARROW_MOVES[e.key]) {
      e.preventDefault();
      const dest = keyboardDestination(nodes, row.node.id, ARROW_MOVES[e.key]);
      if (dest) {
        void moveNote(row.node.id, dest).then(() => setFocusId(row.node.id));
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        moveFocus(index + 1);
        break;
      case 'ArrowUp':
        moveFocus(index - 1);
        break;
      case 'Home':
        moveFocus(0);
        break;
      case 'End':
        moveFocus(rows.length - 1);
        break;
      case 'ArrowRight':
        if (row.hasChildren && !row.expanded) ui.toggleCollapsed(row.node.id);
        else if (row.expanded) moveFocus(index + 1);
        break;
      case 'ArrowLeft':
        if (row.expanded) ui.toggleCollapsed(row.node.id);
        else if (row.node.parentId) setFocusId(row.node.parentId);
        break;
      case 'Enter':
        void openNote(row.node.id);
        break;
      case 'F2':
        setRenamingId(row.node.id);
        break;
      case 'Delete':
        void deleteNote(row.node.id);
        break;
      case 'ContextMenu':
        openMenuAt(e, row.node.id);
        break;
      default:
        if (e.key === 'F10' && e.shiftKey) {
          openMenuAt(e, row.node.id);
          break;
        }
        return;
    }
    e.preventDefault();
  };

  /** Zona y destino según dónde está el puntero sobre el nodo de destino (N-60, N-62). */
  const dropAt = (
    activeId: UniqueIdentifier,
    over: { id: UniqueIdentifier; rect: { top: number; height: number } },
    e: { activatorEvent: Event; delta: { y: number } },
  ): DropTarget => {
    const pointerY = (e.activatorEvent as PointerEvent).clientY + e.delta.y;
    const zone = zoneAt((pointerY - over.rect.top) / over.rect.height);
    return { id: String(over.id), zone, dest: dropDestination(nodes, String(activeId), String(over.id), zone) };
  };

  const onDragMove = (e: DragMoveEvent) => {
    const over = e.over;
    if (!over) {
      hover.current.clear();
      setDrop(null);
      return;
    }
    const targetId = String(over.id);
    const next = dropAt(e.active.id, over, e);
    setDrop((prev) => (prev?.id === next.id && prev.zone === next.zone && sameDest(prev.dest, next.dest) ? prev : next));

    // N-65: mantener el arrastre sobre un nodo plegado lo despliega.
    const row = rows.find((r) => r.node.id === targetId);
    hover.current.over(targetId, Boolean(row?.hasChildren && !row.expanded));
  };

  const endDrag = () => {
    hover.current.clear();
    setDragId(null);
    setDrop(null);
  };

  if (rows.length === 0) {
    return <p className="tree-empty muted">Todavía no hay notas.</p>;
  }

  const dragged = dragId ? nodes.find((n) => n.id === dragId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setDragId(String(e.active.id))}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        // El destino se calcula con la posición final del puntero, no con el último indicador pintado.
        const target = e.over ? dropAt(e.active.id, e.over, e) : null;
        endDrag();
        // N-62: un destino no válido no hace nada.
        if (target?.dest) void moveNote(String(e.active.id), target.dest);
      }}
      onDragCancel={endDrag}
    >
      <div className="tree" ref={scroller} role="tree" aria-label="Notas">
        <div className="tree-inner" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const id = row.node.id;
            return (
              <TreeRow
                key={id}
                row={row}
                start={item.start}
                active={id === openId}
                focusable={item.index === focusIndex}
                dropZone={drop?.id === id ? (drop.dest ? drop.zone : 'invalid') : null}
                renaming={renamingId === id}
                onOpen={(newTab) => {
                  setFocusId(id);
                  void openNote(id, newTab);
                }}
                onPin={() => {
                  // P-14: doble clic en el árbol abre la nota en una pestaña fija.
                  const tabs = useTabs.getState();
                  const open = tabs.tabs.find((t) => t.noteId === id);
                  if (open) tabs.pin(open.id);
                }}
                onContextMenu={(x, y) => {
                  setFocusId(id);
                  setMenu({ id, x, y });
                }}
                onKeyDown={(e) => onKeyDown(e, row, item.index)}
                onRenamed={(value) => {
                  setRenamingId(null);
                  setFocusId(id);
                  if (value !== null) void renameNote(id, value);
                }}
              />
            );
          })}
        </div>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(null)} />}
        {movingId && <MoveDialog noteId={movingId} onClose={() => setMovingId(null)} />}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="drag-chip">
            <TypeIcon type={dragged.type} />
            <span>{dragged.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface RowProps {
  row: VisibleRow;
  start: number;
  active: boolean;
  focusable: boolean;
  dropZone: DropZone | 'invalid' | null;
  renaming: boolean;
  onOpen: (newTab: boolean) => void;
  onPin: () => void;
  onContextMenu: (x: number, y: number) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onRenamed: (value: string | null) => void;
}

function TreeRow({ row, start, active, focusable, dropZone, renaming, onOpen, onPin, onContextMenu, onKeyDown, onRenamed }: RowProps) {
  const { node } = row;
  const drag = useDraggable({ id: node.id, disabled: renaming });
  const dropRef = useDroppable({ id: node.id });
  const setRef = (el: HTMLDivElement | null) => {
    drag.setNodeRef(el);
    dropRef.setNodeRef(el);
  };

  const classes = ['tree-row'];
  if (active) classes.push('active');
  if (drag.isDragging) classes.push('dragging');
  if (dropZone) classes.push(`drop-${dropZone}`);
  if (node.description) classes.push('described');

  return (
    <div
      // Primero lo de dnd-kit: el rol y el foco del árbol mandan sobre los suyos.
      {...drag.attributes}
      {...drag.listeners}
      aria-roledescription={undefined}
      aria-describedby={undefined}
      ref={setRef}
      data-id={node.id}
      className={classes.join(' ')}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-selected={active}
      tabIndex={focusable ? 0 : -1}
      // Con top y no con transform: dnd-kit mide las zonas de soltado sin transformaciones.
      style={{ top: start, paddingLeft: 6 + row.depth * INDENT }}
      onClick={() => onOpen(false)}
      onDoubleClick={onPin}
      // N-03, P-03: clic central abre siempre una pestaña nueva.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onOpen(true);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className={`twisty${row.hasChildren ? '' : ' hidden'}`}
        tabIndex={-1}
        aria-label={row.expanded ? 'Plegar' : 'Desplegar'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          useUi.getState().toggleCollapsed(node.id);
        }}
      >
        {row.expanded ? '▾' : '▸'}
      </button>
      <TypeIcon type={node.type} />
      {renaming ? (
        <RenameInput initial={node.title} onDone={onRenamed} />
      ) : (
        <span className="tree-text">
          <span className="tree-title">{node.title}</span>
          {/* N-07: una línea, cortada con «…» donde acabe el panel; el texto completo en el título emergente. */}
          {node.description && (
            <span className="tree-description" title={node.description}>
              {node.description}
            </span>
          )}
        </span>
      )}
      {node.favorite && !renaming && (
        <span className="favorite-mark" role="img" aria-label="Favorita">
          ★
        </span>
      )}
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <input
      ref={ref}
      className="rename-input"
      aria-label="Nuevo título"
      defaultValue={initial}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value);
        if (e.key === 'Escape') finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}
