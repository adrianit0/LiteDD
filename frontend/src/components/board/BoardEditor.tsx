import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { setFlusher } from '../../stores/tabsStore';
import { useUi } from '../../stores/uiStore';
import {
  BACKGROUND,
  clipRect,
  contains,
  crop,
  DEFAULT_SIZE,
  fitImage,
  floodFill,
  hexToRgba,
  LINE_HEIGHT,
  pastePlacement,
  rectBetween,
  resizeBy,
  strokeBounds,
  textFont,
  union,
  UndoStack,
  type Edge,
  type Rect,
  type Size,
} from '../../board/engine';
import { blobDataUrl, canvasBlob, context2d, copyImage, loadImage, toImageData } from '../../board/canvas';
import { BoardToolbar, type ToolSettings } from './BoardToolbar';
import { ImageActions } from './BoardView';

/** B-18: un paso guarda solo el rectángulo que cambió, antes y después; un cambio de tamaño, el lienzo entero. */
type Step =
  | { kind: 'patch'; x: number; y: number; before: ImageData; after: ImageData }
  | { kind: 'resize'; before: ImageData; after: ImageData };

/** B-16, B-17: selección flotante, levantada del lienzo o pegada, que se mueve hasta fijarla. */
interface Floating {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  /** Lienzo entero antes de levantarla o pegarla, para el paso de deshacer. */
  before: ImageData;
  /** De dónde se levantó; null si se pegó. */
  origin: Rect | null;
}

/** B-14: cuadro de texto abierto, aún sin fijar. */
interface TextBox {
  x: number;
  y: number;
  value: string;
}

interface Point {
  x: number;
  y: number;
}

type Gesture =
  | { kind: 'stroke'; points: Point[]; snapshot: ImageData; color: string; width: number }
  | { kind: 'marquee'; from: Point }
  | { kind: 'move'; offset: Point }
  | { kind: 'resize'; edge: Edge; from: Point; start: Size };

const EDGES: Edge[] = ['right', 'bottom', 'corner'];

/** La herramienta, el color, el grosor y la letra se conservan entre pizarras mientras la aplicación está abierta. */
let lastSettings: ToolSettings = { tool: 'brush', color: '#000000', stroke: 4, fontSize: 20 };

function floatingRect(f: Floating): Rect {
  return { x: f.x, y: f.y, width: f.canvas.width, height: f.canvas.height };
}

function strokeSegment(c: CanvasRenderingContext2D, a: Point, b: Point, color: string, width: number) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
}

/** B-14: rectángulo que ocupa el texto, medido con la tipografía del cuadro. */
function textArea(c: CanvasRenderingContext2D, box: TextBox, size: number): Rect {
  c.font = textFont(size);
  const lines = box.value.split('\n');
  const width = Math.max(...lines.map((line) => c.measureText(line).width));
  return { x: box.x, y: box.y, width: Math.ceil(width) + 2, height: Math.ceil(lines.length * size * LINE_HEIGHT) + 2 };
}

/** B-14: dibuja el texto donde lo muestra el cuadro: cada línea centrada en su altura de línea. */
function drawText(c: CanvasRenderingContext2D, box: TextBox, color: string, size: number) {
  c.font = textFont(size);
  c.fillStyle = color;
  c.textBaseline = 'top';
  const lead = (size * (LINE_HEIGHT - 1)) / 2;
  box.value.split('\n').forEach((line, i) => c.fillText(line, box.x, box.y + lead + i * size * LINE_HEIGHT));
}

interface Props {
  tabId: string;
  title: string;
  content: string;
  initialScroll: number;
  onScroll: (top: number) => void;
  onChange: (content: string) => void;
}

/**
 * B-03, B-10 a B-22, B-30: la pizarra en edición. El lienzo es la fuente de verdad mientras se edita: al terminar
 * cada paso se codifica como PNG y se entrega a la pestaña, que lo guarda como cualquier contenido (ADR-0029).
 */
