import { useState, type KeyboardEvent } from 'react';
import { setImportant } from '../actions';
import { dateInDays, isImportant, localDate } from '../important';
import { useTree } from '../stores/treeStore';
import { useUi } from '../stores/uiStore';

const SHORTCUTS: { label: string; days: number }[] = [
  { label: 'Hoy', days: 0 },
  { label: 'Mañana', days: 1 },
  { label: '1 semana', days: 7 },
];

/**
 * N-89: «Importante…». Los atajos guardan al pulsarlos; el campo de fecha sirve para cualquier otro día, nunca
 * anterior a hoy. Si la nota ya es importante, permite cambiar la fecha y quitar la marca.
 */
export function ImportantDialog({ noteId }: { noteId: string }) {
  const node = useTree((s) => s.nodes.find((n) => n.id === noteId));
  const now = new Date();
  const today = localDate(now);
  const current = node && isImportant(node, now) ? node.importantUntil! : null;
  const [date, setDate] = useState(current ?? dateInDays(1, now));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today;
  const close = () => useUi.getState().setImportantFor(null);

  const save = (until: string | null) => {
    close();
    void setImportant(noteId, until);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className="dialog important-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="important-title"
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save(date);
        }}
      >
        <h2 id="important-title">Importante: «{node?.title}»</h2>
        <div className="important-shortcuts" role="group" aria-label="Atajos">
          {SHORTCUTS.map((s) => (
            <button key={s.label} type="button" onClick={() => save(dateInDays(s.days, now))}>
              {s.label}
            </button>
          ))}
        </div>
        <label className="important-date">
          <span>Fecha fin importancia</span>
          <input type="date" autoFocus required min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {!valid && <p className="error-text">Elige un día que no haya pasado.</p>}
        <div className="dialog-actions">
          {current && (
            <button type="button" className="important-clear" onClick={() => save(null)}>
              Quitar la marca
            </button>
          )}
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
