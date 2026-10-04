import type { RunError } from '../../stores/sqlRunStore';
import type { SqlError } from '../../sql/types';
import { useConnection } from '../../stores/connectionStore';

interface Props {
  /** Errores de análisis de la nota (Q-90 a Q-92, Q-95). */
  analysisErrors: SqlError[];
  error: RunError | null;
  onRefresh: () => void;
}

/** Q-90 a Q-98: cada error con su presentación y, si la hay, su acción. */
export function SqlErrors({ analysisErrors, error, onRefresh }: Props) {
  // Los errores por campo se muestran en el formulario (Q-93).
  const runError = error && error.code !== 'invalid_values' ? error : null;
  if (analysisErrors.length === 0 && !runError) return null;

  const details = runError?.code === 'sql_error' && Array.isArray(runError.details) ? (runError.details as SqlError[]) : [];

  return (
    <div className="sql-errors" role="alert">
      {analysisErrors.map((e, i) => (
        <p key={`a${i}`}>{e.message}</p>
      ))}
      {runError && (
        <div className="sql-error">
          {details.length > 0 ? details.map((d, i) => <p key={i}>{d.message}</p>) : <p>{runError.message}</p>}
          {(runError.code === 'not_connected' || runError.code === 'schema_unavailable') && (
            <button type="button" onClick={() => void useConnection.getState().reconnect()}>
              Reconectar
            </button>
          )}
          {runError.code === 'not_configured' && (
            <button type="button" onClick={() => useConnection.getState().openDialog()}>
              Configurar la conexión
            </button>
          )}
          {runError.code === 'stale_version' && (
            <button type="button" onClick={onRefresh}>
              Actualizar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
