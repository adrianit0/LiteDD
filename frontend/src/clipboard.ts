import { useUi } from './stores/uiStore';

/** Copia al portapapeles y avisa (Q-73, N-34, H-33). done: el aviso si sale bien. */
export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    useUi.getState().notify(done);
  } catch {
    useUi.getState().notify('No se pudo copiar al portapapeles', 'error');
  }
}
