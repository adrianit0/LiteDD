import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { api, ApiError, DEFAULT_CONFIG, type UpdateCheck, type UpdateStatus } from '../api';
import { DialogHost } from './DialogHost';
import { SettingsDialog } from './SettingsDialog';
import { useDialogs } from '../stores/dialogStore';
import { useSqlRuns } from '../stores/sqlRunStore';
import { useTabs, type Tab } from '../stores/tabsStore';
import { useUi } from '../stores/uiStore';
import { useWorkflowRuns } from '../stores/workflowRunStore';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      updateStatus: vi.fn(),
      checkUpdate: vi.fn(),
      applyUpdate: vi.fn(),
      putSettings: vi.fn(),
      httpCredentials: vi.fn(),
      getConnection: vi.fn(),
      httpProfile: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

const REPOSITORY = 'https://github.com/demo/app';
const AVAILABLE: UpdateStatus = { version: '0.1.0', build: 5, commit: '0123456789', available: true, reason: null };
const NEWER: UpdateCheck = {
  newer: true,
  latest: {
    build: 6,
    version: '0.1.0',
    commit: 'abcdef0123',
    date: '2026-11-02T10:15:00Z',
    size: 1024,
    sha256: 'a'.repeat(64),
    commits: ['Corrige el orden de las pestañas', 'Añade la columna de autor'],
  },
};

const search = () => screen.getByRole('button', { name: 'Buscar actualizaciones' }) as HTMLButtonElement;
const update = () => screen.getAllByRole('button', { name: 'Actualizar' })[0] as HTMLButtonElement;
const dirtyTab = { id: 't', noteId: 'n', note: { title: 'a', description: '', content: '' }, title: 'b', description: '', content: '', status: 'error' } as unknown as Tab;

async function open(repository: string | null = REPOSITORY) {
  useUi.setState({ config: { ...DEFAULT_CONFIG, updateRepository: repository }, settingsCategory: 'updates' });
  render(
    <>
      <SettingsDialog />
      <DialogHost />
    </>,
  );
  await act(async () => {});
}

async function findNewer() {
  await open();
  await act(async () => {
    fireEvent.click(search());
  });
}

