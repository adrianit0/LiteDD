import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { api, type AppConfig, type ConnectionForm, type ConnectionStatus, type ImportMode } from '../api';
import { PAGE_SIZES } from '../sql/types';
import { ask } from '../stores/dialogStore';
import { useConnection } from '../stores/connectionStore';
import { useHttpProfile } from '../stores/httpProfileStore';
import { useTabs } from '../stores/tabsStore';
import { useTree } from '../stores/treeStore';
import { useUi, type SettingsCategory } from '../stores/uiStore';
import { ConnectionSettings, EMPTY_CONNECTION, connectionChanged, type ConnectionDraft } from './ConnectionSettings';
import { CorporateCaSettings, HttpProfilesSettings, fromProfileForms, toProfileForms, type ProfileForm } from './HttpProfilesSettings';
import { UpdateSettings } from './UpdateSettings';

/** U-10: categorías, en su orden. */
const CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'connection', label: 'Conexión' },
  { id: 'sql', label: 'SQL' },
  { id: 'http', label: 'HTTP' },
  { id: 'environments', label: 'Entornos' },
  { id: 'data', label: 'Datos' },
  { id: 'updates', label: 'Actualizaciones' },
];

/** Formulario: los números se editan como texto para poder dejar campos vacíos. */
interface ConfigForm {
  defaultPageSize: string;
  rowCap: string;
  queryTimeoutSeconds: string;
  port: string;
  autoShutdownMinutes: string;
  autosave: boolean;
  httpPreproduction: boolean;
  httpProfiles: ProfileForm[];
  httpLoginNoteId: string;
  httpTimeoutSeconds: string;
  httpMaxResponseMb: string;
  httpAccept: string;
  httpUserAgent: string;
  httpCacheControl: string;
  updateRepository: string;
}

