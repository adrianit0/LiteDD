import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isDirty, useTabs, type SaveStatus, type Tab } from '../stores/tabsStore';
import { useTree } from '../stores/treeStore';
import { ancestorsOf } from '../tree';
import { formatDateTime } from '../format';
import { NoteEditor, type EditorControls } from '../editor/NoteEditor';
import { FormatToolbar } from '../editor/FormatToolbar';
import { SqlView } from './sql/SqlView';
import { HttpView } from './http/HttpView';
import { SqlAnalysisPanel, SqlToolbar } from './sql/SqlEditorPanels';
import { MarkdownView } from './MarkdownView';
import { Dialog } from './Dialog';
import { deleteNote, openNote } from '../actions';
import { TypeIcon } from './TypeIcon';
import { FavoriteButton, TagEditor } from './NoteMeta';
import { HistoryDialog } from './HistoryDialog';
import { api } from '../api';
import { imageProblem } from '../markdown/links';
import { useAttachments } from '../markdown/attachments';
import { useUi } from '../stores/uiStore';

export const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Guardado',
  pending: 'Cambios sin guardar',
  saving: 'Guardando…',
  error: 'Error al guardar',
  conflict: 'Conflicto',
};

const SCROLL_DELAY = 200;
/** N-07: igual que en el servidor. */
export const DESCRIPTION_MAX = 200;

/** Contenido de una pestaña: cabecera (U-05) y nota en consulta o edición (N-10 a N-13). */
export function NotePane({ tab }: { tab: Tab }) {
  const { note, title, content, mode, status, conflict, focusTitle } = tab;
  const store = useTabs.getState();
  const autosave = useUi((s) => s.config.autosave);
  // H-02: las notas HTTP no tienen modos; su formulario siempre se edita.
  const isHttp = tab.note?.type === 'http';
  const editing = mode === 'edit' || isHttp;
  // N-40: perder el foco guarda; con el guardado manual (N-46), no.
  const saveOnBlur = () => {
    if (autosave) void store.saveNow(tab.id);
  };
  const nodes = useTree((s) => s.nodes);
  const [confirmReload, setConfirmReload] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorControls | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // N-06: el título de una nota nueva aparece seleccionado.
  useEffect(() => {
    if (focusTitle && editing) {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [focusTitle, editing, tab.id]);

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

  /** N-92: guarda la imagen como adjunto y la deja ya en la caché para la vista. */
  const uploadImage = async (file: File): Promise<string | null> => {
    const problem = imageProblem(file);
    if (problem) {
      useUi.getState().notify(problem, 'error');
      return null;
    }
    try {
      const { id } = await api.uploadAttachment(note.id, file, file.name);
      const reader = new FileReader();
      reader.onload = () => useAttachments.getState().remember(id, String(reader.result));
      reader.readAsDataURL(file);
      return id;
    } catch (e) {
      useUi.getState().notify(e instanceof Error ? e.message : 'No se pudo guardar la imagen', 'error');
      return null;
    }
  };

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
            {editing ? (
              <input
                ref={titleInput}
                className="note-title-input"
                aria-label="Título"
                value={title}
                onChange={(e) => store.edit(tab.id, { title: e.target.value })}
                onBlur={saveOnBlur}
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
            <FavoriteButton note={note} />
          </div>
          {/* N-07: descripción opcional entre el título y las etiquetas. */}
          {editing ? (
            <input
              className="note-description-input"
              aria-label="Descripción"
              placeholder="Descripción (opcional)"
              maxLength={DESCRIPTION_MAX}
              value={tab.description}
              onChange={(e) => store.edit(tab.id, { description: e.target.value })}
              onBlur={saveOnBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editor.current?.focus();
                }
              }}
            />
          ) : (
            tab.description && <p className="note-description muted">{tab.description}</p>
          )}
          <TagEditor note={note} />
        </div>
        <div className="note-actions">
          <span className={`save-status status-${status}`} role="status" aria-live="polite">
            {STATUS_TEXT[status]}
          </span>
          <span className="muted note-date" title="Última modificación">
            {formatDateTime(note.updatedAt)}
          </span>
          {!autosave && (
            // N-46
            <button
              type="button"
              className="primary"
              disabled={!isDirty(tab) || status === 'saving' || status === 'conflict'}
              onClick={() => void store.saveNow(tab.id)}
              aria-keyshortcuts="Control+S"
              title="Ctrl+S"
            >
              Guardar
            </button>
          )}
          {!isHttp && (
            <button type="button" onClick={() => void store.toggleMode(tab.id)} aria-keyshortcuts="Control+E" title="Ctrl+E">
              {mode === 'edit' ? 'Ver' : 'Editar'}
            </button>
          )}
          <button type="button" onClick={onRefresh} title="Recargar la nota desde el disco">
            Actualizar
          </button>
          <button type="button" onClick={() => setHistoryOpen(true)} title="Versiones guardadas de la nota">
            Historial
          </button>
          <button type="button" onClick={() => void deleteNote(note.id)} title="Mover la nota a la papelera">
            Eliminar
          </button>
        </div>
      </header>

      {mode === 'edit' && note.type === 'md' && <FormatToolbar onFormat={(a) => editor.current?.format(a)} />}
      {mode === 'edit' && note.type === 'sql' && <SqlToolbar onInsert={(k) => editor.current?.snippet(k)} />}

      <div
        className={`note-body mode-${isHttp ? 'http' : mode}`}
        ref={body}
        onScroll={mode === 'view' && !isHttp ? (e) => rememberScroll(e.currentTarget.scrollTop) : undefined}
      >
        {isHttp ? (
          <HttpView tab={tab} />
        ) : mode === 'edit' ? (
          <NoteEditor
            key={tab.id}
            type={note.type}
            value={content}
            initialScroll={tab.scroll}
            onScroll={rememberScroll}
            onChange={(value) => store.edit(tab.id, { content: value })}
            onBlur={saveOnBlur}
            onReady={(controls) => {
              editor.current = controls;
            }}
            linkTargets={() => useTree.getState().nodes}
            onImage={uploadImage}
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

      {historyOpen && <HistoryDialog tab={tab} onClose={() => setHistoryOpen(false)} />}

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
