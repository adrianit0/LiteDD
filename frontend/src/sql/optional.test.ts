import { EditorSelection, EditorState } from '@codemirror/state';
import { makeOptional } from './optional';

const run = (doc: string, from: number, to = from) => {
  const state = EditorState.create({ doc, selection: EditorSelection.range(from, to) });
  const spec = makeOptional(state);
  return spec ? state.update(spec).state.doc.toString() : null;
};

const IF = (test: string, body: string, indent = '') => `${indent}<if test="${test}">\n${indent}  ${body}\n${indent}</if>`;

describe('Q-86 hacer opcional', () => {
  it('Q-86 envuelve la línea del cursor en un <if> con su variable', () => {
    const doc = 'SELECT * FROM book WHERE 1 = 1\nAND valor = #{valor,int}';
    expect(run(doc, doc.length)).toBe('SELECT * FROM book WHERE 1 = 1\n' + IF('valor != null', 'AND valor = #{valor,int}'));
  });

  it('Q-86 convierte cada línea seleccionada y une varias variables con and', () => {
    const doc = 'SELECT * FROM book WHERE 1 = 1\n  AND a = #{a}\n\n  AND b BETWEEN #{min,int} AND #{max,int}\n';
    expect(run(doc, 31, doc.length)).toBe(
      'SELECT * FROM book WHERE 1 = 1\n' +
        IF('a != null', 'AND a = #{a}', '  ') +
        '\n\n' +
        IF('min != null and max != null', 'AND b BETWEEN #{min,int} AND #{max,int}', '  ') +
        '\n',
    );
  });

  it('Q-86 una variable repetida se compara una vez y ${} también cuenta', () => {
    const doc = 'SELECT 1 WHERE 1 = 1\nAND (a = #{x} OR b = #{x.id}) ORDER BY ${col}';
    expect(run(doc, doc.length)).toContain('<if test="x != null and col != null">');
  });

  it('Q-86 no toca etiquetas, líneas sin variables ni líneas vacías', () => {
    const doc = 'SELECT 1 WHERE 1 = 1\n<if test="a != null">\n  AND a = 1\n</if>';
    expect(run(doc, 21, doc.length)).toBeNull();
  });

  it('Q-86 IN #{lista} pasa a <foreach> y el tipo declarado lo lleva el item', () => {
    const doc = 'SELECT 1 WHERE 1 = 1\nAND a.id IN #{ids,int}\nAND b.id in #{codes}\nAND c.id IN #{others, javaType=list}';
    const each = (name: string, item: string) => `<foreach collection="${name}" item="item" open="(" separator="," close=")">${item}</foreach>`;
    expect(run(doc, 21, doc.length)).toBe(
      'SELECT 1 WHERE 1 = 1\n' +
        IF('ids != null', `AND a.id IN ${each('ids', '#{item,int}')}`) +
        '\n' +
        IF('codes != null', `AND b.id in ${each('codes', '#{item}')}`) +
        '\n' +
        IF('others != null', `AND c.id IN ${each('others', '#{item}')}`),
    );
  });

  it('Q-86 una selección que acaba al principio de una línea no la incluye', () => {
    const doc = 'SELECT 1 WHERE 1 = 1\nAND a = #{a}\nAND b = #{b}';
    expect(run(doc, 21, 34)).toBe('SELECT 1 WHERE 1 = 1\n' + IF('a != null', 'AND a = #{a}') + '\nAND b = #{b}');
  });

  it('Q-86 el botón de la barra aplica la misma conversión', async () => {
    const { insertSnippet } = await import('./snippets');
    const state = EditorState.create({ doc: 'SELECT 1 WHERE 1 = 1\nAND a = #{a}', selection: { anchor: 25 } });
    expect(state.update(insertSnippet(state, 'optional')).state.doc.toString()).toBe('SELECT 1 WHERE 1 = 1\n' + IF('a != null', 'AND a = #{a}'));
    const plain = EditorState.create({ doc: 'SELECT 1' });
    expect(plain.update(insertSnippet(plain, 'optional')).state.doc.toString()).toBe('SELECT 1');
  });

  it('Q-86 Ctrl+Mayús+F lo aplica en el editor', async () => {
    const { EditorView, keymap, runScopeHandlers } = await import('@codemirror/view');
    const { makeOptionalCommand } = await import('../editor/NoteEditor');
    const view = new EditorView({
      state: EditorState.create({
        doc: 'SELECT 1 WHERE 1 = 1\nAND a = #{a}',
        selection: { anchor: 25 },
        extensions: [keymap.of([{ key: 'Shift-Mod-f', run: makeOptionalCommand }])],
      }),
    });
    const event = new KeyboardEvent('keydown', { key: 'F', code: 'KeyF', keyCode: 70, ctrlKey: true, shiftKey: true });
    expect(runScopeHandlers(view, event, 'editor')).toBe(true);
    expect(view.state.doc.toString()).toContain('<if test="a != null">');
    view.destroy();
  });

  it('Q-86 se deshace en un solo paso', async () => {
    const { undo, history } = await import('@codemirror/commands');
    let state = EditorState.create({ doc: 'SELECT 1 WHERE 1 = 1\nAND a = #{a}', extensions: [history()], selection: { anchor: 25 } });
    state = state.update(makeOptional(state)!).state;
    undo({ state, dispatch: (tr) => (state = tr.state) });
    expect(state.doc.toString()).toBe('SELECT 1 WHERE 1 = 1\nAND a = #{a}');
  });
});