function toForm(c: AppConfig): ConfigForm {
  return {
    defaultPageSize: c.defaultPageSize === null ? 'all' : String(c.defaultPageSize),
    rowCap: String(c.rowCap),
    queryTimeoutSeconds: String(c.queryTimeoutSeconds),
    port: String(c.port),
    autoShutdownMinutes: c.autoShutdownMinutes === null ? '' : String(c.autoShutdownMinutes),
    autosave: c.autosave,
    httpPreproduction: c.http.preproduction,
    httpProfiles: toProfileForms(c.http.profiles),
    httpLoginNoteId: c.http.loginNoteId ?? '',
    httpTimeoutSeconds: String(c.http.timeoutSeconds),
    httpMaxResponseMb: String(c.http.maxResponseMb),
    httpAccept: c.http.accept ?? '',
    httpUserAgent: c.http.userAgent ?? '',
    httpCacheControl: c.http.cacheControl ?? '',
    updateRepository: c.updateRepository ?? '',
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
      preproduction: f.httpPreproduction,
      profiles: fromProfileForms(f.httpProfiles),
      loginNoteId: f.httpLoginNoteId === '' ? null : f.httpLoginNoteId,
      timeoutSeconds: Number(f.httpTimeoutSeconds),
      maxResponseMb: Number(f.httpMaxResponseMb),
      accept: f.httpAccept.trim() === '' ? null : f.httpAccept.trim(),
      userAgent: f.httpUserAgent.trim() === '' ? null : f.httpUserAgent.trim(),
      cacheControl: f.httpCacheControl.trim() === '' ? null : f.httpCacheControl.trim(),
    },
    updateRepository: f.updateRepository.trim() === '' ? null : f.updateRepository.trim(),
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

/** U-10, U-13: ajustes por categorías, con la conexión (C-01) y el menú «Datos» (X-10); un solo «Guardar ajustes». */
export function SettingsDialog() {
  const config = useUi((s) => s.config);
  const [category, setCategory] = useState<SettingsCategory>(() => useUi.getState().settingsCategory);
  const [form, setForm] = useState<ConfigForm>(() => toForm(config));
  const [mode, setMode] = useState<ImportMode>('branch');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const tabs = useRef(new Map<SettingsCategory, HTMLButtonElement>());
  // H-21, H-69: las contraseñas y la clave se escriben pero nunca se leen; solo se sabe si las hay.
  const [savedPasswords, setSavedPasswords] = useState<Record<string, boolean>>({});
  const [confirmKey, setConfirmKey] = useState('');
  const [hasConfirmKey, setHasConfirmKey] = useState(false);
  // C-01: la conexión tal como llegó, para guardarla solo si cambia (C-11).
  const [connection, setConnection] = useState<ConnectionDraft>({ form: EMPTY_CONNECTION, schemas: null });
  const [loadedConnection, setLoadedConnection] = useState<ConnectionForm>(EMPTY_CONNECTION);
  const [hasDbPassword, setHasDbPassword] = useState(false);
  const nodes = useTree((s) => s.nodes);
  const httpNotes = useMemo(() => nodes.filter((n) => n.type === 'http'), [nodes]);

  useEffect(() => {
    api
      .httpCredentials()
      .then((c) => {
        setSavedPasswords(c.passwords);
        setHasConfirmKey(c.hasConfirmKey);
      })
      .catch(() => {});
    api
      .getConnection()
      .then((c) => {
        const loaded = { host: c.host, port: c.port, user: c.user, password: '', schema: c.schema, extraParams: c.extraParams };
        setConnection({ form: loaded, schemas: null });
        setLoadedConnection(loaded);
        setHasDbPassword(c.hasPassword);
      })
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
      const saveConnection = connectionChanged(connection.form, loadedConnection);
      // C-04: sin usuario o sin esquema no se guarda nada, para no dejar la ventana a medias.
      if (saveConnection && (connection.form.user.trim() === '' || connection.form.schema === '')) {
        setCategory('connection');
        throw new Error('La conexión necesita usuario y esquema por defecto: prueba la conexión y elige uno.');
      }
      const next = fromForm(form);
      await api.putSettings({ config: next });
      // Después de los ajustes: un entorno nuevo ya existe y uno quitado ya no tiene contraseña (H-62).
      for (const p of form.httpProfiles) {
        if (p.password !== '') await api.setHttpPassword(p.id, p.password);
      }
      if (confirmKey !== '') await api.setConfirmKey(confirmKey);
      const portChanged = next.port !== config.port;
      ui.setConfig(next);
      // H-62: sin la casilla, o sin el perfil elegido, el servidor vuelve a Local.
      await useHttpProfile
        .getState()
        .load()
        .catch(() => {});
      let status: ConnectionStatus | null = null;
      if (saveConnection) {
        status = await api.saveConnection(connection.form);
        useConnection.getState().setStatus(status);
      }
      const sentences = ['Ajustes guardados.'];
      if (portChanged) sentences.push('El puerto nuevo se aplica al reiniciar LiteDD.');
      if (status && status.state !== 'connected') sentences.push('La conexión se guardó, pero sin conexión con el servidor.');
      ui.notify(sentences.length === 1 ? 'Ajustes guardados' : sentences.join(' '));
      close();
    });
  };

  // C-03, C-04: con un único esquema se elige solo; con varios hay que elegir.
  const testConnection = () =>
    void busyWhile(async () => {
      const { host, port, user, password, extraParams } = connection.form;
      try {
        const { schemas } = await api.testConnection({ host, port, user, password, extraParams });
        const schema = schemas.length === 1 ? schemas[0] : schemas.includes(connection.form.schema) ? connection.form.schema : '';
        setConnection((c) => ({ form: { ...c.form, schema }, schemas }));
        setMessage({
          kind: 'ok',
          text:
            schemas.length === 0
              ? 'Conexión correcta, pero no hay esquemas de usuario.'
              : `Conexión correcta: ${schemas.length} ${schemas.length === 1 ? 'esquema' : 'esquemas'}.`,
        });
      } catch (e) {
        setConnection((c) => ({ ...c, schemas: null }));
        throw e;
      }
    });

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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  // U-08, U-13: las flechas recorren las categorías.
  const onTabKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const index = CATEGORIES.findIndex((c) => c.id === category);
    const next = CATEGORIES[(index + (e.key === 'ArrowDown' ? 1 : CATEGORIES.length - 1)) % CATEGORIES.length].id;
    setCategory(next);
    tabs.current.get(next)?.focus();
  };

  const general = (
    <>
      <div className="form-grid">
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
      <p className="muted settings-hint">El puerto nuevo se aplica al reiniciar LiteDD.</p>
      <p className="muted settings-hint">
        Sin guardado automático, las notas se guardan con «Guardar», Ctrl+S o al cambiar de modo, y al cerrar con cambios se pregunta.
      </p>
    </>
  );

  const sql = (
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
    </div>
  );

  const http = (
    <>
      <div className="form-grid">
        <label htmlFor="st-http-login">Nota de login</label>
        <select id="st-http-login" value={form.httpLoginNoteId} onChange={(e) => update({ httpLoginNoteId: e.target.value })}>
          <option value="">Sin elegir</option>
          {httpNotes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
        </select>

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
      <h4 className="settings-subtitle">Headers generados</h4>
      <div className="form-grid">
        <label htmlFor="st-http-accept">Accept</label>
        <input id="st-http-accept" value={form.httpAccept} placeholder="application/json" onChange={(e) => update({ httpAccept: e.target.value })} />

        <label htmlFor="st-http-ua">User-Agent</label>
        <input id="st-http-ua" value={form.httpUserAgent} placeholder="LiteDD/versión" onChange={(e) => update({ httpUserAgent: e.target.value })} />

        <label htmlFor="st-http-cache">Cache-Control</label>
        <input id="st-http-cache" value={form.httpCacheControl} placeholder="no-cache" onChange={(e) => update({ httpCacheControl: e.target.value })} />
      </div>
      <p className="muted settings-hint">
        Valen para todas las notas HTTP y para el login; vacío, el valor de serie. Cada nota puede cambiarlos. Content-Type depende del cuerpo.
      </p>
    </>
  );

  const environments = (
    <>
      <div className="form-grid">
        <label htmlFor="st-http-pre">Permitir entornos de preproducción</label>
        <span>
          <input id="st-http-pre" type="checkbox" checked={form.httpPreproduction} onChange={(e) => update({ httpPreproduction: e.target.checked })} />
        </span>
      </div>
      <HttpProfilesSettings
        profiles={form.httpProfiles}
        preproduction={form.httpPreproduction}
        saved={savedPasswords}
        busy={busy}
        onChange={(httpProfiles) => update({ httpProfiles })}
        onClearPassword={(id) =>
          void busyWhile(async () => {
            setSavedPasswords((await api.setHttpPassword(id, '')).passwords);
            setMessage({ kind: 'ok', text: 'Contraseña HTTP borrada' });
          })
        }
      />
      <div className="form-grid">
        <label htmlFor="st-http-confirm-key">Clave de confirmación</label>
        <span className="settings-inline">
          <input
            id="st-http-confirm-key"
            type="password"
            value={confirmKey}
            autoComplete="new-password"
            placeholder={hasConfirmKey ? 'Guardada (déjala vacía para conservarla)' : ''}
            onChange={(e) => setConfirmKey(e.target.value)}
          />
          {hasConfirmKey && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void busyWhile(async () => {
                  setHasConfirmKey((await api.setConfirmKey('')).hasConfirmKey);
                  setMessage({ kind: 'ok', text: 'Clave de confirmación borrada' });
                })
              }
            >
              Borrar
            </button>
          )}
        </span>
      </div>
      {form.httpPreproduction && <CorporateCaSettings onMessage={setMessage} />}
      <p className="muted settings-hint">
        Local va siempre primero y es el destino al arrancar; los demás entornos se ordenan con «Subir» y «Bajar». Local solo admite
        127.0.0.1, localhost o ::1. Los entornos de preproducción solo admiten https con un nombre de host: con «Pedir CA corporativa»,
        su certificado debe ser de la CA importada; sin ella, de una CA de confianza de Java. Con «Pedir clave al enviar», cada envío
        a ese perfil pide la clave de confirmación.
      </p>
      <p className="muted settings-hint">
        Las contraseñas y la clave se guardan aparte, solo para tu usuario: no se exportan ni entran en las copias.
      </p>
    </>
  );

  const data = (
    <>
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
    </>
  );

  const panels: Record<SettingsCategory, ReactNode> = {
    general,
    connection: (
      <ConnectionSettings draft={connection} hasPassword={hasDbPassword} busy={busy} onChange={setConnection} onTest={testConnection} />
    ),
    sql,
    http,
    environments,
    data,
    updates: (
      <UpdateSettings
        repository={form.updateRepository}
        saved={config.updateRepository}
        busy={busy}
        run={busyWhile}
        onChange={(updateRepository) => update({ updateRepository })}
        onMessage={setMessage}
      />
    ),
  };
  const current = CATEGORIES.find((c) => c.id === category)!;

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={onKeyDown}>
        <div className="dialog-header">
          <h2 id="settings-title">Ajustes</h2>
          <button type="button" className="dialog-close" aria-label="Cerrar la ventana" title="Cerrar" onClick={close}>
            ×
          </button>
        </div>
        <form className="settings-form" onSubmit={save}>
          <div className="settings-body">
            <div className="settings-nav" role="tablist" aria-orientation="vertical" aria-label="Categorías" onKeyDown={onTabKeyDown}>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  ref={(el) => {
                    if (el) tabs.current.set(c.id, el);
                    else tabs.current.delete(c.id);
                  }}
                  type="button"
                  role="tab"
                  id={`settings-tab-${c.id}`}
                  aria-selected={c.id === category}
                  aria-controls="settings-panel"
                  tabIndex={c.id === category ? 0 : -1}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="settings-panel" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${category}`}>
              <h3 className="settings-panel-title">{current.label}</h3>
              {panels[category]}
            </div>
          </div>
          <div className="settings-footer">
            {message ? (
              <p className={message.kind === 'error' ? 'error-text' : 'muted'} role={message.kind === 'error' ? 'alert' : 'status'}>
                {message.text}
              </p>
            ) : (
              <span />
            )}
            <div className="dialog-actions">
              <button type="submit" className="primary" disabled={busy}>
                Guardar ajustes
              </button>
              <button type="button" onClick={close}>
                Cerrar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
