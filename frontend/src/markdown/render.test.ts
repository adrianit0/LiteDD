import { renderMarkdown } from './render';

function dom(markdown: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(markdown);
  return div;
}

describe('renderMarkdown', () => {
  it('N-30 GFM: tablas, tachado y autoenlaces', () => {
    const el = dom('| a | b |\n| :-: | --- |\n| 1 | 2 |\n\n~~fuera~~ https://example.org');
    expect(el.querySelectorAll('table td')).toHaveLength(2);
    expect(el.querySelector('th')!.className).toBe('align-center');
    expect(el.querySelector('s')!.textContent).toBe('fuera');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('https://example.org');
  });

  it('N-30 resalta los bloques de código', () => {
    const el = dom('```sql\nSELECT id FROM book\n```');
    expect(el.querySelector('pre.hljs .hljs-keyword')!.textContent).toBe('SELECT');
  });

  it('N-30 un bloque sin lenguaje conocido se escapa', () => {
    const el = dom('```\n<b>no</b>\n```');
    expect(el.querySelector('pre code')!.textContent).toBe('<b>no</b>\n');
    expect(el.querySelector('pre b')).toBeNull();
  });

  it('N-30 N-31 listas de tareas con casillas de solo lectura', () => {
    const el = dom('- [ ] pendiente\n- [x] hecha\n- normal');
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect([...boxes].every((b) => b.disabled)).toBe(true);
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    expect(el.querySelectorAll('li.task-list-item')).toHaveLength(2);
    expect(el.textContent).toContain('pendiente');
    expect(el.textContent).not.toContain('[ ]');
  });

  it('N-33 una tabla copiada de un resultado SQL se ve como tabla', () => {
    // Formato de Q-66: barras escapadas, saltos como <br> y nulos como NULL.
    const el = dom('| id | title |\n| --- | --- |\n| 1 | a \\| b |\n| 2 | uno<br>dos |\n| 3 | NULL |');
    const cells = [...el.querySelectorAll('td')].map((td) => td.innerHTML);
    expect(cells).toEqual(['1', 'a | b', '2', 'uno<br>dos', '3', 'NULL']);
  });

  it('N-32 N-93 los enlaces a notas se resuelven antes de sanear', () => {
    const el = dom('[Libros](litedd://note/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90)');
    const a = el.querySelector('a')!;
    expect(a.dataset.noteId).toBe('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90');
    expect(a.getAttribute('href')).toBe('#');
  });

  it('S-15 elimina scripts, manejadores y javascript:', () => {
    const el = dom('<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>\n\n[y](javascript:alert(1))');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img')!.getAttribute('onerror')).toBeNull();
    el.querySelectorAll('a').forEach((a) => expect(a.getAttribute('href') ?? '').not.toContain('javascript'));
  });

  it('S-14 no genera atributos style', () => {
    expect(renderMarkdown('| a |\n| --: |\n| 1 |')).not.toContain('style=');
  });
});
