import { statusLabel, useConnection } from '../stores/connectionStore';

/** C-02, C-09: estado de la conexión; un clic abre el diálogo y «Reconectar» recrea el pool. */
export function ConnectionStatusBar() {
  const status = useConnection((s) => s.status);
  const busy = useConnection((s) => s.busy);
  const state = status?.state ?? 'not_configured';
  const label = statusLabel(status);

  return (
    <div className="connection-status">
      <button
        type="button"
        className={`connection-indicator state-${state}`}
        onClick={() => useConnection.getState().openDialog()}
        title={status?.message ? `${label}: ${status.message}` : 'Conexión a MySQL'}
      >
        <span className="connection-dot" aria-hidden="true">
          ●
        </span>
        <span>{label}</span>
      </button>
      {(state === 'disconnected' || state === 'schema_unavailable') && (
        <button type="button" disabled={busy} onClick={() => void useConnection.getState().reconnect()}>
          {busy ? 'Reconectando…' : 'Reconectar'}
        </button>
      )}
    </div>
  );
}
