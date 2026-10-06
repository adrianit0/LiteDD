import css from './theme.css?raw';

function variable(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match) throw new Error(`Falta --${name}`);
  return match[1].trim();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('U-02 tema oscuro', () => {
  it('define las variables de la especificación', () => {
    for (const name of ['bg', 'surface', 'border', 'text', 'text-muted', 'accent', 'error', 'warning']) {
      expect(variable(name)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each([
    ['text', 'bg'],
    ['text', 'surface'],
    ['text', 'surface-raised'],
    ['text', 'selection'],
    ['text-muted', 'bg'],
    ['text-muted', 'surface'],
    ['text-muted', 'surface-raised'],
    ['accent', 'bg'],
    ['link', 'bg'],
    ['code', 'bg'],
    ['code', 'surface'],
    ['green', 'bg'],
    ['green', 'surface'],
    ['green', 'selection'],
    ['error', 'bg'],
    ['error', 'surface'],
    ['warning', 'bg'],
    ['accent-text', 'accent'],
  ])('--%s sobre --%s tiene contraste AA (4,5:1)', (fg, bg) => {
    expect(contrast(variable(fg), variable(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('U-04 tipografías', () => {
  it('sistema para la interfaz y monoespaciada para editores y SQL', () => {
    expect(variable('font-ui')).toContain('system-ui');
    expect(variable('font-mono')).toContain('monospace');
    expect(css).toMatch(/\.sql-source\s*{[^}]*var\(--font-mono\)/);
  });
});

describe('U-08 foco visible', () => {
  it('hay un estilo :focus-visible global', () => {
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*2px solid/);
  });
});
