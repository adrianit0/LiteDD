import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api, type AppConfig, type ImportMode } from '../api';
import { PAGE_SIZES } from '../sql/types';
import { ask } from '../stores/dialogStore';
import { useConnection } from '../stores/connectionStore';
import { useTabs } from '../stores/tabsStore';
import { useTree } from '../stores/treeStore';
import { useUi } from '../stores/uiStore';

/** Formulario: los números se editan como texto para poder dejar campos vacíos. */
interface ConfigForm {
  defaultPageSize: string;
  rowCap: string;
  queryTimeoutSeconds: string;
  port: string;
  autoShutdownMinutes: string;
  autosave: boolean;
  httpBaseUrl: string;
  httpLoginNoteId: string;
  httpUser: string;
  httpTimeoutSeconds: string;
  httpMaxResponseMb: string;
}

function toForm(c: AppConfig): ConfigForm {
  return {
    defaultPageSize: c.defaultPageSize === null ? 'all' : String(c.defaultPageSize),
    rowCap: String(c.rowCap),
    queryTimeoutSeconds: String(c.queryTimeoutSeconds),
    port: String(c.port),
    autoShutdownMinutes: c.autoShutdownMinutes === null ? '' : String(c.autoShutdownMinutes),
    autosave: c.autosave,
    httpBaseUrl: c.http.baseUrl ?? '',
    httpLoginNoteId: c.http.loginNoteId ?? '',
    httpUser: c.http.user,
    httpTimeoutSeconds: String(c.http.timeoutSeconds),
    httpMaxResponseMb: String(c.http.maxResponseMb),
  };
}

function fromForm(f: ConfigForm): AppConfig {
  return {
    defaultPageSize: f.defaultPageSize === 'all' ? null : Number(f.defaultPageSize),
    rowCap: Number(f.rowCap),
    queryTimeoutSeconds: Number(f.queryTimeoutSeconds),
    port: Number(f.port),
    autoShutdownMinutes: f.autoShutdownMinutes.trim() === '' ? null : Number(f.autoShutdownMinutes),
    autosave: f.autosave,
    http: {
      baseUrl: f.httpBaseUrl.trim() === '' ? null : f.httpBaseUrl.trim(),
      loginNoteId: f.httpLoginNoteId === '' ? null : f.httpLoginNoteId,
      user: f.httpUser.trim(),
      timeoutSeconds: Number(f.httpTimeoutSeconds),
      maxResponseMb: Number(f.httpMaxResponseMb),
    },
  };
}

