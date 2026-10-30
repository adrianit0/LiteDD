import type { Mock } from 'vitest';
import { api, request } from './api';
import { RETRY_DELAY, startPresence } from './presence';
import { useTabs } from './stores/tabsStore';
import { useUi } from './stores/uiStore';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, api: { health: vi.fn(), bye: vi.fn(), refreshToken: vi.fn().mockResolvedValue(undefined), appBuild: vi.fn().mockResolvedValue(5) } };
});

const mocked = vi.mocked(api);

/** Canal de eventos simulado: sigue abierto hasta que se llama a end(). */
function eventStream() {
  let end: () => void = () => {};
  const done = new Promise<void>((resolve) => (end = resolve));
  const reader = { read: vi.fn(async () => (await done, { done: true, value: undefined })) };
  return { response: { ok: true, status: 200, body: { getReader: () => reader } }, end };
}

let streams: ReturnType<typeof eventStream>[];
let fetchMock: ReturnType<typeof vi.fn>;
let stop: () => void;
const savePending = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  streams = [];
  fetchMock = vi.fn(async () => {
    const s = eventStream();
    streams.push(s);
    return s.response;
  });
  vi.stubGlobal('fetch', fetchMock);
  useUi.setState({ contactLost: false });
  useTabs.setState({ savePending });
});

afterEach(() => {
  stop?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('presencia y contacto', () => {
  it('ciclo de vida: la ventana abre /api/events con el token y Accept text/event-stream', async () => {
    stop = startPresence();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/events', expect.objectContaining({ headers: expect.objectContaining({ Accept: 'text/event-stream' }) }));
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers).toHaveProperty('X-LiteDD-Token');
  });

  it('ciclo de vida: al cerrar la ventana se despide y no muestra la banda', async () => {
    stop = startPresence();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('pagehide'));
    streams[0].end();
    await vi.advanceTimersByTimeAsync(RETRY_DELAY * 2);
    expect(mocked.bye).toHaveBeenCalledTimes(1);
    expect(useUi.getState().contactLost).toBe(false);
    expect(mocked.health).not.toHaveBeenCalled();
  });

  it('U-11 si se corta el canal aparece la banda, se reintenta solo y al volver se guarda lo pendiente', async () => {
    mocked.health.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    stop = startPresence();
    await vi.advanceTimersByTimeAsync(0);
    streams[0].end();
    await vi.advanceTimersByTimeAsync(0);
    expect(useUi.getState().contactLost).toBe(true);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY);
    expect(mocked.health).toHaveBeenCalledTimes(1);
    expect(useUi.getState().contactLost).toBe(true);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY);
    expect(mocked.health).toHaveBeenCalledTimes(2);
    expect(useUi.getState().contactLost).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocked.refreshToken).toHaveBeenCalledTimes(1);
    expect(savePending).toHaveBeenCalledTimes(1);
  });

  it('U-11 tras un reinicio del servidor se relee el token de la página inicial', async () => {
    const { api: real } = await vi.importActual<typeof import('./api')>('./api');
    document.head.innerHTML = '<meta name="litedd-token" content="viejo" />';
    fetchMock.mockResolvedValueOnce({ text: async () => '<html><head><meta name="litedd-token" content="nuevo" /></head></html>' });
    await real.refreshToken();
    expect(fetchMock).toHaveBeenCalledWith('/', { cache: 'no-store' });
    expect(document.querySelector<HTMLMetaElement>('meta[name="litedd-token"]')!.content).toBe('nuevo');
  });

  it('U-11 una petición sin respuesta también muestra la banda', async () => {
    mocked.health.mockResolvedValue(true);
    stop = startPresence();
    await vi.advanceTimersByTimeAsync(0);
    // El módulo api avisa al oyente registrado cuando fetch falla.
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(request('GET', '/api/tree')).rejects.toMatchObject({ status: 0 });
    expect(useUi.getState().contactLost).toBe(true);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY);
    expect(useUi.getState().contactLost).toBe(false);
  });

  describe('R-45 tras reiniciarse el servidor', () => {
    let reload: Mock<() => void>;

    /** Corta el canal y deja que el servidor vuelva con ese build. */
    async function restartWith(build: number | null) {
      mocked.health.mockResolvedValue(true);
      stop = startPresence();
      await vi.advanceTimersByTimeAsync(0);
      mocked.appBuild.mockResolvedValue(build);
      streams[0].end();
      await vi.advanceTimersByTimeAsync(RETRY_DELAY);
    }

    beforeEach(() => {
      reload = vi.fn<() => void>();
      vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
      mocked.appBuild.mockResolvedValue(5);
      useUi.setState({ updating: false, notices: [] });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('R-45 con otro build guarda lo pendiente y recarga la ventana', async () => {
      await restartWith(6);
      expect(savePending).toHaveBeenCalledTimes(1);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(savePending.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
    });

    it('R-45 con el mismo build no recarga', async () => {
      await restartWith(5);
      expect(reload).not.toHaveBeenCalled();
      expect(useUi.getState().notices).toEqual([]);
    });

    it('R-45 si se pidió actualizar y vuelve el mismo build, avisa de que sigue la versión anterior', async () => {
      useUi.setState({ updating: true });
      await restartWith(5);
      expect(reload).not.toHaveBeenCalled();
      expect(useUi.getState().updating).toBe(false);
      expect(useUi.getState().notices.at(-1)?.text).toContain('sigue la versión anterior');
    });

    it('R-45 sin saber el build no recarga', async () => {
      await restartWith(null);
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