describe('Q-87 <where> automático', () => {
  it('Q-87 añade <where> si la sentencia no tiene WHERE', () => {
    const doc = 'SELECT * FROM t\nAND a = #{a}\nAND b = #{b,int}';
    expect(run(doc, 16, doc.length)).toBe(
      'SELECT * FROM t\n<where>\n' + IF('a != null', 'AND a = #{a}', '  ') + '\n' + IF('b != null', 'AND b = #{b,int}', '  ') + '\n</where>',
    );
  });

  it('Q-87 el <where> abarca solo de la primera a la última línea convertida', () => {
    const doc = 'SELECT * FROM t\nAND a = #{a}\n-- nota\nAND b = #{b}\nORDER BY id';
    expect(run(doc, 0, doc.length)).toBe(
      'SELECT * FROM t\n<where>\n' + IF('a != null', 'AND a = #{a}', '  ') + '\n  -- nota\n' + IF('b != null', 'AND b = #{b}', '  ') + '\n</where>\nORDER BY id',
    );
  });

  it('Q-87 no añade <where> si ya hay <where>, <set>, <trim>, WHERE o SET', () => {
    for (const head of ['SELECT * FROM t <where> </where>', 'UPDATE t SET x = 1', 'SELECT 1 FROM t\nwhere 1 = 1', 'SELECT 1 <trim prefix="WHERE"></trim>']) {
      const doc = `${head}\nAND a = #{a}`;
      expect(run(doc, doc.length)).not.toContain('<where>\n');
    }
  });

  it('Q-87 los comentarios no cuentan', () => {
    const doc = 'SELECT * FROM t <!-- sin WHERE -->\nAND a = #{a}';
    expect(run(doc, doc.length)).toContain('<where>\n');
  });

  it('Q-87 en una nota XML mira solo la sentencia que rodea las líneas', () => {
    const doc = [
      '<mapper namespace="demo">',
      '  <select id="one">SELECT * FROM t WHERE 1 = 1</select>',
      '  <select id="two">',
      '    SELECT * FROM t',
      '    AND a = #{a}',
      '  </select>',
      '</mapper>',
    ].join('\n');
    const at = doc.indexOf('AND a');
    expect(run(doc, at)).toContain('    SELECT * FROM t\n    <where>\n      <if test="a != null">\n        AND a = #{a}\n      </if>\n    </where>\n  </select>');
  });
});
