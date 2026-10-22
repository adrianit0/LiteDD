import { create } from 'zustand';
import { api, type ConnectionStatus } from '../api';
import { useUi } from './uiStore';

/** Estado de la conexión a MySQL, que se ve en «Ajustes → Conexión» (C-02, C-09, C-10). */
interface ConnectionState {
  status: ConnectionStatus | null;
  busy: boolean;
  load: () => Promise<void>;
  setStatus: (status: ConnectionStatus) => void;
  reconnect: () => Promise<void>;
}

export const useConnection = create<ConnectionState>((set) => ({
  status: null,
  busy: false,

  async load() {
    try {
      set({ status: await api.connectionStatus() });
    } catch {
      // «Ajustes → Conexión» muestra «sin conexión» y el resto de la aplicación sigue funcionando.
    }
  },

  setStatus(status) {
    set({ status });
  },

  async reconnect() {
    set({ busy: true });
    try {
      const status = await api.reconnect();
      set({ status });
      if (status.state === 'connected') useUi.getState().notify('Conectado a MySQL');
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo reconectar', 'error');
    } finally {
      set({ busy: false });
    }
  },

}));

/** Texto del estado en «Ajustes → Conexión». */
export function statusLabel(status: ConnectionStatus | null): string {
  if (!status || status.state === 'not_configured') return 'Sin conexión configurada';
  const target = `${status.user}@${status.host}${status.schema ? `/${status.schema}` : ''}`;
  switch (status.state) {
    case 'connected':
      return target;
    case 'schema_unavailable':
      return `Esquema no disponible · ${target}`;
    default:
      return `Desconectado · ${target}`;
  }
}
