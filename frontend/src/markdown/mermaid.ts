import DOMPurify from 'dompurify';

/**
 * N-30, S-15, ADR-0016: diagramas Mermaid con carga diferida y securityLevel 'strict'. El SVG se
 * sanea y se muestra en un shadow root: su <style> pasa a una hoja de estilo construida y los
 * atributos style se aplican por CSSOM, que la CSP permite.
 */
type Mermaid = typeof import('mermaid').default;

let loader: Promise<Mermaid> | null = null;
let counter = 0;
/** Mermaid no admite renderizados simultáneos: se hacen de uno en uno. */
let queue: Promise<unknown> = Promise.resolve();
/** SVG ya generado por texto del diagrama, para no repetir el trabajo al volver a pintar la nota. */
const cache = new Map<string, string>();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => {});
  return run;
}

async function svgFor(source: string): Promise<string> {
  const cached = cache.get(source);
  if (cached) return cached;
  return enqueue(async () => {
    const again = cache.get(source);
    if (again) return again;
    const m = await mermaid();
    const id = `litedd-mermaid-${++counter}`;
    try {
      const { svg } = await m.render(id, source);
      cache.set(source, svg);
      return svg;
    } finally {
      // Mermaid deja a veces su contenedor temporal en el documento.
      document.getElementById(`d${id}`)?.remove();
    }
  });
}

function mermaid(): Promise<Mermaid> {
  if (!loader) {
    loader = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      });
      return m.default;
    });
  }
  return loader;
}

const INLINE_STYLE = 'data-litedd-style';

/**
 * Separa el SVG en estilos y nodos. Los estilos salen del texto antes de analizarlo: Chrome aplica
 * la CSP también a los documentos de DOMParser y denunciaría cada atributo style.
 */
export function prepareSvg(svg: string): { css: string; root: SVGElement; inline: [Element, string][] } | null {
  let css = '';
  const text = svg
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_m, body: string) => {
      css += `${body}\n`;
      return '';
    })
    .replace(/\sstyle="([^"]*)"/gi, (_m, value: string) => ` ${INLINE_STYLE}="${value}"`);
  const clean = DOMPurify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_ATTR: [INLINE_STYLE] });
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null;
  const inline: [Element, string][] = [];
  [root, ...root.querySelectorAll(`[${INLINE_STYLE}]`)].forEach((el) => {
    const style = el.getAttribute(INLINE_STYLE);
    if (style !== null) {
      inline.push([el, style]);
      el.removeAttribute(INLINE_STYLE);
    }
  });
  return { css, root: root as unknown as SVGElement, inline };
}

/** Dibuja cada bloque .mermaid-block dentro de container. */
export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const blocks = [...container.querySelectorAll<HTMLElement>('.mermaid-block')].filter((b) => !b.dataset.rendered);
  for (const block of blocks) {
    block.dataset.rendered = 'true';
    const source = block.querySelector('.mermaid-source')?.textContent ?? '';
    try {
      const svg = await svgFor(source);
      // La vista pudo volver a pintarse mientras tanto.
      if (!block.isConnected) continue;
      const prepared = prepareSvg(svg);
      if (!prepared) throw new Error('SVG no válido');
      const host = document.createElement('div');
      host.className = 'mermaid-diagram';
      const shadow = host.attachShadow({ mode: 'open' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(prepared.css);
      shadow.adoptedStyleSheets = [sheet];
      const imported = document.importNode(prepared.root, true);
      shadow.appendChild(imported);
      // Los atributos style se reaplican por CSSOM sobre los nodos ya importados.
      const originals = [prepared.root, ...prepared.root.querySelectorAll('*')];
      const copies = [imported, ...imported.querySelectorAll('*')];
      for (const [el, style] of prepared.inline) {
        const i = originals.indexOf(el as SVGElement);
        if (i >= 0) (copies[i] as SVGElement).style.cssText = style;
      }
      block.replaceChildren(host);
    } catch (e) {
      const error = document.createElement('p');
      error.className = 'error-text';
      error.textContent = `No se pudo dibujar el diagrama: ${e instanceof Error ? e.message : String(e)}`;
      block.appendChild(error);
    }
  }
}
