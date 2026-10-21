export type NoteType = 'md' | 'sql' | 'http' | 'xml' | 'board';
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
}

export interface Note extends TreeNode {
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrashItem {
  id: string;
  parentId: string | null;
  type: NoteType;
  title: string;
  deletedAt: string;
}
