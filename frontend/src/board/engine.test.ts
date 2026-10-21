import {
  clampSide,
  clipRect,
  crop,
  DEFAULT_SIZE,
  fitImage,
  floodFill,
  hexToRgba,
  MAX_SIDE,
  MIN_SIDE,
  PALETTE,
  pastePlacement,
  pngFileName,
  rectBetween,
  resizeBy,
  strokeBounds,
  UNDO_STEPS,
  UndoStack,
  type Pixels,
} from './engine';

/** Imagen de prueba: cada píxel con el color que da paint(x, y). */
function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const BLACK: [number, number, number, number] = [0, 0, 0, 255];
const RED: [number, number, number, number] = [229, 57, 53, 255];

function at(px: Pixels, x: number, y: number): number[] {
  const i = (y * px.width + x) * 4;
  return [...px.data.subarray(i, i + 4)];
}

describe('B-03, B-22 lienzo', () => {
  it('B-03 una pizarra nueva mide 1200 × 800', () => {
    expect(DEFAULT_SIZE).toEqual({ width: 1200, height: 800 });
  });

  it('B-22 los lados quedan entre 50 y 4096 píxeles', () => {
    expect(clampSide(10)).toBe(MIN_SIDE);
    expect(clampSide(5000)).toBe(MAX_SIDE);
    expect(clampSide(640.6)).toBe(641);
  });

  it('B-20 cada borde cambia solo su lado y la esquina los dos, dentro de los límites', () => {
    const start = { width: 1200, height: 800 };
    expect(resizeBy(start, 'right', 100, 300)).toEqual({ width: 1300, height: 800 });
    expect(resizeBy(start, 'bottom', 100, -300)).toEqual({ width: 1200, height: 500 });
    expect(resizeBy(start, 'corner', -2000, 9000)).toEqual({ width: MIN_SIDE, height: MAX_SIDE });
  });
});

