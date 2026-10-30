import type { Mode, Note, NoteType, TreeNode, TrashItem } from './types';
import type { MapperAnalysis } from './mapper';
import type { Analysis, Column, ExecuteResponse, Sort } from './sql/types';
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
  /** N-07: si falta, el servidor conserva la descripción actual. */
  description?: string;
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

/** M-61, M-65: constante Java de los mappers, con su valor común a todas las notas. */
export interface JavaConstant {
  /** paquete.Clase@CAMPO */
  name: string;
  /** Clase.CAMPO */
  shortName: string;
  packageName: string;
  value: string | null;
  /** Notas SQL y XML que la usan; 0 = «sin uso» (M-66). */
  notes: number;
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
  /** N-40, N-46: false = guardado manual. */
  autosave: boolean;
  /** H-10, H-20, H-22, H-31, H-35, H-60. Las contraseñas y la clave no están aquí (H-21, H-64). */
  http: HttpSettings;
  /** R-11: URL del repositorio de actualizaciones; null = sin conexión a GitHub. */
  updateRepository: string | null;
}

/** R-10, R-14: reason dice por qué no está disponible. */
export interface UpdateStatus {
  version: string;
  build: number;
  commit: string;
  available: boolean;
  reason: string | null;
}

/** R-03 */
export interface UpdateRelease {
  build: number;
  version: string;
  commit: string;
  date: string;
  size: number;
  sha256: string;
  commits: string[];
}

export interface UpdateCheck {
  newer: boolean;
  latest: UpdateRelease;
}

/** H-60: el perfil fijo. */
export const LOCAL_PROFILE_ID = 'local';

/** H-61: destino de las notas HTTP. La contraseña se guarda aparte (H-21). */
export interface HttpProfile {
  id: string;
  name: string;
  baseUrl: string | null;
  user: string;
  /** H-69: pedir la clave de confirmación al enviar. */
  requireKey: boolean;
  /** H-71: exigir la CA corporativa; sin ella, las CA de confianza de Java. Local, siempre false. */
  requireCa: boolean;
}

export interface HttpSettings {
  /** H-62: «Permitir entornos de preproducción». */
  preproduction: boolean;
  /** Local siempre el primero; los entornos, en el orden de «Ajustes» (H-70). */
  profiles: HttpProfile[];
  loginNoteId: string | null;
  timeoutSeconds: number;
  maxResponseMb: number;
  /** H-15, ADR-0022: valores por defecto de las cabeceras generadas fijas; null = el de serie. */
  accept: string | null;
  userAgent: string | null;
  cacheControl: string | null;
}

export const DEFAULT_HTTP: HttpSettings = {
  preproduction: false,
  profiles: [{ id: LOCAL_PROFILE_ID, name: 'Local', baseUrl: null, user: '', requireKey: false, requireCa: false }],
  loginNoteId: null,
  timeoutSeconds: 30,
  maxResponseMb: 10,
  accept: null,
  userAgent: null,
  cacheControl: null,
};

export const DEFAULT_CONFIG: AppConfig = {
  defaultPageSize: 20,
  rowCap: 10_000,
  queryTimeoutSeconds: 30,
  port: 47600,
  autoShutdownMinutes: null,
  autosave: true,
  http: DEFAULT_HTTP,
  updateRepository: null,
};

export interface HttpHeader {
  name: string;
  value: string;
}

export interface HttpCookie {
  name: string;
  value: string;
  domain: string | null;
  path: string | null;
  maxAge: number | null;
  httpOnly: boolean;
  secure: boolean;
}

/** H-33 a H-35: text si es texto; base64 si es binario. */
export interface HttpReceived {
  status: number;
  statusText: string;
  millis: number;
  size: number;
  contentType?: string;
  headers: HttpHeader[];
  cookies: HttpCookie[];
  text?: string;
  base64?: string;
  binary: boolean;
  truncated: boolean;
}

/** phase «login»: el error o la respuesta son del login (H-26). */
export interface HttpResult {
  phase: 'login' | 'request';
  error?: { code: string; message: string };
  request?: { method: string; url: string; headers: HttpHeader[] };
  response?: HttpReceived;
  login?: { user: string; status: number; millis: number };
  /** H-33: el perfil con el que se hizo. */
  profile?: { id: string; name: string };
}

/** H-21, H-69, S-21: qué perfiles tienen contraseña y si hay clave; nunca sus valores. */
export interface HttpCredentialsState {
  passwords: Record<string, boolean>;
  hasConfirmKey: boolean;
}

