import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useTabs, type Tab } from '../../stores/tabsStore';
import { useHttpRun, useHttpRuns } from '../../stores/httpRunStore';
import { useUi } from '../../stores/uiStore';
import {
  COMMON_HEADERS,
  METHODS,
  RESTRICTED_HEADERS,
  formatJson,
  generatedHeaders,
  parseContent,
  oldVariable,
  variableNames,
  serializeContent,
  type BodyMode,
  type HttpContent,
  type HttpMethod,
  type RawType,
  type Row,
} from '../../http/content';
import { elapsedText } from '../../sql/results';
import { NoteEditor } from '../../editor/NoteEditor';
import { KeyValueTable } from './KeyValueTable';
import { HttpResponseView } from './HttpResponseView';

type Section = 'params' | 'headers' | 'body';

/** Versión de la aplicación para el User-Agent mostrado (H-15); la real la pone el servidor. */
let appVersion: Promise<string> | null = null;

const active = (rows: Row[]) => rows.filter((r) => r.enabled && r.key.trim() !== '').length;

/**
 * H-01 a H-36: nota HTTP. Sin modos (H-02): el formulario siempre se edita y se guarda como el resto.
 */
export function HttpView({ tab }: { tab: Tab }) {
  const store = useTabs.getState();
  const runs = useHttpRuns.getState();
  const run = useHttpRun(tab.id);
  const http = useUi((s) => s.config.http);
  const autosave = useUi((s) => s.config.autosave);
  const [section, setSection] = useState<Section>('params');
  const [jsonProblem, setJsonProblem] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [version, setVersion] = useState('');

  useEffect(() => {
    appVersion ??= api.appVersion();
    void appVersion.then(setVersion);
  }, []);

  const content = useMemo(() => parseContent(tab.content), [tab.content]);
  const update = (changes: Partial<HttpContent>) => store.edit(tab.id, { content: serializeContent({ ...content, ...changes }) });
  const variables = variableNames(content);
  const old = oldVariable(content.endpoint);
  const isLoginNote = tab.noteId === http.loginNoteId;
  const loginOff = !isLoginNote && content.login !== 'always';
  const withLogin = !isLoginNote && content.login !== 'none';
  const generated = generatedHeaders(content, version, withLogin, http);
  const saveOnBlur = () => {
    if (autosave) void store.saveNow(tab.id);
  };

  // H-30: cronómetro en vivo y Esc para cancelar.
  useEffect(() => {
    if (!run.running) return;
    const timer = setInterval(() => setTick((t) => t + 1), 100);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void useHttpRuns.getState().cancel(tab.id);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [run.running, tab.id]);

  const missing = variables.filter((v) => !(content.pathValues[v] ?? '').trim());
  const send = () => void runs.execute(tab.id);

  const setGenerated = (name: string, change: { value?: string | null; enabled?: boolean }) => {
    const current = content.generated[name] ?? { value: null, enabled: true };
    const next = { ...current, ...change };
    const generatedChanges = { ...content.generated };
    if (next.value === null && next.enabled) delete generatedChanges[name];
    else generatedChanges[name] = next;
    update({ generated: generatedChanges });
  };

  const formatBody = () => {
    const pretty = formatJson(content.body.raw);
    if (pretty === null) {
      setJsonProblem('El cuerpo no es JSON válido.');
      return;
    }
    setJsonProblem(null);
    update({ body: { ...content.body, raw: pretty } });
  };

  const sectionTabs: [Section, string][] = [
    ['params', `Params${active(content.params) ? ` (${active(content.params)})` : ''}`],
    ['headers', `Headers${active(content.headers) ? ` (${active(content.headers)})` : ''}`],
    ['body', `Body${content.body.mode === 'none' ? '' : ` (${content.body.mode})`}`],
  ];

  return (
    <div className="http-view">
      <div className="http-bar" role="toolbar" aria-label="Llamada">
        <select aria-label="Método" value={content.method} onChange={(e) => update({ method: e.target.value as HttpMethod })}>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="http-url">
          <span className="http-base" title={http.baseUrl ?? undefined}>
            {http.baseUrl ?? 'Sin URL base'}
          </span>
          <input
            aria-label="Endpoint"
            placeholder="/ruta/#{id}"
            value={content.endpoint}
            onChange={(e) => update({ endpoint: e.target.value })}
            onBlur={saveOnBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                send();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="primary"
          onClick={send}
          disabled={run.running !== null || missing.length > 0}
          title={missing.length > 0 ? `Falta el valor de ${missing.join(', ')}` : 'Ctrl+Intro'}
          aria-keyshortcuts="Control+Enter"
        >
          Enviar
        </button>
        {run.running && (
          <>
            <button type="button" onClick={() => void runs.cancel(tab.id)} aria-keyshortcuts="Escape" title="Esc">
              Cancelar
            </button>
            <span className="sql-chrono" role="timer" aria-live="off">
              {elapsedText(performance.now() - run.running.startedAt)}
            </span>
          </>
        )}
      </div>

      {old && (
        // H-18, ADR-0022
        <p className="sql-warning" role="status">
          Las variables se escriben #{'{'}nombre{'}'}: cambia {`{${old}}`} por {`#{${old}}`}.
        </p>
      )}

      {!http.baseUrl && (
        <p className="sql-warning" role="status">
          Falta la URL base del servidor.{' '}
          <button type="button" onClick={() => useUi.getState().setSettingsOpen(true)}>
            Abrir «Ajustes»
          </button>
        </p>
      )}

      <div className="http-login" role="group" aria-label="Login">
        {isLoginNote ? (
          <span className="muted">Nota de login: hace el login con este usuario y lo deja para reutilizar.</span>
        ) : (
          <>
            <label>
              <input
                type="checkbox"
                checked={content.login === 'none'}
                disabled={content.login === 'reuse'}
                onChange={(e) => update({ login: e.target.checked ? 'none' : 'always' })}
              />{' '}
              No necesita login
            </label>
            <label>
              <input
                type="checkbox"
                checked={content.login === 'reuse'}
                disabled={content.login === 'none'}
                onChange={(e) => update({ login: e.target.checked ? 'reuse' : 'always' })}
              />{' '}
              Reutilizar login
            </label>
          </>
        )}
        <label className="http-user">
          <span className="muted">Usuario</span>
          <input
            value={content.user}
            disabled={loginOff}
            placeholder={http.user || 'usuario'}
            aria-label="Usuario"
            onChange={(e) => update({ user: e.target.value })}
            onBlur={saveOnBlur}
          />
        </label>
      </div>

      {variables.length > 0 && (
        <fieldset className="http-path">
          <legend>Variables</legend>
          {variables.map((name) => (
            <label key={name}>
              <span className="muted">{`#{${name}}`}</span>
              <input
                aria-label={`Variable ${name}`}
                aria-invalid={missing.includes(name) ? true : undefined}
                value={content.pathValues[name] ?? ''}
                onChange={(e) => update({ pathValues: { ...content.pathValues, [name]: e.target.value } })}
                onBlur={saveOnBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    send();
                  }
                }}
              />
            </label>
          ))}
        </fieldset>
      )}

      <div className="http-tabs" role="tablist" aria-label="Partes de la petición">
        {sectionTabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} className={section === id ? 'active' : undefined} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </div>

      {section === 'params' && (
        <div className="http-panel">
          <KeyValueTable label="Params" rows={content.params} onChange={(params) => update({ params })} />
        </div>
      )}

      {section === 'headers' && (
        <div className="http-panel">
          <div className="http-panel-actions">
            <button type="button" onClick={() => update({ hideGenerated: !content.hideGenerated })}>
              {content.hideGenerated ? 'Mostrar headers generados' : 'Esconder headers generados'}
            </button>
          </div>
          {!content.hideGenerated && (
            <table className="kv-table http-generated" aria-label="Headers generados">
              <tbody>
                {isLoginNote && (
                  <tr>
                    <td className="kv-check" />
                    <td className="muted">Authorization</td>
                    <td className="muted">Basic (usuario y contraseña de «Ajustes»)</td>
                    <td className="kv-actions" />
                  </tr>
                )}
                {generated.map((g) => {
                  const change = content.generated[g.name];
                  const enabled = change?.enabled !== false;
                  return (
                    <tr key={g.name} className={enabled ? undefined : 'kv-off'}>
                      <td className="kv-check">
                        <input
                          type="checkbox"
                          checked={enabled}
                          aria-label={`Enviar ${g.name}`}
                          onChange={(e) => setGenerated(g.name, { enabled: e.target.checked })}
                        />
                      </td>
                      <td className="muted">{g.name}</td>
                      <td>
                        <input
                          className="generated-value"
                          aria-label={`Valor de ${g.name}`}
                          value={change?.value ?? ''}
                          placeholder={g.defaultValue ?? '(del login)'}
                          onChange={(e) => setGenerated(g.name, { value: e.target.value === '' ? null : e.target.value })}
                        />
                      </td>
                      <td className="kv-actions" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <KeyValueTable
            label="Headers"
            rows={content.headers}
            onChange={(headers) => update({ headers })}
            suggestions={COMMON_HEADERS}
            problem={(row) => (RESTRICTED_HEADERS.includes(row.key.trim().toLowerCase()) ? 'La pone el cliente; no se puede escribir' : null)}
          />
        </div>
      )}

      {section === 'body' && (
        <div className="http-panel">
          <div className="http-body-modes" role="radiogroup" aria-label="Tipo de cuerpo">
            {(['none', 'form-data', 'raw'] as BodyMode[]).map((mode) => (
              <label key={mode}>
                <input type="radio" name={`body-${tab.id}`} checked={content.body.mode === mode} onChange={() => update({ body: { ...content.body, mode } })} />{' '}
                {mode}
              </label>
            ))}
            {content.body.mode === 'raw' && (
              <>
                <select
                  aria-label="Formato del cuerpo"
                  value={content.body.rawType}
                  onChange={(e) => update({ body: { ...content.body, rawType: e.target.value as RawType } })}
                >
                  <option value="json">JSON</option>
                  <option value="text">Texto</option>
                  <option value="xml">XML</option>
                </select>
                {content.body.rawType === 'json' && (
                  <button type="button" onClick={formatBody}>
                    Formatear JSON
                  </button>
                )}
              </>
            )}
          </div>
          {jsonProblem && content.body.mode === 'raw' && (
            <p className="error-text" role="alert">
              {jsonProblem}
            </p>
          )}
          {content.body.mode === 'none' && <p className="muted">La llamada no lleva cuerpo.</p>}
          {content.body.mode === 'form-data' && (
            <KeyValueTable label="form-data" rows={content.body.form} onChange={(form) => update({ body: { ...content.body, form } })} />
          )}
          {content.body.mode === 'raw' && (
            <div className="http-raw">
              <NoteEditor
                key={`${tab.id}-raw`}
                type="plain"
                value={content.body.raw}
                onChange={(raw) => {
                  setJsonProblem(null);
                  update({ body: { ...content.body, raw } });
                }}
                onBlur={saveOnBlur}
              />
            </div>
          )}
        </div>
      )}

      {run.error && (
        <p className="http-error" role="alert">
          {run.error.message}
        </p>
      )}
      {run.result && <HttpResponseView key={run.running ? 'running' : 'done'} result={run.result} />}
    </div>
  );
}
