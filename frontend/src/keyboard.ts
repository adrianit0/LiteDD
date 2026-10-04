/** Atajos globales de «Atajos de teclado». Ninguno usa combinaciones reservadas del navegador (U-09). */
export type Shortcut =
  | 'toggleMode'
  | 'save'
  | 'newMarkdown'
  | 'newSql'
  | 'toggleSidebar'
  | 'closeTab'
  | 'previousTab'
  | 'nextTab'
  | 'execute'
  | 'quickSearch';

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function matchShortcut(e: KeyLike): Shortcut | null {
  const key = e.key.toLowerCase();
  if (e.metaKey) return null;
  if (e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (key === 'e') return 'toggleMode';
    if (key === 's') return 'save';
    // N-73: Ctrl+K abre la búsqueda rápida.
    if (key === 'k') return 'quickSearch';
    // Q-23: Ctrl+Intro ejecuta la consulta.
    if (e.key === 'Enter') return 'execute';
  }
  if (e.altKey && !e.ctrlKey) {
    if (key === 'n') return e.shiftKey ? 'newSql' : 'newMarkdown';
    if (key === 'b' && !e.shiftKey) return 'toggleSidebar';
    // P-04: Alt+W, porque Ctrl+W está reservado (U-09).
    if (key === 'w' && !e.shiftKey) return 'closeTab';
    if (e.key === 'PageUp' && !e.shiftKey) return 'previousTab';
    if (e.key === 'PageDown' && !e.shiftKey) return 'nextTab';
  }
  return null;
}