/** H-66: certificado de la CA corporativa importada. notAfter en ISO-8601. */
export interface CaCertificate {
  subject: string;
  notAfter: string;
}

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

/** W-51: valores de consulta de un workflow en una pestaña, por nodo y campo. */
export interface WorkflowTabState {
  values: Record<string, Record<string, string>>;
}

export interface SessionTab {
  id: string;
  noteId: string;
  mode: Mode;
  active: boolean;
  /** P-14: preview = pestaña provisional, en cursiva. */
  state: { scroll?: number; sql?: SqlTabState | null; workflow?: WorkflowTabState | null; preview?: boolean } | null;
}

/** W-23 a W-26: la nota de un nodo de workflow. state: active, trash o missing. */
export interface WorkflowNoteInfo {
  id: string;
  state: 'active' | 'trash' | 'missing';
  type?: NoteType;
  title?: string;
  method?: string;
  endpoint?: string;
  /** SQL: si es una consulta que se puede ejecutar (Q-45). */
  executable?: boolean;
  fields?: { name: string; type?: string }[];
  /** Valores iniciales: los guardados en la nota HTTP o los últimos ejecutados de la SQL. */
  values?: Record<string, string | null>;
  error?: string;
}

export interface WorkflowAnalysis {
  notes: WorkflowNoteInfo[];
  /** W-51: solo si se pidió con workflowId. */
  lastValues?: Record<string, Record<string, string | null>>;
}

/** W-64: todas las filas de un nodo SQL, hasta el tope. */
export interface WorkflowRows {
  columns: Column[];
  rows: (string | null)[][];
  capReached: boolean;
  serverMillis: number;
}

export type NodeStatus = 'running' | 'ok' | 'error' | 'cancelled';

/** W-70 a W-72: un evento por línea de la ejecución en streaming (ADR-0031). */
export type WorkflowEvent =
  | { type: 'start'; chain: string[] }
  | {
      type: 'node';
      nodeId: string;
      status: NodeStatus;
      millis?: number;
      /** W-78: lo escrito en cada campo, con sus referencias. */
      raw?: Record<string, string>;
      values?: Record<string, string | null>;
      /** W-78: referencias que no existían. */
      missing?: string[];
      error?: { code: string; message: string };
      http?: HttpResult;
      sql?: WorkflowRows;
    }
  | { type: 'end'; status: 'finished' | 'stopped' | 'cancelled'; errors: number; millis: number; message: string }
  | { type: 'tick' };

export interface WorkflowExecuteRequest {
  noteId: string;
  version: number;
  executionId: string;
  profileId: string;
  confirmKey?: string;
  values: Record<string, Record<string, string>>;
}

/**
 * W-60: la respuesta llega en JSON por líneas; cada evento se entrega en cuanto llega. Los errores previos (W-61,
 * A-05, H-63, H-69) responden como un error normal (A-02).
 */
