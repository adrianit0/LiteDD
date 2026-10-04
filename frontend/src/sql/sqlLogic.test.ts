import { EditorSelection, EditorState } from '@codemirror/state';
import { cellDisplay, elapsedText, nextSort, rangeText, timingText, toMarkdownTable } from './results';
import { insertSnippet } from './snippets';
import { fromControl, initialValues, toControl, typeLabel } from './values';
import { renderMarkdown } from '../markdown/render';

describe('resultados', () => {
  it('Q-42 tiempo total, de servidor y filas con coma decimal', () => {
    expect(timingText(1240, 1190, 20)).toBe('1,24 s (servidor 1,19 s) · 20 filas');
    expect(timingText(50, 3, 1)).toBe('0,05 s (servidor 0,00 s) · 1 fila');
  });

  it('Q-41 cronómetro en vivo', () => {
    expect(elapsedText(3420)).toBe('3,4 s');
  });

  it('Q-59 rango visible', () => {
    expect(rangeText(2, 20, 20)).toBe('21–40');
    expect(rangeText(3, 20, 7)).toBe('41–47');
    expect(rangeText(1, null, 10000)).toBe('1–10000');
    expect(rangeText(1, 20, 0)).toBe('0');
  });

  it('Q-56 clic en la cabecera: ascendente, descendente y sin orden', () => {
    expect(nextSort(null, 2)).toEqual({ column: 2, direction: 'asc' });
    expect(nextSort({ column: 2, direction: 'asc' }, 2)).toEqual({ column: 2, direction: 'desc' });
    expect(nextSort({ column: 2, direction: 'desc' }, 2)).toBeNull();
    expect(nextSort({ column: 2, direction: 'desc' }, 1)).toEqual({ column: 1, direction: 'asc' });
  });

  it('Q-63 Q-64 NULL distinto de la cadena vacía y recorte a 200 caracteres', () => {
    expect(cellDisplay(null)).toEqual({ text: 'NULL', clipped: false });
    expect(cellDisplay('')).toEqual({ text: '', clipped: false });
    const long = cellDisplay('x'.repeat(250));
    expect(long.clipped).toBe(true);
    expect(long.text).toHaveLength(201);
  });

  it('Q-66 copiar tabla como Markdown GFM', () => {
    const md = toMarkdownTable(
      [
        { label: 'id', type: 'BIGINT', numeric: true },
        { label: 'a|b', type: 'VARCHAR', numeric: false },
      ],
      [
        ['1', 'uno | dos'],
        ['2', 'línea\nnueva'],
        ['3', null],
      ],
    );
    expect(md).toBe('| id | a\\|b |\n| ---: | --- |\n| 1 | uno \\| dos |\n| 2 | línea<br>nueva |\n| 3 | NULL |');
  });

  it('N-33 Q-66 la tabla copiada se ve como tabla al pegarla en una nota', () => {
    const md = toMarkdownTable([{ label: 'título', type: 'VARCHAR', numeric: false }], [['a | b'], ['x\ny'], [null]]);
    const div = document.createElement('div');
    div.innerHTML = renderMarkdown(md);
    expect([...div.querySelectorAll('td')].map((td) => td.innerHTML)).toEqual(['a | b', 'x<br>y', 'NULL']);
  });
});

describe('valores', () => {
  it('Q-20 datetime usa el control del navegador y vuelve con segundos', () => {
    expect(toControl('datetime', '2026-10-04 10:30:00')).toBe('2026-10-04T10:30:00');
    expect(fromControl('datetime', '2026-10-04T10:30')).toBe('2026-10-04 10:30:00');
    expect(fromControl('datetime', '2026-10-04T10:30:15')).toBe('2026-10-04 10:30:15');
    expect(fromControl('date', '2026-10-04')).toBe('2026-10-04');
  });

  it('Q-24 los últimos valores se proponen; los nulos quedan vacíos', () => {
    expect(initialValues({ a: 'mar', b: null })).toEqual({ a: 'mar', b: '' });
    expect(initialValues(undefined)).toEqual({});
  });

  it('Q-20 el tipo se muestra junto al nombre', () => {
    expect(typeLabel('list', 'int')).toBe('list<int>');
    expect(typeLabel('list', 'string')).toBe('list');
    expect(typeLabel('int', null)).toBe('int');
  });
});

describe('Q-81 inserciones del editor SQL', () => {
  const run = (doc: string, from: number, to: number, kind: Parameters<typeof insertSnippet>[1]) => {
    const state = EditorState.create({ doc, selection: EditorSelection.range(from, to) });
    const next = state.update(insertSnippet(state, kind)).state;
    return { doc: next.doc.toString(), selected: next.sliceDoc(next.selection.main.from, next.selection.main.to) };
  };

  it('#{} sin selección deja el nombre seleccionado', () => {
    expect(run('', 0, 0, 'param')).toEqual({ doc: '#{nombre}', selected: 'nombre' });
  });

  it('<if>, <where>, <trim> y CDATA envuelven la selección', () => {
    expect(run('AND a = 1', 0, 9, 'if').doc).toBe('<if test="nombre != null">\n  AND a = 1\n</if>');
    expect(run('X', 0, 1, 'where').doc).toBe('<where>\n  X\n</where>');
    expect(run('X', 0, 1, 'trim').doc).toContain('prefixOverrides="AND |OR "');
    expect(run('a < 3', 0, 5, 'cdata').doc).toBe('<![CDATA[ a < 3 ]]>');
  });

  it('<choose> y <foreach> insertan su plantilla', () => {
    expect(run('', 0, 0, 'choose').doc).toContain('<otherwise></otherwise>');
    expect(run('', 0, 0, 'foreach').doc).toBe('<foreach collection="lista" item="item" open="(" separator="," close=")">#{item}</foreach>');
  });
});
