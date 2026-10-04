import { useEffect, useState } from 'react';
import { matchShortcut } from './keyboard';
import { createAndOpen } from './actions';
import { useNote } from './stores/noteStore';
import { useTree } from './stores/treeStore';
import { useUi } from './stores/uiStore';
import { Sidebar } from './components/Sidebar';
import { NotePane } from './components/NotePane';

/** Disposición de tres zonas: barra superior, panel izquierdo y área principal. */
export function App() {
  const sidebarVisible = useUi((s) => s.sidebarVisible);
  const notices = useUi((s) => s.notices);
  const hasNote = useNote((s) => s.note !== null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([useTree.getState().load(), useUi.getState().load()]).catch((e: Error) => setLoadError(e.message));

    const onKeyDown = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e);
      if (!shortcut) return;
      e.preventDefault();
      const note = useNote.getState();
      switch (shortcut) {
        case 'toggleMode':
          if (note.note) void note.toggleMode();
          break;
        case 'save':
          void note.saveNow();
          break;
        case 'newMarkdown':
          void createAndOpen(null, 'md');
          break;
        case 'newSql':
          void createAndOpen(null, 'sql');
          break;
        case 'toggleSidebar':
          useUi.getState().toggleSidebar();
          break;
      }
    };
    // N-40: al cerrar la ventana se guarda lo pendiente.
    const onPageHide = () => useNote.getState().flushOnUnload();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">LiteDD</span>
      </header>
      <div className="workspace">
        {sidebarVisible && <Sidebar />}
        <main className="main">
          {loadError ? (
            <div className="empty">
              <p className="error-text">No se pudieron cargar las notas: {loadError}</p>
            </div>
          ) : hasNote ? (
            <NotePane />
          ) : (
            <div className="empty">
              <h1>LiteDD</h1>
              <p className="muted">No hay ninguna nota abierta.</p>
              <div className="empty-actions">
                <button type="button" onClick={() => void createAndOpen(null, 'md')}>
                  Nueva nota Markdown
                </button>
                <button type="button" onClick={() => void createAndOpen(null, 'sql')}>
                  Nueva nota SQL
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
      <div className="notices" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className={`notice notice-${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
            <span>{n.text}</span>
            <button type="button" aria-label="Cerrar aviso" onClick={() => useUi.getState().dismiss(n.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
