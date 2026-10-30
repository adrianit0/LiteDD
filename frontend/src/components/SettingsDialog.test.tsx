import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { api, ApiError, DEFAULT_CONFIG, type AppConfig, type ConnectionStatus } from '../api';
import { SettingsDialog } from './SettingsDialog';
import { DialogHost } from './DialogHost';
import { statusLabel, useConnection } from '../stores/connectionStore';
import { useDialogs } from '../stores/dialogStore';
import { defaultSqlState, useTabs } from '../stores/tabsStore';
import { useTree } from '../stores/treeStore';
import { useUi } from '../stores/uiStore';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      putSettings: vi.fn(),
      exportData: vi.fn(),
      importData: vi.fn(),
      backupNow: vi.fn(),
      openDataFolder: vi.fn(),
      tree: vi.fn(),
      httpCredentials: vi.fn(),
      setHttpPassword: vi.fn(),
      setConfirmKey: vi.fn(),
      httpCa: vi.fn(),
      importHttpCa: vi.fn(),
      httpProfile: vi.fn(),
      getConnection: vi.fn(),
      testConnection: vi.fn(),
      saveConnection: vi.fn(),
      reconnect: vi.fn(),
      connectionStatus: vi.fn(),
    },
  };
});

const PRE1 = { id: 'pre1', name: 'PRE1', baseUrl: 'https://pre1.litedd-demo.test/demo/', user: 'pre-ana', requireKey: true, requireCa: true };
const PRE2 = { id: 'pre2', name: 'PRE2', baseUrl: 'https://pre2.litedd-demo.test/demo/', user: 'pre-ana', requireKey: true, requireCa: true };

/** Ajustes con la casilla de preproducción marcada y un entorno PRE1. */
const withPre: AppConfig = {
  ...DEFAULT_CONFIG,
  http: { ...DEFAULT_CONFIG.http, preproduction: true, profiles: [...DEFAULT_CONFIG.http.profiles, PRE1] },
};

const savedConfig = () => (mocked.putSettings.mock.calls.at(-1)![0] as { config: AppConfig }).config;

const mocked = vi.mocked(api);

const status = (state: ConnectionStatus['state']): ConnectionStatus => ({
  state,
  user: 'lector',
  host: '127.0.0.1',
  port: 3306,
  schema: 'litedd_demo',
  message: null,
});

function zip(name = 'litedd-export-20261004-1000.zip') {
  return new File([new Uint8Array([0x50, 0x4b])], name, { type: 'application/zip' });
}

function chooseFile(file: File) {
  const input = screen.getByLabelText<HTMLInputElement>('Fichero ZIP para importar');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

/** U-13: elige una categoría de la lista de la izquierda. */
function goTo(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

async function renderAt(name?: string) {
  render(<SettingsDialog />);
  await act(async () => {});
  if (name) goTo(name);
}

async function saveSettings() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocked.putSettings.mockResolvedValue({});
  mocked.tree.mockResolvedValue([]);
  mocked.httpCredentials.mockResolvedValue({ passwords: { local: false }, hasConfirmKey: false });
  mocked.setHttpPassword.mockResolvedValue({ passwords: { local: true }, hasConfirmKey: false });
  mocked.setConfirmKey.mockResolvedValue({ hasConfirmKey: true });
  mocked.httpCa.mockResolvedValue({ certificates: [] });
  mocked.httpProfile.mockResolvedValue({ active: 'local' });
  mocked.getConnection.mockResolvedValue({
    configured: true,
    host: '127.0.0.1',
    port: 3306,
    user: 'lector',
    schema: 'litedd_demo',
    extraParams: '',
    hasPassword: true,
  });
  mocked.connectionStatus.mockResolvedValue(status('connected'));
  useUi.setState({ config: DEFAULT_CONFIG, settingsOpen: true, settingsCategory: 'general', notices: [] });
  useTabs.setState({ tabs: [], activeId: null });
  useDialogs.setState({ current: null });
  useConnection.setState({ status: null, busy: false });
});

