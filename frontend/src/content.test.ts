import { hasFilters, NO_FILTERS, searchParams, sinceFor, splitMarked } from './search';
import { attachmentIds, imageProblem, linkCandidates, noteLink } from './markdown/links';
import { renderMarkdown } from './markdown/render';
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
    const all = new URLSearchParams(searchParams('', { type: 'sql', tags: ['demo', 'libros'], favorite: true, since: '7d' }, now));
    expect(all.get('type')).toBe('sql');
    expect(all.get('tags')).toBe('demo,libros');
    expect(all.get('favorite')).toBe('true');
    expect(new Date(all.get('since')!).getDate()).toBe(new Date(2026, 8, 27).getDate());
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, favorite: true })).toBe(true);
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
