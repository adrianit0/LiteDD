import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const STEP = 1.25;

interface View {
  scale: number;
  x: number;
  y: number;
}

const FIT: View = { scale: 1, x: 0, y: 0 };

function clamp(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * N-35: visor de una imagen de la vista Markdown. Parte ajustado a la ventana; la rueda acerca hacia el
 * puntero, arrastrar desplaza y doble clic vuelve al ajuste. El zoom se aplica solo a la imagen.
 */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [view, setView] = useState<View>(FIT);
  const root = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => root.current?.focus(), []);

  /** Cambia la escala manteniendo fijo el punto de pantalla (cx, cy); sin punto, el centro de la imagen. */
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const scale = clamp(v.scale * factor);
      const rect = img.current?.getBoundingClientRect();
      if (!rect || cx === undefined || cy === undefined) return { ...v, scale };
      // Centro de la imagen sin desplazar: el escalado es respecto al centro, que solo mueve la traslación.
      const ox = rect.left + rect.width / 2 - v.x;
      const oy = rect.top + rect.height / 2 - v.y;
      const k = scale / v.scale;
      return { scale, x: cx - ox - k * (cx - ox - v.x), y: cy - oy - k * (cy - oy - v.y) };
    });
  };

  // La rueda necesita un oyente no pasivo para que no desplace la nota de detrás.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === '+' || e.key === '=') {
      zoomAt(STEP);
    } else if (e.key === '-') {
      zoomAt(1 / STEP);
    } else if (e.key === '0') {
      setView(FIT);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: PointerEvent<HTMLImageElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  const endDrag = () => {
    drag.current = null;
  };

  // Porcentaje respecto al tamaño real de la imagen; si aún no se conoce, respecto al ajuste.
  const natural = img.current?.naturalWidth ?? 0;
  const fitted = img.current?.offsetWidth ?? 0;
  const percent = Math.round(view.scale * (natural > 0 && fitted > 0 ? fitted / natural : 1) * 100);

  return createPortal(
    <div
      className="image-viewer"
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Imagen: ${alt}` : 'Imagen'}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="image-viewer-toolbar">
        <span className="image-viewer-zoom" aria-label="Zoom">
          {percent} %
        </span>
        <button type="button" title="Alejar (-)" aria-label="Alejar" onClick={() => zoomAt(1 / STEP)}>
          −
        </button>
        <button type="button" title="Acercar (+)" aria-label="Acercar" onClick={() => zoomAt(STEP)}>
          +
        </button>
        <button type="button" title="Ajustar a la ventana (0)" onClick={() => setView(FIT)}>
          Ajustar
        </button>
        <button type="button" title="Cerrar (Esc)" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <img
        ref={img}
        src={src}
        alt={alt}
        draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setView(FIT)}
        onLoad={() => setView((v) => ({ ...v }))}
      />
    </div>,
    document.body,
  );
}