async function confirm() {
  await act(async () => {
    fireEvent.click(update());
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.updateStatus.mockResolvedValue(AVAILABLE);
  mocked.checkUpdate.mockResolvedValue(NEWER);
  mocked.applyUpdate.mockResolvedValue({ restarting: true });
  mocked.putSettings.mockResolvedValue({});
  mocked.httpCredentials.mockResolvedValue({ passwords: {}, hasConfirmKey: false });
  mocked.httpProfile.mockResolvedValue({ active: 'local' });
  mocked.getConnection.mockResolvedValue({ configured: false, host: '127.0.0.1', port: 3306, user: '', schema: '', extraParams: '', hasPassword: false });
  useUi.setState({ settingsOpen: true, updating: false, notices: [] });
  // Antes que las pestañas: al cerrarse una, su ejecución se cancela.
  useSqlRuns.setState({ runs: {} });
  useWorkflowRuns.setState({ runs: {} });
  useTabs.setState({ tabs: [], activeId: null, savePending: vi.fn().mockResolvedValue(undefined) });
  useDialogs.setState({ current: null });
});

describe('R-10 categoría «Actualizaciones»', () => {
  it('R-10 muestra la versión, el build y el commit instalados y la URL guardada', async () => {
    await open();
    expect(screen.getByRole('tab', { name: 'Actualizaciones' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('0.1.0, build 5, commit 0123456')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('URL del repositorio').value).toBe(REPOSITORY);
  });

  it('R-06 un JAR compilado a mano se indica como tal', async () => {
    mocked.updateStatus.mockResolvedValue({ ...AVAILABLE, build: 0, commit: '' });
    await open();
    expect(screen.getByText('0.1.0, compilada a mano')).toBeTruthy();
  });

  it('R-14 si no está disponible dice el motivo y no ofrece los botones', async () => {
    mocked.updateStatus.mockResolvedValue({ ...AVAILABLE, available: false, reason: 'Las actualizaciones solo funcionan en Ubuntu.' });
    await open();
    expect(screen.getByText('Las actualizaciones solo funcionan en Ubuntu.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Buscar actualizaciones' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actualizar' })).toBeNull();
  });
});

describe('R-11 URL del repositorio', () => {
  it('R-11 sin URL guardada no se puede buscar', async () => {
    await open(null);
    expect(search().disabled).toBe(true);
    expect(update().disabled).toBe(true);
  });

  it('R-11 una URL escrita y sin guardar todavía no vale', async () => {
    await open(null);
    fireEvent.change(screen.getByLabelText('URL del repositorio'), { target: { value: REPOSITORY } });
    expect(search().disabled).toBe(true);
    expect(screen.getByText('Guarda los ajustes para usar esta URL.')).toBeTruthy();
  });

  it('R-11 «Guardar ajustes» guarda la URL', async () => {
    await open(null);
    fireEvent.change(screen.getByLabelText('URL del repositorio'), { target: { value: ` ${REPOSITORY} ` } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    });
    expect(mocked.putSettings).toHaveBeenCalledWith({ config: expect.objectContaining({ updateRepository: REPOSITORY }) });
  });

  it('R-11 vaciar el campo quita la URL', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('URL del repositorio'), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    });
    expect(mocked.putSettings).toHaveBeenCalledWith({ config: expect.objectContaining({ updateRepository: null }) });
  });

  it('R-12 abrir la categoría no busca nada', async () => {
    await open();
    expect(mocked.checkUpdate).not.toHaveBeenCalled();
  });
});

describe('R-13 búsqueda', () => {
  it('R-13 sin nada nuevo dice que tienes la última versión', async () => {
    mocked.checkUpdate.mockResolvedValue({ ...NEWER, newer: false });
    await findNewer();
    expect(screen.getByText('Tienes la última versión')).toBeTruthy();
    expect(update().disabled).toBe(true);
  });

  it('R-13 con una versión nueva muestra build, fecha, commit y commits, y activa «Actualizar»', async () => {
    await findNewer();
    const release = within(screen.getByRole('region', { name: 'Versión disponible' }));
    expect(release.getByText(/Build 6/).textContent).toContain('commit abcdef0');
    expect(release.getByText(/Build 6/).textContent).toMatch(/\d{2}\/11\/2026/);
    expect(release.getByText('Corrige el orden de las pestañas')).toBeTruthy();
    expect(release.getByText('Añade la columna de autor')).toBeTruthy();
    expect(update().disabled).toBe(false);
  });

  it('R-13 si falla dice el motivo', async () => {
    mocked.checkUpdate.mockRejectedValue(new ApiError(502, 'update_signature', 'La firma de la versión publicada no es válida', null));
    await findNewer();
    expect(screen.getByRole('alert').textContent).toContain('La firma de la versión publicada no es válida');
    expect(update().disabled).toBe(true);
  });
});

describe('R-40 instalación', () => {
  it('R-40 pide confirmación con el build, el commit y los commits, y avisa del reinicio', async () => {
    await findNewer();
    await confirm();
    const dialog = within(screen.getByRole('dialog', { name: 'Actualizar LiteDD' }));
    expect(dialog.getByText(/build 6/).textContent).toContain('abcdef0');
    expect(dialog.getByText(/se reiniciará/)).toBeTruthy();
    expect(dialog.getByText('Corrige el orden de las pestañas')).toBeTruthy();
    expect(mocked.applyUpdate).not.toHaveBeenCalled();
  });

  it('R-40 confirmar instala el build mostrado', async () => {
    await findNewer();
    await confirm();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Actualizar LiteDD' })).getByRole('button', { name: 'Actualizar' }));
    });
    expect(mocked.applyUpdate).toHaveBeenCalledWith(6);
    expect(useUi.getState().updating).toBe(true);
    expect(screen.getByText('Reiniciando LiteDD…')).toBeTruthy();
    expect(update().disabled).toBe(true);
  });

  it('R-40 cancelar no instala nada', async () => {
    await findNewer();
    await confirm();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Actualizar LiteDD' })).getByRole('button', { name: 'Cancelar' }));
    });
    expect(mocked.applyUpdate).not.toHaveBeenCalled();
  });

  it('R-41 antes de confirmar guarda lo pendiente', async () => {
    const savePending = vi.fn().mockResolvedValue(undefined);
    useTabs.setState({ savePending });
    await findNewer();
    await confirm();
    expect(savePending).toHaveBeenCalled();
  });

  it('R-41 con una pestaña sin guardar no actualiza y dice por qué', async () => {
    useTabs.setState({ tabs: [dirtyTab], activeId: 't' });
    await findNewer();
    await confirm();
    expect(screen.queryByRole('dialog', { name: 'Actualizar LiteDD' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('hay pestañas sin guardar');
    expect(mocked.applyUpdate).not.toHaveBeenCalled();
  });

  it('R-41 con una consulta o un workflow en marcha no actualiza', async () => {
    useSqlRuns.setState({ runs: { t: { running: { executionId: 'e', startedAt: 0 } } as never } });
    useWorkflowRuns.setState({ runs: { t: { running: { executionId: 'f', startedAt: 0 } } as never } });
    await findNewer();
    await confirm();
    const alert = screen.getByRole('alert').textContent;
    expect(alert).toContain('hay una consulta en marcha');
    expect(alert).toContain('hay un workflow en marcha');
    expect(mocked.applyUpdate).not.toHaveBeenCalled();
  });

  it('R-32 si la instalación falla lo dice y la ventana no espera un reinicio', async () => {
    mocked.applyUpdate.mockRejectedValue(new ApiError(502, 'update_hash', 'El JAR descargado no coincide con el manifiesto', null));
    await findNewer();
    await confirm();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Actualizar LiteDD' })).getByRole('button', { name: 'Actualizar' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('El JAR descargado no coincide con el manifiesto');
    expect(useUi.getState().updating).toBe(false);
  });
});
