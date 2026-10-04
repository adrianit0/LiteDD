/** Atajos globales de «Atajos de teclado». Ninguno usa combinaciones reservadas del navegador (U-09). */
export type Shortcut = 'toggleMode' | 'save' | 'newMarkdown' | 'newSql' | 'toggleSidebar';

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
  }
  if (e.altKey && !e.ctrlKey) {
    if (key === 'n') return e.shiftKey ? 'newSql' : 'newMarkdown';
    if (key === 'b' && !e.shiftKey) return 'toggleSidebar';
  }
  return null;
}
