import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api, type JavaConstant } from '../api';
import { useUi } from '../stores/uiStore';

/** M-65, M-66: constantes Java de los mappers con su valor, común a todas las notas (ADR-0025). */
export function ConstantsDialog() {
  const [list, setList] = useState<JavaConstant[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (constants: JavaConstant[]) => {
    setList(constants);
    setDrafts(Object.fromEntries(constants.map((c) => [c.name, c.value ?? ''])));
  };

  useEffect(() => {
    api
      .constants()
      .then(load)
      .catch((e: Error) => setError(e.message));
  }, []);

  const close = () => useUi.getState().setConstantsOpen(false);

  const visible = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return (list ?? []).filter((c) => words.every((w) => c.name.toLowerCase().includes(w)));
  }, [list, filter]);

  const changed = (list ?? []).filter((c) => (drafts[c.name] ?? '').trim() !== (c.value ?? ''));

  const apply = async (values: Record<string, string>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      load(await api.putConstants(values));
      useUi.getState().constantsSaved();
      useUi.getState().notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar las constantes');
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (changed.length === 0) return;
    void apply(Object.fromEntries(changed.map((c) => [c.name, drafts[c.name] ?? ''])), 'Constantes guardadas');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog constants-dialog" role="dialog" aria-modal="true" aria-labelledby="constants-title" onKeyDown={onKeyDown}>
        <h2 id="constants-title">Constantes</h2>
        <p className="muted settings-hint">
          Valores de las constantes Java de los mappers, como <code>@paquete.Clase@CAMPO</code>. Un número se usa como número y
          cualquier otro valor como texto. Valen para todas las notas.
        </p>
        <form onSubmit={save}>
          <input
            type="search"
            className="constants-filter"
            placeholder="Filtrar"
            aria-label="Filtrar constantes"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {list === null ? (
            !error && <p className="muted">Cargando…</p>
          ) : list.length === 0 ? (
            <p className="muted">Ninguna nota usa constantes Java.</p>
          ) : (
            <table className="constants-table">
              <thead>
                <tr>
                  <th>Constante</th>
                  <th>Valor</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const missing = c.value === null;
                  return (
                    <tr key={c.name} className={missing ? 'constant-missing' : undefined}>
                      <td>
                        <span className="constant-name">{c.shortName}</span>
                        {c.packageName && <span className="constant-package muted">{c.packageName}</span>}
                      </td>
                      <td>
                        <input
                          aria-label={`Valor de ${c.shortName}`}
                          value={drafts[c.name] ?? ''}
                          placeholder={missing ? 'Sin valor' : ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [c.name]: e.target.value }))}
                        />
                      </td>
                      <td>
                        {c.notes > 0 ? (
                          c.notes
                        ) : (
                          <span className="constant-unused">
                            <span className="muted">sin uso</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void apply({ [c.name]: '' }, `Constante «${c.shortName}» borrada`)}
                            >
                              Borrar
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button type="submit" className="primary" disabled={busy || changed.length === 0}>
              Guardar
            </button>
            <button type="button" onClick={close}>
              Cerrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
