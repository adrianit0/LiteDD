import { useEffect, useState } from 'react';
import { api } from '../../api';
import { SNIPPET_BUTTONS, type SnippetKind } from '../../sql/snippets';
import type { Analysis } from '../../sql/types';
import { typeLabel } from '../../sql/values';

const ANALYZE_DELAY = 400;

/** Q-81: barra de inserciones del editor SQL. */
export function SqlToolbar({ onInsert }: { onInsert: (kind: SnippetKind) => void }) {
  return (
    <div className="format-toolbar" role="toolbar" aria-label="Inserciones SQL">
      {SNIPPET_BUTTONS.map((b) => (
        <button
          key={b.kind}
          type="button"
          className="tool tool-code"
          title={b.label}
          aria-label={b.label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(b.kind)}
        >
          {b.text}
        </button>
      ))}
    </div>
  );
}

/** Q-82: bajo el editor, las variables detectadas con su tipo y los errores, en vivo. */
export function SqlAnalysisPanel({ content }: { content: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .analyze(content)
        .then((a) => {
          if (!cancelled) {
            setAnalysis(a);
            setFailed(false);
          }
        })
        .catch(() => !cancelled && setFailed(true));
    }, ANALYZE_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [content]);

  return (
    <section className="sql-analysis" aria-label="Análisis de la consulta" aria-live="polite">
      {failed && <p className="muted">No se pudo analizar la consulta.</p>}
      {analysis && (
        <>
          <div className="sql-analysis-vars">
            <span className="muted">Variables:</span>
            {analysis.variables.length === 0 ? (
              <span className="muted"> ninguna</span>
            ) : (
              analysis.variables.map((v) => (
                <span key={v.name} className="sql-chip">
                  {v.name} <span className="muted">{typeLabel(v.type, v.elementType)}</span>
                  {v.textual ? ' $' : ''}
                </span>
              ))
            )}
            {analysis.kind === 'statement' && <span className="sql-chip warning">No ejecutable: «Generar SQL»</span>}
          </div>
          {analysis.errors.map((e, i) => (
            <p key={i} className="error-text">
              {e.message}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
