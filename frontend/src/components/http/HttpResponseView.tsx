import { useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import type { HttpReceived, HttpResult } from '../../api';
import { prettyBody, sizeText } from '../../http/content';
import { copyText } from '../../clipboard';

type Panel = 'body' | 'headers' | 'cookies' | 'request';

const number = (n: number) => n.toLocaleString('es-ES');

/** H-35: descarga de un cuerpo binario. */
function download(response: HttpReceived) {
  const bytes = Uint8Array.from(atob(response.base64 ?? ''), (c) => c.charCodeAt(0));
  const type = response.contentType ?? 'application/octet-stream';
  const ext = type.split(';')[0].split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `respuesta.${ext}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return 'http-ok';
  if (status >= 300 && status < 400) return 'http-redirect';
  return 'http-fail';
}

/** H-33 a H-35: respuesta de la llamada, o del login si falló (H-26). */
export function HttpResponseView({ result }: { result: HttpResult }) {
  const [panel, setPanel] = useState<Panel>('body');
  const response = result.response;
  const body = useMemo(() => {
    if (!response || response.binary || response.text === undefined) return null;
    const pretty = prettyBody(response.text, response.contentType ?? null);
    // H-34: el JSON se resalta; hljs escapa el texto.
    const html = pretty.json ? hljs.highlight(pretty.text, { language: 'json', ignoreIllegals: true }).value : null;
    return { ...pretty, html };
  }, [response]);

  const tabs: [Panel, string][] = [
    ['body', 'Cuerpo'],
    ['headers', `Cabeceras (${response?.headers.length ?? 0})`],
    ['cookies', `Cookies (${response?.cookies.length ?? 0})`],
    ['request', 'Petición'],
  ];

  return (
    <section className="http-response" aria-label="Respuesta">
      {result.error && (
        <p className="http-error" role="alert">
          {result.phase === 'login' && <strong>Error en el login: </strong>}
          {result.error.message}
        </p>
      )}
      {result.login && result.phase === 'request' && (
        <p className="muted http-login-summary">
          Login como «{result.login.user}»: {result.login.status} · {number(result.login.millis)} ms
        </p>
      )}
      {response && (
        <div className="http-status-line">
          {result.phase === 'login' && <span className="muted">Respuesta del login:</span>}
          <span className={`http-status ${statusClass(response.status)}`}>
            {response.status} {response.statusText}
          </span>
          <span className="muted">{number(response.millis)} ms</span>
          <span className="muted">{sizeText(response.size)}</span>
        </div>
      )}
      {result.request && (
        <p className="http-sent muted">
          {result.request.method} {result.request.url}
        </p>
      )}

      {(response || result.request) && (
        <>
          <div className="http-tabs" role="tablist" aria-label="Partes de la respuesta">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={panel === id}
                className={panel === id ? 'active' : undefined}
                onClick={() => setPanel(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {panel === 'body' && response && (
            <div className="http-panel">
              {response.truncated && (
                <p className="sql-warning" role="status">
                  El cuerpo supera el tamaño máximo de «Ajustes» y se muestra cortado.
                </p>
              )}
              {response.binary ? (
                <p className="http-binary">
                  Binario, {number(response.size)} bytes{' '}
                  <button type="button" onClick={() => download(response)}>
                    Descargar
                  </button>
                </p>
              ) : body && body.text !== '' ? (
                <>
                  <div className="http-panel-actions">
                    <button type="button" onClick={() => void copyText(body.text, 'Cuerpo copiado')}>
                      Copiar
                    </button>
                  </div>
                  {body.html !== null ? (
                    <pre className="hljs http-body">
                      <code dangerouslySetInnerHTML={{ __html: body.html }} />
                    </pre>
                  ) : (
                    <pre className="http-body">
                      <code>{body.text}</code>
                    </pre>
                  )}
                </>
              ) : (
                <p className="muted">Sin cuerpo.</p>
              )}
            </div>
          )}

          {panel === 'headers' && response && (
            <div className="http-panel">
              <div className="http-panel-actions">
                <button
                  type="button"
                  onClick={() => void copyText(response.headers.map((h) => `${h.name}: ${h.value}`).join('\n'), 'Cabeceras copiadas')}
                >
                  Copiar
                </button>
              </div>
              <table className="http-table">
                <tbody>
                  {response.headers.map((h, i) => (
                    <tr key={i}>
                      <th scope="row">{h.name}</th>
                      <td>{h.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {panel === 'cookies' && response && (
            <div className="http-panel">
              {response.cookies.length === 0 ? (
                <p className="muted">Sin cookies.</p>
              ) : (
                <>
                  <div className="http-panel-actions">
                    <button
                      type="button"
                      onClick={() => void copyText(response.cookies.map((c) => `${c.name}=${c.value}`).join('; '), 'Cookies copiadas')}
                    >
                      Copiar
                    </button>
                  </div>
                  <table className="http-table">
                    <thead>
                      <tr>
                        <th scope="col">Nombre</th>
                        <th scope="col">Valor</th>
                        <th scope="col">Ruta</th>
                        <th scope="col">Caduca</th>
                        <th scope="col">Atributos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {response.cookies.map((c, i) => (
                        <tr key={i}>
                          <th scope="row">{c.name}</th>
                          <td>{c.value}</td>
                          <td>{c.path ?? ''}</td>
                          <td>{c.maxAge === null ? 'Sesión' : `${number(c.maxAge)} s`}</td>
                          <td>{[c.httpOnly ? 'HttpOnly' : '', c.secure ? 'Secure' : ''].filter(Boolean).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {panel === 'request' && result.request && (
            <div className="http-panel">
              <div className="http-panel-actions">
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      [`${result.request!.method} ${result.request!.url}`, ...result.request!.headers.map((h) => `${h.name}: ${h.value}`)].join('\n'),
                      'Petición copiada',
                    )
                  }
                >
                  Copiar
                </button>
              </div>
              <table className="http-table">
                <tbody>
                  {result.request.headers.map((h, i) => (
                    <tr key={i}>
                      <th scope="row">{h.name}</th>
                      <td>{h.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
