import { acceptsChildren, isGenerated, mapperTokens, writeMark } from './mapper';
import { mybatisClass } from './editor/mybatis';

describe('M-41 M-42 resaltado del mapper', () => {
  it('reconoce declaración, DOCTYPE, etiquetas del mapper, tokens y comentarios', () => {
    const text =
      '<?xml version="1.0"?>\n<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "x.dtd">\n<mapper namespace="demo">' +
      '<sql id="c">b.id</sql><select id="s">SELECT <include refid="c"/> WHERE a = #{a,int} AND ${col} = 1<!-- n --></select></mapper>';
    const tokens = mapperTokens(text, mybatisClass);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    const marked = tokens.filter((t) => t.className).map((t) => [t.text, t.className]);
    expect(marked).toEqual([
      ['<?xml version="1.0"?>', 'cm-mb-tag'],
      ['<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "x.dtd">', 'cm-mb-tag'],
      ['<mapper namespace="demo">', 'cm-mb-tag'],
      ['<sql id="c">', 'cm-mb-tag'],
      ['</sql>', 'cm-mb-tag'],
      ['<select id="s">', 'cm-mb-tag'],
      ['<include refid="c"/>', 'cm-mb-tag'],
      ['#{a,int}', 'cm-mb-param'],
      ['${col}', 'cm-mb-textual'],
      ['<!-- n -->', 'cm-mb-comment'],
      ['</select>', 'cm-mb-tag'],
      ['</mapper>', 'cm-mb-tag'],
    ]);
  });

  it('un «<» escapado o una comparación no son etiquetas', () => {
    const marked = mapperTokens('a &lt; 3 AND b >= 2 AND c < d', mybatisClass).filter((t) => t.className);
    expect(marked).toEqual([]);
  });
});

describe('M-20 M-22 M-24 hijas generadas', () => {
  it('distingue hijas, notas que admiten hijas y sentencias de escritura', () => {
    expect(isGenerated({ statementId: 'byAuthor' })).toBe(true);
    expect(isGenerated({ statementId: null })).toBe(false);
    expect(isGenerated({})).toBe(false);
    expect(acceptsChildren({ type: 'md', statementId: null })).toBe(true);
    expect(acceptsChildren({ type: 'xml', statementId: null })).toBe(false);
    expect(acceptsChildren({ type: 'sql', statementId: 'x' })).toBe(false);
    expect(writeMark('select')).toBeNull();
    expect(writeMark('delete')).toBe('DELETE');
    expect(writeMark(null)).toBeNull();
  });
});
