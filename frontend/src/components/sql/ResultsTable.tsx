import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cellDisplay, columnWidth } from '../../sql/results';
import type { Column, Sort } from '../../sql/types';

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
}

/**
 * Q-60 a Q-65, Q-68: cabecera fija, número de fila, desplazamiento en los dos ejes y filas
 * virtualizadas.
 */
export function ResultsTable({ columns, rows, firstRowNumber, truncatedCells, sort, onSort, onOpenCell, onCopyCell }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const widths = useMemo(() => columns.map((c, i) => columnWidth(c, rows, i)), [columns, rows]);
  const totalWidth = NUMBER_WIDTH + widths.reduce((a, b) => a + b, 0);
  const truncated = useMemo(() => new Set(truncatedCells.map(([r, c]) => `${r}:${c}`)), [truncatedCells]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const select = (cell: SelectedCell) => {
    setSelected(cell);
    const value = rows[cell.row][cell.col];
    // ADR-0015: el valor completo se abre si no cabe en la tabla.
    if (cellDisplay(value).clipped || truncated.has(`${cell.row}:${cell.col}`)) onOpenCell(cell);
  };

  const onKeyDown = (e: KeyboardEvent) => {
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
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onOpenCell(selected);
    }
  };

  return (
    <div
      className="results"
      ref={scroller}
      role="grid"
      aria-label="Resultados"
      aria-rowcount={rows.length + 1}
      aria-colcount={columns.length + 1}
      tabIndex={0}
      onKeyDown={onKeyDown}
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
                    return (
                      <div
                        key={col}
                        className={classes.join(' ')}
                        role="gridcell"
                        aria-selected={isSelected}
                        style={{ width: widths[col] }}
                        onClick={() => select({ row: item.index, col })}
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
  );
}
