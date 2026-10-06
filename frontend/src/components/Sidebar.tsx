import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useUi, SIDEBAR_MAX, SIDEBAR_MIN } from '../stores/uiStore';
import { createAndOpen } from '../actions';
import { Tree } from './Tree';
import { TrashPanel } from './TrashPanel';
import { SearchBox, SearchResults } from './SearchPanel';
import { searchActive, useSearch } from '../stores/searchStore';

/** Panel izquierdo (U-01): botones de nueva nota (N-05), árbol y papelera (N-52); redimensionable. */
export function Sidebar() {
  const width = useUi((s) => s.sidebarWidth);
  const view = useUi((s) => s.sidebarView);
  const searching = useSearch((s) => searchActive(s));
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

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
            <button type="button" onClick={() => void createAndOpen(null, 'md')} aria-keyshortcuts="Alt+N" title="Alt+N">
              + Nueva nota Markdown
            </button>
            <button type="button" onClick={() => void createAndOpen(null, 'sql')} aria-keyshortcuts="Alt+Shift+N" title="Alt+Mayús+N">
              + Nueva nota SQL
            </button>
            <button type="button" onClick={() => void createAndOpen(null, 'http')}>
              + Nueva nota HTTP
            </button>
          </div>
          <SearchBox />
          {searching ? <SearchResults /> : <Tree />}
          <div className="sidebar-footer">
            <button type="button" onClick={() => useUi.getState().setSidebarView('trash')}>
              🗑 Papelera
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
