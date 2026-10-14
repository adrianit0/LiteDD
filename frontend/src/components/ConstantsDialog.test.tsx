import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { api, type JavaConstant } from '../api';
import { ConstantsDialog } from './ConstantsDialog';
import { SqlErrors } from './sql/SqlErrors';
import { useUi } from '../stores/uiStore';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      constants: vi.fn(),
      putConstants: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

const constant = (over: Partial<JavaConstant>): JavaConstant => ({
  name: 'demo.DemoConstants@STATUS_ACTIVE',
  shortName: 'DemoConstants.STATUS_ACTIVE',
  packageName: 'demo',
  value: null,
  notes: 2,
  ...over,
});

const active = constant({});
const label = constant({ name: 'demo.DemoConstants@LABEL', shortName: 'DemoConstants.LABEL', value: 'novel', notes: 1 });
const gone = constant({ name: 'demo.Old@GONE', shortName: 'Old.GONE', value: 'x', notes: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  mocked.constants.mockResolvedValue([active, label, gone]);
  useUi.setState({ constantsOpen: true, constantsVersion: 0, notices: [] });
});

async function open() {
  render(<ConstantsDialog />);
  await screen.findByText('DemoConstants.STATUS_ACTIVE');
}

describe('M-65 constantes', () => {
  it('M-65 muestra nombre corto, paquete, valor y notas; la que no tiene valor va marcada', async () => {
    await open();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].className).toBe('constant-missing');
    expect(within(rows[0]).getByText('demo')).toBeTruthy();
    expect(within(rows[0]).getByPlaceholderText('Sin valor')).toBeTruthy();
    expect(within(rows[0]).getByText('2')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Valor de DemoConstants.LABEL').value).toBe('novel');
  });

  it('M-65 el filtro deja solo las constantes que coinciden', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Filtrar constantes'), { target: { value: 'label' } });
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('DemoConstants.LABEL')).toBeTruthy();
  });

  it('M-65 M-67 «Guardar» envía solo los cambios y avisa para volver a analizar las notas', async () => {
    mocked.putConstants.mockResolvedValue([{ ...active, value: '5' }, label, gone]);
    await open();
    const save = screen.getByRole('button', { name: 'Guardar' });
    expect(save).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Valor de DemoConstants.STATUS_ACTIVE'), { target: { value: ' 5 ' } });
    await act(async () => {
      fireEvent.click(save);
    });
    expect(mocked.putConstants).toHaveBeenCalledWith({ 'demo.DemoConstants@STATUS_ACTIVE': ' 5 ' });
    expect(useUi.getState().constantsVersion).toBe(1);
    expect(useUi.getState().notices.map((n) => n.text)).toContain('Constantes guardadas');
  });

  it('M-66 una constante sin uso aparece marcada y se puede borrar', async () => {
    mocked.putConstants.mockResolvedValue([active, label]);
    await open();
    const row = screen.getByText('Old.GONE').closest('tr')!;
    expect(within(row).getByText('sin uso')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: 'Borrar' }));
    });
    expect(mocked.putConstants).toHaveBeenCalledWith({ 'demo.Old@GONE': '' });
    expect(screen.queryByText('Old.GONE')).toBeNull();
  });

  it('M-63 el error de una constante sin valor ofrece abrir «Constantes»', () => {
    useUi.setState({ constantsOpen: false });
    render(
      <SqlErrors
        analysisErrors={[
          {
            code: 'constant',
            message: 'La constante «DemoConstants.STATUS_ACTIVE» no tiene valor. Dale uno en «Constantes».',
            line: null,
            column: null,
            variable: null,
          },
        ]}
        error={null}
        onRefresh={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Constantes…' }));
    expect(useUi.getState().constantsOpen).toBe(true);
  });
});