describe('U-13 ventana por categorías', () => {
  it('U-10 U-13 las categorías van en su orden y las flechas las recorren', async () => {
    await renderAt();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['General', 'Conexión', 'SQL', 'HTTP', 'Entornos', 'Datos', 'Actualizaciones']);
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'General' })).toBeTruthy();

    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Conexión' }), { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: 'SQL' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'SQL' }));
    expect(screen.getByLabelText('Tope de filas')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'SQL' }), { key: 'ArrowUp' });
    expect(screen.getByRole('tab', { name: 'Conexión' }).getAttribute('aria-selected')).toBe('true');
  });

  it('U-13 se abre en la categoría pedida', async () => {
    useUi.setState({ settingsCategory: 'environments' });
    await renderAt();
    expect(screen.getByRole('tab', { name: 'Entornos' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Permitir entornos de preproducción')).toBeTruthy();
  });

  it('U-13 la «×», «Cerrar» y Esc cierran sin guardar', async () => {
    const { unmount } = render(<SettingsDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la ventana' }));
    expect(useUi.getState().settingsOpen).toBe(false);
    unmount();

    useUi.setState({ settingsOpen: true });
    const second = render(<SettingsDialog />);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Ajustes' }), { key: 'Escape' });
    expect(useUi.getState().settingsOpen).toBe(false);
    second.unmount();

    useUi.setState({ settingsOpen: true });
    render(<SettingsDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(useUi.getState().settingsOpen).toBe(false);
    expect(mocked.putSettings).not.toHaveBeenCalled();
  });

  it('U-13 «Guardar ajustes» y «Cerrar» van juntos en el pie y guardan lo cambiado en cualquier categoría', async () => {
    await renderAt('SQL');
    fireEvent.change(screen.getByLabelText('Tope de filas'), { target: { value: '5000' } });
    goTo('HTTP');
    fireEvent.change(screen.getByLabelText('Tiempo máximo de llamada (s)'), { target: { value: '45' } });
    goTo('Datos');
    const save = screen.getByRole('button', { name: 'Guardar ajustes' });
    expect(save.parentElement).toBe(screen.getByRole('button', { name: 'Cerrar' }).parentElement);
    goTo('SQL');
    expect(screen.getByLabelText<HTMLInputElement>('Tope de filas').value).toBe('5000');
    await saveSettings();
    expect(savedConfig()).toMatchObject({ rowCap: 5000, http: { timeoutSeconds: 45 } });
    expect(useUi.getState().settingsOpen).toBe(false);
  });
});

describe('U-10 «General» y «SQL»', () => {
  it('U-10 muestra tamaño de página, tope, tiempo, puerto y apagado automático con sus valores', async () => {
    await renderAt();
    expect(screen.getByLabelText<HTMLInputElement>('Puerto').value).toBe('47600');
    expect(screen.getByLabelText<HTMLInputElement>('Apagado automático sin ventanas (min)').value).toBe('');
    goTo('SQL');
    expect(screen.getByLabelText<HTMLSelectElement>('Tamaño de página por defecto').value).toBe('20');
    expect(screen.getByLabelText<HTMLInputElement>('Tope de filas').value).toBe('10000');
    expect(screen.getByLabelText<HTMLInputElement>('Tiempo máximo de consulta (s)').value).toBe('30');
  });

  it('U-10 guarda la configuración y la aplica a las pestañas nuevas', async () => {
    await renderAt('SQL');
    fireEvent.change(screen.getByLabelText('Tamaño de página por defecto'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Tope de filas'), { target: { value: '5000' } });
    goTo('General');
    fireEvent.change(screen.getByLabelText('Apagado automático sin ventanas (min)'), { target: { value: '30' } });
    await saveSettings();
    const expected = { ...DEFAULT_CONFIG, defaultPageSize: 50, rowCap: 5000, autoShutdownMinutes: 30 };
    expect(mocked.putSettings).toHaveBeenCalledWith({ config: expected });
    expect(useUi.getState().config).toEqual(expected);
    expect(useUi.getState().settingsOpen).toBe(false);
    expect(defaultSqlState().pageSize).toBe(50);
  });

  it('U-10 «Sin límite» guarda null y el puerto avisa de que requiere reiniciar', async () => {
    await renderAt('SQL');
    fireEvent.change(screen.getByLabelText('Tamaño de página por defecto'), { target: { value: 'all' } });
    goTo('General');
    fireEvent.change(screen.getByLabelText('Puerto'), { target: { value: '47700' } });
    await saveSettings();
    expect(useUi.getState().config.defaultPageSize).toBeNull();
    expect(useUi.getState().notices.at(-1)?.text).toContain('al reiniciar');
  });

  it('N-46 la casilla «Guardado automático» permite pasar al guardado manual', async () => {
    await renderAt();
    const box = screen.getByLabelText<HTMLInputElement>('Guardado automático');
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await saveSettings();
    expect(mocked.putSettings).toHaveBeenCalledWith({ config: expect.objectContaining({ autosave: false }) });
    expect(useUi.getState().config.autosave).toBe(false);
  });

  it('U-10 muestra el error de validación del servidor', async () => {
    mocked.putSettings.mockRejectedValue(new Error('El tope de filas debe estar entre 100 y 100000'));
    await renderAt();
    await saveSettings();
    expect(screen.getByRole('alert').textContent).toContain('tope de filas');
    expect(useUi.getState().settingsOpen).toBe(true);
  });
});

describe('C-01 a C-11 «Conexión»', () => {
  it('C-01 tiene método fijo, host, puerto, usuario, contraseña, esquema y parámetros', async () => {
    await renderAt('Conexión');
    expect(screen.getByLabelText<HTMLInputElement>('Usuario').value).toBe('lector');
    expect(screen.getByText('TCP/IP estándar')).toBeTruthy();
    for (const label of ['Host', 'Puerto', 'Usuario', 'Contraseña', 'Esquema por defecto', 'Parámetros JDBC adicionales']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    // S-21, ADR-0012: la contraseña no llega; el campo indica que hay una guardada.
    const password = screen.getByLabelText<HTMLInputElement>('Contraseña');
    expect(password.value).toBe('');
    expect(password.placeholder).toContain('Guardada');
  });

  it('C-09 C-10 muestra el estado y «Reconectar» recrea el pool', async () => {
    mocked.connectionStatus.mockResolvedValue(status('disconnected'));
    mocked.reconnect.mockResolvedValue(status('connected'));
    await renderAt('Conexión');
    expect(screen.getByText('Desconectado · lector@127.0.0.1/litedd_demo')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconectar' }));
    });
    expect(mocked.reconnect).toHaveBeenCalled();
    expect(screen.getByText('lector@127.0.0.1/litedd_demo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reconectar' })).toBeNull();
  });

  it('C-02 C-09 C-10 textos de cada estado', () => {
    expect(statusLabel(null)).toBe('Sin conexión configurada');
    expect(statusLabel(status('connected'))).toBe('lector@127.0.0.1/litedd_demo');
    expect(statusLabel(status('disconnected'))).toBe('Desconectado · lector@127.0.0.1/litedd_demo');
    expect(statusLabel(status('schema_unavailable'))).toBe('Esquema no disponible · lector@127.0.0.1/litedd_demo');
  });

  it('C-03 C-04 con un único esquema se selecciona solo', async () => {
    mocked.getConnection.mockResolvedValue({ configured: false, host: '127.0.0.1', port: 3306, user: '', schema: '', extraParams: '', hasPassword: false });
    mocked.testConnection.mockResolvedValue({ schemas: ['litedd_demo'] });
    await renderAt('Conexión');
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'lector' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    });
    expect(mocked.testConnection).toHaveBeenCalledWith({ host: '127.0.0.1', port: 3306, user: 'lector', password: '', extraParams: '' });
    expect(screen.getByLabelText<HTMLSelectElement>('Esquema por defecto').value).toBe('litedd_demo');
    expect(screen.getByRole('status').textContent).toBe('Conexión correcta: 1 esquema.');
  });

  it('C-04 C-11 con varios esquemas hay que elegir uno, y «Guardar ajustes» guarda la conexión cambiada', async () => {
    mocked.getConnection.mockResolvedValue({ configured: false, host: '127.0.0.1', port: 3306, user: 'lector', schema: '', extraParams: '', hasPassword: true });
    mocked.testConnection.mockResolvedValue({ schemas: ['litedd_demo', 'otro'] });
    mocked.saveConnection.mockResolvedValue(status('connected'));
    await renderAt('Conexión');
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'localhost' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    });
    expect(screen.getByLabelText<HTMLSelectElement>('Esquema por defecto').value).toBe('');
    goTo('General');
    await saveSettings();
    // Sin esquema no se guarda nada y la ventana vuelve a «Conexión».
    expect(screen.getByRole('alert').textContent).toContain('esquema');
    expect(screen.getByRole('tab', { name: 'Conexión' }).getAttribute('aria-selected')).toBe('true');
    expect(mocked.putSettings).not.toHaveBeenCalled();
    expect(mocked.saveConnection).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Esquema por defecto'), { target: { value: 'otro' } });
    await saveSettings();
    expect(mocked.putSettings).toHaveBeenCalled();
    expect(mocked.saveConnection).toHaveBeenCalledWith({ host: 'localhost', port: 3306, user: 'lector', password: '', schema: 'otro', extraParams: '' });
    expect(useConnection.getState().status?.state).toBe('connected');
    expect(useUi.getState().settingsOpen).toBe(false);
  });

  it('C-11 sin cambios en la conexión, «Guardar ajustes» no la guarda ni recrea el pool', async () => {
    await renderAt('Conexión');
    await saveSettings();
    expect(mocked.putSettings).toHaveBeenCalled();
    expect(mocked.saveConnection).not.toHaveBeenCalled();
  });

  it('C-03 un fallo al probar se muestra sin cerrar la ventana', async () => {
    mocked.testConnection.mockRejectedValue(new ApiError(422, 'connection_failed', 'No se pudo conectar: Connection refused', null));
    await renderAt('Conexión');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('Connection refused');
    expect(useUi.getState().settingsOpen).toBe(true);
  });
});

