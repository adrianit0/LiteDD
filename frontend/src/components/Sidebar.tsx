import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useUi, SIDEBAR_MAX, SIDEBAR_MIN } from '../stores/uiStore';
import { newNoteItems } from '../actions';
import { ContextMenu } from './ContextMenu';
import { Tree } from './Tree';
import { TrashPanel } from './TrashPanel';
import { SearchBox, SearchResults } from './SearchPanel';
import { searchActive, useSearch } from '../stores/searchStore';
import { useTree } from '../stores/treeStore';
import { useActiveTab } from '../stores/tabsStore';
import { ancestorsOf } from '../tree';

/** N-09: pliega todas las notas que tienen hijas. */
function collapseAll() {
  const nodes = useTree.getState().nodes;
  const parents = new Set(nodes.map((n) => n.parentId).filter((id): id is string => id !== null));
  useUi.getState().collapseAll([...parents]);
}

/** N-09: muestra en el árbol la nota abierta, desplegando sus madres. */
function revealNote(id: string) {
  const search = useSearch.getState();
  if (searchActive(search)) search.clear();
  const ancestors = ancestorsOf(useTree.getState().nodes, id).map((n) => n.id);
  useUi.getState().revealNote(id, ancestors);
}

/** Panel izquierdo (U-01): botón «Nuevo» (N-05, ADR-0026), contraer y localizar (N-09), árbol y papelera (N-52); redimensionable. */
export function Sidebar() {
  const width = useUi((s) => s.sidebarWidth);
  const view = useUi((s) => s.sidebarView);
  const searching = useSearch((s) => searchActive(s));
  const openId = useActiveTab()?.noteId;
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startWidth: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    useUi.getState().setSidebarWidth(drag.current.startWidth + e.clientX - drag.current.startX);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowLeft') useUi.getState().setSidebarWidth(width - step);
    else if (e.key === 'ArrowRight') useUi.getState().setSidebarWidth(width + step);
    else return;
    e.preventDefault();
  };

  return (
    <aside className="sidebar" style={{ width }} aria-label="Panel de notas">
      {view === 'trash' ? (
        <TrashPanel />
      ) : (
        <>
          <div className="sidebar-actions">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={newMenu !== null}
              // Con el menú abierto, el clic en el botón lo cierra en vez de cerrarlo y volver a abrirlo.
              onPointerDown={(e) => newMenu && e.stopPropagation()}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setNewMenu(newMenu ? null : { x: rect.left, y: rect.bottom + 2 });
              }}
            >
              + Nuevo
            </button>
            <button type="button" className="icon-button" aria-label="Contraer todo" title="Contraer todo" onClick={collapseAll}>
              ⊟
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Localizar nota abierta"
              title="Localizar nota abierta"
              disabled={!openId}
              onClick={() => openId && revealNote(openId)}
            >
              ◎
            </button>
          </div>
          {newMenu && <ContextMenu x={newMenu.x} y={newMenu.y} items={newNoteItems(null)} onClose={() => setNewMenu(null)} />}
          <SearchBox />
          {searching ? <SearchResults /> : <Tree />}
          <div className="sidebar-footer">
            <button type="button" onClick={() => useUi.getState().setSidebarView('trash')}>
              🗑 Papelera
            </button>
            {/* M-65 */}
            <button type="button" onClick={() => useUi.getState().setConstantsOpen(true)}>
              Constantes
            </button>
          </div>
        </>
      )}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ancho del panel"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </aside>
  );
}