/** X-01: descarga del ZIP con el nombre que da el servidor. */
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** U-10: ajustes, acceso a «Conexión» y menú «Datos» (X-10). */
export function SettingsDialog() {
  const config = useUi((s) => s.config);
  const [form, setForm] = useState<ConfigForm>(() => toForm(config));
  const [mode, setMode] = useState<ImportMode>('branch');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // H-21: la contraseña se escribe pero nunca se lee; solo se sabe si hay una.
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const nodes = useTree((s) => s.nodes);
  const httpNotes = useMemo(() => nodes.filter((n) => n.type === 'http'), [nodes]);

  useEffect(() => {
    api
      .httpCredentials()
      .then((c) => setHasPassword(c.hasPassword))
      .catch(() => {});
  }, []);

  const close = () => useUi.getState().setSettingsOpen(false);
  const update = (changes: Partial<ConfigForm>) => setForm((f) => ({ ...f, ...changes }));
  const ui = useUi.getState();

  const busyWhile = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo completar la operación' });
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void busyWhile(async () => {
      const next = fromForm(form);
      await api.putSettings({ config: next });
      if (password !== '') {
        await api.setHttpPassword(password);
        setPassword('');
        setHasPassword(true);
      }
      const portChanged = next.port !== config.port;
      ui.setConfig(next);
      ui.notify(portChanged ? 'Ajustes guardados. El puerto nuevo se aplica al reiniciar LiteDD.' : 'Ajustes guardados');
      close();
    });
  };

  const exportData = () =>
    void busyWhile(async () => {
      const { blob, fileName } = await api.exportData();
      download(blob, fileName);
      setMessage({ kind: 'ok', text: `Exportado: ${fileName}` });
    });

  const importFile = async (file: File) => {
    if (mode === 'replace') {
      // X-05: confirmación explícita; el servidor hace una copia antes de reemplazar.
      const answer = await ask({
        title: 'Reemplazar todo',
        body: (
          <p>
            Se borrarán todas las notas actuales y se sustituirán por las de «{file.name}». Antes se hará una copia de
            seguridad. ¿Continuar?
          </p>
        ),
        options: [
          { value: 'replace', label: 'Reemplazar todo', primary: true },
          { value: 'cancel', label: 'Cancelar' },
        ],
        cancelValue: 'cancel',
      });
      if (answer !== 'replace') return;
    }
    await busyWhile(async () => {
      // Lo pendiente se guarda antes de importar.
      await useTabs.getState().savePending();
      const result = await api.importData(file, mode);
      if (mode === 'replace') {
        // Las pestañas y el árbol se recargan desde cero.
        window.location.reload();
        return;
      }
      await useTree.getState().load();
      setMessage({
        kind: 'ok',
        text: `Importadas ${result.notes} ${result.notes === 1 ? 'nota' : 'notas'} y ${result.attachments} ${result.attachments === 1 ? 'adjunto' : 'adjuntos'} como rama nueva.`,
      });
    });
  };

  const backupNow = () =>
    void busyWhile(async () => {
      const { file } = await api.backupNow();
      setMessage({ kind: 'ok', text: `Copia creada: ${file}` });
    });

  const openFolder = () =>
    void busyWhile(async () => {
      const { opened, path } = await api.openDataFolder();
      setMessage(opened ? { kind: 'ok', text: 'Carpeta de datos abierta' } : { kind: 'error', text: `No se pudo abrir la carpeta: ${path}` });
    });

  const openConnection = () => {
    close();
    useConnection.getState().openDialog();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={onKeyDown}>
        <h2 id="settings-title">Ajustes</h2>
        <form onSubmit={save}>
          <div className="form-grid">
            <label htmlFor="st-page-size">Tamaño de página por defecto</label>
            <select id="st-page-size" value={form.defaultPageSize} onChange={(e) => update({ defaultPageSize: e.target.value })}>
              {PAGE_SIZES.map((s) => (
                <option key={String(s)} value={s === null ? 'all' : String(s)}>
                  {s === null ? 'Sin límite' : s}
                </option>
              ))}
            </select>

            <label htmlFor="st-row-cap">Tope de filas</label>
            <input id="st-row-cap" type="number" min={100} max={100000} required value={form.rowCap} onChange={(e) => update({ rowCap: e.target.value })} />

            <label htmlFor="st-timeout">Tiempo máximo de consulta (s)</label>
            <input
              id="st-timeout"
              type="number"
              min={1}
              max={3600}
              required
              value={form.queryTimeoutSeconds}
              onChange={(e) => update({ queryTimeoutSeconds: e.target.value })}
            />

            <label htmlFor="st-port">Puerto</label>
            <input id="st-port" type="number" min={1024} max={65535} required value={form.port} onChange={(e) => update({ port: e.target.value })} />

            <label htmlFor="st-auto">Apagado automático sin ventanas (min)</label>
            <input
              id="st-auto"
              type="number"
              min={1}
              max={1440}
              placeholder="Desactivado"
              value={form.autoShutdownMinutes}
              onChange={(e) => update({ autoShutdownMinutes: e.target.value })}
            />

            <label htmlFor="st-autosave">Guardado automático</label>
            <span>
              <input id="st-autosave" type="checkbox" checked={form.autosave} onChange={(e) => update({ autosave: e.target.checked })} />
            </span>
          </div>
          <p className="muted settings-hint">
            Sin guardado automático, las notas se guardan con «Guardar», Ctrl+S o al cambiar de modo, y al cerrar con cambios se pregunta.
          </p>
          <p className="muted settings-hint">El puerto nuevo se aplica al reiniciar LiteDD.</p>

          <h3 className="settings-subtitle">HTTP</h3>
          <div className="form-grid">
            <label htmlFor="st-http-base">URL base</label>
            <input
              id="st-http-base"
              value={form.httpBaseUrl}
              placeholder="http://127.0.0.1:8080/demo/"
              onChange={(e) => update({ httpBaseUrl: e.target.value })}
            />

            <label htmlFor="st-http-login">Nota de login</label>
            <select id="st-http-login" value={form.httpLoginNoteId} onChange={(e) => update({ httpLoginNoteId: e.target.value })}>
              <option value="">Sin elegir</option>
              {httpNotes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>

            <label htmlFor="st-http-user">Usuario</label>
            <input id="st-http-user" value={form.httpUser} autoComplete="off" onChange={(e) => update({ httpUser: e.target.value })} />

            <label htmlFor="st-http-password">Contraseña</label>
            <span className="settings-inline">
              <input
                id="st-http-password"
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder={hasPassword ? 'Guardada (déjala vacía para conservarla)' : ''}
                onChange={(e) => setPassword(e.target.value)}
              />
              {hasPassword && (
                <button
                  type="button"
                  onClick={() =>
                    void busyWhile(async () => {
                      await api.setHttpPassword('');
                      setHasPassword(false);
                      setMessage({ kind: 'ok', text: 'Contraseña HTTP borrada' });
                    })
                  }
                >
                  Borrar
                </button>
              )}
            </span>

            <label htmlFor="st-http-timeout">Tiempo máximo de llamada (s)</label>
            <input
              id="st-http-timeout"
              type="number"
              min={1}
              max={3600}
              required
              value={form.httpTimeoutSeconds}
              onChange={(e) => update({ httpTimeoutSeconds: e.target.value })}
            />

            <label htmlFor="st-http-max">Tamaño máximo de respuesta (MB)</label>
            <input
              id="st-http-max"
              type="number"
              min={1}
              max={100}
              required
              value={form.httpMaxResponseMb}
              onChange={(e) => update({ httpMaxResponseMb: e.target.value })}
            />
          </div>
          <p className="muted settings-hint">
            Solo se admiten 127.0.0.1, localhost o ::1. La contraseña se guarda aparte, solo para tu usuario, y no se exporta.
          </p>
          <div className="dialog-actions">
            <button type="submit" className="primary" disabled={busy}>
              Guardar ajustes
            </button>
          </div>
        </form>

        <section className="settings-section" aria-labelledby="settings-connection">
          <h3 id="settings-connection">Conexión</h3>
          <button type="button" onClick={openConnection}>
            Conexión a MySQL…
          </button>
        </section>

        <section className="settings-section" aria-labelledby="settings-data">
          <h3 id="settings-data">Datos</h3>
          <div className="settings-row">
            <button type="button" disabled={busy} onClick={exportData}>
              Exportar
            </button>
            <button type="button" disabled={busy} onClick={backupNow}>
              Crear copia ahora
            </button>
            <button type="button" disabled={busy} onClick={openFolder}>
              Abrir carpeta de datos
            </button>
          </div>
          <fieldset className="settings-import">
            <legend>Importar</legend>
            <label>
              <input type="radio" name="import-mode" checked={mode === 'branch'} onChange={() => setMode('branch')} /> Añadir como rama
            </label>
            <label>
              <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Reemplazar todo
            </label>
            <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
              Elegir fichero ZIP…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              hidden
              aria-label="Fichero ZIP para importar"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void importFile(file);
              }}
            />
          </fieldset>
        </section>

        {message && (
          <p className={message.kind === 'error' ? 'error-text' : 'muted'} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
