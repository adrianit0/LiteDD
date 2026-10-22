import { useEffect, useRef, useState } from 'react';
import { api, LOCAL_PROFILE_ID, type CaCertificate, type HttpProfile } from '../api';
import { formatDateTime } from '../format';

/** Un perfil en el formulario de «Ajustes»; la contraseña se escribe aquí pero nunca se lee (H-21). */
export interface ProfileForm {
  id: string;
  name: string;
  baseUrl: string;
  user: string;
  requireKey: boolean;
  requireCa: boolean;
  password: string;
}

export function toProfileForms(profiles: HttpProfile[]): ProfileForm[] {
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl ?? '',
    user: p.user,
    requireKey: p.requireKey,
    requireCa: p.requireCa,
    password: '',
  }));
}

export function fromProfileForms(forms: ProfileForm[]): HttpProfile[] {
  return forms.map((p) => ({
    id: p.id,
    name: p.name.trim(),
    baseUrl: p.baseUrl.trim() === '' ? null : p.baseUrl.trim(),
    user: p.user.trim(),
    requireKey: p.requireKey,
    requireCa: p.requireCa,
  }));
}

interface Props {
  profiles: ProfileForm[];
  /** H-62: sin la casilla solo se ve Local; los demás se conservan. */
  preproduction: boolean;
  /** Perfiles con contraseña guardada. */
  saved: Record<string, boolean>;
  busy: boolean;
  onChange: (profiles: ProfileForm[]) => void;
  onClearPassword: (id: string) => void;
}

/**
 * H-60 a H-62, H-69 a H-71: Local fijo y primero, y los entornos de preproducción en su orden, cada uno con su URL base,
 * usuario, contraseña, clave y CA.
 */
export function HttpProfilesSettings({ profiles, preproduction, saved, busy, onChange, onClearPassword }: Props) {
  const change = (id: string, changes: Partial<ProfileForm>) => onChange(profiles.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  const visible = profiles.filter((p) => p.id === LOCAL_PROFILE_ID || preproduction);
  // Propuesta C de ADR-0028 y H-71: un entorno nuevo nace pidiendo la clave y la CA corporativa.
  const add = () =>
    onChange([...profiles, { id: crypto.randomUUID(), name: '', baseUrl: '', user: '', requireKey: true, requireCa: true, password: '' }]);
  // H-70: Local se queda en la posición 0; los demás se intercambian con su vecino.
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 1 || target >= profiles.length) return;
    const next = [...profiles];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <>
      {visible.map((p) => {
        const local = p.id === LOCAL_PROFILE_ID;
        const index = profiles.indexOf(p);
        const id = (field: string) => `st-http-${p.id}-${field}`;
        return (
          <fieldset key={p.id} className="settings-profile">
            <legend>{local ? 'Local' : p.name.trim() || 'Entorno sin nombre'}</legend>
            <div className="form-grid">
              {!local && (
                <>
                  <label htmlFor={id('name')}>Nombre</label>
                  <input id={id('name')} value={p.name} required onChange={(e) => change(p.id, { name: e.target.value })} />
                </>
              )}
              <label htmlFor={id('base')}>URL base</label>
              <input
                id={id('base')}
                value={p.baseUrl}
                placeholder={local ? 'http://127.0.0.1:8080/demo/' : 'https://pre1.litedd-demo.test/demo/'}
                onChange={(e) => change(p.id, { baseUrl: e.target.value })}
              />

              <label htmlFor={id('user')}>Usuario</label>
              <input id={id('user')} value={p.user} autoComplete="off" onChange={(e) => change(p.id, { user: e.target.value })} />

              <label htmlFor={id('password')}>Contraseña</label>
              <span className="settings-inline">
                <input
                  id={id('password')}
                  type="password"
                  value={p.password}
                  autoComplete="new-password"
                  placeholder={saved[p.id] ? 'Guardada (déjala vacía para conservarla)' : ''}
                  onChange={(e) => change(p.id, { password: e.target.value })}
                />
                {saved[p.id] && (
                  <button type="button" disabled={busy} onClick={() => onClearPassword(p.id)}>
                    Borrar
                  </button>
                )}
              </span>

              <label htmlFor={id('key')}>Pedir clave al enviar</label>
              <span>
                <input id={id('key')} type="checkbox" checked={p.requireKey} onChange={(e) => change(p.id, { requireKey: e.target.checked })} />
              </span>

              {!local && (
                <>
                  <label htmlFor={id('ca')}>Pedir CA corporativa</label>
                  <span>
                    <input id={id('ca')} type="checkbox" checked={p.requireCa} onChange={(e) => change(p.id, { requireCa: e.target.checked })} />
                  </span>
                </>
              )}
            </div>
            {!local && (
              <div className="settings-row">
                <button type="button" disabled={index <= 1} onClick={() => move(index, -1)}>
                  <span aria-hidden="true">↑</span> Subir
                </button>
                <button type="button" disabled={index >= profiles.length - 1} onClick={() => move(index, 1)}>
                  <span aria-hidden="true">↓</span> Bajar
                </button>
                <button type="button" onClick={() => onChange(profiles.filter((o) => o.id !== p.id))}>
                  Eliminar entorno
                </button>
              </div>
            )}
          </fieldset>
        );
      })}
      {preproduction && (
        <button type="button" onClick={add}>
          Añadir entorno
        </button>
      )}
    </>
  );
}

/** H-66: la CA corporativa importada, con su sujeto y su caducidad, y el botón para importarla desde un PEM. */
export function CorporateCaSettings({ onMessage }: { onMessage: (message: { kind: 'ok' | 'error'; text: string }) => void }) {
  const [certificates, setCertificates] = useState<CaCertificate[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .httpCa()
      .then((r) => setCertificates(r.certificates))
      .catch(() => setCertificates([]));
  }, []);

  const importFile = async (file: File) => {
    try {
      const { certificates: imported } = await api.importHttpCa(await file.text());
      setCertificates(imported);
      onMessage({ kind: 'ok', text: `CA corporativa importada de «${file.name}»` });
    } catch (e) {
      onMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo importar la CA' });
    }
  };

  return (
    <div className="settings-ca" role="group" aria-label="CA corporativa">
      <span className="form-label">CA corporativa</span>
      {certificates && certificates.length > 0 ? (
        <ul className="settings-ca-list">
          {certificates.map((c) => (
            <li key={c.subject + c.notAfter}>
              {c.subject} <span className="muted">· caduca el {formatDateTime(c.notAfter)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="muted">{certificates ? 'Sin importar: no se puede llamar a los entornos con «Pedir CA corporativa»' : 'Cargando…'}</span>
      )}
      <button type="button" onClick={() => fileInput.current?.click()}>
        Importar CA (PEM)…
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".pem,.crt,.cer,application/x-pem-file"
        hidden
        aria-label="Fichero PEM de la CA corporativa"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
    </div>
  );
}
