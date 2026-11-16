import { hasFilters, NO_FILTERS, searchParams, sinceFor, splitMarked } from './search';
import { attachmentIds, imageProblem, linkCandidates, noteLink } from './markdown/links';
import { renderMarkdown } from './markdown/render';
import { dateInDays, formatDay, importantLabel, isImportant, localDate } from './important';
import type { TreeNode } from './types';

const node = (id: string, title: string): TreeNode => ({ id, parentId: null, position: 0, type: 'md', title, description: '', favorite: false, tags: [] });

function dom(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('búsqueda', () => {
  const now = new Date(2026, 9, 4, 15, 30);

  it('N-72 filtros combinables en la petición', () => {
    expect(searchParams('  préstamo ', NO_FILTERS, now)).toBe('q=pr%C3%A9stamo');
    const all = new URLSearchParams(searchParams('', { type: 'sql', tags: ['demo', 'libros'], favorite: true, since: '7d', important: false, obsolete: false }, now));
    expect(all.get('type')).toBe('sql');
    expect(all.get('tags')).toBe('demo,libros');
    expect(all.get('favorite')).toBe('true');
    expect(new Date(all.get('since')!).getDate()).toBe(new Date(2026, 8, 27).getDate());
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, favorite: true })).toBe(true);
  });

  it('N-84 «Mostrar obsoletas» va en la petición y por sí solo no activa la búsqueda', () => {
    expect(searchParams('x', NO_FILTERS, now)).toBe('q=x');
    expect(searchParams('x', { ...NO_FILTERS, obsolete: true }, now)).toBe('q=x&obsolete=true');
    expect(hasFilters({ ...NO_FILTERS, obsolete: true })).toBe(false);
  });

  it('N-84 el autocompletado de notas no ofrece las obsoletas', () => {
    const nodes = [node('a', 'Informe'), { ...node('b', 'Informe viejo'), obsolete: true }];
    expect(linkCandidates(nodes, 'inf').map((n) => n.id)).toEqual(['a']);
  });

  it('N-72 «hoy» empieza a medianoche local', () => {
    const today = new Date(sinceFor('today', now)!);
    expect([today.getHours(), today.getMinutes(), today.getDate()]).toEqual([0, 0, 4]);
    expect(sinceFor('', now)).toBeNull();
  });

  it('N-71 el fragmento resaltado se trocea sin interpretar HTML', () => {
    expect(splitMarked('la \u0002tabla\u0003 <b>x</b>')).toEqual([
      { text: 'la ', mark: false },
      { text: 'tabla', mark: true },
      { text: ' <b>x</b>', mark: false },
    ]);
  });
});

describe('enlaces e imágenes', () => {
  it('N-90 el enlace a nota escapa los corchetes del título', () => {
    expect(noteLink({ id: 'a1', title: 'Guía [v2]' })).toBe('[Guía \\[v2\\]](litedd://note/a1)');
    const el = dom(renderMarkdown(noteLink({ id: 'a1', title: 'Guía [v2]' })));
    expect(el.querySelector('a')!.textContent).toBe('Guía [v2]');
  });

  it('N-90 candidatos sin distinguir acentos, primero los que empiezan por lo escrito', () => {
    const nodes = [node('1', 'Mis préstamos'), node('2', 'Préstamos'), node('3', 'Autores')];
    expect(linkCandidates(nodes, 'prest').map((n) => n.id)).toEqual(['2', '1']);
    expect(linkCandidates(nodes, '')).toHaveLength(3);
  });

  it('N-91 un enlace a una nota inexistente se marca como roto', () => {
    const el = dom(renderMarkdown('[ok](litedd://note/a) [roto](litedd://note/b)', { noteExists: (id) => id === 'a' }));
    const [ok, broken] = [...el.querySelectorAll('a')];
    expect(ok.className).not.toContain('broken');
    expect(broken.className).toContain('broken');
  });

  it('N-92 N-93 las imágenes adjuntas se resuelven antes de sanear, como URL data:', () => {
    const id = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
    const src = `![](litedd://attachment/${id})`;
    expect(attachmentIds(`${src} y ${src}`)).toEqual([id]);
    const pending = dom(renderMarkdown(src)).querySelector('img')!;
    expect(pending.dataset.attachmentId).toBe(id);
    const loaded = dom(renderMarkdown(src, { attachmentUrl: () => 'data:image/png;base64,AAAA' })).querySelector('img')!;
    expect(loaded.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('N-92 tipos y tamaño de imagen', () => {
    expect(imageProblem({ type: 'image/png', size: 100 })).toBeNull();
    expect(imageProblem({ type: 'image/svg+xml', size: 100 })).toContain('PNG');
    expect(imageProblem({ type: 'image/webp', size: 10 * 1024 * 1024 + 1 })).toContain('10 MB');
  });

  it('N-30 S-15 un bloque mermaid queda como texto escapado para dibujarlo después', () => {
    const el = dom(renderMarkdown('```mermaid\ngraph TD; A-->B; C["<img src=x onerror=alert(1)>"]\n```'));
    const block = el.querySelector('.mermaid-block .mermaid-source')!;
    expect(block.textContent).toContain('A-->B');
    expect(el.querySelector('img')).toBeNull();
  });
});

describe('notas importantes (ADR-0047)', () => {
  const lateToday = new Date(2026, 9, 4, 23, 59);

  it('N-97 la nota es importante hasta el final del día de su fecha y al siguiente deja de serlo', () => {
    expect(isImportant({ importantUntil: '2026-10-04' }, lateToday)).toBe(true);
    expect(isImportant({ importantUntil: '2026-10-11' }, lateToday)).toBe(true);
    expect(isImportant({ importantUntil: '2026-10-04' }, new Date(2026, 9, 5, 0, 0))).toBe(false);
    expect(isImportant({ importantUntil: null }, lateToday)).toBe(false);
    expect(isImportant({}, lateToday)).toBe(false);
  });

  it('N-89 los días son locales y los atajos cuentan desde hoy', () => {
    expect(localDate(lateToday)).toBe('2026-10-04');
    expect(dateInDays(0, lateToday)).toBe('2026-10-04');
    expect(dateInDays(1, lateToday)).toBe('2026-10-05');
    expect(dateInDays(7, new Date(2026, 9, 28, 9, 0))).toBe('2026-11-04');
  });

  it('N-98 el resalte dice hasta cuándo, y nada si la fecha ya pasó', () => {
    expect(formatDay('2026-10-04')).toBe('04/10/2026');
    expect(importantLabel({ importantUntil: '2026-10-11' }, lateToday)).toBe('Importante hasta el 11/10/2026');
    expect(importantLabel({ importantUntil: '2026-10-03' }, lateToday)).toBeNull();
  });

  it('N-99 «Solo importantes» es un filtro y envía el día local de hoy', () => {
    expect(searchParams('', { ...NO_FILTERS, important: true }, lateToday)).toBe('important=2026-10-04');
    expect(searchParams('x', { ...NO_FILTERS, important: true, favorite: true }, lateToday)).toBe('q=x&favorite=true&important=2026-10-04');
    expect(hasFilters({ ...NO_FILTERS, important: true })).toBe(true);
  });
});
