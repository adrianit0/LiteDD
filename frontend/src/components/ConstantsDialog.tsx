import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api, type JavaConstant } from '../api';
import { migrate, type Migration } from '../javaConstants';
import { useUi } from '../stores/uiStore';
import { ask } from '../stores/dialogStore';

/** M-69: resumen de la migración masiva. */
function migrationSummary(m: Migration): string {
  const filled = Object.keys(m.values).length;
  const parts = [
    `${filled} ${filled === 1 ? 'constante rellenada' : 'constantes rellenadas'}` +
      (m.same > 0 ? ` y ${m.same} ${m.same === 1 ? 'que ya tenía' : 'que ya tenían'} ese valor.` : '.'),
  ];
  if (m.outside > 0) {
    parts.push(
      m.outside === 1
        ? '1 constante del texto no está en la lista y no se añade.'
        : `${m.outside} constantes del texto no están en la lista y no se añaden.`,
    );
  }
  if (m.unreadable.length > 0) parts.push(`No se ha podido leer el valor de ${m.unreadable.join(', ')}: dáselo a mano.`);
  if (filled > 0) parts.push('Revisa los cambios y pulsa «Guardar».');
  return parts.join(' ');
}

/**
 * M-65, M-66, ADR-0026: constantes Java de los mappers con su valor, común a todas las notas (ADR-0025).
 * M-69, ADR-0037: migración masiva desde el .java de constantes.
 */
export function ConstantsDialog() {
  const [list, setList] = useState<JavaConstant[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** M-69, ADR-0037: texto pegado; solo vive mientras se muestra el cuadro. null = se muestra la lista. */
  const [source, setSource] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const migrationButton = useRef<HTMLButtonElement>(null);
  const wasMigrating = useRef(false);

  // Al volver a la lista, el foco vuelve al botón para que Esc siga llegando a la ventana.
  const migrating = source !== null;
  useEffect(() => {
    if (wasMigrating.current && !migrating) migrationButton.current?.focus();
    wasMigrating.current = migrating;
  }, [migrating]);

  const load =(constants: JavaConstant[]) => {
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

  const isChanged = (c: JavaConstant) => (drafts[c.name] ?? '').trim() !== (c.value ?? '');
  const changed = (list ?? []).filter(isChanged);

  const apply = async (values: Record<string, string>, message: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      load(await api.putConstants(values));
      setSummary(null);
      useUi.getState().constantsSaved();
      useUi.getState().notify(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar las constantes');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveChanges = () => apply(Object.fromEntries(changed.map((c) => [c.name, drafts[c.name] ?? ''])), 'Constantes guardadas');

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (source !== null || changed.length === 0) return;
    void saveChanges();
  };

  const startMigration = () => {
    setError(null);
    setSource('');
  };

  const cancelMigration = () => {
    setError(null);
    setSource(null);
  };

  /** M-69: rellena la tabla con los valores del texto, sin guardar. */
  const runMigration = () => {
    const result = migrate(source ?? '', list ?? [], drafts);
    if (!result) {
      setError('No se ha encontrado ninguna constante en el texto pegado.');
      return;
    }
    setDrafts((d) => ({ ...d, ...result.values }));
    setSummary(migrationSummary(result));
    cancelMigration();
  };

  /** ADR-0026: con cambios sin guardar, pregunta antes de cerrar. */
  const requestClose = async () => {
    if (changed.length === 0) return close();
    const choice = await ask({
      title: 'Cambios sin guardar',
      body:
        changed.length === 1
          ? 'Una constante tiene cambios sin guardar.'
          : `${changed.length} constantes tienen cambios sin guardar.`,
      options: [
        { value: 'save', label: 'Guardar', primary: true },
        { value: 'discard', label: 'Descartar' },
        { value: 'cancel', label: 'Seguir editando' },
      ],
      cancelValue: 'cancel',
    });
    if (choice === 'discard' || (choice === 'save' && (await saveChanges()))) close();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (source !== null) cancelMigration();
      else void requestClose();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog constants-dialog" role="dialog" aria-modal="true" aria-labelledby="constants-title" onKeyDown={onKeyDown}>
        <div className="dialog-header">
          <h2 id="constants-title">Constantes</h2>
          <button type="button" className="dialog-close" aria-label="Cerrar la ventana" title="Cerrar" onClick={() => void requestClose()}>
            ×
          </button>
        </div>
        <p className="muted settings-hint">
          Valores de las constantes Java de los mappers, como <code>@paquete.Clase@CAMPO</code>. Un número se usa como número y
          cualquier otro valor como texto. Valen para todas las notas.
        </p>
        <form className="constants-form" onSubmit={save}>
          {source !== null ? (
            <>
              <p className="muted settings-hint constants-migration-hint">
                Pega el contenido del fichero <code>.java</code> de constantes. Se rellenan solo las constantes de la lista; el texto
                no se guarda.
              </p>
              <textarea
                className="constants-source"
                aria-label="Contenido del .java"
                autoFocus
                spellCheck={false}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </>
          ) : (
            <>
              <div className="constants-toolbar">
                <input
                  type="search"
                  className="constants-filter"
                  placeholder="Filtrar"
                  aria-label="Filtrar constantes"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <button
                  ref={migrationButton}
                  type="button"
                  disabled={busy || !list || list.length === 0}
                  onClick={startMigration}
                >
                  Migración masiva…
                </button>
              </div>
              {summary && (
                <p className="constants-summary" role="status">
                  {summary}
                </p>
              )}
              {list === null ? (
                !error && <p className="muted">Cargando…</p>
              ) : list.length === 0 ? (
                <p className="muted">Ninguna nota usa constantes Java.</p>
              ) : (
                <div className="constants-list">
                  <table className="constants-table">
                    <colgroup>
                      <col className="constants-col-name" />
                      <col />
                      <col className="constants-col-notes" />
                    </colgroup>
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
                        const rowClass = [missing && 'constant-missing', isChanged(c) && 'constant-changed'].filter(Boolean).join(' ');
                        return (
                          <tr key={c.name} className={rowClass || undefined}>
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
                </div>
              )}
            </>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {/* Claves distintas: si React reutilizara «Aplicar» como «Guardar», el clic acabaría enviando el formulario. */}
          <div className="dialog-actions">
            {source !== null ? (
              <>
                <button key="apply" type="button" className="primary" disabled={source.trim() === ''} onClick={runMigration}>
                  Aplicar
                </button>
                <button key="cancel" type="button" onClick={cancelMigration}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button key="save" type="submit" className="primary" disabled={busy || changed.length === 0}>
                  Guardar
                </button>
                <button key="close" type="button" onClick={() => void requestClose()}>
                  Cerrar
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