export function BoardEditor({ tabId, title, content, initialScroll, onScroll, onChange }: Props) {
  const [settings, setSettings] = useState<ToolSettings>(lastSettings);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  const size = useRef<Size>(DEFAULT_SIZE);
  const ready = useRef(false);
  const scrolled = useRef(false);
  const undo = useRef(new UndoStack<Step>());
  const floating = useRef<Floating | null>(null);
  const text = useRef<TextBox | null>(null);
  const marquee = useRef<Rect | null>(null);
  const preview = useRef<Size | null>(null);
  const gesture = useRef<Gesture | null>(null);
  /** Contenido ya entregado a la pestaña o cargado de ella. */
  const emitted = useRef<string | null>(null);
  /** Cambios del lienzo y el último ya entregado. */
  const revision = useRef(0);
  const delivered = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const ctx = () => (canvasRef.current ? context2d(canvasRef.current) : null);

  // B-03, B-30: carga el contenido al abrir y cuando cambia desde fuera (recargar, restaurar, conflicto).
  useEffect(() => {
    if (content === emitted.current) return;
    emitted.current = content;
    const rev = ++revision.current;
    delivered.current = rev;
    undo.current = new UndoStack<Step>();
    floating.current = null;
    text.current = null;
    gesture.current = null;
    const load = async () => {
      const canvas = canvasRef.current;
      const c = canvas && context2d(canvas);
      if (!canvas || !c) return;
      let img: HTMLImageElement | null = null;
      if (content !== '') {
        try {
          img = await loadImage(content);
        } catch {
          useUi.getState().notify('No se pudo leer la imagen de la pizarra', 'error');
        }
      }
      if (rev !== revision.current) return;
      const next = img ? { width: img.naturalWidth, height: img.naturalHeight } : DEFAULT_SIZE;
      canvas.width = next.width;
      canvas.height = next.height;
      c.fillStyle = BACKGROUND;
      c.fillRect(0, 0, next.width, next.height);
      if (img) c.drawImage(img, 0, 0);
      size.current = next;
      ready.current = true;
      rerender();
      if (!scrolled.current && scrollRef.current) {
        scrolled.current = true;
        scrollRef.current.scrollTop = initialScroll;
      }
    };
    void load();
    // initialScroll solo cuenta la primera vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const deliver = (url: string, rev: number) => {
    delivered.current = rev;
    if (url === emitted.current) return;
    emitted.current = url;
    onChangeRef.current(url);
  };

  /** B-30: tras cada paso, el PNG se codifica aparte y se entrega si nada lo ha dejado atrás. */
  const changed = () => {
    const rev = ++revision.current;
    rerender();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvasBlob(canvas)
      .then(blobDataUrl)
      .then((url) => {
        if (rev === revision.current && delivered.current < rev) deliver(url, rev);
      })
      .catch(() => {});
  };

  /** Lo que se ve: el lienzo con la selección flotante y el texto aún sin fijar. */
  const composite = (): HTMLCanvasElement | null => {
    const canvas = canvasRef.current;
    const f = floating.current;
    const t = text.current;
    if (!canvas) return null;
    if (!f && !(t && t.value.trim() !== '')) return canvas;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const c = context2d(out);
    if (!c) return canvas;
    c.drawImage(canvas, 0, 0);
    if (f) c.drawImage(f.canvas, f.x, f.y);
    if (t && t.value.trim() !== '') drawText(c, t, settingsRef.current.color, settingsRef.current.fontSize);
    return out;
  };

  /** B-30: antes de guardar, la pestaña recibe lo que se ve ahora, aunque haya un paso a medio codificar. */
  const flush = () => {
    if (!ready.current) return;
    const extra = floating.current !== null || (text.current !== null && text.current.value.trim() !== '');
    if (!extra && delivered.current === revision.current) return;
    const image = composite();
    if (image) deliver(image.toDataURL('image/png'), revision.current);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    setFlusher(tabId, () => flushRef.current());
    return () => setFlusher(tabId, null);
  }, [tabId]);

  const pushPatch = (area: Rect, before: ImageData) => {
    const c = ctx();
    if (!c) return;
    undo.current.push({ kind: 'patch', x: area.x, y: area.y, before, after: c.getImageData(area.x, area.y, area.width, area.height) });
    changed();
  };

  /** B-14: fija el texto en el lienzo; vacío no deja nada. */
  const commitText = () => {
    const t = text.current;
    if (!t) return;
    text.current = null;
    rerender();
    const c = ctx();
    if (!c || t.value.trim() === '') return;
    const { color, fontSize } = settingsRef.current;
    const area = clipRect(textArea(c, t, fontSize), size.current);
    if (!area) return;
    const before = c.getImageData(area.x, area.y, area.width, area.height);
    drawText(c, t, color, fontSize);
    pushPatch(area, before);
  };

  /** B-16: fija la selección donde está. Si no se movió, el lienzo queda como estaba y no hay paso. */
  const commitFloating = () => {
    const f = floating.current;
    if (!f) return;
    floating.current = null;
    rerender();
    const c = ctx();
    if (!c) return;
    c.drawImage(f.canvas, f.x, f.y);
    if (f.origin && f.origin.x === f.x && f.origin.y === f.y) return;
    const dest = floatingRect(f);
    const area = clipRect(f.origin ? union(f.origin, dest) : dest, size.current);
    if (area) pushPatch(area, toImageData(crop(f.before, area)));
  };

  const commitPending = () => {
    commitText();
    commitFloating();
  };

  /** B-16: Supr quita la selección; si se levantó del lienzo, su sitio queda en blanco. */
  const deleteFloating = () => {
    const f = floating.current;
    if (!f) return;
    floating.current = null;
    rerender();
    if (f.origin) pushPatch(f.origin, toImageData(crop(f.before, f.origin)));
  };

  /** B-16: levanta un rectángulo del lienzo como selección flotante; su sitio queda en blanco. */
  const lift = (area: Rect) => {
    const c = ctx();
    if (!c) return;
    const piece = document.createElement('canvas');
    piece.width = area.width;
    piece.height = area.height;
    context2d(piece)?.putImageData(c.getImageData(area.x, area.y, area.width, area.height), 0, 0);
    const before = c.getImageData(0, 0, size.current.width, size.current.height);
    c.fillStyle = BACKGROUND;
    c.fillRect(area.x, area.y, area.width, area.height);
    floating.current = { canvas: piece, x: area.x, y: area.y, before, origin: area };
    rerender();
  };

  /** B-20: cambia el tamaño; al encoger recorta y al crecer la parte nueva es blanca. */
  const resizeCanvas = (next: Size) => {
    const canvas = canvasRef.current;
    const c = ctx();
    const current = size.current;
    if (!canvas || !c || (next.width === current.width && next.height === current.height)) return;
    const before = c.getImageData(0, 0, current.width, current.height);
    canvas.width = next.width;
    canvas.height = next.height;
    c.fillStyle = BACKGROUND;
    c.fillRect(0, 0, next.width, next.height);
    c.putImageData(before, 0, 0);
    size.current = next;
    undo.current.push({ kind: 'resize', before, after: c.getImageData(0, 0, next.width, next.height) });
    changed();
  };

  /** B-18 */
  const apply = (step: Step, image: ImageData) => {
    const canvas = canvasRef.current;
    const c = ctx();
    if (!canvas || !c) return;
    if (step.kind === 'resize') {
      canvas.width = image.width;
      canvas.height = image.height;
      size.current = { width: image.width, height: image.height };
      c.putImageData(image, 0, 0);
    } else {
      c.putImageData(image, step.x, step.y);
    }
    changed();
  };

  const doUndo = () => {
    commitPending();
    const step = undo.current.undo();
    if (step) apply(step, step.before);
  };

  const doRedo = () => {
    commitPending();
    const step = undo.current.redo();
    if (step) apply(step, step.after);
  };

  /** B-14, B-16: cambiar de herramienta fija el texto y la selección. */
  const changeSettings = (changes: Partial<ToolSettings>, commit = true) => {
    if (commit && changes.tool && changes.tool !== settingsRef.current.tool) commitPending();
    const next = { ...settingsRef.current, ...changes };
    settingsRef.current = next;
    lastSettings = next;
    setSettings(next);
  };

  const point = (e: { clientX: number; clientY: number }): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** B-15 */
  const fillAt = (p: Point) => {
    const c = ctx();
    if (!c) return;
    const { width, height } = size.current;
    const full = c.getImageData(0, 0, width, height);
    const original = new Uint8ClampedArray(full.data);
    const area = floodFill(full, p.x, p.y, hexToRgba(settingsRef.current.color));
    if (!area) return;
    c.putImageData(full, 0, 0, area.x, area.y, area.width, area.height);
    pushPatch(area, toImageData(crop({ width, height, data: original }, area)));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const c = ctx();
    if (e.button !== 0 || !ready.current || !c) return;
    e.preventDefault();
    stageRef.current?.focus({ preventScroll: true });
    const p = point(e);
    const s = settingsRef.current;
    switch (s.tool) {
      case 'brush':
      case 'eraser': {
        commitPending();
        const color = s.tool === 'eraser' ? BACKGROUND : s.color;
        const snapshot = c.getImageData(0, 0, size.current.width, size.current.height);
        gesture.current = { kind: 'stroke', points: [p], snapshot, color, width: s.stroke };
        strokeSegment(c, p, p, color, s.stroke);
        e.currentTarget.setPointerCapture(e.pointerId);
        break;
      }
      case 'fill':
        commitPending();
        fillAt(p);
        break;
      case 'text':
        // Con un cuadro abierto, el clic fuera lo fija; el siguiente abre otro.
        if (text.current) {
          commitText();
          break;
        }
        commitFloating();
        text.current = { x: Math.round(p.x), y: Math.round(p.y), value: '' };
        rerender();
        break;
      case 'select': {
        const f = floating.current;
        if (f && contains(floatingRect(f), p.x, p.y)) {
          gesture.current = { kind: 'move', offset: { x: p.x - f.x, y: p.y - f.y } };
        } else {
          commitPending();
          gesture.current = { kind: 'marquee', from: p };
          marquee.current = rectBetween(p.x, p.y, p.x, p.y);
          rerender();
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        break;
      }
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'stroke') {
      const c = ctx();
      if (!c) return;
      // Los eventos agrupados dan trazos suaves aunque el ratón vaya deprisa.
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of events.length > 0 ? events : [e.nativeEvent]) {
        const p = point(ev);
        strokeSegment(c, g.points[g.points.length - 1], p, g.color, g.width);
        g.points.push(p);
      }
      return;
    }
    const p = point(e);
    if (g.kind === 'marquee') {
      marquee.current = rectBetween(g.from.x, g.from.y, p.x, p.y);
    } else if (g.kind === 'move' && floating.current) {
      floating.current.x = Math.round(p.x - g.offset.x);
      floating.current.y = Math.round(p.y - g.offset.y);
    } else if (g.kind === 'resize') {
      preview.current = resizeBy(g.start, g.edge, e.clientX - g.from.x, e.clientY - g.from.y);
    }
    rerender();
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'stroke') {
      const area = clipRect(strokeBounds(g.points, g.width), size.current);
      if (area) pushPatch(area, toImageData(crop(g.snapshot, area)));
    } else if (g.kind === 'marquee') {
      const area = marquee.current && clipRect(marquee.current, size.current);
      marquee.current = null;
      if (area && area.width >= 2 && area.height >= 2) lift(area);
      rerender();
    } else if (g.kind === 'resize') {
      const next = preview.current;
      preview.current = null;
      if (next) resizeCanvas(next);
      rerender();
    }
  };

  /** B-20: arrastrar el borde derecho, el inferior o la esquina. */
  const startResize = (e: PointerEvent<HTMLDivElement>, edge: Edge) => {
    if (e.button !== 0 || !ready.current) return;
    e.stopPropagation();
    e.preventDefault();
    commitPending();
    gesture.current = { kind: 'resize', edge, from: { x: e.clientX, y: e.clientY }, start: size.current };
    preview.current = size.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    rerender();
  };

  /** B-17: pega la imagen como selección flotante en la esquina visible, haciendo crecer el lienzo si no cabe. */
  const pasteImage = async (file: File) => {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      useUi.getState().notify('No se pudo leer la imagen pegada', 'error');
      return;
    }
    const canvas = canvasRef.current;
    const view = scrollRef.current;
    const c = ctx();
    if (!canvas || !view || !c) return;
    commitPending();
    const fit = fitImage({ width: bitmap.width, height: bitmap.height });
    const bounds = canvas.getBoundingClientRect();
    const visible = view.getBoundingClientRect();
    const at = { x: Math.max(0, visible.left - bounds.left), y: Math.max(0, visible.top - bounds.top) };
    const placement = pastePlacement(size.current, fit, at);
    resizeCanvas(placement.canvas);
    const piece = document.createElement('canvas');
    piece.width = fit.width;
    piece.height = fit.height;
    context2d(piece)?.drawImage(bitmap, 0, 0, fit.width, fit.height);
    bitmap.close();
    const before = c.getImageData(0, 0, size.current.width, size.current.height);
    floating.current = { canvas: piece, x: placement.x, y: placement.y, before, origin: null };
    // Lista para moverla con la selección, sin fijarla.
    changeSettings({ tool: 'select' }, false);
    rerender();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    // En el cuadro de texto se pega texto.
    if (e.target !== e.currentTarget || !ready.current) return;
    const item = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void pasteImage(file);
  };

  /** B-16, B-18, B-19: atajos con el foco en el lienzo. Los globales (Ctrl+S, Ctrl+E…) siguen su curso. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    const f = floating.current;
    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      doUndo();
    } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      doRedo();
    } else if (ctrl && !e.shiftKey && (key === 'c' || key === 'x') && f) {
      e.preventDefault();
      void copyImage(canvasBlob(f.canvas), key === 'x' ? 'Selección cortada' : 'Selección copiada');
      if (key === 'x') deleteFloating();
    } else if (e.key === 'Delete' && f) {
      e.preventDefault();
      deleteFloating();
    } else if (e.key === 'Escape' && f) {
      e.preventDefault();
      e.stopPropagation();
      commitFloating();
    }
  };

  const f = floating.current;
  const t = text.current;
  const m = marquee.current;
  const p = preview.current;

  return (
    <div className="board-editor">
      <BoardToolbar
        settings={settings}
        onChange={(changes) => changeSettings(changes)}
        canUndo={undo.current.canUndo || f !== null || t !== null}
        canRedo={undo.current.canRedo}
        onUndo={doUndo}
        onRedo={doRedo}
      >
        <ImageActions
          png={() => {
            const image = composite();
            return image ? canvasBlob(image) : Promise.reject(new Error('Sin lienzo'));
          }}
          title={title}
        />
      </BoardToolbar>
      <div className="board-scroll" ref={scrollRef} onScroll={(e) => onScroll(e.currentTarget.scrollTop)}>
        <div
          ref={stageRef}
          className={`board-stage board-tool-${settings.tool}`}
          tabIndex={0}
          role="application"
          aria-label="Lienzo de la pizarra"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        >
          <canvas ref={canvasRef} className="board-canvas" />
          {f && (
            <div
              className="board-floating"
              style={{ left: f.x, top: f.y, width: f.canvas.width, height: f.canvas.height }}
              ref={(el) => {
                if (el && el.firstChild !== f.canvas) el.replaceChildren(f.canvas);
              }}
            />
          )}
          {m && <div className="board-marquee" style={{ left: m.x, top: m.y, width: m.width, height: m.height }} />}
          {t && (
            <textarea
              className="board-text"
              aria-label="Texto de la pizarra"
              autoFocus
              rows={1}
              value={t.value}
              style={{ left: t.x, top: t.y, color: settings.color, fontSize: settings.fontSize }}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                t.value = e.target.value;
                rerender();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  commitText();
                  stageRef.current?.focus({ preventScroll: true });
                }
              }}
            />
          )}
          {EDGES.map((edge) => (
            <div
              key={edge}
              className={`board-handle board-handle-${edge}`}
              title="Arrastra para cambiar el tamaño del lienzo"
              onPointerDown={(e) => startResize(e, edge)}
            />
          ))}
          {p && (
            <div className="board-resize" style={{ width: p.width, height: p.height }}>
              <span className="board-size">
                {p.width} × {p.height}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
