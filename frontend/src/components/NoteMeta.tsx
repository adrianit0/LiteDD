import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, type TagCount } from '../api';
import { openNote, saveTags, setObsolete, toggleFavorite } from '../actions';
import { useTree } from '../stores/treeStore';
import { NotePicker } from './workflow/NotePicker';
import { useUi } from '../stores/uiStore';
import type { Note } from '../types';

/** N-81: estrella de favorita en la cabecera. */
export function FavoriteButton({ note }: { note: Note }) {
  return (
    <button
      type="button"
      className={`favorite-button${note.favorite ? ' on' : ''}`}
      aria-pressed={note.favorite}
      aria-label={note.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
      title={note.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
      onClick={() => void toggleFavorite(note.id)}
    >
      {note.favorite ? '★' : '☆'}
    </button>
  );
}

/** N-85, N-86: aviso de nota obsoleta, con la nota que la sustituye y la forma de quitar la marca. */
export function ObsoleteBanner({ note }: { note: Note }) {
  const nodes = useTree((s) => s.nodes);
  const [picking, setPicking] = useState(false);
  const replacement = note.replacedBy ? nodes.find((n) => n.id === note.replacedBy) : undefined;
  return (
    <div className="obsolete-banner" role="note" aria-label="Nota obsoleta">
      <span>
        <strong>Nota obsoleta.</strong>
        {note.replacedBy && (
          <>
            {' '}Sustituida por{' '}
            {replacement ? (
              <button type="button" className="link-button" onClick={() => void openNote(replacement.id)}>
                «{replacement.title}»
              </button>
            ) : (
              // N-91: la sustituta está en la papelera.
              <span className="obsolete-broken" title="La nota sustituta está en la papelera">
                una nota eliminada
              </span>
            )}
            .
          </>
        )}
      </span>
      <span className="obsolete-actions">
        <button type="button" onClick={() => setPicking(true)}>
          {note.replacedBy ? 'Cambiar sustituta…' : 'Elegir sustituta…'}
        </button>
        {note.replacedBy && (
          <button type="button" onClick={() => void setObsolete(note.id, true, null)}>
            Quitar sustituta
          </button>
        )}
        <button type="button" onClick={() => void setObsolete(note.id, false)}>
          Quitar la marca
        </button>
      </span>
      {picking && (
        <NotePicker exclude={note.id} onPick={(id) => void setObsolete(note.id, true, id)} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

/** N-80: etiquetas libres con autocompletado; Intro o coma añaden, Retroceso quita la última. */
export function TagEditor({ note }: { note: Note }) {
  const [text, setText] = useState('');
  const [known, setKnown] = useState<TagCount[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const focusFor = useUi((s) => s.focusTagsFor);

  useEffect(() => {
    if (focusFor === note.id) {
      input.current?.focus();
      useUi.getState().setFocusTags(null);
    }
  }, [focusFor, note.id]);

  const add = (raw: string) => {
    const name = raw.trim();
    setText('');
    if (name === '' || note.tags.some((t) => t.toLowerCase() === name.toLowerCase())) return;
    void saveTags(note.id, [...note.tags, name]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && text === '' && note.tags.length > 0) {
      void saveTags(note.id, note.tags.slice(0, -1));
    }
  };

  const listId = `tags-${note.id}`;
  return (
    <div className="tag-editor" role="group" aria-label="Etiquetas">
      {note.tags.map((t) => (
        <span key={t} className="tag-chip">
          {t}
          <button type="button" aria-label={`Quitar la etiqueta ${t}`} onClick={() => void saveTags(note.id, note.tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        ref={input}
        aria-label="Añadir etiqueta"
        placeholder={note.tags.length === 0 ? '+ etiqueta' : '+'}
        list={listId}
        value={text}
        onFocus={() => api.tags().then(setKnown).catch(() => {})}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => text.trim() && add(text)}
      />
      <datalist id={listId}>
        {known.filter((k) => !note.tags.includes(k.name)).map((k) => (
          <option key={k.name} value={k.name} />
        ))}
      </datalist>
    </div>
  );
}
