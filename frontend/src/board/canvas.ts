import { useUi } from '../stores/uiStore';
import { pngFileName, type Pixels } from './engine';

/** Ayudas de la pizarra que necesitan el DOM: contexto, imágenes, PNG, portapapeles y descarga (ADR-0029). */

/** Contexto 2D para leer píxeles a menudo; null donde no hay canvas (jsdom en las pruebas). */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    return null;
  }
}

/** Los píxeles como ImageData, sin copiarlos. */
export function toImageData(px: Pixels): ImageData {
  return new ImageData(px.data, px.width, px.height);
}

/** B-30: la imagen ya decodificada, para dibujarla en el lienzo. */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** ADR-0029: el PNG se codifica fuera del hilo principal para no bloquear la interfaz con lienzos grandes. */
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo codificar la pizarra'))), 'image/png'),
  );
}

export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(blob);
  });
}

/** El contenido de una pizarra (B-30) como fichero PNG. */
export function dataUrlBlob(url: string): Blob {
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

/**
 * B-04, B-16: copia un PNG al portapapeles. El ClipboardItem recibe la promesa para no perder el permiso del clic
 * mientras se codifica.
 */
export async function copyImage(png: Promise<Blob>, done = 'Imagen copiada'): Promise<void> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    useUi.getState().notify(done);
  } catch {
    useUi.getState().notify('No se pudo copiar la imagen al portapapeles', 'error');
  }
}

/** B-04: descarga el PNG con el título de la pizarra como nombre. */
export function downloadImage(png: Blob, title: string): void {
  const url = URL.createObjectURL(png);
  const a = document.createElement('a');
  a.href = url;
  a.download = pngFileName(title);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
