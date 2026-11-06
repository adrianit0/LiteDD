import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { MySQL, sql } from '@codemirror/lang-sql';
import { api, type ConnectionStatus } from '../api';
import { useConnection } from '../stores/connectionStore';
import { schemaSource, useSqlSchema } from './schema';
import type { SchemaTable } from './types';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { sqlSchema: vi.fn() } };
});

const mocked = vi.mocked(api);

const TABLES: SchemaTable[] = [
  { name: 'author', columns: ['id', 'name'] },
  { name: 'book', columns: ['id', 'title', 'year', 'author_id'] },
  { name: 'loan', columns: ['id', 'book_id'] },
];

/** Opciones que propone el autocompletado con el cursor donde está «|». */
async function complete(text: string): Promise<string[]> {
  const pos = text.indexOf('|');
  const doc = text.replace('|', '');
  const state = EditorState.create({ doc, extensions: [sql({ dialect: MySQL })] });
  const result = await schemaSource(TABLES)(new CompletionContext(state, pos, false));
  if (!result) return [];
  const typed = doc.slice(result.from, pos).toLowerCase();
  return result.options.map((o) => o.label).filter((l) => l.toLowerCase().startsWith(typed));
}

const status = (schema: string): ConnectionStatus => ({ state: 'connected', user: 'demo', host: 'db.example', port: 3306, schema, message: null });

describe('Q-84 autocompletado de tablas y columnas', () => {
  it('propone las tablas del esquema', async () => {
    expect(await complete('SELECT * FROM bo|')).toEqual(['book']);
  });

  it('tras «tabla.» propone sus columnas', async () => {
    expect(await complete('SELECT book.ti| FROM book')).toEqual(['title']);
  });

  it('tras «alias.» propone las columnas de la tabla del alias, también con etiquetas MyBatis', async () => {
    expect(await complete('SELECT b.| FROM book b JOIN author a ON a.id = b.author_id')).toEqual(['id', 'title', 'year', 'author_id']);
    expect(await complete('SELECT a.na| FROM book b JOIN author a ON a.id = b.author_id <where><if test="x != null">AND 1</if></where>')).toEqual([
      'name',
    ]);
  });

  it('no completa palabras clave', async () => {
    expect(await complete('SEL|')).toEqual([]);
  });
});

describe('Q-85 el esquema se lee una vez por conexión', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSqlSchema.setState({ tables: [], loadedKey: null, wanted: false });
    useConnection.setState({ status: status('litedd_demo') });
  });

  it('se pide al primer editor y se reutiliza mientras no cambie la conexión', async () => {
    mocked.sqlSchema.mockResolvedValue({ tables: TABLES });
    await useSqlSchema.getState().ensure();
    await useSqlSchema.getState().ensure();
    expect(mocked.sqlSchema).toHaveBeenCalledTimes(1);
    expect(useSqlSchema.getState().tables).toEqual(TABLES);
  });

  it('al cambiar la conexión se vuelve a pedir', async () => {
    mocked.sqlSchema.mockResolvedValue({ tables: TABLES });
    await useSqlSchema.getState().ensure();
    mocked.sqlSchema.mockResolvedValue({ tables: [TABLES[0]] });
    useConnection.setState({ status: status('otro') });
    await vi.waitFor(() => expect(useSqlSchema.getState().tables).toEqual([TABLES[0]]));
    expect(mocked.sqlSchema).toHaveBeenCalledTimes(2);
  });

  it('sin conexión no propone nada y lo vuelve a intentar en el siguiente editor', async () => {
    mocked.sqlSchema.mockRejectedValue(new Error('No hay ninguna conexión a MySQL configurada'));
    await useSqlSchema.getState().ensure();
    expect(useSqlSchema.getState().tables).toEqual([]);
    mocked.sqlSchema.mockResolvedValue({ tables: TABLES });
    await useSqlSchema.getState().ensure();
    expect(useSqlSchema.getState().tables).toEqual(TABLES);
  });

  it('si ningún editor lo ha pedido, cambiar la conexión no lo lee', async () => {
    useConnection.setState({ status: status('otro') });
    await Promise.resolve();
    expect(mocked.sqlSchema).not.toHaveBeenCalled();
  });
});
