import { api, onNetworkFailure, sessionToken } from './api';
import { useTabs } from './stores/tabsStore';
import { useUi } from './stores/uiStore';

/** U-11: cadencia del reintento mientras no hay contacto. */
export const RETRY_DELAY = 3000;

/**
 * Ciclo de vida (ADR-0017): la ventana mantiene abierto el canal /api/events y se despide al cerrarse.
 * U-11: si el canal o una petición fallan, aparece la banda, se reintenta solo y, al recuperar el
 * contacto, se guardan las pestañas pendientes.
 */
export function startPresence(): () => void {
  let stopped = false;
  let leaving = false;
  let retrying = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const listen = async () => {
    controller = new AbortController();
    try {
      const res = await fetch('/api/events', {
        headers: { 'X-LiteDD-Token': sessionToken(), Accept: 'text/event-stream' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok || !res.body) throw new Error(`Error ${res.status}`);
      const reader = res.body.getReader();
      // Solo importa que el canal siga abierto; el contenido son latidos.
      while (!(await reader.read()).done) {
        /* latido */
      }
    } catch {
      // El servidor se ha ido o la ventana se cierra.
    }
    if (!stopped && !leaving) lost();
  };

  const lost = () => {
    if (stopped || leaving) return;
    useUi.getState().setContactLost(true);
    if (retrying) return;
    retrying = true;
    retryTimer = setTimeout(retry, RETRY_DELAY);
  };

  const retry = async () => {
    if (stopped) return;
    if (!(await api.health())) {
      retryTimer = setTimeout(retry, RETRY_DELAY);
      return;
    }
    retrying = false;
    await api.refreshToken();
    useUi.getState().setContactLost(false);
    void listen();
    await useTabs.getState().savePending();
  };

  const onPageHide = () => {
    leaving = true;
    void api.bye();
  };
  // Al volver de la caché del navegador la ventana vuelve a contar.
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    leaving = false;
    void listen();
  };

  onNetworkFailure(lost);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  void listen();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    controller?.abort();
    onNetworkFailure(null);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
}