describe('U-10 «HTTP» y «Entornos»', () => {
  it('H-10 H-15 H-20 H-22 H-31 H-35 H-61 guarda URL base y usuario de Local, nota de login, cabeceras y límites', async () => {
    useTree.setState({
      nodes: [
        { id: 'l1', parentId: null, position: 0, type: 'http', title: 'Login', description: '', favorite: false, tags: [] },
        { id: 'm1', parentId: null, position: 1, type: 'md', title: 'Texto', description: '', favorite: false, tags: [] },
      ],
    });
    await renderAt('HTTP');
    const login = screen.getByLabelText<HTMLSelectElement>('Nota de login');
    expect([...login.options].map((o) => o.textContent)).toEqual(['Sin elegir', 'Login']);
    fireEvent.change(login, { target: { value: 'l1' } });
    fireEvent.change(screen.getByLabelText('Tiempo máximo de llamada (s)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Tamaño máximo de respuesta (MB)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('User-Agent'), { target: { value: ' MiCliente/2.0 ' } });
    expect(screen.getByLabelText<HTMLInputElement>('Accept').placeholder).toBe('application/json');
    goTo('Entornos');
    fireEvent.change(screen.getByLabelText('URL base'), { target: { value: ' http://127.0.0.1:8080/demo/ ' } });
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'demo' } });
    await saveSettings();
    const http = {
      preproduction: false,
      profiles: [{ id: 'local', name: 'Local', baseUrl: 'http://127.0.0.1:8080/demo/', user: 'demo', requireKey: false, requireCa: false }],
      loginNoteId: 'l1',
      timeoutSeconds: 45,
      maxResponseMb: 20,
      accept: null,
      userAgent: 'MiCliente/2.0',
      cacheControl: null,
    };
    expect(mocked.putSettings).toHaveBeenCalledWith({ config: expect.objectContaining({ http }) });
    expect(useUi.getState().config.http).toEqual(http);
    expect(mocked.setHttpPassword).not.toHaveBeenCalled();
    expect(mocked.setConfirmKey).not.toHaveBeenCalled();
  });

  it('H-21 la contraseña solo se escribe: no se lee, se guarda aparte y se puede borrar', async () => {
    mocked.httpCredentials.mockResolvedValue({ passwords: { local: true }, hasConfirmKey: false });
    mocked.setHttpPassword.mockResolvedValue({ passwords: { local: false }, hasConfirmKey: false });
    await renderAt('Entornos');
    const password = screen.getByLabelText<HTMLInputElement>('Contraseña');
    expect(password.type).toBe('password');
    expect(password.value).toBe('');
    expect(password.placeholder).toContain('Guardada');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    });
    expect(mocked.setHttpPassword).toHaveBeenCalledWith('local', '');
    expect(screen.getByLabelText<HTMLInputElement>('Contraseña').placeholder).toBe('');
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'nueva' } });
    await saveSettings();
    expect(mocked.setHttpPassword).toHaveBeenLastCalledWith('local', 'nueva');
    // La contraseña nunca viaja en config.json.
    expect(JSON.stringify(mocked.putSettings.mock.calls)).not.toContain('nueva');
  });

  it('H-60 H-62 H-71 sin la casilla solo está Local; con ella se añaden entornos que nacen pidiendo la clave y la CA', async () => {
    await renderAt('Entornos');
    const localGroup = screen.getByRole('group', { name: 'Local' });
    expect(screen.queryByRole('button', { name: 'Añadir entorno' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'CA corporativa' })).toBeNull();
    // H-71: Local no tiene la casilla de la CA.
    expect(within(localGroup).queryByLabelText('Pedir CA corporativa')).toBeNull();

    fireEvent.click(screen.getByLabelText('Permitir entornos de preproducción'));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Añadir entorno' }));
    const added = screen.getByRole('group', { name: 'Entorno sin nombre' });
    // Propuesta C de ADR-0028 y H-71.
    expect(within(added).getByLabelText<HTMLInputElement>('Pedir clave al enviar').checked).toBe(true);
    expect(within(added).getByLabelText<HTMLInputElement>('Pedir CA corporativa').checked).toBe(true);
    expect(within(localGroup).getByLabelText<HTMLInputElement>('Pedir clave al enviar').checked).toBe(false);
    fireEvent.change(within(added).getByLabelText('Nombre'), { target: { value: 'PRE1' } });
    const named = screen.getByRole('group', { name: 'PRE1' });
    fireEvent.change(within(named).getByLabelText('URL base'), { target: { value: ' https://pre1.litedd-demo.test/demo/ ' } });
    fireEvent.change(within(named).getByLabelText('Usuario'), { target: { value: 'pre-ana' } });
    fireEvent.change(within(named).getByLabelText('Contraseña'), { target: { value: 'clave-pre' } });
    await saveSettings();

    const http = savedConfig().http;
    expect(http.preproduction).toBe(true);
    expect(http.profiles).toHaveLength(2);
    const [, pre] = http.profiles;
    expect(pre).toEqual({
      id: expect.any(String),
      name: 'PRE1',
      baseUrl: 'https://pre1.litedd-demo.test/demo/',
      user: 'pre-ana',
      requireKey: true,
      requireCa: true,
    });
    // H-21: la contraseña va aparte, después de guardar el perfil.
    expect(mocked.setHttpPassword).toHaveBeenCalledWith(pre.id, 'clave-pre');
    expect(JSON.stringify(mocked.putSettings.mock.calls)).not.toContain('clave-pre');
    // H-62: el servidor puede haber vuelto a Local.
    expect(mocked.httpProfile).toHaveBeenCalled();
  });

  it('H-71 «Pedir CA corporativa» se puede desmarcar en un entorno', async () => {
    useUi.setState({ config: withPre });
    await renderAt('Entornos');
    const box = within(screen.getByRole('group', { name: 'PRE1' })).getByLabelText<HTMLInputElement>('Pedir CA corporativa');
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await saveSettings();
    expect(savedConfig().http.profiles.map((p) => [p.id, p.requireCa])).toEqual([
      ['local', false],
      ['pre1', false],
    ]);
  });

  it('H-70 los entornos se suben y bajan; Local se queda el primero', async () => {
    useUi.setState({ config: { ...withPre, http: { ...withPre.http, profiles: [...withPre.http.profiles, PRE2] } } });
    await renderAt('Entornos');
    // El orden en pantalla, por la leyenda de cada perfil.
    const names = () => screen.getAllByRole('group').flatMap((g) => g.querySelector(':scope > legend')?.textContent ?? []);
    expect(within(screen.getByRole('group', { name: 'Local' })).queryByRole('button', { name: 'Subir' })).toBeNull();
    const pre1 = within(screen.getByRole('group', { name: 'PRE1' }));
    const pre2 = within(screen.getByRole('group', { name: 'PRE2' }));
    expect(pre1.getByRole<HTMLButtonElement>('button', { name: 'Subir' }).disabled).toBe(true);
    expect(pre2.getByRole<HTMLButtonElement>('button', { name: 'Bajar' }).disabled).toBe(true);

    fireEvent.click(pre2.getByRole('button', { name: 'Subir' }));
    expect(names()).toEqual(['Local', 'PRE2', 'PRE1']);
    expect(within(screen.getByRole('group', { name: 'PRE2' })).getByRole<HTMLButtonElement>('button', { name: 'Subir' }).disabled).toBe(true);
    await saveSettings();
    expect(savedConfig().http.profiles.map((p) => p.id)).toEqual(['local', 'pre2', 'pre1']);
  });

  it('H-62 desmarcar la casilla oculta los entornos pero los conserva', async () => {
    useUi.setState({ config: withPre });
    await renderAt('Entornos');
    expect(screen.getByRole('group', { name: 'PRE1' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Permitir entornos de preproducción'));
    expect(screen.queryByRole('group', { name: 'PRE1' })).toBeNull();
    await saveSettings();
    expect(savedConfig().http.preproduction).toBe(false);
    expect(savedConfig().http.profiles.map((p) => p.id)).toEqual(['local', 'pre1']);
  });

  it('H-62 «Eliminar entorno» lo quita de los ajustes; el servidor borra su contraseña al guardar', async () => {
    useUi.setState({ config: withPre });
    await renderAt('Entornos');
    fireEvent.click(within(screen.getByRole('group', { name: 'PRE1' })).getByRole('button', { name: 'Eliminar entorno' }));
    expect(screen.queryByRole('group', { name: 'PRE1' })).toBeNull();
    await saveSettings();
    expect(savedConfig().http.profiles.map((p) => p.id)).toEqual(['local']);
  });

  it('H-69 la clave de confirmación solo se escribe, se guarda aparte y se puede borrar', async () => {
    mocked.httpCredentials.mockResolvedValue({ passwords: { local: false }, hasConfirmKey: true });
    mocked.setConfirmKey.mockResolvedValue({ hasConfirmKey: false });
    await renderAt('Entornos');
    const key = screen.getByLabelText<HTMLInputElement>('Clave de confirmación');
    expect(key.type).toBe('password');
    expect(key.value).toBe('');
    expect(key.placeholder).toContain('Guardada');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    });
    expect(mocked.setConfirmKey).toHaveBeenCalledWith('');
    expect(screen.getByLabelText<HTMLInputElement>('Clave de confirmación').placeholder).toBe('');
    fireEvent.change(screen.getByLabelText('Clave de confirmación'), { target: { value: 'confirmo-el-envio' } });
    await saveSettings();
    expect(mocked.setConfirmKey).toHaveBeenLastCalledWith('confirmo-el-envio');
    expect(JSON.stringify(mocked.putSettings.mock.calls)).not.toContain('confirmo-el-envio');
  });

  it('H-66 importa la CA corporativa desde un PEM y muestra su sujeto y su caducidad', async () => {
    useUi.setState({ config: withPre });
    mocked.importHttpCa.mockResolvedValue({ certificates: [{ subject: 'CN=LiteDD Demo CA,O=litedd_demo', notAfter: '2027-10-21T10:00:00Z' }] });
    await renderAt('Entornos');
    await act(async () => {});
    const ca = screen.getByRole('group', { name: 'CA corporativa' });
    expect(ca.textContent).toContain('Sin importar');
    const pem = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n';
    const input = screen.getByLabelText<HTMLInputElement>('Fichero PEM de la CA corporativa');
    Object.defineProperty(input, 'files', { value: [new File([pem], 'ca.pem', { type: 'application/x-pem-file' })], configurable: true });
    await act(async () => {
      fireEvent.change(input);
    });
    expect(mocked.importHttpCa).toHaveBeenCalledWith(pem);
    expect(ca.textContent).toContain('CN=LiteDD Demo CA,O=litedd_demo');
    expect(ca.textContent).toMatch(/caduca el 21\/10\/2027/);
    expect(screen.getByRole('status').textContent).toContain('ca.pem');
  });
});

