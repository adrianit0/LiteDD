import type { Mode, Note, NoteType, TreeNode, TrashItem } from './types';

/** Error de la API con el cuerpo de A-02. status 0 = sin contacto con el servidor. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** S-12: el token llega en el HTML inicial. */
function sessionToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="litedd-token"]')?.content ?? '';
}

interface RequestOptions {
  keepalive?: boolean;
}

export async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-LiteDD-Token': sessionToken() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive: options.keepalive,
    });
  } catch {
    throw new ApiError(0, 'network', 'No hay contacto con el servidor', null);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Error ${res.status}`, err.details ?? null);
  }
  return data as T;
}

export type Settings = Record<string, unknown>;

export interface SessionTab {
  id: string;
  noteId: string;
  mode: Mode;
  active: boolean;
  state: { scroll?: number } | null;
}

export const api = {
  tree: () => request<TreeNode[]>('GET', '/api/tree'),
  createNote: (parentId: string | null, type: NoteType, title?: string) =>
    request<Note>('POST', '/api/notes', { parentId, type, title }),
  getNote: (id: string) => request<Note>('GET', `/api/notes/${encodeURIComponent(id)}`),
  saveNote: (id: string, title: string, content: string, baseVersion: number, options?: RequestOptions) =>
    request<Note>('PUT', `/api/notes/${encodeURIComponent(id)}`, { title, content, baseVersion }, options),
  moveNote: (id: string, parentId: string | null, position: number) =>
    request<Note>('POST', `/api/notes/${encodeURIComponent(id)}/move`, { parentId, position }),
  deleteNote: (id: string, promoteChildren: boolean) =>
    request<void>('DELETE', `/api/notes/${encodeURIComponent(id)}${promoteChildren ? '?children=promote' : ''}`),
  trash: () => request<TrashItem[]>('GET', '/api/trash'),
  restore: (id: string) => request<Note>('POST', `/api/trash/${encodeURIComponent(id)}/restore`),
  purge: (id: string) => request<void>('DELETE', `/api/trash/${encodeURIComponent(id)}`),
  emptyTrash: () => request<void>('DELETE', '/api/trash'),
  getSession: () => request<{ tabs: SessionTab[] }>('GET', '/api/session'),
  putSession: (tabs: SessionTab[]) => request<{ tabs: SessionTab[] }>('PUT', '/api/session', { tabs }),
  getSettings: () => request<Settings>('GET', '/api/settings'),
  putSettings: (changes: Settings) => request<Settings>('PUT', '/api/settings', changes),
};
