import { act } from '@testing-library/react';
import { api, DEFAULT_CONFIG } from '../api';
import { useConnection } from '../stores/connectionStore';
import { useTabs } from '../stores/tabsStore';
import { useUi } from '../stores/uiStore';
import { filterOptions, MAX_VISIBLE_OPTIONS, normalize, optionLabel, useTypeOptions, valueLabel, type TypeOption } from './options';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { sqlOptions: vi.fn(), putSession: vi.fn() } };
});

const mocked = vi.mocked(api);

const LANGS: TypeOption[] = [
  ['1', 'Java'],
  ['2', 'Python'],
  ['10', 'Español'],
  ['11', null],
];

describe('Q-115 Q-117 texto y filtro de las opciones', () => {
  it('Q-115 cada opción se ve como «key — value»; sin value, solo la key', () => {
    expect(optionLabel(['3', 'Java'])).toBe('3 — Java');
    expect(optionLabel(['3', null])).toBe('3');
  });

  it('Q-117 el valor elegido se ve con su opción; uno que no está, con su key; vacío, nada', () => {
    expect(valueLabel('2', LANGS)).toBe('2 — Python');
    expect(valueLabel('99', LANGS)).toBe('99');
    expect(valueLabel('', LANGS)).toBe('');
  });

  it('Q-115 filtra por el texto de la opción, sin mayúsculas ni acentos', () => {
    expect(normalize('ESPAÑOL Ü')).toBe('espanol u');
    expect(filterOptions(LANGS, 'espan').shown).toEqual([['10', 'Español']]);
    expect(filterOptions(LANGS, ' PY ').shown).toEqual([['2', 'Python']]);
    // También por la key.
    expect(filterOptions(LANGS, '1').shown.map(([k]) => k)).toEqual(['1', '10', '11']);
    expect(filterOptions(LANGS, '').shown).toHaveLength(4);
  });

  it('Q-115 se ven hasta 200 y se cuenta el resto', () => {
    const many: TypeOption[] = Array.from({ length: 250 }, (_, i) => [String(i), `Valor ${i}`]);
    const all = filterOptions(many, '');
    expect(all.shown).toHaveLength(MAX_VISIBLE_OPTIONS);
    expect(all.hidden).toBe(50);
    expect(filterOptions(many, 'valor 24').hidden).toBe(0);
  });
});

describe('Q-116 consulta y memoria de las opciones por pestaña', () => {
  const entry = (tab: string, type: string) => useTypeOptions.getState().byTab[tab]?.[type];

  beforeEach(() => {
    vi.clearAllMocks();
    mocked.putSession.mockResolvedValue({ tabs: [] });
    useTypeOptions.setState({ byTab: {}, key: '' });
    useUi.setState({ config: { ...DEFAULT_CONFIG, types: [{ name: 'lang', noteId: 'n1' }] } });
    useTabs.setState({ tabs: [{ id: 't1' }, { id: 't2' }] as never, activeId: 't1' });
  });

  it('Q-116 pide cada tipo una vez por pestaña, con «Consultando…» mientras llega', async () => {
    mocked.sqlOptions.mockResolvedValue({ options: LANGS, capReached: false });
    act(() => useTypeOptions.getState().ensure('t1', ['lang', 'LANG', 'catalogo5']));
    expect(entry('t1', 'lang')?.status).toBe('loading');
    expect(mocked.sqlOptions.mock.calls).toEqual([['lang'], ['catalogo5']]);
    await act(async () => {});
    expect(entry('t1', 'lang')).toEqual({ status: 'ready', options: LANGS, capReached: false, error: null });
    act(() => useTypeOptions.getState().ensure('t1', ['lang']));
    expect(mocked.sqlOptions).toHaveBeenCalledTimes(2);
    // Otra pestaña consulta las suyas.
    act(() => useTypeOptions.getState().ensure('t2', ['lang']));
    expect(mocked.sqlOptions).toHaveBeenCalledTimes(3);
  });

  it('Q-116 un fallo se muestra y no se recuerda: se vuelve a pedir', async () => {
    mocked.sqlOptions.mockRejectedValueOnce(new Error('No hay ninguna conexión a MySQL configurada'));
    act(() => useTypeOptions.getState().ensure('t1', ['lang']));
    await act(async () => {});
    expect(entry('t1', 'lang')?.status).toBe('error');
    expect(entry('t1', 'lang')?.error).toBe('No hay ninguna conexión a MySQL configurada');
    mocked.sqlOptions.mockResolvedValue({ options: LANGS, capReached: true });
    act(() => useTypeOptions.getState().ensure('t1', ['lang']));
    await act(async () => {});
    expect(entry('t1', 'lang')?.capReached).toBe(true);
  });

  it('Q-116 cambiar la conexión o los tipos, o cerrar la pestaña, olvida lo consultado', async () => {
    mocked.sqlOptions.mockResolvedValue({ options: LANGS, capReached: false });
    act(() => useTypeOptions.getState().ensure('t1', ['lang']));
    await act(async () => {});
    useUi.setState({ config: { ...DEFAULT_CONFIG, types: [{ name: 'lang', noteId: 'n2' }] } });
    act(() => useTypeOptions.getState().ensure('t1', ['lang']));
    expect(mocked.sqlOptions).toHaveBeenCalledTimes(2);
    await act(async () => {});
    useConnection.setState({ status: { state: 'connected', user: 'u', host: 'h', port: 3306, schema: 'litedd_demo' } as never });
    act(() => useTypeOptions.getState().ensure('t1', ['lang']));
    expect(mocked.sqlOptions).toHaveBeenCalledTimes(3);
    await act(async () => {});

    act(() => useTabs.setState({ tabs: [{ id: 't2' }] as never }));
    expect(useTypeOptions.getState().byTab.t1).toBeUndefined();
  });
});
