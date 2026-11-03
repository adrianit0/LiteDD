import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { api, type JavaConstant } from '../api';
import { ConstantsDialog } from './ConstantsDialog';
import { SqlErrors } from './sql/SqlErrors';
import { useUi } from '../stores/uiStore';
import { DialogHost } from './DialogHost';

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

  it('M-65 la «×» de arriba cierra sin preguntar si no hay cambios', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la ventana' }));
    expect(useUi.getState().constantsOpen).toBe(false);
  });

  it('M-65 con cambios, la «×» pregunta: «Seguir editando» no cierra y «Descartar» cierra sin guardar', async () => {
    render(<DialogHost />);
    await open();
    fireEvent.change(screen.getByLabelText('Valor de DemoConstants.STATUS_ACTIVE'), { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar la ventana' }));
    });
    expect(screen.getByText('Una constante tiene cambios sin guardar.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    });
    expect(useUi.getState().constantsOpen).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Valor de DemoConstants.STATUS_ACTIVE').value).toBe('5');
    // Esc también pregunta.
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Valor de DemoConstants.STATUS_ACTIVE'), { key: 'Escape' });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    });
    expect(useUi.getState().constantsOpen).toBe(false);
    expect(mocked.putConstants).not.toHaveBeenCalled();
  });

  it('M-65 con cambios, «Guardar» del aviso guarda y cierra', async () => {
    mocked.putConstants.mockResolvedValue([{ ...active, value: '5' }, label, gone]);
    render(<DialogHost />);
    await open();
    fireEvent.change(screen.getByLabelText('Valor de DemoConstants.STATUS_ACTIVE'), { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    });
    const dialog = screen.getByRole('dialog', { name: 'Cambios sin guardar' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    });
    expect(mocked.putConstants).toHaveBeenCalledWith({ 'demo.DemoConstants@STATUS_ACTIVE': '5' });
    expect(useUi.getState().constantsOpen).toBe(false);
  });

  const source = `
    package demo;
    public class DemoConstants {
        public static final int STATUS_ACTIVE = 60 * 1000;
        public static final String LABEL = "novel";
        public static final int UNUSED = 5;
    }
    class Old {
        static final String GONE = "y";
    }`;

  const startMigration = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Migración masiva…' }));
    return screen.getByLabelText<HTMLTextAreaElement>('Contenido del .java');
  };

  it('M-69 «Migración masiva…» rellena la tabla sin guardar, marca las filas y resume lo hecho', async () => {
    mocked.putConstants.mockResolvedValue([active, label, { ...gone, value: 'y' }]);
    await open();
    const box = startMigration();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toHaveProperty('disabled', true);
    fireEvent.change(box, { target: { value: source } });
    const applyButton = screen.getByRole('button', { name: 'Aplicar' });
    fireEvent.click(applyButton);
    expect(mocked.putConstants).not.toHaveBeenCalled();
    // En el navegador, si el mismo botón pasara a ser «Guardar» durante el clic, enviaría el formulario.
    expect(applyButton.isConnected).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('Valor de Old.GONE').value).toBe('y');
    expect(screen.getByLabelText<HTMLInputElement>('Valor de DemoConstants.STATUS_ACTIVE').value).toBe('');
    expect(screen.getByText('Old.GONE').closest('tr')!.className).toBe('constant-changed');
    expect(screen.getByText('DemoConstants.LABEL').closest('tr')!.className).toBe('');
    expect(screen.getByRole('status').textContent).toBe(
      '1 constante rellenada y 1 que ya tenía ese valor. 1 constante del texto no está en la lista y no se añade. ' +
        'No se ha podido leer el valor de DemoConstants.STATUS_ACTIVE: dáselo a mano. Revisa los cambios y pulsa «Guardar».',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(mocked.putConstants).toHaveBeenCalledWith({ 'demo.Old@GONE': 'y' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Old.GONE').closest('tr')!.className).toBe('');
  });

  it('M-69 «Cancelar» y Esc vuelven a la lista sin cambiar nada y el texto pegado no se conserva', async () => {
    await open();
    fireEvent.change(startMigration(), { target: { value: source } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Valor de Old.GONE').value).toBe('x');
    const box = startMigration();
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: source } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(useUi.getState().constantsOpen).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Valor de Old.GONE').value).toBe('x');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Migración masiva…' }));
    expect(startMigration().value).toBe('');
  });

  it('M-69 un texto sin constantes avisa y sigue en el cuadro', async () => {
    await open();
    fireEvent.change(startMigration(), { target: { value: 'esto no es Java' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByRole('alert').textContent).toBe('No se ha encontrado ninguna constante en el texto pegado.');
    expect(screen.getByLabelText('Contenido del .java')).toBeTruthy();
  });

  it('M-69 sin constantes en la lista no hay nada que migrar', async () => {
    mocked.constants.mockResolvedValue([]);
    render(<ConstantsDialog />);
    await screen.findByText('Ninguna nota usa constantes Java.');
    expect(screen.getByRole('button', { name: 'Migración masiva…' })).toHaveProperty('disabled', true);
  });

  it('M-69 una fila editada a mano también se marca', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Valor de DemoConstants.STATUS_ACTIVE'), { target: { value: '5' } });
    expect(screen.getByText('DemoConstants.STATUS_ACTIVE').closest('tr')!.className).toBe('constant-missing constant-changed');
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
