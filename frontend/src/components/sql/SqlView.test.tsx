import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { api, ApiError } from '../../api';
import { SqlView } from './SqlView';
import { useTabs } from '../../stores/tabsStore';
import { useSqlRuns } from '../../stores/sqlRunStore';
import { useConnection } from '../../stores/connectionStore';
import type { Note } from '../../types';
import type { Analysis, ExecuteResponse } from '../../sql/types';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      analyze: vi.fn(),
      execute: vi.fn(),
      count: vi.fn(),
      cancel: vi.fn(),
      saveNote: vi.fn(),
      getNote: vi.fn(),
      putSession: vi.fn(),
      reconnect: vi.fn(),
      tree: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);
const writeText = vi.fn();

const note: Note = {
  id: 'q1',
  parentId: null,
  position: 0,
  type: 'sql',
  title: 'Libros',
  content: 'SELECT …',
  favorite: false,
  tags: [],
  version: 3,
  createdAt: '2026-10-04T08:00:00Z',
  updatedAt: '2026-10-04T08:00:00Z',
};

const analysis = (over: Partial<Analysis> = {}): Analysis => ({
  variables: [
    { name: 'title', type: 'string', elementType: null, textual: false },
    { name: 'minYear', type: 'int', elementType: null, textual: false },
    { name: 'authorIds', type: 'list', elementType: 'int', textual: false },
  ],
  kind: 'query',
  forbiddenClause: null,
  errors: [],
  lastValues: {},
  ...over,
});

const finalSql = { withPlaceholders: 'SELECT ? AS a', parameters: [{ index: 1, value: 'mar', type: 'string' }], inlined: "SELECT 'mar' AS a" };

const result = (over: Partial<ExecuteResponse> = {}): ExecuteResponse => ({
  kind: 'query',
  columns: [
    { label: 'id', type: 'BIGINT', numeric: true },
    { label: 'title', type: 'VARCHAR', numeric: false },
  ],
  rows: [
    ['1', 'El mar'],
    ['2', null],
  ],
  truncatedCells: [],
  hasMore: false,
  total: 2,
  capReached: false,
  serverMillis: 14,
  finalSql,
  ...over,
});

function tab() {
  return useTabs.getState().tabs[0];
}

/** Como NotePane: la vista recibe la pestaña actual del almacén. */
function Harness() {
  const t = useTabs((s) => s.tabs[0]);
  return t ? <SqlView tab={t} /> : null;
}

async function mount(a: Analysis = analysis()) {
  mocked.analyze.mockResolvedValue(a);
  const view = render(<Harness />);
  await act(async () => {});
  return view;
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 800, height: 600 }));
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  mocked.putSession.mockResolvedValue({ tabs: [] });
  mocked.cancel.mockResolvedValue({ cancelled: true });
  useSqlRuns.setState({ runs: {} });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  await useTabs.getState().open('q1', { note });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formulario de variables', () => {
  it('Q-20 un campo por variable en orden, con nombre y tipo; Q-40 no se ejecuta al abrir', async () => {
    await mount();
    const form = screen.getByRole('group', { name: 'Variables' });
    expect([...form.querySelectorAll('.sql-field-name')].map((e) => e.textContent)).toEqual(['title', 'minYear', 'authorIds']);
    expect([...form.querySelectorAll('.sql-field-type')].map((e) => e.textContent)).toEqual(['string', 'int', 'list<int>']);
    expect(mocked.analyze).toHaveBeenCalledWith('SELECT …', 'q1');
    expect(mocked.execute).not.toHaveBeenCalled();
  });

  it('Q-20 boolean es un selector vacío/sí/no y date un selector de fecha', async () => {
    await mount(
      analysis({
        variables: [
          { name: 'active', type: 'boolean', elementType: null, textual: false },
          { name: 'day', type: 'date', elementType: null, textual: false },
        ],
      }),
    );
    const select = screen.getByLabelText(/active/) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['(vacío)', 'sí', 'no']);
    expect((screen.getByLabelText(/day/) as HTMLInputElement).type).toBe('date');
  });

  it('Q-25 sin variables no hay formulario, solo «Ejecutar»', async () => {
    await mount(analysis({ variables: [] }));
    expect(screen.queryByRole('group', { name: 'Variables' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ejecutar' })).toBeTruthy();
  });

  it('Q-24 se proponen los últimos valores ejecutados', async () => {
    await mount(analysis({ lastValues: { title: 'mar', minYear: null } }));
    expect((screen.getByLabelText(/title/) as HTMLInputElement).value).toBe('mar');
    expect((screen.getByLabelText(/minYear/) as HTMLInputElement).value).toBe('');
  });

  it('Q-21 Q-23 Intro en un campo ejecuta con los valores como texto; vacío llega vacío', async () => {
    mocked.execute.mockResolvedValue(result());
    await mount();
    fireEvent.change(screen.getByLabelText(/title/), { target: { value: 'mar' } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/title/), { key: 'Enter' });
    });
    expect(mocked.execute).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: 'q1', version: 3, values: { title: 'mar' }, page: 1, pageSize: 20, sort: null }),
    );
  });

  it('Q-23 «Limpiar» vacía todos los campos', async () => {
    await mount(analysis({ lastValues: { title: 'mar', minYear: '1990' } }));
    await click(screen.getByRole('button', { name: 'Limpiar' }));
    expect((screen.getByLabelText(/title/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/minYear/) as HTMLInputElement).value).toBe('');
  });

  it('Q-22 Q-93 un valor no convertible marca el campo y no hay resultados', async () => {
    mocked.execute.mockRejectedValue(new ApiError(422, 'invalid_values', 'Hay valores…', { minYear: 'Se esperaba un número entero (int)' }));
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const field = screen.getByLabelText(/minYear/);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Se esperaba un número entero (int)')).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
  });
});

