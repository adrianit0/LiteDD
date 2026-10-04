import { useEffect, useState, type KeyboardEvent } from 'react';
import { api, type NoteVersion } from '../api';
import { formatDateTime } from '../format';
import { useTabs, type Tab } from '../stores/tabsStore';
import { useUi } from '../stores/uiStore';

const PREVIEW = 160;

/** N-45: versiones con fecha y vista previa; se puede restaurar una. */
export function HistoryDialog({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [selected, setSelected] = useState<NoteVersion | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .versions(tab.noteId)
      .then((v) => {
        setVersions(v);
        setSelected(v[0] ?? null);
      })
      .catch((e) => {
        useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo leer el historial', 'error');
        setVersions([]);
      });
  }, [tab.noteId]);

  const restore = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const tabs = useTabs.getState();
      await tabs.saveNow(tab.id);
      const current = tabs.tabs.find((t) => t.id === tab.id);
      if (!current?.note) return;
      const note = await api.restoreVersion(tab.noteId, selected.id, current.note.version);
      useTabs.getState().applyRestored(tab.id, note);
      useUi.getState().notify(`Versión del ${formatDateTime(selected.savedAt)} restaurada`);
      onClose();
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo restaurar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title" onKeyDown={onKeyDown}>
        <h2 id="history-title">Historial</h2>
        {versions === null ? (
          <p className="muted">Cargando…</p>
        ) : versions.length === 0 ? (
          <p className="muted">Todavía no hay versiones guardadas. Se guarda una al salir del modo edición.</p>
        ) : (
          <div className="history-body">
            <ul className="history-list" role="listbox" aria-label="Versiones">
              {versions.map((v) => (
                <li key={v.id} role="option" aria-selected={selected?.id === v.id}>
                  <button type="button" className={selected?.id === v.id ? 'selected' : undefined} onClick={() => setSelected(v)}>
                    <strong>{formatDateTime(v.savedAt)}</strong>
                    <span className="muted history-preview">
                      {v.content.slice(0, PREVIEW) || '(vacía)'}
                      {v.content.length > PREVIEW ? '…' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <section className="history-content" aria-label="Contenido de la versión">
                <h3>{selected.title}</h3>
                <pre>{selected.content}</pre>
              </section>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="primary" disabled={!selected || busy} onClick={() => void restore()}>
            Restaurar esta versión
          </button>
          <button type="button" onClick={onClose} autoFocus>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
