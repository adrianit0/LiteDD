/** Contenido de una nota HTTP (H-03). Mismo formato que HttpNoteContent en el servidor. */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type LoginMode = 'always' | 'none' | 'reuse';
export type BodyMode = 'none' | 'form-data' | 'raw';
export type RawType = 'json' | 'text' | 'xml';

/** H-13 */
export const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export interface Row {
  key: string;
  value: string;
  enabled: boolean;
}

/** H-15: valor cambiado (null = el generado) o desactivación de una cabecera generada. */
export interface GeneratedChange {
  value: string | null;
  enabled: boolean;
}

export interface HttpBody {
  mode: BodyMode;
  rawType: RawType;
  raw: string;
  form: Row[];
}

export interface HttpContent {
  method: HttpMethod;
  endpoint: string;
  pathValues: Record<string, string>;
  params: Row[];
  headers: Row[];
  generated: Record<string, GeneratedChange>;
  body: HttpBody;
  login: LoginMode;
  user: string;
  hideGenerated: boolean;
}

export const EMPTY_CONTENT: HttpContent = {
  method: 'GET',
  endpoint: '',
  pathValues: {},
  params: [],
  headers: [],
  generated: {},
  body: { mode: 'none', rawType: 'json', raw: '', form: [] },
  login: 'always',
  user: '',
  hideGenerated: false,
};

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.map((r) => ({
    key: typeof r?.key === 'string' ? r.key : '',
    value: typeof r?.value === 'string' ? r.value : '',
    enabled: r?.enabled !== false,
  }));
}

/** H-03: el contenido guardado; vacío o ilegible da una llamada GET sin endpoint. */
export function parseContent(text: string): HttpContent {
  if (text.trim() === '') return EMPTY_CONTENT;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return EMPTY_CONTENT;
  }
  const body = (raw.body ?? {}) as Record<string, unknown>;
  const method = String(raw.method ?? 'GET').toUpperCase() as HttpMethod;
  return {
    method: METHODS.includes(method) ? method : 'GET',
    endpoint: typeof raw.endpoint === 'string' ? raw.endpoint : '',
    pathValues: (raw.pathValues && typeof raw.pathValues === 'object' ? raw.pathValues : {}) as Record<string, string>,
    params: rows(raw.params),
    headers: rows(raw.headers),
    generated: (raw.generated && typeof raw.generated === 'object' ? raw.generated : {}) as Record<string, GeneratedChange>,
    body: {
      mode: ['none', 'form-data', 'raw'].includes(String(body.mode)) ? (body.mode as BodyMode) : 'none',
      rawType: ['json', 'text', 'xml'].includes(String(body.rawType)) ? (body.rawType as RawType) : 'json',
      raw: typeof body.raw === 'string' ? body.raw : '',
      form: rows(body.form),
    },
    login: raw.login === 'none' || raw.login === 'reuse' ? raw.login : 'always',
    user: typeof raw.user === 'string' ? raw.user : '',
    hideGenerated: raw.hideGenerated === true,
  };
}

export function serializeContent(content: HttpContent): string {
  return JSON.stringify(content, null, 2);
}

/** H-12: variables {nombre} del endpoint, en orden y sin repetir. */
export function pathVariables(endpoint: string): string[] {
  const names: string[] = [];
  for (const m of endpoint.matchAll(/\{([^{}/]+)\}/g)) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/** H-11: una sola barra entre base y endpoint. */
export function joinUrl(base: string, endpoint: string): string {
  if (endpoint === '') return base;
  const baseSlash = base.endsWith('/');
  const endpointSlash = endpoint.startsWith('/');
  if (baseSlash && endpointSlash) return base + endpoint.slice(1);
  return baseSlash || endpointSlash ? base + endpoint : `${base}/${endpoint}`;
}

/** H-17 */
export function contentTypeFor(body: HttpBody): string {
  if (body.mode === 'form-data') return 'multipart/form-data';
  if (body.mode === 'raw' && body.rawType === 'text') return 'text/plain';
  if (body.mode === 'raw' && body.rawType === 'xml') return 'application/xml';
  return 'application/json';
}

export interface GeneratedHeader {
  name: string;
  /** Valor que se enviará si no se cambia; null si lo pone el login. */
  defaultValue: string | null;
  /** Solo con login. */
  fromLogin: boolean;
}

/** H-15: cabeceras generadas, en el orden en que se envían. */
export function generatedHeaders(content: HttpContent, version: string, withLogin: boolean): GeneratedHeader[] {
  const list: GeneratedHeader[] = [
    { name: 'Accept', defaultValue: 'application/json', fromLogin: false },
    { name: 'Content-Type', defaultValue: contentTypeFor(content.body), fromLogin: false },
    { name: 'User-Agent', defaultValue: `LiteDD/${version}`, fromLogin: false },
    { name: 'Cache-Control', defaultValue: 'no-cache', fromLogin: false },
  ];
  if (withLogin) {
    for (const name of ['X-USERID', 'X-CSRF-TOKEN', 'Cookie']) list.push({ name, defaultValue: null, fromLogin: true });
  }
  return list;
}

/** H-16: sugerencias al escribir el nombre de una cabecera propia. */
export const COMMON_HEADERS = [
  'Accept',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'If-Match',
  'If-None-Match',
  'Origin',
  'Pragma',
  'Referer',
  'User-Agent',
  'X-CSRF-TOKEN',
  'X-Requested-With',
  'X-USERID',
];

/** H-16: las pone el cliente HTTP y no se pueden escribir. */
export const RESTRICTED_HEADERS = ['host', 'content-length', 'connection', 'expect', 'upgrade'];

/** H-17: «Formatear JSON»; null si no es JSON válido. */
export function formatJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

/** H-34: un cuerpo de respuesta JSON se muestra sangrado; si no lo es, tal cual. */
export function prettyBody(text: string, contentType: string | null): { text: string; json: boolean } {
  const looksJson = (contentType ?? '').toLowerCase().includes('json') || /^\s*[[{]/.test(text);
  if (looksJson) {
    const pretty = formatJson(text);
    if (pretty !== null) return { text: pretty, json: true };
  }
  return { text, json: false };
}

/** U-03: tamaño con coma decimal. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString('es-ES', { maximumFractionDigits: 1 })} KB`;
  return `${(kb / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
}