async function workflowExecute(req: WorkflowExecuteRequest, onEvent: (e: WorkflowEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/workflow/execute', {
      method: 'POST',
      headers: { 'X-LiteDD-Token': sessionToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch {
    if (signal?.aborted) return;
    throw networkError();
  }
  if (!res.ok || !res.body) {
    const err = ((await res.json().catch(() => null)) ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Error ${res.status}`, err.details ?? null);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (all: boolean) => {
    let nl = buffer.indexOf('\n');
    while (nl >= 0 || (all && buffer.trim() !== '')) {
      const line = nl >= 0 ? buffer.slice(0, nl) : buffer;
      buffer = nl >= 0 ? buffer.slice(nl + 1) : '';
      if (line.trim() !== '') onEvent(JSON.parse(line) as WorkflowEvent);
      nl = buffer.indexOf('\n');
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flush(false);
    }
  } catch {
    if (signal?.aborted) return;
    throw networkError();
  }
  flush(true);
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
      {
        title,
        content,
        baseVersion,
        ...(options?.description !== undefined ? { description: options.description } : {}),
        ...(options?.snapshot ? { snapshot: true } : {}),
      },
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
  /** N-08 */
  duplicateNote: (id: string) => request<Note>('POST', `/api/notes/${encodeURIComponent(id)}/duplicate`),
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
  /** M-41 */
  analyzeMapper: (content: string, noteId?: string) => request<MapperAnalysis>('POST', '/api/mybatis/analyze', { content, noteId }),
  /** M-61, M-65 */
  constants: () => request<JavaConstant[]>('GET', '/api/constants'),
  /** M-65, M-66: un valor vacío deja la constante sin valor. */
  putConstants: (values: Record<string, string>) => request<JavaConstant[]>('PUT', '/api/constants', { values }),
  execute: (req: ExecuteRequest) => request<ExecuteResponse>('POST', '/api/sql/execute', req),
  count: (req: ExecuteRequest) => request<{ total: number }>('POST', '/api/sql/count', req),
  cancel: (executionId: string) => request<{ cancelled: boolean }>('POST', '/api/sql/cancel', { executionId }),
  /** H-30, H-63: con el perfil que se muestra. H-69: la clave, si el perfil la pide. */
  httpExecute: (noteId: string, version: number, executionId: string, profileId: string, confirmKey?: string) =>
    request<HttpResult>('POST', '/api/http/execute', { noteId, version, executionId, profileId, confirmKey }),
  httpCancel: (executionId: string) => request<{ cancelled: boolean }>('POST', '/api/http/cancel', { executionId }),
  /** W-23 a W-26, W-51 */
  workflowAnalyze: (noteIds: string[], workflowId?: string) =>
    request<WorkflowAnalysis>('POST', '/api/workflow/analyze', { noteIds, workflowId }),
  /** W-60 a W-72 */
  workflowExecute,
  workflowCancel: (executionId: string) => request<{ cancelled: boolean }>('POST', '/api/workflow/cancel', { executionId }),
  /** H-63 */
  httpProfile: () => request<{ active: string }>('GET', '/api/http/profile'),
  setHttpProfile: (id: string) => request<{ active: string }>('PUT', '/api/http/profile', { id }),
  /** H-21: solo se sabe qué perfiles tienen contraseña; nunca se lee. */
  httpCredentials: () => request<HttpCredentialsState>('GET', '/api/http/credentials'),
  setHttpPassword: (profileId: string, password: string) =>
    request<HttpCredentialsState>('PUT', '/api/http/credentials', { profileId, password }),
  /** H-69: vacía la borra. */
  setConfirmKey: (key: string) => request<{ hasConfirmKey: boolean }>('PUT', '/api/http/confirm-key', { key }),
  /** H-66 */
  httpCa: () => request<{ certificates: CaCertificate[] }>('GET', '/api/http/ca'),
  importHttpCa: (pem: string) => request<{ certificates: CaCertificate[] }>('PUT', '/api/http/ca', { pem }),
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
  updateStatus: () => request<UpdateStatus>('GET', '/api/update'),
  checkUpdate: () => request<UpdateCheck>('POST', '/api/update/check'),
  applyUpdate: (build: number) => request<{ restarting: boolean }>('POST', '/api/update/apply', { build }),
  /** U-11: comprobación sin token del servidor. */
  health: async () => {
    try {
      return (await fetch('/api/health', { cache: 'no-store' })).ok;
    } catch {
      return false;
    }
  },
  /**
   * U-11: si el servidor se ha reiniciado, el token de sesión ha cambiado (S-12). Se relee de la página
   * inicial, del mismo origen, para que lo pendiente se pueda guardar sin recargar la ventana.
   */
  refreshToken: async () => {
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text();
      const token = /<meta[^>]*name="litedd-token"[^>]*content="([^"]+)"/.exec(html)?.[1];
      const meta = document.querySelector<HTMLMetaElement>('meta[name="litedd-token"]');
      if (token && meta) meta.content = token;
    } catch {
      // Sin página no hay token nuevo; las peticiones siguientes lo indicarán.
    }
  },
  /** Versión de la aplicación, para el User-Agent mostrado (H-15). */
  appVersion: async () => {
    try {
      const info = (await (await fetch('/api/health', { cache: 'no-store' })).json()) as { version?: string };
      return info.version ?? '';
    } catch {
      return '';
    }
  },
  /** R-45: build del servidor en marcha; null si no se sabe. */
  appBuild: async () => {
    try {
      const info = (await (await fetch('/api/health', { cache: 'no-store' })).json()) as { build?: number };
      return info.build ?? null;
    } catch {
      return null;
    }
  },
  /** Ciclo de vida: la ventana se cierra. */
  bye: () =>
    fetch('/api/presence/bye', { method: 'POST', keepalive: true, headers: { 'X-LiteDD-Token': sessionToken() } }).catch(() => undefined),
};
