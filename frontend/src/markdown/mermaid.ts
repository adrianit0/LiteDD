import DOMPurify from 'dompurify';

/**
 * N-30, S-15, ADR-0016: diagramas Mermaid con carga diferida y securityLevel 'strict'. El SVG se
 * sanea y se muestra en un shadow root: su <style> pasa a una hoja de estilo construida y los
 * atributos style se aplican por CSSOM, que la CSP permite.
 */
type Mermaid = typeof import('mermaid').default;

let loader: Promise<Mermaid> | null = null;
let counter = 0;

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

/** Separa el SVG en estilos y nodos, sin aplicar todavía ningún estilo en línea. */
export function prepareSvg(svg: string): { css: string; root: SVGElement; inline: [Element, string][] } | null {
  const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['style'] });
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null;
  let css = '';
  root.querySelectorAll('style').forEach((s) => {
    css += `${s.textContent ?? ''}\n`;
    s.remove();
  });
  const inline: [Element, string][] = [];
  [root, ...root.querySelectorAll('[style]')].forEach((el) => {
    const style = el.getAttribute('style');
    if (style) {
      inline.push([el, style]);
      el.removeAttribute('style');
    }
  });
  return { css, root: root as unknown as SVGElement, inline };
}

/** Dibuja cada bloque .mermaid-block dentro de container. */
export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const blocks = [...container.querySelectorAll<HTMLElement>('.mermaid-block')].filter((b) => !b.dataset.rendered);
  if (blocks.length === 0) return;
  const m = await mermaid();
  for (const block of blocks) {
    block.dataset.rendered = 'true';
    const source = block.querySelector('.mermaid-source')?.textContent ?? '';
    try {
      const { svg } = await m.render(`litedd-mermaid-${++counter}`, source);
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
    } finally {
      // Mermaid deja a veces su contenedor temporal en el documento.
      document.getElementById(`dlitedd-mermaid-${counter}`)?.remove();
    }
  }
}
