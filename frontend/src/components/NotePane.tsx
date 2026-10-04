import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isDirty, useTabs, type SaveStatus, type Tab } from '../stores/tabsStore';
import { useTree } from '../stores/treeStore';
import { ancestorsOf } from '../tree';
import { formatDateTime } from '../format';
import { NoteEditor, type EditorControls } from '../editor/NoteEditor';
import { FormatToolbar } from '../editor/FormatToolbar';
import { SqlView } from './sql/SqlView';
import { SqlAnalysisPanel, SqlToolbar } from './sql/SqlEditorPanels';
import { MarkdownView } from './MarkdownView';
import { Dialog } from './Dialog';
import { deleteNote, openNote } from '../actions';
import { TypeIcon } from './TypeIcon';

export const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Guardado',
  pending: 'Cambios sin guardar',
  saving: 'Guardando…',
  error: 'Error al guardar',
  conflict: 'Conflicto',
};

const SCROLL_DELAY = 200;

/** Contenido de una pestaña: cabecera (U-05) y nota en consulta o edición (N-10 a N-13). */
export function NotePane({ tab }: { tab: Tab }) {
  const { note, title, content, mode, status, conflict, focusTitle } = tab;
  const store = useTabs.getState();
  const nodes = useTree((s) => s.nodes);
  const [confirmReload, setConfirmReload] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorControls | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // N-06: el título de una nota nueva aparece seleccionado.
  useEffect(() => {
    if (focusTitle && mode === 'edit') {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [focusTitle, mode, tab.id]);

  // P-06: cada pestaña recupera su desplazamiento.
  useLayoutEffect(() => {
    if (mode === 'view' && body.current && note) body.current.scrollTop = tab.scroll;
    // Solo al cambiar de pestaña, de modo o al cargar la nota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, mode, note === null]);

  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  const rememberScroll = (top: number) => {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => store.setScroll(tab.id, Math.round(top)), SCROLL_DELAY);
  };

  if (!note) {
    return (
      <section className="note-pane">
        <p className="muted view-empty">Cargando…</p>
      </section>
    );
  }
  const path = ancestorsOf(nodes, note.id).map((n) => n.title);

  const onRefresh = () => {
    if (isDirty(tab)) setConfirmReload(true);
    else void store.reload(tab.id);
  };

  return (
    <section className="note-pane" aria-label={`Nota ${note.title}`}>
      <header className="note-header">
        <div className="note-heading">
          {path.length > 0 && <div className="note-path muted">{path.join(' / ')}</div>}
          <div className="note-title-row">
            <TypeIcon type={note.type} />
            {mode === 'edit' ? (
              <input
                ref={titleInput}
                className="note-title-input"
                aria-label="Título"
                value={title}
                onChange={(e) => store.edit(tab.id, { title: e.target.value })}
                onBlur={() => void store.saveNow(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    editor.current?.focus();
                  }
                }}
              />
            ) : (
              <h1 className="note-title">{title}</h1>
            )}
          </div>
        </div>
        <div className="note-actions">
          <span className={`save-status status-${status}`} role="status" aria-live="polite">
            {STATUS_TEXT[status]}
          </span>
          <span className="muted note-date" title="Última modificación">
            {formatDateTime(note.updatedAt)}
          </span>
          <button type="button" onClick={() => void store.toggleMode(tab.id)} aria-keyshortcuts="Control+E" title="Ctrl+E">
            {mode === 'edit' ? 'Ver' : 'Editar'}
          </button>
          <button type="button" onClick={onRefresh} title="Recargar la nota desde el disco">
            Actualizar
          </button>
          <button type="button" onClick={() => void deleteNote(note.id)} title="Mover la nota a la papelera">
            Eliminar
          </button>
        </div>
      </header>

      {mode === 'edit' && note.type === 'md' && <FormatToolbar onFormat={(a) => editor.current?.format(a)} />}
      {mode === 'edit' && note.type === 'sql' && <SqlToolbar onInsert={(k) => editor.current?.snippet(k)} />}

      <div
        className={`note-body mode-${mode}`}
        ref={body}
        onScroll={mode === 'view' ? (e) => rememberScroll(e.currentTarget.scrollTop) : undefined}
      >
        {mode === 'edit' ? (
          <NoteEditor
            key={tab.id}
            type={note.type}
            value={content}
            initialScroll={tab.scroll}
            onScroll={rememberScroll}
            onChange={(value) => store.edit(tab.id, { content: value })}
            onBlur={() => void store.saveNow(tab.id)}
            onReady={(controls) => {
              editor.current = controls;
            }}
          />
        ) : note.type === 'md' ? (
          <MarkdownView content={content} onOpenNote={(id, newTab) => void openNote(id, newTab)} />
        ) : (
          <SqlView tab={tab} />
        )}
      </div>
      {mode === 'edit' && note.type === 'sql' && <SqlAnalysisPanel content={content} />}

      {status === 'conflict' && conflict && (
        <Dialog
          title="La nota ha cambiado"
          actions={[
            { label: 'Recargar', onClick: () => void store.resolveConflict(tab.id, 'reload'), primary: true },
            { label: 'Sobrescribir', onClick: () => void store.resolveConflict(tab.id, 'overwrite') },
          ]}
        >
          <p>
            La nota se guardó desde otro sitio el {formatDateTime(conflict.updatedAt)}. «Recargar» descarta tus cambios y
            carga la versión guardada. «Sobrescribir» guarda tu versión encima.
          </p>
        </Dialog>
      )}

      {confirmReload && (
        <Dialog
          title="Descartar cambios"
          onCancel={() => setConfirmReload(false)}
          actions={[
            {
              label: 'Descartar y actualizar',
              primary: true,
              onClick: () => {
                setConfirmReload(false);
                void store.reload(tab.id);
              },
            },
            { label: 'Cancelar', onClick: () => setConfirmReload(false) },
          ]}
        >
          <p>Hay cambios sin guardar. Si actualizas, se pierden.</p>
        </Dialog>
      )}
    </section>
  );
}
