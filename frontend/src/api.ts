import type { Mode, Note, NoteType, TreeNode, TrashItem } from './types';
import type { Analysis, ExecuteResponse, Sort } from './sql/types';
import type { SearchHit } from './search';

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

/** U-11: aviso cuando una petición no llega al servidor. */
let networkFailureListener: (() => void) | null = null;

export function onNetworkFailure(listener: (() => void) | null) {
  networkFailureListener = listener;
}

function networkError(): ApiError {
  networkFailureListener?.();
  return new ApiError(0, 'network', 'No hay contacto con el servidor', null);
}

/** S-12: el token llega en el HTML inicial. */
export function sessionToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="litedd-token"]')?.content ?? '';
}

interface RequestOptions {
  keepalive?: boolean;
}

interface SaveOptions extends RequestOptions {
  /** N-44: al salir del modo edición se guarda una versión. */
  snapshot?: boolean;
}

export interface NoteVersion {
  id: number;
  title: string;
  content: string;
  savedAt: string;
}

export interface TagCount {
  name: string;
  count: number;
}

/** Para cuerpos que no son JSON: subir una imagen (N-92). */
async function requestRaw<T>(method: string, path: string, body: Blob, contentType: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: { 'X-LiteDD-Token': sessionToken(), 'Content-Type': contentType }, body });
  } catch {
    throw networkError();
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Error ${res.status}`, err.details ?? null);
  }
  return data as T;
}

/** ADR-0016: el adjunto se descarga con el token y se muestra como URL data:. */
async function attachmentDataUrl(id: string): Promise<string> {
  const res = await fetch(`/api/attachments/${encodeURIComponent(id)}`, { headers: { 'X-LiteDD-Token': sessionToken() } });
  if (!res.ok) throw new ApiError(res.status, 'attachment', 'No se pudo cargar la imagen', null);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ApiError(0, 'attachment', 'No se pudo leer la imagen', null));
    reader.readAsDataURL(blob);
  });
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
    throw networkError();
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

/** U-10: ajustes de config.json (ADR-0017). defaultPageSize null = «Todas». */
export interface AppConfig {
  defaultPageSize: number | null;
  rowCap: number;
  queryTimeoutSeconds: number;
  port: number;
  autoShutdownMinutes: number | null;
}

export const DEFAULT_CONFIG: AppConfig = {
  defaultPageSize: 20,
  rowCap: 10_000,
  queryTimeoutSeconds: 30,
  port: 47600,
  autoShutdownMinutes: null,
};

export type ImportMode = 'replace' | 'branch';

export interface ImportResult {
  notes: number;
  attachments: number;
  rootId: string | null;
}

/** X-01: el ZIP se pide con el token y se descarga con el nombre que da el servidor. */
async function exportData(): Promise<{ blob: Blob; fileName: string }> {
  let res: Response;
  try {
    res = await fetch('/api/data/export', { method: 'POST', headers: { 'X-LiteDD-Token': sessionToken() } });
  } catch {
    throw networkError();
  }
  if (!res.ok) {
    const err = ((await res.json().catch(() => null)) ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Error ${res.status}`, err.details ?? null);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'litedd-export.zip';
  return { blob: await res.blob(), fileName };
}

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
  saveNote: (id: string, title: string, content: string, baseVersion: number, options?: SaveOptions) =>
    request<Note>(
      'PUT',
      `/api/notes/${encodeURIComponent(id)}`,
      options?.snapshot ? { title, content, baseVersion, snapshot: true } : { title, content, baseVersion },
      options?.keepalive ? { keepalive: true } : {},
    ),
  versions: (id: string) => request<NoteVersion[]>('GET', `/api/notes/${encodeURIComponent(id)}/versions`),
  restoreVersion: (id: string, versionId: number, baseVersion: number) =>
    request<Note>('POST', `/api/notes/${encodeURIComponent(id)}/versions/${versionId}/restore`, { baseVersion }),
  setTags: (id: string, tags: string[]) => request<Note>('PUT', `/api/notes/${encodeURIComponent(id)}/tags`, { tags }),
  setFavorite: (id: string, favorite: boolean) => request<Note>('PUT', `/api/notes/${encodeURIComponent(id)}/favorite`, { favorite }),
  tags: () => request<TagCount[]>('GET', '/api/tags'),
  search: (params: string) => request<SearchHit[]>('GET', `/api/search?${params}`),
  uploadAttachment: (noteId: string, file: Blob, name: string) =>
    requestRaw<{ id: string }>('POST', `/api/attachments?noteId=${encodeURIComponent(noteId)}&name=${encodeURIComponent(name)}`, file, file.type),
  attachmentDataUrl,
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
  exportData,
  importData: (file: Blob, mode: ImportMode) => requestRaw<ImportResult>('POST', `/api/data/import?mode=${mode}`, file, 'application/zip'),
  backupNow: () => request<{ file: string }>('POST', '/api/data/backup'),
  openDataFolder: () => request<{ opened: boolean; path: string }>('POST', '/api/data/open-folder'),
  /** U-11: comprobación sin token del servidor. */
  health: async () => {
    try {
      return (await fetch('/api/health', { cache: 'no-store' })).ok;
    } catch {
      return false;
    }
  },
  /** Ciclo de vida: la ventana se cierra. */
  bye: () =>
    fetch('/api/presence/bye', { method: 'POST', keepalive: true, headers: { 'X-LiteDD-Token': sessionToken() } }).catch(() => undefined),
};
