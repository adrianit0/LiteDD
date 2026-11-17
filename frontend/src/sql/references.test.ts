import { api, type ConnectionStatus, type Reference } from '../api';
import { useConnection } from '../stores/connectionStore';
import { DEFAULT_REFERENCE_COLOR, REFERENCE_DELAY_MS, columnReferences, lookupLines, referenceProblem, useForeignKeys } from './references';
import type { Column, ForeignKey } from './types';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { sqlReferences: vi.fn() } };
});

const mocked = vi.mocked(api);

const AUTHOR: Reference = { table: 'author', color: '#123456', noteId: 'n1' };
const BOOK: Reference = { table: 'book', color: '#654321', noteId: 'n2' };
const KEYS: ForeignKey[] = [
  { table: 'book', column: 'author_id', referencedTable: 'author' },
  { table: 'loan', column: 'book_id', referencedTable: 'book' },
];

const status = (schema: string): ConnectionStatus => ({ state: 'connected', user: 'lector', host: '127.0.0.1', port: 3306, schema, message: null });

describe('Q-102 columnas marcadas', () => {
  it('una columna que sale tal cual de una columna con clave foránea hacia una tabla objetivo lleva su referencia', () => {
    const columns: Column[] = [
      { label: 'id', type: 'INT', numeric: true, table: 'book', column: 'id' },
      // Con alias: cuenta el origen, no la etiqueta.
      { label: 'autor', type: 'INT', numeric: true, table: 'book', column: 'author_id' },
      // Una expresión no tiene origen.
      { label: 'author_id', type: 'BIGINT', numeric: true },
      { label: 'libro', type: 'INT', numeric: true, table: 'LOAN', column: 'BOOK_ID' },
    ];
    expect(columnReferences(columns, KEYS, [AUTHOR])).toEqual([null, AUTHOR, null, null]);
    expect(columnReferences(columns, KEYS, [AUTHOR, BOOK])).toEqual([null, AUTHOR, null, BOOK]);
    expect(columnReferences(columns, [], [AUTHOR, BOOK])).toEqual([null, null, null, null]);
    expect(columnReferences(columns, KEYS, [{ ...AUTHOR, table: 'AUTHOR' }])[1]?.color).toBe('#123456');
  });
});

describe('Q-100 avisos de «Ajustes → Referencias»', () => {
  it('falta la tabla, se repite sin distinguir mayúsculas o falta la nota', () => {
    expect(DEFAULT_REFERENCE_COLOR).toBe('#007ba7');
    expect(referenceProblem({ ...AUTHOR, table: ' ' }, [AUTHOR])).toBe('Falta la tabla objetivo');
    expect(referenceProblem(AUTHOR, [AUTHOR, { ...BOOK, table: 'Author ' }])).toBe('Tabla objetivo repetida');
    expect(referenceProblem({ ...AUTHOR, noteId: null }, [AUTHOR])).toBe('Elige una nota SQL');
    expect(referenceProblem(AUTHOR, [AUTHOR, BOOK])).toBeNull();
  });
});

describe('Q-105 contenido del recuadro', () => {
  it('con una columna, solo el valor; con varias, cada valor con su etiqueta; sin filas, nada', () => {
    expect(lookupLines({ columns: ['name'], row: ['Ana'] })).toEqual([{ label: null, value: 'Ana' }]);
    expect(lookupLines({ columns: ['name', 'active'], row: ['Ana', null] })).toEqual([
      { label: 'name', value: 'Ana' },
      { label: 'active', value: null },
    ]);
    expect(lookupLines({ columns: ['name'] })).toEqual([]);
  });

  it('Q-104 se consulta tras 400 ms', () => {
    expect(REFERENCE_DELAY_MS).toBe(400);
  });
});

describe('Q-103 claves foráneas en memoria', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useForeignKeys.setState({ foreignKeys: [], loadedKey: null, loadingKey: null });
    useConnection.setState({ status: status('litedd_demo') });
    mocked.sqlReferences.mockResolvedValue({ foreignKeys: KEYS });
  });

  it('sin referencias no se piden', async () => {
    await useForeignKeys.getState().ensure([]);
    expect(mocked.sqlReferences).not.toHaveBeenCalled();
    expect(useForeignKeys.getState().foreignKeys).toEqual([]);
  });

  it('se piden una vez por conexión y tablas objetivo; cambiar cualquiera de las dos las vuelve a pedir', async () => {
    await Promise.all([useForeignKeys.getState().ensure([AUTHOR]), useForeignKeys.getState().ensure([AUTHOR])]);
    await useForeignKeys.getState().ensure([{ ...AUTHOR, color: '#000000' }]);
    expect(mocked.sqlReferences).toHaveBeenCalledTimes(1);
    expect(useForeignKeys.getState().foreignKeys).toEqual(KEYS);

    await useForeignKeys.getState().ensure([AUTHOR, BOOK]);
    expect(mocked.sqlReferences).toHaveBeenCalledTimes(2);
    useConnection.setState({ status: status('otro') });
    await useForeignKeys.getState().ensure([AUTHOR, BOOK]);
    expect(mocked.sqlReferences).toHaveBeenCalledTimes(3);
  });

  it('si la petición falla, no se marca nada y se vuelve a pedir la vez siguiente', async () => {
    mocked.sqlReferences.mockRejectedValueOnce(new Error('Sin conexión'));
    await useForeignKeys.getState().ensure([AUTHOR]);
    expect(useForeignKeys.getState().foreignKeys).toEqual([]);
    await useForeignKeys.getState().ensure([AUTHOR]);
    expect(mocked.sqlReferences).toHaveBeenCalledTimes(2);
    expect(useForeignKeys.getState().foreignKeys).toEqual(KEYS);
  });
});
