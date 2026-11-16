export type NoteType = 'md' | 'sql' | 'http' | 'xml' | 'board' | 'workflow';
/** M-24: etiqueta de la sentencia de la que sale una hija generada. */
export type StatementKind = 'select' | 'insert' | 'update' | 'delete';
export type Mode = 'view' | 'edit';

export interface TreeNode {
  id: string;
  parentId: string | null;
  position: number;
  type: NoteType;
  title: string;
  /** N-07: descripción opcional; vacía si no hay. */
  description: string;
  favorite: boolean;
  tags: string[];
  /** M-12: id de la sentencia en el mapper de la madre; null en una nota normal. */
  statementId?: string | null;
  statementKind?: StatementKind | null;
  /** N-82: marcada como obsoleta por el usuario. */
  obsolete?: boolean;
  /** N-89: importante hasta ese día local (AAAA-MM-DD), incluido; pasado ese día ya no cuenta (N-97). */
  importantUntil?: string | null;
}

export interface Note extends TreeNode {
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** N-86: la nota que la sustituye, si está obsoleta y se ha elegido una. */
  replacedBy?: string | null;
  /** N-88: última ejecución correcta. */
  lastRunAt?: string | null;
}

export interface TrashItem {
  id: string;
  parentId: string | null;
  type: NoteType;
  title: string;
  deletedAt: string;
}
