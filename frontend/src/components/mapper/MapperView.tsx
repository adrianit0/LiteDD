import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { mapperTokens, writeMark, type MapperAnalysis } from '../../mapper';
import { mybatisClass } from '../../editor/mybatis';
import { openNote } from '../../actions';
import { useTree } from '../../stores/treeStore';
import type { Note, TreeNode } from '../../types';

const ANALYZE_DELAY = 400;

/**
 * M-41, M-42: sentencias y errores de un mapper, pedidos al servidor un momento después del último cambio. M-05:
 * con noteId, el servidor usa los fragmentos de las demás notas XML, sin contar esta.
 */
function useMapperAnalysis(content: string, delay: number, noteId: string): { analysis: MapperAnalysis | null; failed: boolean } {
  const [analysis, setAnalysis] = useState<MapperAnalysis | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .analyzeMapper(content, noteId)
        .then((a) => {
          if (!cancelled) {
            setAnalysis(a);
            setFailed(false);
          }
        })
        .catch(() => !cancelled && setFailed(true));
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [content, delay, noteId]);
  return { analysis, failed };
}

function MapperErrors({ analysis, failed }: { analysis: MapperAnalysis | null; failed: boolean }) {
  if (failed) return <p className="muted">No se pudo analizar el mapper.</p>;
  return (
    <>
      {analysis?.errors.map((e, i) => (
        <p key={i} className="error-text">
          {e.message}
        </p>
      ))}
    </>
  );
}

function KindChip({ kind }: { kind: string }) {
  const mark = writeMark(kind as TreeNode['statementKind']);
  return <span className={`statement-kind${mark ? ' write' : ''}`}>{kind.toUpperCase()}</span>;
}

/** M-41: bajo el editor, las sentencias del mapper con su etiqueta y los errores, en vivo. */
export function MapperAnalysisPanel({ content, noteId }: { content: string; noteId: string }) {
  const { analysis, failed } = useMapperAnalysis(content, ANALYZE_DELAY, noteId);
  return (
    <section className="sql-analysis" aria-label="Análisis del mapper" aria-live="polite">
      {analysis && (
        <div className="sql-analysis-vars">
          <span className="muted">Sentencias:</span>
          {analysis.statements.length === 0 ? (
            <span className="muted"> ninguna</span>
          ) : (
            analysis.statements.map((s) => (
              <span key={s.id} className="sql-chip">
                {s.id} <KindChip kind={s.kind} />
              </span>
            ))
          )}
        </div>
      )}
      <MapperErrors analysis={analysis} failed={failed} />
    </section>
  );
}

/** M-42: en consulta, las sentencias generadas con enlace a cada hija y el XML resaltado. */
export function MapperView({ note, content }: { note: Note; content: string }) {
  const nodes = useTree((s) => s.nodes);
  const children = useMemo(
    () => nodes.filter((n) => n.parentId === note.id && n.statementId).sort((a, b) => a.position - b.position),
    [nodes, note.id],
  );
  const { analysis, failed } = useMapperAnalysis(content, 0, note.id);
  const tokens = useMemo(() => mapperTokens(content, mybatisClass), [content]);

  if (content.trim() === '') {
    return <p className="muted view-empty">Pulsa «Editar» (Ctrl+E) y pega el mapper.xml completo.</p>;
  }

  return (
    <div className="mapper-view">
      <section className="mapper-statements" aria-label="Sentencias generadas">
        <h2>Sentencias generadas</h2>
        {children.length === 0 ? (
          <p className="muted">El mapper no tiene sentencias.</p>
        ) : (
          <ul>
            {children.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void openNote(c.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      void openNote(c.id, true);
                    }
                  }}
                >
                  {c.title}
                </button>
                {c.statementKind && <KindChip kind={c.statementKind} />}
              </li>
            ))}
          </ul>
        )}
        {analysis && analysis.errors.length > 0 && (
          <p className="sql-warning" role="status">
            El mapper guardado tiene errores: las sentencias generadas no se han actualizado.
          </p>
        )}
        <MapperErrors analysis={analysis} failed={failed} />
      </section>
      <pre className="mapper-source" aria-label="Mapper">
        <code>
          {tokens.map((t, i) =>
            t.className ? (
              <span key={i} className={t.className}>
                {t.text}
              </span>
            ) : (
              t.text
            ),
          )}
        </code>
      </pre>
    </div>
  );
}
