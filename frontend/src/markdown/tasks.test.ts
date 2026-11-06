import { toggleTask } from './tasks';

describe('toggleTask', () => {
  it('N-31 marca y desmarca la casilla de la línea indicada', () => {
    const md = '# Hoy\n\n- [ ] uno\n- [x] dos\n- [X] tres';
    expect(toggleTask(md, 2)).toBe('# Hoy\n\n- [x] uno\n- [x] dos\n- [X] tres');
    expect(toggleTask(md, 3)).toBe('# Hoy\n\n- [ ] uno\n- [ ] dos\n- [X] tres');
    expect(toggleTask(md, 4)).toBe('# Hoy\n\n- [ ] uno\n- [x] dos\n- [ ] tres');
  });

  it('N-31 listas anidadas, numeradas, con otros marcadores y dentro de citas', () => {
    expect(toggleTask('- a\n  - [ ] b', 1)).toBe('- a\n  - [x] b');
    expect(toggleTask('1. [ ] a\n2) [x] b', 0)).toBe('1. [x] a\n2) [x] b');
    expect(toggleTask('1. [ ] a\n2) [x] b', 1)).toBe('1. [ ] a\n2) [ ] b');
    expect(toggleTask('* [ ] a\n+ [ ] b', 1)).toBe('* [ ] a\n+ [x] b');
    expect(toggleTask('> - [ ] citada', 0)).toBe('> - [x] citada');
  });

  it('N-31 conserva los finales de línea de Windows y el resto del texto', () => {
    expect(toggleTask('- [ ] a [ ] b\r\n- [ ] c\r\n', 0)).toBe('- [x] a [ ] b\r\n- [ ] c\r\n');
  });

  it('N-31 una línea que ya no es una tarea no cambia', () => {
    const md = '- normal\n- [ ] tarea\n[ ] suelta';
    expect(toggleTask(md, 0)).toBe(md);
    expect(toggleTask(md, 2)).toBe(md);
    expect(toggleTask(md, 9)).toBe(md);
  });
});
