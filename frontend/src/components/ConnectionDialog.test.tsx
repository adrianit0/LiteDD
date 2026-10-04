import { act, fireEvent, render, screen } from '@testing-library/react';
import { api, ApiError, type ConnectionStatus } from '../api';
import { ConnectionDialog } from './ConnectionDialog';
import { ConnectionStatusBar } from './ConnectionStatusBar';
import { statusLabel, useConnection } from '../stores/connectionStore';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: { getConnection: vi.fn(), testConnection: vi.fn(), saveConnection: vi.fn(), reconnect: vi.fn(), connectionStatus: vi.fn() },
  };
});

const mocked = vi.mocked(api);

const status = (state: ConnectionStatus['state']): ConnectionStatus => ({
  state,
  user: 'lector',
  host: '127.0.0.1',
  port: 3306,
  schema: 'litedd_demo',
  message: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getConnection.mockResolvedValue({
    configured: true,
    host: '127.0.0.1',
    port: 3306,
    user: 'lector',
    schema: '',
    extraParams: '',
    hasPassword: true,
  });
  useConnection.setState({ status: null, dialogOpen: true, busy: false });
});

describe('diálogo de conexión', () => {
  it('C-01 tiene método fijo, host, puerto, usuario, contraseña, esquema y parámetros', async () => {
    render(<ConnectionDialog />);
    expect(await screen.findByDisplayValue('lector')).toBeTruthy();
    expect(screen.getByText('TCP/IP estándar')).toBeTruthy();
    for (const label of ['Host', 'Puerto', 'Usuario', 'Contraseña', 'Esquema por defecto', 'Parámetros JDBC adicionales']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    // S-21, ADR-0012: la contraseña no llega; el campo indica que hay una guardada.
    const password = screen.getByLabelText<HTMLInputElement>('Contraseña');
    expect(password.value).toBe('');
    expect(password.placeholder).toContain('Guardada');
  });

  it('C-03 C-04 con un único esquema se selecciona solo', async () => {
    mocked.testConnection.mockResolvedValue({ schemas: ['litedd_demo'] });
    render(<ConnectionDialog />);
    await screen.findByDisplayValue('lector');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    });
    expect(screen.getByLabelText<HTMLSelectElement>('Esquema por defecto').value).toBe('litedd_demo');
    expect(screen.getByRole('button', { name: 'Guardar' }).hasAttribute('disabled')).toBe(false);
  });

  it('C-04 con varios esquemas hay que elegir uno para guardar', async () => {
    mocked.testConnection.mockResolvedValue({ schemas: ['litedd_demo', 'otro'] });
    mocked.saveConnection.mockResolvedValue(status('connected'));
    render(<ConnectionDialog />);
    await screen.findByDisplayValue('lector');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    });
    const save = screen.getByRole('button', { name: 'Guardar' });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Esquema por defecto'), { target: { value: 'otro' } });
    await act(async () => {
      fireEvent.click(save);
    });
    expect(mocked.saveConnection).toHaveBeenCalledWith(expect.objectContaining({ schema: 'otro', password: '' }));
    expect(useConnection.getState().status?.state).toBe('connected');
    expect(useConnection.getState().dialogOpen).toBe(false);
  });

  it('C-03 un fallo al probar se muestra sin cerrar el diálogo', async () => {
    mocked.testConnection.mockRejectedValue(new ApiError(422, 'connection_failed', 'No se pudo conectar: Connection refused', null));
    render(<ConnectionDialog />);
    await screen.findByDisplayValue('lector');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('Connection refused');
  });
});

describe('estado en la barra', () => {
  it('C-02 C-09 C-10 textos de cada estado', () => {
    expect(statusLabel(null)).toBe('Sin conexión configurada');
    expect(statusLabel(status('connected'))).toBe('lector@127.0.0.1/litedd_demo');
    expect(statusLabel(status('disconnected'))).toBe('Desconectado · lector@127.0.0.1/litedd_demo');
    expect(statusLabel(status('schema_unavailable'))).toBe('Esquema no disponible · lector@127.0.0.1/litedd_demo');
  });

  it('C-09 un clic abre el diálogo y «Reconectar» recrea el pool', async () => {
    mocked.reconnect.mockResolvedValue(status('connected'));
    useConnection.setState({ status: status('disconnected'), dialogOpen: false });
    render(<ConnectionStatusBar />);
    fireEvent.click(screen.getByRole('button', { name: /Desconectado/ }));
    expect(useConnection.getState().dialogOpen).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconectar' }));
    });
    expect(mocked.reconnect).toHaveBeenCalled();
    expect(useConnection.getState().status?.state).toBe('connected');
  });
});
