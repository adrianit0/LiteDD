import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Reference } from '../../api';
import { cellDisplay, columnWidth } from '../../sql/results';
import { REFERENCE_DELAY_MS, lookupKey, lookupLines } from '../../sql/references';
import type { Column, LookupResult, Sort } from '../../sql/types';

const ROW_HEIGHT = 26;
const NUMBER_WIDTH = 56;

export interface SelectedCell {
  row: number;
  col: number;
}

interface Props {
  columns: Column[];
  rows: (string | null)[][];
  /** Número de la primera fila mostrada (Q-60). */
  firstRowNumber: number;
  truncatedCells: [number, number][];
  sort: Sort | null;
  /** null si la tabla no se puede ordenar (Q-44). */
  onSort: ((column: number) => void) | null;
  onOpenCell: (cell: SelectedCell) => void;
  onCopyCell: (value: string | null) => void;
  /** Q-102: la referencia de cada columna, o null. Sin ella no hay marcas. */
  references?: (Reference | null)[];
  /** Q-107: consulta el valor de una celda marcada. */
  onLookup?: (table: string, value: string) => Promise<LookupResult>;
}

type Lookup = { state: 'loading' } | { state: 'done'; result: LookupResult } | { state: 'error'; message: string };

/** Q-104: el recuadro de una celda marcada, junto a ella. */
interface Shown extends SelectedCell {
  source: 'mouse' | 'keyboard';
  /** Los resultados para los que se abrió: con otros, ya no vale. */
  rows: (string | null)[][];
  left: number;
  top: number;
  /** Sin sitio debajo de la celda, el recuadro va encima. */
  above: boolean;
  lookup: Lookup;
}

/** Ancho máximo del recuadro y alto que se le reserva debajo de la celda (theme.css, .ref-popover). */
const POPOVER_WIDTH = 360;
const POPOVER_ROOM = 160;

