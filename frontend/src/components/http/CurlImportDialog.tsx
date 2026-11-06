import { useState, type KeyboardEvent } from 'react';
import { useUi } from '../../stores/uiStore';
import { CurlError, importCurl } from '../../http/curl';
import { serializeContent } from '../../http/content';
import { createFromCurl } from '../../actions';

/** H-75 a H-78: «Nuevo → Desde cURL…». Se pega el comando y «Crear» hace la nota HTTP. */
export function CurlImportDialog({ parentId }: { parentId: string | null }) {
  const http = useUi((s) => s.config.http);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => useUi.getState().setCurlImport(null);

  const create = async () => {
    let result;
    try {
      result = importCurl(text, http.profiles.map((p) => p.baseUrl), http.headers);
    } catch (e) {
      setError(e instanceof CurlError ? e.message : 'No se pudo leer el comando.');
      return;
    }
    setBusy(true);
    try {
      await createFromCurl(parentId, result.title, serializeContent(result.content));
      close();
      const notes = [...result.warnings];
      if (result.discarded.length > 0) notes.unshift(`Descartado: ${result.discarded.join(', ')}.`);
      useUi.getState().notify(`Creada «${result.title}»${notes.length ? `. ${notes.join(' ')}` : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la nota.');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void create();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog curl-dialog" role="dialog" aria-modal="true" aria-labelledby="curl-title" onKeyDown={onKeyDown}>
        <div className="dialog-header">
          <h2 id="curl-title">Nota HTTP desde cURL</h2>
          <button type="button" className="dialog-close" aria-label="Cerrar la ventana" title="Cerrar" onClick={close}>
            ×
          </button>
        </div>
        <p className="muted settings-hint">
          Pega un comando de «Copy as cURL» de Chrome (bash o cmd). Se quitan la URL base del perfil y las cabeceras que LiteDD ya
          calcula, como Cookie o X-CSRF-TOKEN.
        </p>
        <textarea
          className="constants-source curl-source"
          aria-label="Comando cURL"
          autoFocus
          spellCheck={false}
          placeholder="curl 'http://127.0.0.1:8080/demo/…' -H '…' --data-raw '…'"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="primary" disabled={busy || text.trim() === ''} onClick={() => void create()} title="Ctrl+Intro">
            Crear
          </button>
          <button type="button" onClick={close}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
