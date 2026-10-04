import { create } from 'zustand';
import { api, type ConnectionStatus } from '../api';
import { useUi } from './uiStore';

/** Estado de la conexión a MySQL en la barra superior (C-02, C-09, C-10). */
interface ConnectionState {
  status: ConnectionStatus | null;
  dialogOpen: boolean;
  busy: boolean;
  load: () => Promise<void>;
  setStatus: (status: ConnectionStatus) => void;
  reconnect: () => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;
}

export const useConnection = create<ConnectionState>((set) => ({
  status: null,
  dialogOpen: false,
  busy: false,

  async load() {
    try {
      set({ status: await api.connectionStatus() });
    } catch {
      // La barra muestra «sin conexión» y el resto de la aplicación sigue funcionando.
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

  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}));

/** Texto del indicador de la barra superior. */
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