describe('B-17 pegar', () => {
  it('una imagen que cabe conserva su tamaño; una mayor que el máximo se reduce en proporción', () => {
    expect(fitImage({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(fitImage({ width: 5120, height: 1440 })).toEqual({ width: 4096, height: 1152 });
  });

  it('el lienzo crece hasta contener la imagen pegada', () => {
    const placement = pastePlacement({ width: 1200, height: 800 }, { width: 1920, height: 1080 }, { x: 100, y: 50 });
    expect(placement).toEqual({ x: 100, y: 50, canvas: { width: 2020, height: 1130 } });
  });

  it('el lienzo no crece si la imagen ya cabe', () => {
    expect(pastePlacement({ width: 1200, height: 800 }, { width: 200, height: 100 }, { x: 0, y: 0 }).canvas).toEqual({
      width: 1200,
      height: 800,
    });
  });

  it('cerca del máximo, la imagen retrocede para no pasar de 4096', () => {
    const placement = pastePlacement({ width: 4000, height: 800 }, { width: 3000, height: 100 }, { x: 2000, y: 0 });
    expect(placement.x).toBe(MAX_SIDE - 3000);
    expect(placement.canvas.width).toBe(MAX_SIDE);
  });
});

describe('B-15 cubo de relleno', () => {
  it('rellena la zona cerrada y se detiene en el borde', () => {
    // Un marco negro de 1 píxel alrededor de un interior blanco de 3 × 3, dentro de un lienzo blanco de 7 × 7.
    const px = image(7, 7, (x, y) => ((x === 1 || x === 5) && y >= 1 && y <= 5) || ((y === 1 || y === 5) && x >= 1 && x <= 5) ? BLACK : WHITE);
    const changed = floodFill(px, 3, 3, RED);
    expect(changed).toEqual({ x: 2, y: 2, width: 3, height: 3 });
    expect(at(px, 3, 3)).toEqual(RED);
    expect(at(px, 2, 4)).toEqual(RED);
    expect(at(px, 1, 1)).toEqual(BLACK);
    expect(at(px, 0, 0)).toEqual(WHITE);
  });

  it('absorbe el suavizado: un gris casi blanco cuenta como blanco, uno oscuro no', () => {
    const px = image(3, 1, (x) => (x === 1 ? [240, 240, 240, 255] : x === 2 ? [128, 128, 128, 255] : WHITE));
    floodFill(px, 0, 0, RED);
    expect(at(px, 1, 0)).toEqual(RED);
    expect(at(px, 2, 0)).toEqual([128, 128, 128, 255]);
  });

  it('no cambia nada si el color ya es el elegido o el punto está fuera', () => {
    const px = image(2, 2, () => RED);
    expect(floodFill(px, 0, 0, RED)).toBeNull();
    expect(floodFill(px, 5, 0, BLACK)).toBeNull();
  });

  it('termina aunque el color nuevo se parezca al de la zona', () => {
    const px = image(50, 50, () => WHITE);
    expect(floodFill(px, 10, 10, [250, 250, 250, 255])).toEqual({ x: 0, y: 0, width: 50, height: 50 });
  });
});

describe('B-16, B-18 recortes y deshacer', () => {
  it('crop copia los píxeles de un rectángulo', () => {
    const px = image(4, 3, (x, y) => [x, y, 0, 255]);
    const part = crop(px, { x: 1, y: 1, width: 2, height: 2 });
    expect(part.width).toBe(2);
    expect(at(part, 0, 0)).toEqual([1, 1, 0, 255]);
    expect(at(part, 1, 1)).toEqual([2, 2, 0, 255]);
  });

  it('clipRect recorta al lienzo y descarta lo que queda fuera', () => {
    const size = { width: 100, height: 50 };
    expect(clipRect({ x: -10, y: 40, width: 30, height: 30 }, size)).toEqual({ x: 0, y: 40, width: 20, height: 10 });
    expect(clipRect({ x: 120, y: 0, width: 10, height: 10 }, size)).toBeNull();
  });

  it('rectBetween ordena las esquinas y strokeBounds cubre el grosor', () => {
    expect(rectBetween(10, 20, 2, 5)).toEqual({ x: 2, y: 5, width: 8, height: 15 });
    expect(strokeBounds([{ x: 10, y: 10 }, { x: 20, y: 15 }], 4)).toEqual({ x: 7, y: 7, width: 16, height: 11 });
  });

  it('B-18 deshace y rehace en orden; un paso nuevo descarta lo que se podía rehacer', () => {
    const stack = new UndoStack<number>();
    expect(stack.canUndo).toBe(false);
    stack.push(1);
    stack.push(2);
    expect(stack.undo()).toBe(2);
    expect(stack.canRedo).toBe(true);
    expect(stack.redo()).toBe(2);
    expect(stack.undo()).toBe(2);
    stack.push(3);
    expect(stack.canRedo).toBe(false);
    expect(stack.undo()).toBe(3);
    expect(stack.undo()).toBe(1);
    expect(stack.undo()).toBeUndefined();
  });

  it(`B-18 guarda como mucho ${UNDO_STEPS} pasos`, () => {
    const stack = new UndoStack<number>();
    for (let i = 1; i <= UNDO_STEPS + 5; i++) stack.push(i);
    let count = 0;
    while (stack.undo() !== undefined) count++;
    expect(count).toBe(UNDO_STEPS);
  });
});

describe('B-04, B-13 colores y nombre del fichero', () => {
  it('B-13 la paleta tiene 12 colores distintos', () => {
    expect(PALETTE).toHaveLength(12);
    expect(new Set(PALETTE.map((c) => c.value)).size).toBe(12);
    expect(hexToRgba('#e53935')).toEqual(RED);
  });

  it('B-04 el PNG se llama como la pizarra, sin caracteres no válidos', () => {
    expect(pngFileName('Esquema de préstamos')).toBe('Esquema de préstamos.png');
    expect(pngFileName('Flujo 2026/10: «v2»?')).toBe('Flujo 2026 10 «v2».png');
    expect(pngFileName('  ...  ')).toBe('pizarra.png');
  });
});
