import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { api, DEFAULT_CONFIG, type HttpResult } from '../../api';
import { NotePane } from '../NotePane';
import { useActiveTab, useTabs } from '../../stores/tabsStore';
import { useHttpRuns } from '../../stores/httpRunStore';
import { useUi } from '../../stores/uiStore';
import { parseContent } from '../../http/content';
import type { Note } from '../../types';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      saveNote: vi.fn(),
      putSession: vi.fn(),
      putSettings: vi.fn(),
      tags: vi.fn(),
      httpExecute: vi.fn(),
      httpCancel: vi.fn(),
      appVersion: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

const httpNote = (content: string, over: Partial<Note> = {}): Note => ({
  id: 'h1',
  parentId: null,
  position: 0,
  type: 'http',
  title: 'Tareas',
  description: '',
  content,
  favorite: false,
  tags: [],
  version: 3,
  createdAt: '2026-10-06T08:00:00Z',
  updatedAt: '2026-10-06T08:00:00Z',
  ...over,
});

function Pane() {
  const tab = useActiveTab();
  return tab ? <NotePane key={tab.id} tab={tab} /> : null;
}

async function mount(content = '', over: Partial<Note> = {}) {
  await act(async () => {
    await useTabs.getState().open(over.id ?? 'h1', { note: httpNote(content, over), preview: true });
  });
  render(<Pane />);
  await act(async () => {});
}

const saved = () => parseContent(useTabs.getState().tabs[0].content);

const ok: HttpResult = {
  phase: 'request',
  login: { user: 'demo', status: 200, millis: 12 },
  request: { method: 'GET', url: 'http://127.0.0.1:8080/demo/user/5/tasks', headers: [{ name: 'X-USERID', value: 'usr-1' }] },
  response: {
    status: 200,
    statusText: 'OK',
    millis: 34,
    size: 2048,
    contentType: 'application/json',
    headers: [{ name: 'Content-Type', value: 'application/json' }],
    cookies: [{ name: 'pref', value: '1', domain: null, path: '/', maxAge: null, httpOnly: true, secure: false }],
    text: '{"id":5,"title":"Tarea"}',
    binary: false,
    truncated: false,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.appVersion.mockResolvedValue('0.1.0');
  mocked.putSession.mockResolvedValue({ tabs: [] });
  mocked.tags.mockResolvedValue([]);
  mocked.saveNote.mockImplementation(async (id, title, content, baseVersion) => httpNote(content, { id, title, version: baseVersion + 1 }));
  mocked.httpCancel.mockResolvedValue({ cancelled: true });
  useUi.setState({
    config: { ...DEFAULT_CONFIG, http: { ...DEFAULT_CONFIG.http, baseUrl: 'http://127.0.0.1:8080/demo/', loginNoteId: 'login', user: 'demo' } },
  });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  useHttpRuns.setState({ runs: {} });
});