/** Q-105 */
function LookupContent({ lookup }: { lookup: Lookup }) {
  if (lookup.state === 'loading') return <span className="muted">Consultando…</span>;
  if (lookup.state === 'error') return <span className="error-text">{lookup.message}</span>;
  const lines = lookupLines(lookup.result);
  if (lines.length === 0) return <span className="muted">Sin resultados</span>;
  return (
    <dl className="ref-lines">
      {lines.map((line, i) => (
        <div key={i}>
          {line.label !== null && <dt>{line.label}</dt>}
          <dd className={line.value === null ? 'null' : undefined}>{line.value ?? 'NULL'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Q-60 a Q-65, Q-68: cabecera fija, número de fila, desplazamiento en los dos ejes y filas
 * virtualizadas. Q-102 a Q-106: marca y recuadro de las referencias de claves foráneas.
 */
export function ResultsTable({ columns, rows, firstRowNumber, truncatedCells, sort, onSort, onOpenCell, onCopyCell, references, onLookup }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const widths = useMemo(() => columns.map((c, i) => columnWidth(c, rows, i)), [columns, rows]);
  const totalWidth = NUMBER_WIDTH + widths.reduce((a, b) => a + b, 0);
  const truncated = useMemo(() => new Set(truncatedCells.map(([r, c]) => `${r}:${c}`)), [truncatedCells]);
  const popoverId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cada consulta lleva un número: una respuesta que llega tarde a un recuadro ya cerrado se descarta.
  const request = useRef(0);
  const [shownState, setShown] = useState<Shown | null>(null);
  // Q-106: lo consultado vale mientras se ven estos resultados; una ejecución nueva u otra página traen otras filas.
  const looked = useMemo(() => new Map<string, LookupResult>(), [rows]);
  const shown = shownState?.rows === rows ? shownState : null;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const cancelTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  // Lo pendiente no sobrevive a otras filas ni a cerrar la tabla.
  useEffect(() => () => cancelTimer(), [rows]);

  const hide = () => {
    cancelTimer();
    request.current++;
    setShown(null);
  };

  const referenceOf = (row: number, col: number) => {
    const reference = references?.[col] ?? null;
    const value = rows[row]?.[col] ?? null;
    return reference && value !== null && onLookup ? { reference, value } : null;
  };

  const show = (row: number, col: number, source: Shown['source']) => {
    const target = referenceOf(row, col);
    const el = scroller.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
    if (!target || !el || !onLookup) return;
    const rect = el.getBoundingClientRect();
    // Bajo la celda; si no cabe, encima. Nunca fuera de la ventana por los lados.
    const below = rect.bottom + POPOVER_ROOM < window.innerHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    const base = { row, col, source, rows, left, top: below ? rect.bottom + 2 : rect.top - 2, above: !below };
    const key = lookupKey(target.reference.table, target.value);
    const values = looked;
    const token = ++request.current;
    const cached = looked.get(key);
    if (cached) {
      setShown({ ...base, lookup: { state: 'done', result: cached } });
      return;
    }
    setShown({ ...base, lookup: { state: 'loading' } });
    onLookup(target.reference.table, target.value).then(
      (result) => {
        values.set(key, result);
        if (request.current === token) setShown((s) => (s ? { ...s, lookup: { state: 'done', result } } : s));
      },
      (e: unknown) => {
        // Q-106: los errores no se recuerdan.
        const message = e instanceof Error ? e.message : 'No se pudo consultar la referencia';
        if (request.current === token) setShown((s) => (s ? { ...s, lookup: { state: 'error', message } } : s));
      },
    );
  };

  // Q-104: solo se consulta si el ratón o la selección se quedan en la celda.
  const schedule = (row: number, col: number, source: Shown['source']) => {
    cancelTimer();
    if (!referenceOf(row, col)) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      show(row, col, source);
    }, REFERENCE_DELAY_MS);
  };

  const select = (cell: SelectedCell) => {
    setSelected(cell);
    if (shown && (shown.row !== cell.row || shown.col !== cell.col)) hide();
    const value = rows[cell.row][cell.col];
    // ADR-0015: el valor completo se abre si no cabe en la tabla.
    if (cellDisplay(value).clipped || truncated.has(`${cell.row}:${cell.col}`)) onOpenCell(cell);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (shown || timer.current !== null)) {
      hide();
      return;
    }
    if (!selected) return;
    // Q-65: Ctrl+C copia el valor de la celda seleccionada.
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      onCopyCell(rows[selected.row][selected.col]);
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      const row = Math.min(rows.length - 1, Math.max(0, selected.row + move[0]));
      const col = Math.min(columns.length - 1, Math.max(0, selected.col + move[1]));
      setSelected({ row, col });
      virtualizer.scrollToIndex(row);
      // Q-104, U-08: con el teclado, la celda seleccionada hace de ratón.
      hide();
      schedule(row, col, 'keyboard');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onOpenCell(selected);
    }
  };

  // Q-104: al desplazar la tabla, el recuadro se queda lejos de su celda. Lo pendiente sigue: el teclado también desplaza.
  const onScroll = () => {
    if (!shown) return;
    request.current++;
    setShown(null);
  };

  return (
    <>
      <div
        className="results"
        ref={scroller}
        role="grid"
        aria-label="Resultados"
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length + 1}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
      >
        <div className="results-inner" style={{ width: totalWidth }}>
          <div className="results-header" role="row">
            <div className="results-number" role="columnheader" style={{ width: NUMBER_WIDTH }}>
              #
            </div>
            {columns.map((c, i) => {
              const active = sort?.column === i + 1 ? sort.direction : null;
              return (
                <div
                  key={i}
                  className={`results-cell results-head${c.numeric ? ' numeric' : ''}`}
                  role="columnheader"
                  aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
                  style={{ width: widths[i] }}
                  title={`${c.label} · ${c.type}`}
                >
                  {onSort ? (
                    <button type="button" className="sort-button" onClick={() => onSort(i + 1)}>
                      <span className="results-label">{c.label}</span>
                      <span className="sort-mark" aria-hidden="true">
                        {active === 'asc' ? '▲' : active === 'desc' ? '▼' : ''}
                      </span>
                    </button>
                  ) : (
                    <span className="results-label">{c.label}</span>
                  )}
                </div>
              );
            })}
          </div>
          {rows.length === 0 ? (
            // Q-68
            <p className="results-empty muted">Sin resultados</p>
          ) : (
            <div className="results-body" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                return (
                  <div key={item.index} className="results-row" role="row" aria-rowindex={item.index + 2} style={{ top: item.start }}>
                    <div className="results-number" role="rowheader" style={{ width: NUMBER_WIDTH }}>
                      {firstRowNumber + item.index}
                    </div>
                    {row.map((value, col) => {
                      const { text, clipped } = cellDisplay(value);
                      const isSelected = selected?.row === item.index && selected.col === col;
                      const classes = ['results-cell'];
                      if (columns[col]?.numeric) classes.push('numeric');
                      if (value === null) classes.push('null');
                      if (isSelected) classes.push('selected');
                      if (clipped || truncated.has(`${item.index}:${col}`)) classes.push('clipped');
                      // Q-102: esquina inferior derecha del color de la referencia.
                      const marked = referenceOf(item.index, col);
                      const style: CSSProperties = { width: widths[col] };
                      if (marked) {
                        classes.push('ref');
                        (style as Record<string, string | number>)['--ref-color'] = marked.reference.color;
                      }
                      const described = shown?.row === item.index && shown.col === col;
                      return (
                        <div
                          key={col}
                          className={classes.join(' ')}
                          role="gridcell"
                          aria-selected={isSelected}
                          aria-describedby={described ? popoverId : undefined}
                          data-cell={marked ? `${item.index}:${col}` : undefined}
                          style={style}
                          onClick={() => select({ row: item.index, col })}
                          onMouseEnter={marked ? () => schedule(item.index, col, 'mouse') : undefined}
                          onMouseLeave={
                            marked
                              ? () => {
                                  cancelTimer();
                                  if (shown?.source === 'mouse') hide();
                                }
                              : undefined
                          }
                        >
                          {text}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {shown && (
        <div
          id={popoverId}
          role="tooltip"
          className={`ref-popover${shown.above ? ' above' : ''}`}
          style={{ left: shown.left, top: shown.top }}
        >
          <LookupContent lookup={shown.lookup} />
        </div>
      )}
    </>
  );
}