describe('ejecución', () => {
  it('Q-41 cronómetro y «Cancelar»; Esc cancela', async () => {
    let finish: (r: ExecuteResponse) => void = () => {};
    mocked.execute.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    expect(screen.getByRole('timer').textContent).toMatch(/^\d+,\d s$/);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    const executionId = mocked.execute.mock.calls[0][0].executionId;
    expect(mocked.cancel).toHaveBeenCalledWith(executionId);
    await act(async () => finish(result()));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('Q-42 tiempo total, de servidor y filas', async () => {
    mocked.execute.mockResolvedValue(result());
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    expect(screen.getByText(/s \(servidor 0,01 s\) · 2 filas$/)).toBeTruthy();
  });

  it('Q-45 una sentencia no ejecutable muestra «Generar SQL», el aviso y el SQL final abierto', async () => {
    mocked.execute.mockResolvedValue({
      kind: 'statement',
      finalSql: { withPlaceholders: 'UPDATE book SET title = ?', parameters: [], inlined: "UPDATE book SET title = 'x'" },
      warning: 'LiteDD solo ejecuta consultas. Copia la sentencia para ejecutarla en otra herramienta.',
    });
    await mount(analysis({ kind: 'statement', variables: [] }));
    await click(screen.getByRole('button', { name: 'Generar SQL' }));
    expect(screen.getByText(/LiteDD solo ejecuta consultas/)).toBeTruthy();
    const details = document.querySelector('details.final-sql') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(within(details).getByText("UPDATE book SET title = 'x'")).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('Q-95 una cláusula no permitida también se genera, no se ejecuta', async () => {
    await mount(analysis({ kind: 'query', forbiddenClause: 'FOR UPDATE', errors: [{ code: 'forbidden_clause', message: 'Cláusula no permitida: FOR UPDATE', line: null, column: null, variable: null }] }));
    expect(screen.getByRole('button', { name: 'Generar SQL' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Cláusula no permitida: FOR UPDATE');
  });

  it('Q-46 Q-98 sin conexión se muestra la causa y «Reconectar»', async () => {
    mocked.execute.mockRejectedValue(new ApiError(503, 'not_connected', 'Sin conexión con MySQL: Connection refused', null));
    mocked.reconnect.mockResolvedValue({ state: 'connected', user: 'u', host: 'h', port: 1, schema: 's', message: null });
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    expect(screen.getByRole('alert').textContent).toContain('Connection refused');
    await click(screen.getByRole('button', { name: 'Reconectar' }));
    expect(useConnection.getState().status?.state).toBe('connected');
  });

  it('Q-90 Q-94 Q-96 Q-97 los errores se muestran con su mensaje', async () => {
    await mount();
    const cases: [ApiError, string][] = [
      [new ApiError(422, 'sql_error', 'x', [{ code: 'xml', message: 'XML no válido en la línea 2, columna 9: …', line: 2, column: 9, variable: null }]), 'línea 2, columna 9'],
      [new ApiError(422, 'sql_error', 'Una nota solo puede contener una sentencia', [{ code: 'multiple_statements', message: 'Una nota solo puede contener una sentencia', line: null, column: null, variable: null }]), 'una sentencia'],
      [new ApiError(422, 'mysql_error', 'Error de MySQL 1146: Table \'litedd_demo.x\' doesn\'t exist', null), 'Error de MySQL 1146'],
      [new ApiError(422, 'timeout', 'La consulta superó el tiempo máximo de 30 s y se canceló (30,0 s)', null), '(30,0 s)'],
      [new ApiError(422, 'cancelled', 'Consulta cancelada a los 1,2 s', null), 'cancelada a los 1,2 s'],
    ];
    for (const [error, text] of cases) {
      mocked.execute.mockRejectedValueOnce(error);
      await click(screen.getByRole('button', { name: 'Ejecutar' }));
      expect(screen.getByRole('alert').textContent).toContain(text);
    }
  });

  it('A-05 una versión antigua ofrece «Actualizar»', async () => {
    mocked.execute.mockRejectedValue(new ApiError(409, 'stale_version', 'La nota ha cambiado desde que se abrió. Pulsa «Actualizar».', null));
    mocked.getNote.mockResolvedValue({ ...note, version: 4 });
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    await click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(mocked.getNote).toHaveBeenCalledWith('q1');
  });

  it('Q-54 «Contar» muestra el total', async () => {
    mocked.execute.mockResolvedValue(result({ hasMore: true, total: undefined, rows: [['1', 'a']] }));
    mocked.count.mockResolvedValue({ total: 12345 });
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    await click(screen.getByRole('button', { name: 'Contar' }));
    expect(screen.getByRole('navigation', { name: 'Paginación' }).textContent).toContain('de 12.345');
  });
});

describe('paginación y orden', () => {
  it('Q-59 siguiente pide la página 2 y muestra el rango; Q-50 cambiar el tamaño vuelve a la 1', async () => {
    mocked.execute.mockResolvedValue(result({ hasMore: true, total: undefined }));
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    await click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(mocked.execute).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }));
    const pager = screen.getByRole('navigation', { name: 'Paginación' });
    expect(pager.textContent).toContain('Página 2');
    expect(pager.textContent).toContain('21–22');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Tamaño de página'), { target: { value: 'all' } });
    });
    expect(mocked.execute).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: null }));
    expect(screen.getByRole('option', { name: 'Sin límite' })).toBeTruthy();
  });

  it('Q-56 clic en la cabecera: ascendente, descendente, sin orden, desde la página 1', async () => {
    mocked.execute.mockResolvedValue(result());
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const header = () => screen.getByRole('button', { name: /title/ });
    await click(header());
    expect(mocked.execute).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, sort: { column: 2, direction: 'asc' } }));
    await click(header());
    expect(mocked.execute).toHaveBeenLastCalledWith(expect.objectContaining({ sort: { column: 2, direction: 'desc' } }));
    await click(header());
    expect(mocked.execute).toHaveBeenLastCalledWith(expect.objectContaining({ sort: null }));
  });

  it('Q-44 SHOW, DESCRIBE y EXPLAIN no tienen orden ni paginación', async () => {
    mocked.execute.mockResolvedValue(result({ kind: 'meta' }));
    await mount(analysis({ kind: 'meta', variables: [] }));
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
    expect(screen.queryByRole('button', { name: /title/ })).toBeNull();
  });

  it('Q-55 «Sin límite» con tope alcanzado avisa', async () => {
    mocked.execute.mockResolvedValue(result({ capReached: true, total: undefined }));
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    expect(screen.getByText(/se ha alcanzado el tope/)).toBeTruthy();
  });
});

