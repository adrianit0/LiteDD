import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTree } from '../stores/treeStore';
import { useUi } from '../stores/uiStore';
import { useNote } from '../stores/noteStore';
import { visibleRows, type VisibleRow } from '../tree';
import { createAndOpen, openNote, renameNote } from '../actions';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { TypeIcon } from './TypeIcon';

const ROW_HEIGHT = 28;
const INDENT = 16;

interface MenuState {
  id: string;
  x: number;
  y: number;
}

/** Árbol virtualizado de notas (N-01 a N-06, N-13), manejable con teclado (U-08). */
export function Tree() {
  const nodes = useTree((s) => s.nodes);
  const collapsed = useUi((s) => s.collapsed);
  const openId = useNote((s) => s.note?.id);
  const rows = useMemo(() => visibleRows(nodes, collapsed), [nodes, collapsed]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const focusIndex = Math.max(0, rows.findIndex((r) => r.node.id === (focusId ?? openId)));

  // Lleva el foco del teclado a la fila activa cuando cambia.
  useEffect(() => {
    if (!focusId) return;
    const index = rows.findIndex((r) => r.node.id === focusId);
    if (index < 0) return;
    virtualizer.scrollToIndex(index);
    requestAnimationFrame(() => {
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
  ];

  const onKeyDown = (e: KeyboardEvent, row: VisibleRow, index: number) => {
    if (renamingId) return;
    const ui = useUi.getState();
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
      case 'ContextMenu': {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenu({ id: row.node.id, x: rect.left + 24, y: rect.bottom });
        break;
      }
      default:
        if (e.key === 'F10' && e.shiftKey) {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ id: row.node.id, x: rect.left + 24, y: rect.bottom });
          break;
        }
        return;
    }
    e.preventDefault();
  };

  if (rows.length === 0) {
    return <p className="tree-empty muted">Todavía no hay notas.</p>;
  }

  return (
    <div className="tree" ref={scroller} role="tree" aria-label="Notas">
      <div className="tree-inner" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          const { node } = row;
          const active = node.id === openId;
          return (
            <div
              key={node.id}
              data-id={node.id}
              className={`tree-row${active ? ' active' : ''}`}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-expanded={row.hasChildren ? row.expanded : undefined}
              aria-selected={active}
              tabIndex={item.index === focusIndex ? 0 : -1}
              style={{ transform: `translateY(${item.start}px)`, paddingLeft: 6 + row.depth * INDENT }}
              onClick={() => {
                setFocusId(node.id);
                void openNote(node.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setFocusId(node.id);
                setMenu({ id: node.id, x: e.clientX, y: e.clientY });
              }}
              onKeyDown={(e) => onKeyDown(e, row, item.index)}
            >
              <button
                type="button"
                className={`twisty${row.hasChildren ? '' : ' hidden'}`}
                tabIndex={-1}
                aria-label={row.expanded ? 'Plegar' : 'Desplegar'}
                onClick={(e) => {
                  e.stopPropagation();
                  useUi.getState().toggleCollapsed(node.id);
                }}
              >
                {row.expanded ? '▾' : '▸'}
              </button>
              <TypeIcon type={node.type} />
              {renamingId === node.id ? (
                <RenameInput
                  initial={node.title}
                  onDone={(value) => {
                    setRenamingId(null);
                    setFocusId(node.id);
                    if (value !== null) void renameNote(node.id, value);
                  }}
                />
              ) : (
                <span className="tree-title">{node.title}</span>
              )}
            </div>
          );
        })}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(null)} />}
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
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value);
        if (e.key === 'Escape') finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}
