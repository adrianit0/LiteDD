export type NoteType = 'md' | 'sql';
export type Mode = 'view' | 'edit';

export interface TreeNode {
  id: string;
  parentId: string | null;
  position: number;
  type: NoteType;
  title: string;
  favorite: boolean;
  tags: string[];
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