describe('tabla de resultados', () => {
  it('Q-60 Q-61 Q-63 número de fila, etiquetas, NULL distinto y números a la derecha', async () => {
    mocked.execute.mockResolvedValue(result({ columns: [{ label: 'id', type: 'BIGINT', numeric: true }, { label: 'id', type: 'INT', numeric: true }], rows: [['1', '']] }));
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const grid = screen.getByRole('grid', { name: 'Resultados' });
    expect(within(grid).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['#', 'id', 'id']);
    expect(within(grid).getByRole('rowheader').textContent).toBe('1');
    const cells = within(grid).getAllByRole('gridcell');
    expect(cells[0].className).toContain('numeric');
    expect(cells[1].textContent).toBe('');
    expect(cells[1].className).not.toContain('null');
  });

  it('Q-63 NULL atenuado', async () => {
    mocked.execute.mockResolvedValue(result());
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const nullCell = screen.getAllByRole('gridcell')[3];
    expect(nullCell.textContent).toBe('NULL');
    expect(nullCell.className).toContain('null');
  });

  it('Q-64 ADR-0015 una celda larga se recorta y un clic abre el valor completo, con aviso si el servidor lo recortó', async () => {
    const long = 'x'.repeat(10_000);
    mocked.execute.mockResolvedValue(result({ rows: [['1', long]], truncatedCells: [[0, 1]] }));
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const cell = screen.getAllByRole('gridcell')[1];
    expect(cell.textContent).toHaveLength(201);
    await click(cell);
    const panel = screen.getByRole('region', { name: 'Valor completo' });
    expect(panel.querySelector('pre')!.textContent).toHaveLength(10_000);
    expect(panel.textContent).toContain('ha recortado el valor a 10.000 caracteres');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('region', { name: 'Valor completo' })).toBeNull();
  });

  it('Q-65 clic selecciona una celda y Ctrl+C copia su valor', async () => {
    mocked.execute.mockResolvedValue(result());
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const cell = screen.getAllByRole('gridcell')[1];
    await click(cell);
    expect(cell.getAttribute('aria-selected')).toBe('true');
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('grid'), { key: 'c', ctrlKey: true });
    });
    expect(writeText).toHaveBeenCalledWith('El mar');
  });

  it('Q-66 «Copiar tabla» copia las filas cargadas en Markdown', async () => {
    mocked.execute.mockResolvedValue(result());
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    await click(screen.getByRole('button', { name: 'Copiar tabla' }));
    expect(writeText).toHaveBeenCalledWith('| id | title |\n| ---: | --- |\n| 1 | El mar |\n| 2 | NULL |');
  });

  it('Q-68 sin filas: cabeceras y «Sin resultados»', async () => {
    mocked.execute.mockResolvedValue(result({ rows: [], total: 0 }));
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByText('Sin resultados')).toBeTruthy();
  });

  it('Q-67 P-08 los resultados se liberan al cerrar la pestaña', async () => {
    mocked.execute.mockResolvedValue(result());
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const id = tab().id;
    expect(useSqlRuns.getState().runs[id].result).not.toBeNull();
    await act(async () => {
      await useTabs.getState().close(id);
    });
    expect(useSqlRuns.getState().runs[id]).toBeUndefined();
  });
});

