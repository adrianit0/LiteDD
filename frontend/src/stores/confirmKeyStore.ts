import { create } from 'zustand';

/** H-69: petición de la clave de confirmación antes de enviar a un perfil que la pide. */
interface KeyRequest {
  id: number;
  profileName: string;
  /** Por qué se vuelve a pedir, por ejemplo una clave incorrecta. */
  error: string | null;
  resolve: (key: string | null) => void;
}

interface ConfirmKeyState {
  current: KeyRequest | null;
  answer: (key: string | null) => void;
}

let requestId = 0;

export const useConfirmKey = create<ConfirmKeyState>((set, get) => ({
  current: null,
  answer(key) {
    const current = get().current;
    set({ current: null });
    current?.resolve(key);
  },
}));

/** La clave escrita, o null si se cancela: entonces no se envía nada. La interfaz no la recuerda. */
export function askConfirmKey(profileName: string, error: string | null = null): Promise<string | null> {
  return new Promise((resolve) => {
    // Una petición nueva sustituye a la anterior, que se da por cancelada.
    useConfirmKey.getState().current?.resolve(null);
    useConfirmKey.setState({ current: { id: ++requestId, profileName, error, resolve } });
  });
}
