import { act, fireEvent, render, screen } from '@testing-library/react';
import { api, DEFAULT_CONFIG } from '../api';
import { SettingsDialog } from './SettingsDialog';
import { DialogHost } from './DialogHost';
import { useConnection } from '../stores/connectionStore';
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
    },
  };
});

const mocked = vi.mocked(api);

function zip(name = 'litedd-export-20261004-1000.zip') {
  return new File([new Uint8Array([0x50, 0x4b])], name, { type: 'application/zip' });
}

function chooseFile(file: File) {
  const input = screen.getByLabelText<HTMLInputElement>('Fichero ZIP para importar');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocked.putSettings.mockResolvedValue({});
  mocked.tree.mockResolvedValue([]);
  mocked.httpCredentials.mockResolvedValue({ hasPassword: false });
  mocked.setHttpPassword.mockResolvedValue({ hasPassword: true });
  useUi.setState({ config: DEFAULT_CONFIG, settingsOpen: true, notices: [] });
  useTabs.setState({ tabs: [], activeId: null });
  useDialogs.setState({ current: null });
  useConnection.setState({ dialogOpen: false });
});

describe('U-10 ajustes', () => {
  it('U-10 muestra tamaño de página, tope, tiempo, puerto y apagado automático con sus valores', () => {
    render(<SettingsDialog />);
    expect(screen.getByLabelText<HTMLSelectElement>('Tamaño de página por defecto').value).toBe('20');
    expect(screen.getByLabelText<HTMLInputElement>('Tope de filas').value).toBe('10000');
    expect(screen.getByLabelText<HTMLInputElement>('Tiempo máximo de consulta (s)').value).toBe('30');
    expect(screen.getByLabelText<HTMLInputElement>('Puerto').value).toBe('47600');
    expect(screen.getByLabelText<HTMLInputElement>('Apagado automático sin ventanas (min)').value).toBe('');
  });

  it('U-10 guarda la configuración y la aplica a las pestañas nuevas', async () => {
    render(<SettingsDialog />);
    fireEvent.change(screen.getByLabelText('Tamaño de página por defecto'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Tope de filas'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Apagado automático sin ventanas (min)'), { target: { value: '30' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    });
    const expected = { defaultPageSize: 50, rowCap: 5000, queryTimeoutSeconds: 30, port: 47600, autoShutdownMinutes: 30, autosave: true, http: DEFAULT_CONFIG.http };
    expect(mocked.putSettings).toHaveBeenCalledWith({ config: expected });
    expect(useUi.getState().config).toEqual(expected);
    expect(useUi.getState().settingsOpen).toBe(false);
    expect(defaultSqlState().pageSize).toBe(50);
  });

  it('U-10 «Sin límite» guarda null y el puerto avisa de que requiere reiniciar', async () => {
    render(<SettingsDialog />);
    fireEvent.change(screen.getByLabelText('Tamaño de página por defecto'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Puerto'), { target: { value: '47700' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    });
    expect(useUi.getState().config.defaultPageSize).toBeNull();
    expect(useUi.getState().notices.at(-1)?.text).toContain('al reiniciar');
  });

  it('N-46 la casilla «Guardado automático» permite pasar al guardado manual', async () => {
    render(<SettingsDialog />);
    const box = screen.getByLabelText<HTMLInputElement>('Guardado automático');
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    });
    expect(mocked.putSettings).toHaveBeenCalledWith({ config: expect.objectContaining({ autosave: false }) });
    expect(useUi.getState().config.autosave).toBe(false);
  });

  it('U-10 da acceso a «Conexión»', () => {
    render(<SettingsDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Conexión a MySQL…' }));
    expect(useConnection.getState().dialogOpen).toBe(true);
    expect(useUi.getState().settingsOpen).toBe(false);
  });

  it('U-10 muestra el error de validación del servidor', async () => {
    mocked.putSettings.mockRejectedValue(new Error('El tope de filas debe estar entre 100 y 100000'));
    render(<SettingsDialog />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('tope de filas');
    expect(useUi.getState().settingsOpen).toBe(true);
  });
});

describe('U-10 sección HTTP', () => {
  it('H-10 H-15 H-20 H-22 H-31 H-35 guarda URL base, nota de login, usuario, cabeceras y límites', async () => {
    useTree.setState({
      nodes: [
        { id: 'l1', parentId: null, position: 0, type: 'http', title: 'Login', description: '', favorite: false, tags: [] },
        { id: 'm1', parentId: null, position: 1, type: 'md', title: 'Texto', description: '', favorite: false, tags: [] },
      ],
    });
    render(<SettingsDialog />);
    await act(async () => {});
    const login = screen.getByLabelText<HTMLSelectElement>('Nota de login');
    expect([...login.options].map((o) => o.textContent)).toEqual(['Sin elegir', 'Login']);
    fireEvent.change(screen.getByLabelText('URL base'), { target: { value: ' http://127.0.0.1:8080/demo/ ' } });
    fireEvent.change(login, { target: { value: 'l1' } });
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'demo' } });
    fireEvent.change(screen.getByLabelText('Tiempo máximo de llamada (s)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Tamaño máximo de respuesta (MB)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('User-Agent'), { target: { value: ' MiCliente/2.0 ' } });
    expect(screen.getByLabelText<HTMLInputElement>('Accept').placeholder).toBe('application/json');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    });
    const http = {
      baseUrl: 'http://127.0.0.1:8080/demo/',
      loginNoteId: 'l1',
      user: 'demo',
      timeoutSeconds: 45,
      maxResponseMb: 20,
      accept: null,
      userAgent: 'MiCliente/2.0',
      cacheControl: null,
    };
    expect(mocked.putSettings).toHaveBeenCalledWith({ config: expect.objectContaining({ http }) });
    expect(useUi.getState().config.http).toEqual(http);
    expect(mocked.setHttpPassword).not.toHaveBeenCalled();
  });

  it('H-21 la contraseña solo se escribe: no se lee, se guarda aparte y se puede borrar', async () => {
    mocked.httpCredentials.mockResolvedValue({ hasPassword: true });
    mocked.setHttpPassword.mockResolvedValue({ hasPassword: false });
    render(<SettingsDialog />);
    await act(async () => {});
    const password = screen.getByLabelText<HTMLInputElement>('Contraseña');
    expect(password.type).toBe('password');
    expect(password.value).toBe('');
    expect(password.placeholder).toContain('Guardada');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    });
    expect(mocked.setHttpPassword).toHaveBeenCalledWith('');
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'nueva' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    });
    expect(mocked.setHttpPassword).toHaveBeenLastCalledWith('nueva');
    // La contraseña nunca viaja en config.json.
    expect(JSON.stringify(mocked.putSettings.mock.calls)).not.toContain('nueva');
  });
});

describe('X-10 menú «Datos»', () => {
  it('X-10 tiene exportar, importar, crear copia ahora y abrir la carpeta de datos', () => {
    render(<SettingsDialog />);
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
    render(<SettingsDialog />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    });
    expect(downloaded).toBe('litedd-export-20261004-1000.zip');
    expect(screen.getByRole('status').textContent).toContain('litedd-export-20261004-1000.zip');
  });

  it('X-10 crear copia ahora y abrir la carpeta informan del resultado', async () => {
    mocked.backupNow.mockResolvedValue({ file: 'litedd-20261004.db' });
    mocked.openDataFolder.mockResolvedValue({ opened: false, path: '/datos' });
    render(<SettingsDialog />);
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
    render(<SettingsDialog />);
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
