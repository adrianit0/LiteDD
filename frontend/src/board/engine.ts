/**
 * Lógica de la pizarra que no necesita el DOM (ADR-0029): límites del lienzo, relleno, recortes de píxeles y pila
 * de deshacer. Los píxeles van como en ImageData: RGBA, fila a fila.
 */

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** B-03 */
export const DEFAULT_SIZE: Size = { width: 1200, height: 800 };
/** B-22 */
export const MIN_SIDE = 50;
export const MAX_SIDE = 4096;
/** B-18 */
export const UNDO_STEPS = 50;
/** B-13 */
export const MIN_STROKE = 1;
export const MAX_STROKE = 40;
/** B-14 */
export const FONT_SIZES = [12, 16, 20, 24, 32, 40, 56, 72];
export const LINE_HEIGHT = 1.25;
/** B-12, propuesta B: fondo blanco y opaco. */
export const BACKGROUND = '#ffffff';
/** B-15: diferencia máxima por canal que aún cuenta como el mismo color; absorbe el suavizado de los bordes. */
export const FILL_TOLERANCE = 48;

/** B-13: paleta fija de 12 colores. */
export const PALETTE: { name: string; value: string }[] = [
  { name: 'Negro', value: '#000000' },
  { name: 'Gris', value: '#808080' },
  { name: 'Blanco', value: '#ffffff' },
  { name: 'Rojo', value: '#e53935' },
  { name: 'Naranja', value: '#fb8c00' },
  { name: 'Amarillo', value: '#fdd835' },
  { name: 'Verde', value: '#43a047' },
  { name: 'Cian', value: '#00acc1' },
  { name: 'Azul', value: '#1e88e5' },
  { name: 'Violeta', value: '#8e24aa' },
  { name: 'Rosa', value: '#d81b60' },
  { name: 'Marrón', value: '#6d4c41' },
];

/** B-22: un lado del lienzo dentro de los límites. */
export function clampSide(n: number): number {
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(n)));
}

export type Edge = 'right' | 'bottom' | 'corner';

/** B-20: tamaño nuevo al arrastrar un borde o la esquina dx, dy píxeles. */
export function resizeBy(start: Size, edge: Edge, dx: number, dy: number): Size {
  return {
    width: edge === 'bottom' ? start.width : clampSide(start.width + dx),
    height: edge === 'right' ? start.height : clampSide(start.height + dy),
  };
}

/** B-17: tamaño de una imagen pegada, reducido de forma proporcional si supera el máximo. */
export function fitImage(image: Size, max = MAX_SIDE): Size {
  const k = Math.min(1, max / image.width, max / image.height);
  return { width: Math.max(1, Math.round(image.width * k)), height: Math.max(1, Math.round(image.height * k)) };
}

/**
 * B-17: dónde queda una imagen pegada en el punto pedido y qué tamaño necesita el lienzo para contenerla. El
 * punto retrocede si la imagen no cabe sin pasar del máximo.
 */
export function pastePlacement(canvas: Size, image: Size, at: { x: number; y: number }): { x: number; y: number; canvas: Size } {
  const x = Math.max(0, Math.min(Math.round(at.x), MAX_SIDE - image.width));
  const y = Math.max(0, Math.min(Math.round(at.y), MAX_SIDE - image.height));
  return {
    x,
    y,
    canvas: { width: Math.max(canvas.width, x + image.width), height: Math.max(canvas.height, y + image.height) },
  };
}

/** Rectángulo entre dos puntos, en cualquier orden. */
export function rectBetween(x1: number, y1: number, x2: number, y2: number): Rect {
  const x = Math.round(Math.min(x1, x2));
  const y = Math.round(Math.min(y1, y2));
  return { x, y, width: Math.round(Math.max(x1, x2)) - x, height: Math.round(Math.max(y1, y2)) - y };
}

/** La parte del rectángulo que cae dentro del lienzo, o null si no queda nada. */
export function clipRect(r: Rect, size: Size): Rect | null {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const right = Math.min(size.width, Math.ceil(r.x + r.width));
  const bottom = Math.min(size.height, Math.ceil(r.y + r.height));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
}

/** B-11, B-12: rectángulo que cubre un trazo de ese grosor, con sus extremos redondeados. */
export function strokeBounds(points: { x: number; y: number }[], width: number): Rect {
  const half = width / 2 + 1;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return rectBetween(Math.min(...xs) - half, Math.min(...ys) - half, Math.max(...xs) + half, Math.max(...ys) + half);
}

/** Copia de los píxeles de un rectángulo, que debe caer dentro de la imagen. */
export function crop(px: Pixels, r: Rect): Pixels {
  const data = new Uint8ClampedArray(r.width * r.height * 4);
  for (let row = 0; row < r.height; row++) {
    const start = ((r.y + row) * px.width + r.x) * 4;
    data.set(px.data.subarray(start, start + r.width * 4), row * r.width * 4);
  }
  return { width: r.width, height: r.height, data };
}

/** #rrggbb a RGBA opaco. */
export function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/**
 * B-15: relleno por inundación con los cuatro vecinos de los píxeles cuyo color se parece al del punto pulsado.
 * Cambia los píxeles en su sitio y devuelve el rectángulo cambiado, o null si no cambia nada.
 */
export function floodFill(px: Pixels, x: number, y: number, color: [number, number, number, number], tolerance = FILL_TOLERANCE): Rect | null {
  const { width, height, data } = px;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const start = (y * width + x) * 4;
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  if (target.every((v, i) => v === color[i])) return null;
  const similar = (i: number) =>
    Math.abs(data[i] - target[0]) <= tolerance &&
    Math.abs(data[i + 1] - target[1]) <= tolerance &&
    Math.abs(data[i + 2] - target[2]) <= tolerance &&
    Math.abs(data[i + 3] - target[3]) <= tolerance;
  const seen = new Uint8Array(width * height);
  const stack = [y * width + x];
  let minX = x;
  let maxX = x;
  let minY = y;
  let maxY = y;
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!similar(i)) continue;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
    const px0 = p % width;
    const py0 = (p - px0) / width;
    if (px0 < minX) minX = px0;
    if (px0 > maxX) maxX = px0;
    if (py0 < minY) minY = py0;
    if (py0 > maxY) maxY = py0;
    if (px0 > 0) stack.push(p - 1);
    if (px0 < width - 1) stack.push(p + 1);
    if (py0 > 0) stack.push(p - width);
    if (py0 < height - 1) stack.push(p + width);
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** B-18: pila de deshacer con un máximo de pasos. Un paso nuevo descarta lo que se podía rehacer. */
export class UndoStack<T> {
  private done: T[] = [];
  private undone: T[] = [];

  constructor(private readonly limit = UNDO_STEPS) {}

  push(step: T): void {
    this.done.push(step);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }

  undo(): T | undefined {
    const step = this.done.pop();
    if (step) this.undone.push(step);
    return step;
  }

  redo(): T | undefined {
    const step = this.undone.pop();
    if (step) this.done.push(step);
    return step;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }
}

/** B-04: nombre del fichero descargado: el título sin los caracteres que no admiten los sistemas de ficheros. */
export function pngFileName(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return `${clean || 'pizarra'}.png`;
}

/** B-14: tipografía del texto, la misma que la del cuadro donde se escribe (U-04). */
export function textFont(size: number): string {
  return `${size}px system-ui, -apple-system, 'Segoe UI', Ubuntu, Cantarell, sans-serif`;
}
