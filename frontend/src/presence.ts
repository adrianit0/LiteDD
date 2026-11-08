import { api, onNetworkFailure, sessionToken } from './api';
import { openFromOutside, type OpenRequest } from './actions';
import { useTabs } from './stores/tabsStore';
import { useUi } from './stores/uiStore';

/** U-11: cadencia del reintento mientras no hay contacto. */
export const RETRY_DELAY = 3000;

export interface ServerEvent {
  event: string;
  data: string;
}

/** Eventos SSE completos de un texto; lo que queda tras el último es el principio del siguiente. */
export function parseEvents(text: string): { events: ServerEvent[]; rest: string } {
  const blocks = text.replace(/\r\n?/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: ServerEvent[] = [];
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      // Los comentarios («: latido») no son eventos.
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length > 0) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

/** N-95, N-96: el evento open lleva la nota pedida desde fuera. */
function onEvent(e: ServerEvent) {
  if (e.event !== 'open') return;
  let request: OpenRequest;
  try {
    request = JSON.parse(e.data) as OpenRequest;
  } catch {
    return;
  }
  void openFromOutside(request);
}

/**
 * Ciclo de vida (ADR-0017): la ventana mantiene abierto el canal /api/events y se despide al cerrarse. Por
 * el canal llegan también las notas que se piden desde fuera (N-95, N-96, ADR-0045).
 * U-11: si el canal o una petición fallan, aparece la banda, se reintenta solo y, al recuperar el
 * contacto, se guardan las pestañas pendientes.
 */
export function startPresence(): () => void {
  let stopped = false;
  let leaving = false;
  let retrying = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  // R-45: la interfaz cargada es la de este build.
  let loadedBuild: number | null = null;
  void api.appBuild().then((build) => (loadedBuild = build));

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
      const decoder = new TextDecoder();
      let rest = '';
      // Que el canal siga abierto es la presencia; trae latidos y las notas pedidas desde fuera (ADR-0045).
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const parsed = parseEvents(rest + decoder.decode(value, { stream: true }));
        rest = parsed.rest;
        parsed.events.forEach(onEvent);
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
    await afterRestart();
  };

  /** R-45: si el servidor es otro build, la ventana se recarga para tomar su interfaz. */
  const afterRestart = async () => {
    const build = await api.appBuild();
    const ui = useUi.getState();
    if (build !== null && loadedBuild !== null && build !== loadedBuild) {
      window.location.reload();
    } else if (ui.updating) {
      ui.setUpdating(false);
      ui.notify('No se pudo aplicar la actualización: sigue la versión anterior. El detalle está en update.log.', 'error');
    }
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
