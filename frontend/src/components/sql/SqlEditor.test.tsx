import { act, fireEvent, render, screen } from '@testing-library/react';
import { api } from '../../api';
import { MYBATIS_TOKEN, mybatisClass } from '../../editor/mybatis';
import { SqlAnalysisPanel, SqlToolbar } from './SqlEditorPanels';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return { ...actual, api: { analyze: vi.fn() } };
});

const mocked = vi.mocked(api);

describe('Q-80 resaltado de MyBatis', () => {
  it('reconoce etiquetas, #{} y ${} con clases distintas', () => {
    const text = 'SELECT * FROM book <where><if test="a != null">AND a = #{a,int}</if></where> ORDER BY ${col} <!-- #{x,boolean} -->';
    const found = [...text.matchAll(MYBATIS_TOKEN)].map((m) => [m[0], mybatisClass(m[0])]);
    expect(found).toEqual([
      ['<where>', 'cm-mb-tag'],
      ['<if test="a != null">', 'cm-mb-tag'],
      ['#{a,int}', 'cm-mb-param'],
      ['</if>', 'cm-mb-tag'],
      ['</where>', 'cm-mb-tag'],
      ['${col}', 'cm-mb-textual'],
      ['<!-- #{x,boolean} -->', 'cm-mb-comment'],
    ]);
  });
});

describe('Q-81 barra de inserciones', () => {
  it('tiene #{}, <if>, <where>, <choose>, <foreach>, <trim> y CDATA', () => {
    const onInsert = vi.fn();
    render(<SqlToolbar onInsert={onInsert} />);
    const buttons = screen.getByRole('toolbar', { name: 'Inserciones SQL' }).querySelectorAll('button');
    expect([...buttons].map((b) => b.textContent)).toEqual(['#{}', '<if>', '<where>', '<choose>', '<foreach>', '<trim>', 'CDATA']);
    fireEvent.click(buttons[4]);
    expect(onInsert).toHaveBeenCalledWith('foreach');
  });
});

describe('Q-82 variables y errores en vivo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('analiza tras dejar de escribir y lista variables, tipos y errores', async () => {
    mocked.analyze.mockResolvedValue({
      variables: [
        { name: 'ids', type: 'list', elementType: 'int', textual: false },
        { name: 'col', type: 'string', elementType: null, textual: true },
      ],
      kind: 'query',
      forbiddenClause: null,
      errors: [{ code: 'type', message: 'La variable «n» tiene tipos contradictorios: int, long', line: null, column: null, variable: 'n' }],
    });
    const { rerender } = render(<SqlAnalysisPanel content="SELECT 1" />);
    rerender(<SqlAnalysisPanel content="SELECT 12" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });
    expect(mocked.analyze).toHaveBeenCalledTimes(1);
    expect(mocked.analyze).toHaveBeenCalledWith('SELECT 12');
    const panel = screen.getByRole('region', { name: 'Análisis de la consulta' });
    expect(panel.textContent).toContain('ids list<int>');
    expect(panel.textContent).toContain('col string $');
    expect(panel.textContent).toContain('tipos contradictorios');
  });
});
