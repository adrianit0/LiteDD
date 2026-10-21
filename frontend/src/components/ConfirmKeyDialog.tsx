import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useConfirmKey } from '../stores/confirmKeyStore';

/** H-69: pide la clave de confirmación nombrando el perfil de destino. Escape cancela sin enviar. */
export function ConfirmKeyDialog() {
  const current = useConfirmKey((s) => s.current);
  if (!current) return null;
  return <KeyForm key={current.id} profileName={current.profileName} error={current.error} />;
}

function KeyForm({ profileName, error }: { profileName: string; error: string | null }) {
  const [key, setKey] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const answer = useConfirmKey.getState().answer;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => previous?.focus();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (key !== '') answer(key);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      answer(null);
    }
    // Mantiene el foco dentro del diálogo (U-08).
    if (e.key === 'Tab') {
      const items = [...(ref.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? [])];
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? index - 1 : index + 1;
      e.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-key-title" ref={ref} onKeyDown={onKeyDown}>
        <h2 id="confirm-key-title">Enviar a «{profileName}»</h2>
        <form onSubmit={submit}>
          <div className="dialog-body">
            <p>El perfil «{profileName}» pide la clave de confirmación antes de enviar.</p>
            <label className="confirm-key-field">
              <span>Clave de confirmación</span>
              <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
            </label>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-actions">
            <button type="submit" className="primary" disabled={key === ''}>
              Enviar
            </button>
            <button type="button" onClick={() => answer(null)}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
