import { useEffect, useState } from 'react';
import { api, type UpdateCheck, type UpdateRelease, type UpdateStatus } from '../api';
import { formatDateTime } from '../format';
import { ask } from '../stores/dialogStore';
import { useTabs } from '../stores/tabsStore';
import { useUi } from '../stores/uiStore';
import { updateBlockers } from '../update';

const shortCommit = (commit: string) => commit.slice(0, 7);

function installedLabel(s: UpdateStatus): string {
  return s.build === 0 ? `${s.version}, compilada a mano` : `${s.version}, build ${s.build}, commit ${shortCommit(s.commit)}`;
}

function CommitList({ commits }: { commits: string[] }) {
  return (
    <ul className="settings-update-commits">
      {commits.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}

interface Props {
  /** Lo escrito en el campo. */
  repository: string;
  /** R-11: la URL guardada, la única con la que se puede buscar. */
  saved: string | null;
  busy: boolean;
  /** Marca la ventana como ocupada y muestra el error en el pie. */
  run: (work: () => Promise<void>) => Promise<void>;
  onChange: (repository: string) => void;
  onMessage: (message: { kind: 'ok' | 'error'; text: string }) => void;
}

/** R-10 a R-14, R-40, R-41: buscar e instalar una versión publicada (ADR-0033). */
export function UpdateSettings({ repository, saved, busy, run, onChange, onMessage }: Props) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [found, setFound] = useState<UpdateCheck | null>(null);
  const updating = useUi((s) => s.updating);
  const ready = saved !== null && saved === repository.trim();

  useEffect(() => {
    api.updateStatus().then(setStatus).catch(() => {});
  }, []);

  const search = () =>
    void run(async () => {
      setFound(null);
      const result = await api.checkUpdate();
      setFound(result);
      if (!result.newer) onMessage({ kind: 'ok', text: 'Tienes la última versión' });
    });

  const install = (release: UpdateRelease) =>
    void run(async () => {
      await useTabs.getState().savePending();
      const blockers = updateBlockers();
      if (blockers.length > 0) throw new Error(`No se puede actualizar: ${blockers.join(', ')}.`);
      const answer = await ask({
        title: 'Actualizar LiteDD',
        // El diálogo pone el cuerpo dentro de un párrafo.
        body: (
          <>
            Se instalará el build {release.build} (commit {shortCommit(release.commit)}) y LiteDD se reiniciará.
            {release.commits.map((c, i) => (
              <span key={i} className="settings-update-commit">
                {c}
              </span>
            ))}
          </>
        ),
        options: [
          { value: 'update', label: 'Actualizar', primary: true },
          { value: 'cancel', label: 'Cancelar' },
        ],
        cancelValue: 'cancel',
      });
      if (answer !== 'update') return;
      const ui = useUi.getState();
      ui.setUpdating(true);
      try {
        await api.applyUpdate(release.build);
      } catch (e) {
        ui.setUpdating(false);
        throw e;
      }
      onMessage({ kind: 'ok', text: 'Reiniciando LiteDD…' });
    });

  const release = found?.newer ? found.latest : null;

  return (
    <>
      <div className="form-grid">
        <span>Versión instalada</span>
        <span>{status ? installedLabel(status) : ''}</span>

        <label htmlFor="st-update-repository">URL del repositorio</label>
        <input
          id="st-update-repository"
          value={repository}
          placeholder="https://github.com/propietario/repositorio"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {repository.trim() !== '' && !ready && <p className="muted settings-hint">Guarda los ajustes para usar esta URL.</p>}
      {status && !status.available && <p className="muted settings-hint">{status.reason}</p>}
      {status?.available && (
        <div className="settings-row settings-update-actions">
          <button type="button" disabled={busy || updating || !ready} onClick={search}>
            Buscar actualizaciones
          </button>
          <button type="button" disabled={busy || updating || !release} onClick={() => release && install(release)}>
            Actualizar
          </button>
        </div>
      )}
      {release && (
        <section className="settings-update-release" aria-label="Versión disponible">
          <p>
            Build {release.build}, {formatDateTime(release.date)}, commit {shortCommit(release.commit)}
          </p>
          <CommitList commits={release.commits} />
        </section>
      )}
      <p className="muted settings-hint">
        LiteDD solo contacta con GitHub al pulsar un botón, no envía ningún dato tuyo y solo instala versiones firmadas. Las actualizaciones nunca se
        instalan solas.
      </p>
    </>
  );
}
