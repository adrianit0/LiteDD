import { useEffect, useState } from 'react';
import { defaultSqlState, useTabs, type Tab } from '../../stores/tabsStore';
import { useSqlRun, useSqlRuns } from '../../stores/sqlRunStore';
import { useUi } from '../../stores/uiStore';
import { copyText } from '../../clipboard';
import { elapsedText, nextSort, rangeText, timingText, toMarkdownTable } from '../../sql/results';
import { PAGE_SIZES } from '../../sql/types';
import { VariablesForm } from './VariablesForm';
import { ResultsTable, type SelectedCell } from './ResultsTable';
import { FinalSqlPanel } from './FinalSqlPanel';
import { SqlErrors } from './SqlErrors';

const copy = (text: string, what: string) => copyText(text, `${what} copiado`);

const number = (n: number) => n.toLocaleString('es-ES');

/**
 * U-06: nota SQL en consulta, de arriba abajo: formulario de variables, barra de ejecución, tabla de
 * resultados, paginación y panel «SQL final».
 */
export function SqlView({ tab }: { tab: Tab }) {
  const run = useSqlRun(tab.id);
  const runs = useSqlRuns.getState();
  const tabs = useTabs.getState();
  const sql = tab.sql ?? defaultSqlState();
  // Q-55, U-10: el tope de filas es un ajuste.
  const rowCap = useUi((s) => s.config.rowCap);
  const [cell, setCell] = useState<SelectedCell | null>(null);
  const [, setTick] = useState(0);
  const version = tab.note?.version;

  // Q-40: al abrir solo se analiza; nunca se ejecuta.
  useEffect(() => {
    void useSqlRuns.getState().analyze(tab.id);
  }, [tab.id, version]);

  // Q-41: cronómetro en vivo y Esc para cancelar.
  useEffect(() => {
    if (!run.running) return;
    const timer = setInterval(() => setTick((t) => t + 1), 100);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void useSqlRuns.getState().cancel(tab.id);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [run.running, tab.id]);

  // ADR-0015: Esc cierra el panel del valor completo.
  useEffect(() => {
    if (!cell) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useSqlRuns.getState().runs[tab.id]?.running) setCell(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cell, tab.id]);

  const analysis = run.analysis;
  const variables = analysis?.variables ?? [];
  // Q-45: lo que no es ejecutable se genera, no se ejecuta.
  const generateOnly = analysis !== null && (analysis.kind === 'statement' || analysis.forbiddenClause !== null);
  const result = run.result;
  const rows = result?.rows ?? [];
  const isQuery = result?.kind === 'query';

  const execute = (page = 1) => {
    setCell(null);
    void runs.execute(tab.id, page);
  };

  const rerunWith = (changes: Partial<typeof sql>) => {
    tabs.setSql(tab.id, { ...changes, page: 1 });
    // Q-56, Q-59: cambiar el orden o el tamaño vuelve a la página 1.
    if (result) execute(1);
  };

  const canGoNext = isQuery && result?.hasMore === true;
  const fullValue = cell && result?.rows ? result.rows[cell.row]?.[cell.col] : undefined;
  const serverClipped = cell !== null && (result?.truncatedCells ?? []).some(([r, c]) => r === cell.row && c === cell.col);

  return (
    <div className="sql-view">
      <VariablesForm
        variables={variables}
        values={sql.values}
        errors={run.fieldErrors}
        onChange={(name, value) => tabs.setSql(tab.id, { values: { ...sql.values, [name]: value } })}
        onExecute={() => execute(1)}
        onClear={() => tabs.setSql(tab.id, { values: {} })}
      />

      <div className="sql-runbar" role="toolbar" aria-label="Ejecución">
        <button
          type="button"
          className="primary"
          onClick={() => execute(1)}
          disabled={run.running !== null}
          aria-keyshortcuts="Control+Enter"
          title="Ctrl+Intro"
        >
          {generateOnly ? 'Generar SQL' : 'Ejecutar'}
        </button>
        {run.running && (
          <>
            <button type="button" onClick={() => void runs.cancel(tab.id)} aria-keyshortcuts="Escape" title="Esc">
              Cancelar
            </button>
            <span className="sql-chrono" role="timer" aria-live="off">
              {elapsedText(performance.now() - run.running.startedAt)}
            </span>
          </>
        )}
        {!run.running && result && result.kind !== 'statement' && run.elapsedMs !== null && (
          <span className="muted sql-timing">{timingText(run.elapsedMs, result.serverMillis, rows.length)}</span>
        )}
        <span className="sql-runbar-spacer" />
        <label className="sql-page-size">
          <span className="muted">Filas</span>
          <select
            value={sql.pageSize === null ? 'all' : String(sql.pageSize)}
            onChange={(e) => rerunWith({ pageSize: e.target.value === 'all' ? null : Number(e.target.value) })}
            aria-label="Tamaño de página"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s ?? 'all'} value={s === null ? 'all' : String(s)}>
                {s === null ? 'Sin límite' : s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void runs.count(tab.id)} disabled={run.counting || generateOnly || run.running !== null}>
          {run.counting ? 'Contando…' : 'Contar'}
        </button>
        <button
          type="button"
          disabled={!result?.columns || rows.length === 0}
          onClick={() => result?.columns && void copy(toMarkdownTable(result.columns, rows), `Tabla (${number(rows.length)} filas)`)}
        >
          Copiar tabla
        </button>
      </div>

      <SqlErrors analysisErrors={analysis?.errors ?? []} error={run.error} onRefresh={() => void tabs.reload(tab.id)} />

      {result?.kind === 'statement' && (
        <p className="sql-warning" role="status">
          {result.forbiddenClause ? `Cláusula no permitida: ${result.forbiddenClause}. ` : ''}
          {result.warning}
        </p>
      )}

      {result?.columns && (
        <>
          {result.capReached && (
            <p className="sql-warning" role="status">
              Se muestran las primeras {number(rowCap)} filas: se ha alcanzado el tope.
            </p>
          )}
          <ResultsTable
            columns={result.columns}
            rows={rows}
            firstRowNumber={isQuery && sql.pageSize !== null ? (run.page - 1) * sql.pageSize + 1 : 1}
            truncatedCells={result.truncatedCells ?? []}
            sort={sql.sort}
            onSort={isQuery ? (column) => rerunWith({ sort: nextSort(sql.sort, column) }) : null}
            onOpenCell={setCell}
            onCopyCell={(value) => void copy(value ?? 'NULL', 'Valor')}
          />
          {cell && fullValue !== undefined && (
            <section className="cell-panel" aria-label="Valor completo">
              <header>
                <strong>{result.columns[cell.col]?.label}</strong>
                <span className="muted"> · fila {(isQuery && sql.pageSize !== null ? (run.page - 1) * sql.pageSize : 0) + cell.row + 1}</span>
                <span className="cell-panel-actions">
                  <button type="button" onClick={() => void copy(fullValue ?? 'NULL', 'Valor')}>
                    Copiar
                  </button>
                  <button type="button" onClick={() => setCell(null)} aria-label="Cerrar el valor completo">
                    ×
                  </button>
                </span>
              </header>
              {serverClipped && <p className="sql-warning">El servidor ha recortado el valor a 10.000 caracteres.</p>}
              <pre className={fullValue === null ? 'null' : undefined}>{fullValue ?? 'NULL'}</pre>
            </section>
          )}
        </>
      )}

      {isQuery && result?.columns && (
        <nav className="sql-pager" aria-label="Paginación">
          <button type="button" onClick={() => execute(1)} disabled={run.page <= 1 || run.running !== null} aria-label="Primera página">
            «
          </button>
          <button type="button" onClick={() => execute(run.page - 1)} disabled={run.page <= 1 || run.running !== null} aria-label="Página anterior">
            ‹
          </button>
          <span>Página {run.page}</span>
          <button type="button" onClick={() => execute(run.page + 1)} disabled={!canGoNext || run.running !== null} aria-label="Página siguiente">
            ›
          </button>
          <span className="muted">
            {rangeText(run.page, sql.pageSize, rows.length)}
            {run.total !== null ? ` de ${number(run.total)}` : ''}
          </span>
        </nav>
      )}

      {result && <FinalSqlPanel key={`${result.kind}-${run.elapsedMs}`} finalSql={result.finalSql} open={result.kind === 'statement'} onCopy={(t, w) => void copy(t, w)} />}
    </div>
  );
}
