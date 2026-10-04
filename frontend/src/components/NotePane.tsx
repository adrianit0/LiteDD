import { useEffect, useRef, useState } from 'react';
import { useNote, type SaveStatus } from '../stores/noteStore';
import { useTree } from '../stores/treeStore';
import { ancestorsOf } from '../tree';
import { formatDateTime } from '../format';
import { NoteEditor, type EditorControls } from '../editor/NoteEditor';
import { FormatToolbar } from '../editor/FormatToolbar';
import { MarkdownView } from './MarkdownView';
import { Dialog } from './Dialog';
import { openNote } from '../actions';
import { TypeIcon } from './TypeIcon';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Guardado',
  pending: 'Cambios sin guardar',
  saving: 'Guardando…',
  error: 'Error al guardar',
  conflict: 'Conflicto',
};

/** Área principal con la nota abierta: cabecera (U-05) y contenido en consulta o edición (N-10 a N-13). */
export function NotePane() {
  const { note, title, content, mode, status, conflict, focusTitle } = useNote();
  const nodes = useTree((s) => s.nodes);
  const [confirmReload, setConfirmReload] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const editor = useRef<EditorControls | null>(null);

  // N-06: el título de una nota nueva aparece seleccionado.
  useEffect(() => {
    if (focusTitle && mode === 'edit') {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [focusTitle, mode, note?.id]);

  if (!note) return null;
  const store = useNote.getState();
  const path = ancestorsOf(nodes, note.id).map((n) => n.title);

  const onRefresh = () => {
    if (store.isDirty()) setConfirmReload(true);
    else void store.reload();
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
                onChange={(e) => store.edit({ title: e.target.value })}
                onBlur={() => void store.saveNow()}
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
          <button type="button" onClick={() => void store.toggleMode()} aria-keyshortcuts="Control+E" title="Ctrl+E">
            {mode === 'edit' ? 'Ver' : 'Editar'}
          </button>
          <button type="button" onClick={onRefresh} title="Recargar la nota desde el disco">
            Actualizar
          </button>
        </div>
      </header>

      {mode === 'edit' && note.type === 'md' && <FormatToolbar onFormat={(a) => editor.current?.format(a)} />}

      <div className={`note-body mode-${mode}`}>
        {mode === 'edit' ? (
          <NoteEditor
            key={note.id}
            type={note.type}
            value={content}
            onChange={(value) => store.edit({ content: value })}
            onBlur={() => void store.saveNow()}
            onReady={(controls) => {
              editor.current = controls;
            }}
          />
        ) : note.type === 'md' ? (
          <MarkdownView content={content} onOpenNote={(id) => void openNote(id)} />
        ) : (
          // La vista ejecutable de las notas SQL llega en el Sprint 4.
          <pre className="sql-source">{content || '—'}</pre>
        )}
      </div>

      {status === 'conflict' && conflict && (
        <Dialog
          title="La nota ha cambiado"
          actions={[
            { label: 'Recargar', onClick: () => void store.resolveConflict('reload'), primary: true },
            { label: 'Sobrescribir', onClick: () => void store.resolveConflict('overwrite') },
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
                void store.reload();
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