describe('nota HTTP', () => {
  it('H-01 H-02 sin modos: título editable, sin «Editar» y con método, URL base y endpoint', async () => {
    await mount();
    expect(screen.getByLabelText('Título')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull();
    expect(screen.getByLabelText<HTMLSelectElement>('Método').value).toBe('GET');
    expect([...screen.getByLabelText<HTMLSelectElement>('Método').options].map((o) => o.value)).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ]);
    expect(screen.getByText('http://127.0.0.1:8080/demo/')).toBeTruthy();
  });

  it('H-02 H-03 P-14 modificar el formulario lo guarda en la nota y fija la pestaña', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('Método'), { target: { value: 'DELETE' } });
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: '/user/7' } });
    expect(saved()).toMatchObject({ method: 'DELETE', endpoint: '/user/7' });
    expect(useTabs.getState().tabs[0]).toMatchObject({ status: 'pending', preview: false });
  });

  it('H-10 sin URL base avisa y lleva a «Ajustes»', async () => {
    useUi.setState({ config: DEFAULT_CONFIG });
    await mount();
    expect(screen.getByText('Sin URL base')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir «Ajustes»' }));
    expect(useUi.getState().settingsOpen).toBe(true);
  });

  it('H-12 cada variable de ruta tiene su campo; vacía impide enviar', async () => {
    await mount('{"endpoint":"/user/{id}/tasks"}');
    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Enviar' });
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Variable id'), { target: { value: '5' } });
    expect(saved().pathValues).toEqual({ id: '5' });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Enviar' }).disabled).toBe(false);
  });

  it('H-24 las dos casillas son excluyentes y desactivan el usuario', async () => {
    await mount();
    const user = screen.getByLabelText<HTMLInputElement>('Usuario');
    expect(user.placeholder).toBe('demo');
    expect(user.disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('No necesita login'));
    expect(saved().login).toBe('none');
    expect(screen.getByLabelText<HTMLInputElement>('Reutilizar login').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Usuario').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('No necesita login'));
    fireEvent.click(screen.getByLabelText('Reutilizar login'));
    expect(saved().login).toBe('reuse');
    expect(screen.getByLabelText<HTMLInputElement>('No necesita login').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Usuario').disabled).toBe(true);
  });

  it('H-20 H-27 la nota de login no tiene casillas y avisa de lo que hace', async () => {
    await mount('', { id: 'login' });
    expect(screen.queryByLabelText('No necesita login')).toBeNull();
    expect(screen.getByText(/Nota de login/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Headers' }));
    expect(screen.getByText('Basic (usuario y contraseña de «Ajustes»)')).toBeTruthy();
  });

  it('H-14 params: una fila nueva se añade al escribir y se puede desactivar o quitar', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('Params: clave nueva'), { target: { value: 'page' } });
    fireEvent.change(screen.getByLabelText('Params: valor 1'), { target: { value: '2' } });
    expect(saved().params).toEqual([{ key: 'page', value: '2', enabled: true }]);
    fireEvent.click(screen.getByLabelText('Activar page'));
    expect(saved().params[0].enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar page' }));
    expect(saved().params).toEqual([]);
  });

  it('H-15 H-16 cabeceras generadas en gris, editables, desactivables y ocultables', async () => {
    await mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Headers' }));
    const generated = screen.getByRole('table', { name: 'Headers generados' });
    for (const name of ['Accept', 'Content-Type', 'User-Agent', 'Cache-Control', 'X-USERID', 'X-CSRF-TOKEN', 'Cookie']) {
      expect(within(generated).getByText(name)).toBeTruthy();
    }
    expect(screen.getByLabelText<HTMLInputElement>('Valor de Accept').placeholder).toBe('application/json');
    expect(screen.getByLabelText<HTMLInputElement>('Valor de User-Agent').placeholder).toBe('LiteDD/0.1.0');
    expect(screen.getByLabelText<HTMLInputElement>('Valor de X-USERID').placeholder).toBe('(del login)');

    fireEvent.change(screen.getByLabelText('Valor de Accept'), { target: { value: 'text/plain' } });
    fireEvent.click(screen.getByLabelText('Enviar Cache-Control'));
    expect(saved().generated).toEqual({ Accept: { value: 'text/plain', enabled: true }, 'Cache-Control': { value: null, enabled: false } });

    fireEvent.change(screen.getByLabelText('Headers: clave nueva'), { target: { value: 'Host' } });
    expect(screen.getByText('La pone el cliente; no se puede escribir')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Esconder headers generados' }));
    expect(screen.queryByRole('table', { name: 'Headers generados' })).toBeNull();
    expect(saved().hideGenerated).toBe(true);
    expect(screen.getByRole('button', { name: 'Mostrar headers generados' })).toBeTruthy();
  });

  it('H-24 sin login no se muestran las cabeceras del login', async () => {
    await mount('{"login":"none"}');
    fireEvent.click(screen.getByRole('tab', { name: 'Headers' }));
    expect(screen.queryByLabelText('Valor de X-USERID')).toBeNull();
  });

  it('H-17 cuerpo: none, form-data y raw con su formato y «Formatear JSON»', async () => {
    await mount('{"body":{"mode":"raw","rawType":"json","raw":"{\\"a\\":1}"}}');
    fireEvent.click(screen.getByRole('tab', { name: /Body/ }));
    expect(screen.getByLabelText<HTMLSelectElement>('Formato del cuerpo').value).toBe('json');
    fireEvent.click(screen.getByRole('button', { name: 'Formatear JSON' }));
    expect(saved().body.raw).toBe('{\n  "a": 1\n}');

    fireEvent.change(screen.getByLabelText('Formato del cuerpo'), { target: { value: 'xml' } });
    expect(saved().body.rawType).toBe('xml');
    expect(screen.queryByRole('button', { name: 'Formatear JSON' })).toBeNull();

    fireEvent.click(screen.getByLabelText('form-data'));
    expect(saved().body.mode).toBe('form-data');
    fireEvent.change(screen.getByLabelText('form-data: clave nueva'), { target: { value: 'nombre' } });
    expect(saved().body.form).toEqual([{ key: 'nombre', value: '', enabled: true }]);

    fireEvent.click(screen.getByLabelText('none'));
    expect(screen.getByText('La llamada no lleva cuerpo.')).toBeTruthy();
  });

  it('H-17 «Formatear JSON» avisa si no es JSON válido', async () => {
    await mount('{"body":{"mode":"raw","rawType":"json","raw":"{roto"}}');
    fireEvent.click(screen.getByRole('tab', { name: /Body/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Formatear JSON' }));
    expect(screen.getByRole('alert').textContent).toBe('El cuerpo no es JSON válido.');
    expect(saved().body.raw).toBe('{roto');
  });

  it('H-30 H-33 H-34 «Enviar» guarda, ejecuta lo guardado y muestra la respuesta', async () => {
    mocked.httpExecute.mockResolvedValue(ok);
    await mount('{"endpoint":"/user/{id}/tasks","pathValues":{"id":"4"}}');
    fireEvent.change(screen.getByLabelText('Variable id'), { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    });
    expect(mocked.saveNote).toHaveBeenCalled();
    expect(mocked.httpExecute).toHaveBeenCalledWith('h1', 4, expect.any(String));
    expect(useTabs.getState().tabs[0].preview).toBe(false);

    expect(screen.getByText('200 OK')).toBeTruthy();
    expect(screen.getByText('34 ms')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();
    expect(screen.getByText('GET http://127.0.0.1:8080/demo/user/5/tasks')).toBeTruthy();
    expect(screen.getByText(/Login como «demo»: 200/)).toBeTruthy();
    const body = document.querySelector('.http-body')!;
    expect(body.textContent).toBe('{\n  "id": 5,\n  "title": "Tarea"\n}');
    expect(body.querySelector('.hljs-attr')).toBeTruthy();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    });
    expect(writeText).toHaveBeenLastCalledWith('{\n  "id": 5,\n  "title": "Tarea"\n}');

    fireEvent.click(screen.getByRole('tab', { name: 'Cabeceras (1)' }));
    expect(screen.getByRole('rowheader', { name: 'Content-Type' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Cookies (1)' }));
    expect(screen.getByText('HttpOnly')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    });
    expect(writeText).toHaveBeenLastCalledWith('pref=1');
    fireEvent.click(screen.getByRole('tab', { name: 'Petición' }));
    expect(screen.getByText('usr-1')).toBeTruthy();
  });

  it('H-26 H-32 un error del login se indica como del login', async () => {
    mocked.httpExecute.mockResolvedValue({
      phase: 'login',
      error: { code: 'connection_refused', message: 'Login: Error: connect ECONNREFUSED 127.0.0.1:8080' },
    });
    await mount('{"endpoint":"/x"}');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Error en el login: Login: Error: connect ECONNREFUSED 127.0.0.1:8080');
  });

  it('H-35 un cuerpo binario se descarga; uno cortado avisa', async () => {
    mocked.httpExecute.mockResolvedValue({
      phase: 'request',
      response: { ...ok.response!, binary: true, text: undefined, base64: btoa('PNG'), size: 3, contentType: 'image/png', truncated: true },
    });
    await mount('{"endpoint":"/logo","login":"none"}');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    });
    expect(screen.getByText(/Binario, 3 bytes/)).toBeTruthy();
    expect(screen.getByText(/supera el tamaño máximo/)).toBeTruthy();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(name).toBe('respuesta.png');
  });

  it('H-30 «Cancelar» y Esc detienen la llamada en curso', async () => {
    let finish: (r: HttpResult) => void = () => {};
    mocked.httpExecute.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await mount('{"endpoint":"/lenta","login":"none"}');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    });
    expect(screen.getByRole('timer')).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(mocked.httpCancel).toHaveBeenCalled();
    await act(async () => {
      finish({ phase: 'request', error: { code: 'cancelled', message: 'Llamada cancelada' } });
    });
    expect(screen.getByRole('alert').textContent).toBe('Llamada cancelada');
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('H-36 cerrar la pestaña olvida la respuesta', async () => {
    mocked.httpExecute.mockResolvedValue(ok);
    await mount('{"endpoint":"/x","login":"none"}');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    });
    const id = useTabs.getState().tabs[0].id;
    expect(useHttpRuns.getState().runs[id]?.result).toBeTruthy();
    await act(async () => {
      await useTabs.getState().close(id);
    });
    expect(useHttpRuns.getState().runs[id]).toBeUndefined();
  });
});
