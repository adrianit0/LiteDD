import { useEffect } from 'react';
import type { ConnectionForm } from '../api';
import { statusLabel, useConnection } from '../stores/connectionStore';

export const EMPTY_CONNECTION: ConnectionForm = { host: '127.0.0.1', port: 3306, user: '', password: '', schema: '', extraParams: '' };

/** Lo que se edita en «Ajustes → Conexión». schemas: los de la última prueba (C-03); null sin probar. */
export interface ConnectionDraft {
  form: ConnectionForm;
  schemas: string[] | null;
}

/** C-11, U-13: «Guardar ajustes» solo guarda la conexión si cambió algo; una contraseña escrita es un cambio. */
export function connectionChanged(form: ConnectionForm, loaded: ConnectionForm): boolean {
  return (
    form.password !== '' ||
    form.host !== loaded.host ||
    form.port !== loaded.port ||
    form.user !== loaded.user ||
    form.schema !== loaded.schema ||
    form.extraParams !== loaded.extraParams
  );
}

interface Props {
  draft: ConnectionDraft;
  hasPassword: boolean;
  busy: boolean;
  onChange: (draft: ConnectionDraft) => void;
  onTest: () => void;
}

/** C-01 a C-04, C-09: estado de la conexión con «Reconectar» y sus datos, con «Probar conexión». */
export function ConnectionSettings({ draft, hasPassword, busy, onChange, onTest }: Props) {
  const status = useConnection((s) => s.status);
  const reconnecting = useConnection((s) => s.busy);
  const state = status?.state ?? 'not_configured';
  const label = statusLabel(status);
  const { form, schemas } = draft;
  const update = (changes: Partial<ConnectionForm>) => onChange({ ...draft, form: { ...form, ...changes } });
  const schemaOptions = schemas ?? (form.schema ? [form.schema] : []);

  useEffect(() => {
    void useConnection.getState().load();
  }, []);

  return (
    <>
      <div className="connection-status">
        <span className={`connection-indicator state-${state}`} title={status?.message ? `${label}: ${status.message}` : undefined}>
          <span className="connection-dot" aria-hidden="true">
            ●
          </span>
          <span>{label}</span>
        </span>
        {(state === 'disconnected' || state === 'schema_unavailable') && (
          <button type="button" disabled={reconnecting} onClick={() => void useConnection.getState().reconnect()}>
            {reconnecting ? 'Reconectando…' : 'Reconectar'}
          </button>
        )}
      </div>
      {status?.message && state !== 'connected' && <p className="muted settings-hint">{status.message}</p>}

      <div className="form-grid">
        <span className="form-label">Método</span>
        <span>TCP/IP estándar</span>

        <label htmlFor="cx-host">Host</label>
        <input id="cx-host" value={form.host} onChange={(e) => update({ host: e.target.value })} />

        <label htmlFor="cx-port">Puerto</label>
        <input id="cx-port" type="number" min={1} max={65535} value={form.port} onChange={(e) => update({ port: Number(e.target.value) })} />

        <label htmlFor="cx-user">Usuario</label>
        <input id="cx-user" value={form.user} onChange={(e) => update({ user: e.target.value })} autoComplete="off" />

        <label htmlFor="cx-password">Contraseña</label>
        <input
          id="cx-password"
          type="password"
          value={form.password}
          placeholder={hasPassword ? 'Guardada (déjala vacía para conservarla)' : ''}
          onChange={(e) => update({ password: e.target.value })}
          autoComplete="new-password"
        />

        <label htmlFor="cx-schema">Esquema por defecto</label>
        <select id="cx-schema" value={form.schema} onChange={(e) => update({ schema: e.target.value })}>
          <option value="">{schemaOptions.length === 0 ? 'Prueba la conexión para ver los esquemas' : 'Elige un esquema…'}</option>
          {schemaOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label htmlFor="cx-extra">Parámetros JDBC adicionales</label>
        <input id="cx-extra" value={form.extraParams} placeholder="clave=valor&clave2=valor2" onChange={(e) => update({ extraParams: e.target.value })} />
      </div>
      <div className="settings-row">
        <button type="button" onClick={onTest} disabled={busy}>
          Probar conexión
        </button>
      </div>
      <p className="muted settings-hint">La conexión se guarda con «Guardar ajustes», solo si cambiaste algo. Guardarla cierra las consultas en curso.</p>
    </>
  );
}