describe('X-10 «Datos»', () => {
  it('X-10 tiene exportar, importar, crear copia ahora y abrir la carpeta de datos', async () => {
    await renderAt('Datos');
    for (const name of ['Exportar', 'Crear copia ahora', 'Abrir carpeta de datos', 'Elegir fichero ZIP…']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByLabelText('Añadir como rama')).toBeTruthy();
    expect(screen.getByLabelText('Reemplazar todo')).toBeTruthy();
  });

  it('X-01 exportar descarga el ZIP con el nombre del servidor', async () => {
    mocked.exportData.mockResolvedValue({ blob: zip(), fileName: 'litedd-export-20261004-1000.zip' });
    URL.createObjectURL = vi.fn(() => 'blob:prueba');
    URL.revokeObjectURL = vi.fn();
    let downloaded = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    await renderAt('Datos');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    });
    expect(downloaded).toBe('litedd-export-20261004-1000.zip');
    expect(screen.getByRole('status').textContent).toContain('litedd-export-20261004-1000.zip');
  });

  it('X-10 crear copia ahora y abrir la carpeta informan del resultado', async () => {
    mocked.backupNow.mockResolvedValue({ file: 'litedd-20261004.db' });
    mocked.openDataFolder.mockResolvedValue({ opened: false, path: '/datos' });
    await renderAt('Datos');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear copia ahora' }));
    });
    expect(screen.getByRole('status').textContent).toContain('litedd-20261004.db');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir carpeta de datos' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('/datos');
  });

  it('X-05 «Añadir como rama» importa sin confirmación y recarga el árbol', async () => {
    mocked.importData.mockResolvedValue({ notes: 3, attachments: 1, rootId: 'raiz' });
    await renderAt('Datos');
    await act(async () => {
      chooseFile(zip());
    });
    expect(useDialogs.getState().current).toBeNull();
    expect(mocked.importData).toHaveBeenCalledWith(expect.any(File), 'branch');
    expect(mocked.tree).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Importadas 3 notas y 1 adjunto');
  });

  it('X-05 «Reemplazar todo» pide confirmación explícita y no importa si se cancela', async () => {
    render(
      <>
        <SettingsDialog />
        <DialogHost />
      </>,
    );
    goTo('Datos');
    fireEvent.click(screen.getByLabelText('Reemplazar todo'));
    await act(async () => {
      chooseFile(zip());
    });
    expect(useDialogs.getState().current?.title).toBe('Reemplazar todo');
    expect(screen.getByText(/copia de\s+seguridad/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    });
    expect(mocked.importData).not.toHaveBeenCalled();
  });

  it('X-05 «Reemplazar todo» confirmado guarda lo pendiente, importa y recarga la ventana', async () => {
    mocked.importData.mockResolvedValue({ notes: 2, attachments: 0, rootId: null });
    const savePending = vi.fn().mockResolvedValue(undefined);
    useTabs.setState({ savePending });
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    render(
      <>
        <SettingsDialog />
        <DialogHost />
      </>,
    );
    goTo('Datos');
    fireEvent.click(screen.getByLabelText('Reemplazar todo'));
    await act(async () => {
      chooseFile(zip());
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Reemplazar todo' }).at(-1)!);
    });
    expect(savePending).toHaveBeenCalled();
    expect(mocked.importData).toHaveBeenCalledWith(expect.any(File), 'replace');
    expect(reload).toHaveBeenCalled();
  });
});