describe('SQL final', () => {
  it('Q-70 Q-71 Q-72 Q-73 panel plegado con las dos vistas y «Copiar»', async () => {
    mocked.execute.mockResolvedValue(result());
    await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const details = document.querySelector('details.final-sql') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const panel = within(details);
    expect(panel.getByText('SELECT ? AS a')).toBeTruthy();
    expect(details.querySelector('.final-sql-params')!.textContent).toContain("'mar' · string");
    await click(panel.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenLastCalledWith('SELECT ? AS a');
    await click(panel.getByRole('tab', { name: 'Con valores' }));
    expect(panel.getByText("SELECT 'mar' AS a")).toBeTruthy();
    await click(panel.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenLastCalledWith("SELECT 'mar' AS a");
  });
});

describe('U-06 disposición', () => {
  it('formulario, barra, tabla, paginación y SQL final, en ese orden', async () => {
    mocked.execute.mockResolvedValue(result());
    const { container } = await mount();
    await click(screen.getByRole('button', { name: 'Ejecutar' }));
    const order = ['.sql-form', '.sql-runbar', '.results', '.sql-pager', '.final-sql'].map((s) => container.querySelector(s)!);
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe('A-04 se ejecuta lo guardado', () => {
  it('si la pestaña tiene cambios, se guardan antes de ejecutar con la versión nueva', async () => {
    mocked.saveNote.mockResolvedValue({ ...note, content: 'SELECT 2', version: 4 });
    mocked.execute.mockResolvedValue(result());
    await mount();
    useTabs.getState().edit(tab().id, { content: 'SELECT 2' });
    await act(async () => {
      await useSqlRuns.getState().execute(tab().id);
    });
    expect(mocked.saveNote).toHaveBeenCalled();
    expect(mocked.execute).toHaveBeenCalledWith(expect.objectContaining({ version: 4 }));
  });
});
