import type { Mode, Note, NoteType, TreeNode, TrashItem } from './types';
import type { Analysis, ExecuteResponse, Sort } from './sql/types';

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

/** P-06: estado SQL de una pestaña que se guarda en la sesión. */
export interface SqlTabState {
  values: Record<string, string>;
  pageSize: number | null;
  sort: Sort | null;
  page: number;
}

export interface SessionTab {
  id: string;
  noteId: string;
  mode: Mode;
  active: boolean;
  state: { scroll?: number; sql?: SqlTabState | null } | null;
}

export interface ExecuteRequest {
  noteId: string;
  version: number;
  executionId: string;
  values: Record<string, string>;
  page: number;
  pageSize: number | null;
  sort: Sort | null;
}

/** C-09, C-10 */
export interface ConnectionStatus {
  state: 'not_configured' | 'connected' | 'disconnected' | 'schema_unavailable';
  user: string | null;
  host: string | null;
  port: number | null;
  schema: string | null;
  message: string | null;
}

/** C-01: la contraseña nunca llega a la interfaz (S-21). */
export interface ConnectionView {
  configured: boolean;
  host: string;
  port: number;
  user: string;
  schema: string;
  extraParams: string;
  hasPassword: boolean;
}

export interface ConnectionForm {
  host: string;
  port: number;
  user: string;
  /** Vacía conserva la guardada (ADR-0012). */
  password: string;
  schema: string;
  extraParams: string;
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
  analyze: (content: string, noteId?: string) => request<Analysis>('POST', '/api/sql/analyze', { content, noteId }),
  execute: (req: ExecuteRequest) => request<ExecuteResponse>('POST', '/api/sql/execute', req),
  count: (req: ExecuteRequest) => request<{ total: number }>('POST', '/api/sql/count', req),
  cancel: (executionId: string) => request<{ cancelled: boolean }>('POST', '/api/sql/cancel', { executionId }),
  getConnection: () => request<ConnectionView>('GET', '/api/connection'),
  saveConnection: (form: ConnectionForm) => request<ConnectionStatus>('PUT', '/api/connection', form),
  testConnection: (form: Omit<ConnectionForm, 'schema'>) => request<{ schemas: string[] }>('POST', '/api/connection/test', form),
  reconnect: () => request<ConnectionStatus>('POST', '/api/connection/reconnect'),
  connectionStatus: () => request<ConnectionStatus>('GET', '/api/connection/status'),
  getSettings: () => request<Settings>('GET', '/api/settings'),
  putSettings: (changes: Settings) => request<Settings>('PUT', '/api/settings', changes),
};
