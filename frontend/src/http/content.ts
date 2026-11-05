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

const VARIABLE = /#\{([^{}]+)\}/g;

function collect(text: string | null | undefined, names: string[]) {
  for (const m of (text ?? '').matchAll(VARIABLE)) {
    const name = m[1].trim();
    if (name !== '' && !names.includes(name)) names.push(name);
  }
}

/**
 * H-12, ADR-0022: variables #{nombre} de toda la nota, en orden y sin repetir; solo de lo que se envía.
 * Mismo criterio que Variables.names en el servidor.
 */
export function variableNames(c: HttpContent): string[] {
  const names: string[] = [];
  collect(c.endpoint, names);
  for (const r of c.params.filter((r) => r.enabled)) {
    collect(r.key, names);
    collect(r.value, names);
  }
  for (const r of c.headers.filter((r) => r.enabled)) {
    collect(r.key, names);
    collect(r.value, names);
  }
  for (const g of Object.values(c.generated)) if (g.enabled !== false) collect(g.value, names);
  if (c.body.mode === 'raw') collect(c.body.raw, names);
  if (c.body.mode === 'form-data') {
    for (const r of c.body.form.filter((r) => r.enabled)) {
      collect(r.key, names);
      collect(r.value, names);
    }
  }
  return names;
}

/** H-18: la forma antigua {nombre} en el endpoint, que ya no es variable; null si no hay. */
export function oldVariable(endpoint: string): string | null {
  return /(?<!#)\{([^{}/]+)\}/.exec(endpoint.replace(VARIABLE, ''))?.[1] ?? null;
}

/** H-11: una sola barra entre base y endpoint. */
export function joinUrl(base: string, endpoint: string): string {
  if (endpoint === '') return base;
  const baseSlash = base.endsWith('/');
  const endpointSlash = endpoint.startsWith('/');
  if (baseSlash && endpointSlash) return base + endpoint.slice(1);
  return baseSlash || endpointSlash ? base + endpoint : `${base}/${endpoint}`;
}

/** H-17, ADR-0038: el cuerpo raw se envía en UTF-8 y lo declara. */
export function contentTypeFor(body: HttpBody): string {
  if (body.mode === 'form-data') return 'multipart/form-data';
  if (body.mode !== 'raw') return 'application/json';
  if (body.rawType === 'text') return 'text/plain; charset=UTF-8';
  if (body.rawType === 'xml') return 'application/xml; charset=UTF-8';
  return 'application/json; charset=UTF-8';
}

export interface GeneratedHeader {
  name: string;
  /** Valor que se enviará si no se cambia; con login, lo que se añade a lo del login (null, nada). */
  defaultValue: string | null;
  /** Solo con login. */
  fromLogin: boolean;
  /** H-72: si se envía cuando la nota no dice nada. */
  enabled: boolean;
}

/** H-72, H-74: cabeceras por defecto de serie; en ellas, el valor vacío es el de serie. */
export const BASIC_HEADERS: Row[] = [
  { key: 'Accept', value: '', enabled: true },
  { key: 'User-Agent', value: '', enabled: true },
  { key: 'Cache-Control', value: '', enabled: true },
];

/** H-73: las calcula LiteDD en cada llamada. */
const CALCULATED_HEADERS = ['content-type', 'x-userid', 'x-csrf-token', 'authorization'];

/** H-72: valor de serie de una cabecera básica; null si no lo es. */
export function serieValue(name: string, version: string): string | null {
  switch (name.trim().toLowerCase()) {
    case 'accept':
      return 'application/json';
    case 'user-agent':
      return `LiteDD/${version}`;
    case 'cache-control':
      return 'no-cache';
    default:
      return null;
  }
}

/** H-74: las básicas al principio, activas y con el valor de serie; las demás filas se conservan. */
export function restoreBasicHeaders(rows: Row[]): Row[] {
  const basic = BASIC_HEADERS.map((h) => h.key.toLowerCase());
  return [...BASIC_HEADERS, ...rows.filter((r) => !basic.includes(r.key.trim().toLowerCase()))];
}

/** H-73: por qué una fila no vale como cabecera por defecto; null si vale. */
export function defaultHeaderProblem(row: Row, rows: Row[]): string | null {
  const name = row.key.trim();
  const lower = name.toLowerCase();
  if (name === '') return null;
  if (RESTRICTED_HEADERS.includes(lower)) return 'La pone el cliente; no se puede escribir';
  if (CALCULATED_HEADERS.includes(lower)) return 'La calcula LiteDD en cada llamada';
  if (/[^\x21-\x7e]|:/.test(name)) return 'No es un nombre de cabecera válido';
  if (rows.filter((r) => r.key.trim().toLowerCase() === lower).length > 1) return 'Está repetida';
  return null;
}

/**
 * H-15, H-72, H-73: cabeceras generadas en el orden en que se envían: las de «Ajustes», Content-Type y las del login.
 * Una Cookie de «Ajustes» activa se añade a la del login y conserva su sitio.
 */
export function generatedHeaders(content: HttpContent, version: string, withLogin: boolean, defaults: Row[]): GeneratedHeader[] {
  const list: GeneratedHeader[] = defaults
    .filter((h) => h.key.trim() !== '')
    .map((h) => ({ name: h.key.trim(), defaultValue: h.value.trim() || (serieValue(h.key, version) ?? ''), fromLogin: false, enabled: h.enabled }));
  list.push({ name: 'Content-Type', defaultValue: contentTypeFor(content.body), fromLogin: false, enabled: true });
  if (withLogin) {
    for (const name of ['X-USERID', 'X-CSRF-TOKEN']) list.push({ name, defaultValue: null, fromLogin: true, enabled: true });
    const extra = list.findIndex((h) => h.name.toLowerCase() === 'cookie');
    const added = extra >= 0 && list[extra].enabled && list[extra].defaultValue ? list[extra].defaultValue : null;
    const cookie = { name: extra >= 0 ? list[extra].name : 'Cookie', defaultValue: added, fromLogin: true, enabled: true };
    if (extra >= 0) list[extra] = cookie;
    else list.push(cookie);
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
