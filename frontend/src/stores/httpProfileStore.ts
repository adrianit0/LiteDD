import { create } from 'zustand';
import { api, LOCAL_PROFILE_ID, type HttpProfile, type HttpSettings } from '../api';

/** H-63: perfil activo de las notas HTTP. Lo guarda el servidor en memoria; cada arranque empieza en Local. */
interface HttpProfileState {
  active: string;
  load: () => Promise<void>;
  /** U-12: lo elige el selector de la barra superior. */
  select: (id: string) => Promise<void>;
}

export const useHttpProfile = create<HttpProfileState>((set) => ({
  active: LOCAL_PROFILE_ID,

  async load() {
    const { active } = await api.httpProfile();
    set({ active });
  },

  async select(id) {
    const { active } = await api.setHttpProfile(id);
    set({ active });
  },
}));

/** H-62: el perfil activo si se puede usar; si no, Local, que siempre va el primero. */
export function profileOf(http: HttpSettings, active: string): HttpProfile {
  const found = http.profiles.find((p) => p.id === active && (p.id === LOCAL_PROFILE_ID || http.preproduction));
  return found ?? http.profiles[0];
}

/** El perfil activo con sus ajustes. */
export function useActiveProfile(http: HttpSettings): HttpProfile {
  const active = useHttpProfile((s) => s.active);
  return profileOf(http, active);
}
