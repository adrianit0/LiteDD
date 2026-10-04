import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useUi } from '../stores/uiStore';
import { emptyTrash, purgeNote, restoreNote } from '../actions';
import { formatDateTime } from '../format';
import type { TrashItem } from '../types';
import { TypeIcon } from './TypeIcon';

/** N-52, ADR-0009: la papelera ocupa el panel izquierdo. */
export function TrashPanel() {
  const [items, setItems] = useState<TrashItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.trash());
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo leer la papelera', 'error');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="trash">
      <div className="trash-header">
        <h2>Papelera</h2>
        <button type="button" onClick={() => useUi.getState().setSidebarView('tree')}>
          Volver al árbol
        </button>
      </div>
      {items === null ? (
        <p className="muted trash-empty">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="muted trash-empty">La papelera está vacía.</p>
      ) : (
        <>
          <ul className="trash-list" aria-label="Notas en la papelera">
            {items.map((item) => (
              <li key={item.id} className="trash-item">
                <div className="trash-item-title">
                  <TypeIcon type={item.type} />
                  <span>{item.title}</span>
                </div>
                <div className="muted trash-date">Eliminada el {formatDateTime(item.deletedAt)}</div>
                <div className="trash-actions">
                  <button type="button" onClick={async () => (await restoreNote(item.id)) && void load()}>
                    Restaurar
                  </button>
                  <button type="button" onClick={async () => (await purgeNote(item.id, item.title)) && void load()}>
                    Eliminar definitivamente
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="trash-footer">
            <button type="button" onClick={async () => (await emptyTrash(items.length)) && void load()}>
              Vaciar la papelera
            </button>
          </div>
        </>
      )}
    </div>
  );
}
