import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api, type ConnectionForm } from '../api';
import { useConnection } from '../stores/connectionStore';
import { useUi } from '../stores/uiStore';

const EMPTY: ConnectionForm = { host: '127.0.0.1', port: 3306, user: '', password: '', schema: '', extraParams: '' };

/** C-01, C-03, C-04: datos de conexión, prueba con lista de esquemas y guardado. */
export function ConnectionDialog() {
  const [form, setForm] = useState<ConnectionForm>(EMPTY);
  const [hasPassword, setHasPassword] = useState(false);
  const [schemas, setSchemas] = useState<string[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getConnection()
      .then((c) => {
        setForm({ host: c.host, port: c.port, user: c.user, password: '', schema: c.schema, extraParams: c.extraParams });
        setHasPassword(c.hasPassword);
      })
      .catch(() => {});
  }, []);

  const close = () => useConnection.getState().closeDialog();
  const update = (changes: Partial<ConnectionForm>) => setForm((f) => ({ ...f, ...changes }));

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { schemas: found } = await api.testConnection({
        host: form.host,
        port: form.port,
        user: form.user,
        password: form.password,
        extraParams: form.extraParams,
      });
      setSchemas(found);
      // C-04: con un único esquema se elige solo; con varios hay que elegir.
      if (found.length === 1) update({ schema: found[0] });
      else if (!found.includes(form.schema)) update({ schema: '' });
      setMessage({
        kind: 'ok',
        text: found.length === 0 ? 'Conexión correcta, pero no hay esquemas de usuario.' : `Conexión correcta: ${found.length} ${found.length === 1 ? 'esquema' : 'esquemas'}.`,
      });
    } catch (e) {
      setSchemas(null);
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo conectar' });
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const status = await api.saveConnection(form);
      useConnection.getState().setStatus(status);
      useUi.getState().notify(status.state === 'connected' ? 'Conexión guardada' : 'Conexión guardada, pero sin conexión con el servidor');
      close();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  const schemaOptions = schemas ?? (form.schema ? [form.schema] : []);

  return (
    <div className="dialog-backdrop">
      <form className="dialog connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-title" onSubmit={save} onKeyDown={onKeyDown}>
        <h2 id="connection-title">Conexión</h2>
        <div className="form-grid">
          <span className="form-label">Método</span>
          <span>TCP/IP estándar</span>

          <label htmlFor="cx-host">Host</label>
          <input id="cx-host" value={form.host} onChange={(e) => update({ host: e.target.value })} autoFocus />

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

        {message && (
          <p className={message.kind === 'error' ? 'error-text' : 'muted'} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={() => void test()} disabled={busy}>
            Probar conexión
          </button>
          <button type="submit" className="primary" disabled={busy || form.user.trim() === '' || form.schema === ''}>
            Guardar
          </button>
          <button type="button" onClick={close}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
