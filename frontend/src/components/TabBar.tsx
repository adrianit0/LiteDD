import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { isSplit, paneTabs, useTabs, visibleIdOf, type Side, type Tab } from '../stores/tabsStore';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { TypeIcon } from './TypeIcon';
import { STATUS_TEXT } from './NotePane';

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export const PANE_NAME: Record<Side, string> = { left: 'izquierdo', right: 'derecho' };

/** Barra de pestañas de un panel (P-01 a P-05, P-10, P-11, P-15, P-17). El arrastre lo gestiona TabsArea. */
export function TabBar({ side }: { side: Side }) {
  const allTabs = useTabs((s) => s.tabs);
  const visibleId = useTabs((s) => visibleIdOf(s.tabs, s.shown, s.activeId, side));
  const tabs = paneTabs(allTabs, side);
  const split = isSplit(allTabs);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  // P-15: soltar sobre la barra lleva la pestaña a este panel.
  const { setNodeRef } = useDroppable({ id: `bar:${side}` });

  // P-10: la pestaña visible siempre queda a la vista.
  useEffect(() => {
    if (!visibleId) return;
    strip.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(visibleId)}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [visibleId]);

  const tabMenu = (tab: Tab): MenuItem[] => {
    const s = useTabs.getState();
    const items: MenuItem[] = [
      { label: 'Cerrar', shortcut: 'Alt+W', onSelect: () => void s.close(tab.id) },
      { label: 'Cerrar las demás', onSelect: () => void s.closeOthers(tab.id) },
      { label: 'Cerrar las de la derecha', onSelect: () => void s.closeRight(tab.id) },
      { label: 'Duplicar', onSelect: () => void s.duplicate(tab.id) },
    ];
    // P-15: la única pestaña de la izquierda no se mueve, para no dejar el panel vacío.
    if (side === 'right') items.push({ label: 'Mover a la izquierda', onSelect: () => s.moveToSide(tab.id, 'left') });
    else if (tabs.length > 1) items.push({ label: 'Mover a la derecha', onSelect: () => s.moveToSide(tab.id, 'right') });
    return items;
  };

  const listMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      x: rect.right - 240,
      y: rect.bottom,
      items: tabs.map((t) => ({ label: tabLabel(t), onSelect: () => useTabs.getState().activate(t.id) })),
    });
  };

  if (tabs.length === 0) return null;

  return (
    <div className="tabbar" ref={setNodeRef}>
      <SortableContext id={`tabs-${side}`} items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="tab-strip" ref={strip} role="tablist" aria-label={split ? `Pestañas del panel ${PANE_NAME[side]}` : 'Pestañas'}>
          {tabs.map((t) => (
            <TabItem
              key={t.id}
              tab={t}
              active={t.id === visibleId}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, items: tabMenu(t) });
              }}
            />
          ))}
        </div>
      </SortableContext>
      <button type="button" className="tab-list-button" aria-label="Todas las pestañas" title="Todas las pestañas" onClick={listMenu}>
        ▾
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function tabLabel(tab: Tab): string {
  return tab.title || tab.note?.title || 'Cargando…';
}

function TabItem({ tab, active, onContextMenu }: { tab: Tab; active: boolean; onContextMenu: (e: MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  const store = useTabs.getState();
  const label = tabLabel(tab);

  return (
    <div
      ref={setNodeRef}
      data-tab-id={tab.id}
      className={`tab${active ? ' active' : ''}${tab.preview ? ' preview' : ''}${isDragging ? ' dragging' : ''}`}
      style={{
        transform: transform ? `translate3d(${Math.round(transform.x)}px, 0, 0)` : undefined,
        transition,
      }}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={label}
      onClick={() => store.activate(tab.id)}
      // P-14: doble clic fija la pestaña provisional.
      onDoubleClick={() => store.pin(tab.id)}
      // P-04: clic central cierra la pestaña.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          void store.close(tab.id);
        }
      }}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') store.cycle(1);
        else if (e.key === 'ArrowLeft') store.cycle(-1);
        else if (e.key === 'Delete') void store.close(tab.id);
        else return;
        e.preventDefault();
      }}
    >
      {tab.note && <TypeIcon type={tab.note.type} />}
      <span className="tab-title">{label}</span>
      <span className={`tab-status status-${tab.status}`} role="img" aria-label={STATUS_TEXT[tab.status]} title={STATUS_TEXT[tab.status]}>
        {tab.status === 'saved' ? '' : '●'}
      </span>
      <button
        type="button"
        className="tab-close"
        aria-label={`Cerrar ${label}`}
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void store.close(tab.id);
        }}
      >
        ×
      </button>
    </div>
  );
}
