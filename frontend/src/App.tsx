import { useEffect, useState } from 'react';
import { matchShortcut } from './keyboard';
import { createAndOpen } from './actions';
import { autosaveEnabled, isDirty, useActiveTab, useTabs } from './stores/tabsStore';
import { useTree } from './stores/treeStore';
import { useUi } from './stores/uiStore';
import { Sidebar } from './components/Sidebar';
import { NotePane } from './components/NotePane';
import { TabBar } from './components/TabBar';
import { DialogHost } from './components/DialogHost';
import { ConnectionStatusBar } from './components/ConnectionStatusBar';
import { ConnectionDialog } from './components/ConnectionDialog';
import { useConnection } from './stores/connectionStore';
import { useSqlRuns } from './stores/sqlRunStore';
import { useHttpRuns } from './stores/httpRunStore';
import { QuickSearch } from './components/QuickSearch';
import { SettingsDialog } from './components/SettingsDialog';
import { startPresence } from './presence';

/** Disposición de tres zonas: barra superior, panel izquierdo y área principal con pestañas. */
export function App() {
  const sidebarVisible = useUi((s) => s.sidebarVisible);
  const notices = useUi((s) => s.notices);
  const activeTab = useActiveTab();
  const connectionDialog = useConnection((s) => s.dialogOpen);
  const quickSearch = useUi((s) => s.quickSearchOpen);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const contactLost = useUi((s) => s.contactLost);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([useTree.getState().load(), useUi.getState().load(), useTabs.getState().restore()]).catch((e: Error) =>
      setLoadError(e.message),
    );
    // C-02: el estado de la conexión no bloquea las notas.
    void useConnection.getState().load();
    const stopPresence = startPresence();

    const onKeyDown = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e);
      if (!shortcut) return;
      e.preventDefault();
      const tabs = useTabs.getState();
      const active = tabs.activeId;
      switch (shortcut) {
        case 'toggleMode': {
          // H-02: las notas HTTP no tienen modos.
          const tab = tabs.tabs.find((t) => t.id === active);
          if (tab && tab.note?.type !== 'http') void tabs.toggleMode(tab.id);
          break;
        }
        case 'save':
          if (active) void tabs.saveNow(active);
          break;
        case 'closeTab':
          if (active) void tabs.close(active);
          break;
        case 'previousTab':
          tabs.cycle(-1);
          break;
        case 'nextTab':
          tabs.cycle(1);
          break;
        case 'execute': {
          // Q-23: Ctrl+Intro ejecuta la nota SQL activa; desde edición, pasa antes a consulta.
          const tab = tabs.tabs.find((t) => t.id === active);
          // H-30: Ctrl+Intro envía la llamada de una nota HTTP.
          if (tab?.note?.type === 'http') {
            void useHttpRuns.getState().execute(tab.id);
            break;
          }
          if (!tab?.note || tab.note.type !== 'sql') break;
          const run = async () => {
            if (tab.mode === 'edit') await tabs.toggleMode(tab.id);
            await useSqlRuns.getState().execute(tab.id);
          };
          void run();
          break;
        }
        case 'newMarkdown':
          void createAndOpen(null, 'md');
          break;
        case 'newSql':
          void createAndOpen(null, 'sql');
          break;
        case 'toggleSidebar':
          useUi.getState().toggleSidebar();
          break;
        case 'quickSearch':
          useUi.getState().setQuickSearch(true);
          break;
      }
    };
    // N-40: al cerrar la ventana se guarda lo pendiente.
    const onPageHide = () => useTabs.getState().flushOnUnload();
    // N-46: con el guardado manual y cambios pendientes, el navegador pide confirmación al cerrar.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (autosaveEnabled() || !useTabs.getState().tabs.some((t) => t.note && isDirty(t))) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      stopPresence();
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">LiteDD</span>
        <div className="topbar-end">
          <ConnectionStatusBar />
          <button type="button" className="icon-button" aria-label="Ajustes" title="Ajustes" onClick={() => useUi.getState().setSettingsOpen(true)}>
            ⚙
          </button>
        </div>
      </header>
      {contactLost && (
        // U-11
        <div className="contact-banner" role="alert">
          Sin contacto con LiteDD. Reintentando… Los cambios se guardarán al recuperar el contacto.
        </div>
      )}
      <div className="workspace">
        {sidebarVisible && <Sidebar />}
        <main className="main">
          {loadError ? (
            <div className="empty">
              <p className="error-text">No se pudieron cargar las notas: {loadError}</p>
            </div>
          ) : (
            <>
              <TabBar />
              {activeTab ? (
                <NotePane key={activeTab.id} tab={activeTab} />
              ) : (
                // P-12: sin pestañas, accesos a nueva nota.
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
                    <button type="button" onClick={() => useUi.getState().setQuickSearch(true)} aria-keyshortcuts="Control+K">
                      Búsqueda rápida (Ctrl+K)
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {settingsOpen && <SettingsDialog />}
      <DialogHost />
      {connectionDialog && <ConnectionDialog />}
      {quickSearch && <QuickSearch />}
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
