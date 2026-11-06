/**
 * H-75 a H-79, ADR-0042: convierte un comando cURL en el contenido de una nota HTTP y al revés.
 */
import {
  EMPTY_CONTENT,
  METHODS,
  RESTRICTED_HEADERS,
  generatedHeaders,
  joinUrl,
  type HttpContent,
  type HttpMethod,
  type RawType,
  type Row,
} from './content';

export class CurlError extends Error {}

export interface CurlImport {
  title: string;
  content: HttpContent;
  /** H-77: nombres de lo descartado, sin repetir. */
  discarded: string[];
  /** H-76, H-78: avisos para el usuario. */
  warnings: string[];
}

// ---------------------------------------------------------------- Troceado

/** Cadena $'…' de bash: \n, \t, \uXXXX, \xHH (bytes UTF-8)… */
function ansiC(text: string, start: number): [string, number] {
  let out = '';
  let bytes: number[] = [];
  const flush = () => {
    if (bytes.length) out += new TextDecoder().decode(new Uint8Array(bytes));
    bytes = [];
  };
  let i = start;
  while (i < text.length && text[i] !== "'") {
    const c = text[i];
    if (c !== '\\') {
      flush();
      out += c;
      i++;
      continue;
    }
    const n = text[i + 1];
    if (n === 'x') {
      const hex = /^[0-9a-fA-F]{1,2}/.exec(text.slice(i + 2))?.[0] ?? '';
      bytes.push(parseInt(hex || '0', 16));
      i += 2 + hex.length;
      continue;
    }
    flush();
    if (n === 'u' || n === 'U') {
      const braced = /^\{([0-9a-fA-F]+)\}/.exec(text.slice(i + 2));
      const hex = braced ? braced[1] : (/^[0-9a-fA-F]{1,8}/.exec(text.slice(i + 2))?.[0] ?? '');
      out += String.fromCodePoint(parseInt(hex || '0', 16));
      i += 2 + (braced ? braced[0].length : hex.length);
      continue;
    }
    const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"', '?': '?', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v' };
    out += simple[n] ?? `\\${n ?? ''}`;
    i += 2;
  }
  flush();
  return [out, i + 1];
}

/** Palabras de un comando de bash. */
function bashWords(text: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  let i = 0;
  const add = (s: string) => (word = (word ?? '') + s);
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && (text[i + 1] === '\n' || (text[i + 1] === '\r' && text[i + 2] === '\n'))) {
      i += text[i + 1] === '\r' ? 3 : 2;
    } else if (/\s/.test(c)) {
      if (word !== null) words.push(word);
      word = null;
      i++;
    } else if (c === '\\') {
      add(text[i + 1] ?? '');
      i += 2;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) throw new CurlError('Falta cerrar una comilla simple.');
      add(text.slice(i + 1, end));
      i = end + 1;
    } else if (c === '$' && text[i + 1] === "'") {
      const [value, next] = ansiC(text, i + 2);
      if (next > text.length) throw new CurlError('Falta cerrar una comilla simple.');
      add(value);
      i = next;
    } else if (c === '"') {
      let value = '';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && '"\\$`\n'.includes(text[i + 1] ?? '')) {
          if (text[i + 1] !== '\n') value += text[i + 1];
          i += 2;
        } else value += text[i++];
      }
      if (i >= text.length) throw new CurlError('Falta cerrar una comilla doble.');
      add(value);
      i++;
    } else {
      add(c);
      i++;
    }
  }
  if (word !== null) words.push(word);
  return words;
}

/**
 * Palabras de un comando de cmd como el de «Copy as cURL (cmd)» de Chrome: ^ escapa el carácter siguiente
 * (y al final de línea continúa el comando) y las comillas dobles admiten \" y \\.
 */
function cmdWords(text: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  let quoted = false;
  let i = 0;
  const add = (s: string) => (word = (word ?? '') + s);
  const newlineAt = (j: number) => (text[j] === '\n' ? 1 : text[j] === '\r' && text[j + 1] === '\n' ? 2 : 0);
  while (i < text.length) {
    const c = text[i];
    if (c === '^') {
      const nl = newlineAt(i + 1);
      if (nl) {
        i += 1 + nl;
        // Dentro de comillas, Chrome escribe un salto de línea como ^ + dos saltos.
        if (quoted) {
          const second = newlineAt(i);
          if (second) i += second;
          add('\n');
        }
        continue;
      }
      // ^" abre o cierra comillas igual que ".
      if (text[i + 1] === '"') {
        quoted = !quoted;
        if (word === null) word = '';
        i += 2;
        continue;
      }
      if (quoted && text[i + 1] === '\\' && (text[i + 2] === '^' || text[i + 2] === '\\')) {
        // ^\^" es una comilla escapada; ^\^\ (o ^\\) una barra.
        const target = text[i + 2] === '^' ? text[i + 3] : '\\';
        add(target);
        i += text[i + 2] === '^' ? 4 : 3;
        continue;
      }
      add(text[i + 1] ?? '');
      i += 2;
    } else if (c === '"') {
      quoted = !quoted;
      if (word === null) word = '';
      i++;
    } else if (quoted && c === '\\' && (text[i + 1] === '"' || text[i + 1] === '\\')) {
      add(text[i + 1]);
      i += 2;
    } else if (!quoted && /\s/.test(c)) {
      if (word !== null) words.push(word);
      word = null;
      i++;
    } else {
      add(c);
      i++;
    }
  }
  if (quoted) throw new CurlError('Falta cerrar una comilla doble.');
  if (word !== null) words.push(word);
  return words;
}

/** H-75: bash o cmd, según cómo esté escrito. */
export function curlWords(text: string): string[] {
  const cmd = /\^"|\s\^\r?\n/.test(text);
  return cmd ? cmdWords(text) : bashWords(text);
}

// ---------------------------------------------------------------- Opciones

/** Opciones de curl que llevan valor y no cambian la petición. */
const IGNORED_WITH_VALUE = new Set([
  '-o', '--output', '-m', '--max-time', '--connect-timeout', '-x', '--proxy', '-w', '--write-out', '--retry',
  '--cacert', '--cert', '--key', '-E', '--resolve', '-c', '--cookie-jar', '-D', '--dump-header', '-K', '--config',
  '--limit-rate', '-r', '--range', '-y', '--speed-time', '-Y', '--speed-limit', '--max-redirs', '-T', '--upload-file',
  '--interface', '--dns-servers', '--retry-delay', '--retry-max-time', '--trace', '--trace-ascii',
]);

const DATA_OPTIONS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode', '--json']);

interface Parsed {
  url: string | null;
  method: string | null;
  headers: [string, string][];
  data: string[];
  form: [string, string][];
  get: boolean;
  head: boolean;
  json: boolean;
  discarded: string[];
  warnings: string[];
}

function encodeData(option: string, value: string): string {
  if (option !== '--data-urlencode') return value;
  const eq = value.indexOf('=');
  if (eq < 0) return encodeURIComponent(value);
  return `${value.slice(0, eq)}=${encodeURIComponent(value.slice(eq + 1))}`;
}

function parseOptions(words: string[]): Parsed {
  const p: Parsed = { url: null, method: null, headers: [], data: [], form: [], get: false, head: false, json: false, discarded: [], warnings: [] };
  let i = 1;
  const value = (option: string) => {
    if (i + 1 >= words.length) throw new CurlError(`Falta el valor de ${option}.`);
    i += 1;
    return words[i];
  };
  const positionals: string[] = [];
  for (; i < words.length; i++) {
    let w = words[i];
    let inline: string | null = null;
    // -XPOST, -H'…', --request=POST
    const long = /^(--[a-z0-9-]+)=(.*)$/s.exec(w);
    if (long) [w, inline] = [long[1], long[2]];
    else if (/^-[XHdbuFeA]./s.test(w)) [w, inline] = [w.slice(0, 2), w.slice(2)];
    const arg = (option: string) => inline ?? value(option);

    if (w === '-X' || w === '--request') p.method = arg(w).toUpperCase();
    else if (w === '--url') p.url = arg(w);
    else if (w === '-H' || w === '--header') {
      const h = arg(w);
      const colon = h.indexOf(':');
      if (colon > 0) p.headers.push([h.slice(0, colon).trim(), h.slice(colon + 1).trim()]);
      else if (h.endsWith(';')) p.headers.push([h.slice(0, -1).trim(), '']);
    } else if (w === '-A' || w === '--user-agent') p.headers.push(['User-Agent', arg(w)]);
    else if (w === '-e' || w === '--referer') p.headers.push(['Referer', arg(w)]);
    else if (w === '-b' || w === '--cookie') {
      arg(w);
      p.discarded.push('Cookie');
    } else if (w === '-u' || w === '--user') {
      arg(w);
      p.discarded.push('usuario y contraseña (-u)');
    } else if (DATA_OPTIONS.has(w)) {
      const d = arg(w);
      if (w === '--json') p.json = true;
      if (d.startsWith('@') && w !== '--data-raw' && w !== '--data-urlencode') p.warnings.push(`Se descarta el fichero ${d.slice(1)} del cuerpo.`);
      else p.data.push(encodeData(w, d));
    } else if (w === '-F' || w === '--form' || w === '--form-string') {
      const f = arg(w);
      const eq = f.indexOf('=');
      const name = eq < 0 ? f : f.slice(0, eq);
      const v = eq < 0 ? '' : f.slice(eq + 1);
      if (w !== '--form-string' && (v.startsWith('@') || v.startsWith('<'))) p.warnings.push(`Se descarta el fichero del campo ${name}.`);
      else p.form.push([name, v]);
    } else if (w === '-G' || w === '--get') p.get = true;
    else if (w === '-I' || w === '--head') p.head = true;
    else if (IGNORED_WITH_VALUE.has(w)) arg(w);
    else if (w.startsWith('-') && w.length > 1) continue;
    else positionals.push(w);
  }
  p.url ??= positionals.find((w) => /^https?:\/\//i.test(w)) ?? positionals[0] ?? null;
  return p;
}

// ---------------------------------------------------------------- Importar

/** H-77: las calcula LiteDD, son del login o llevan secretos. */
const CALCULATED = ['cookie', 'x-csrf-token', 'x-userid', 'authorization'];
/** H-77: las pone el navegador o LiteDD no las necesita. */
const BROWSER = ['accept-encoding', 'priority'];

/** H-76: quita la URL base más larga que coincida. */
function endpointOf(url: URL, bases: string[], warnings: string[]): string {
  const target = url.origin + url.pathname;
  let best: string | null = null;
  for (const base of bases) {
    let normalized: string;
    try {
      const b = new URL(base);
      normalized = (b.origin + b.pathname).replace(/\/+$/, '');
    } catch {
      continue;
    }
    if ((target === normalized || target.startsWith(`${normalized}/`)) && (best === null || normalized.length > best.length)) best = normalized;
  }
  if (best === null) {
    warnings.push('La URL no empieza por la URL base de ningún perfil: se usa solo la ruta.');
    return url.pathname;
  }
  const rest = target.slice(best.length);
  return rest === '' ? '/' : rest;
}

function rawTypeOf(contentType: string): RawType | null {
  const ct = contentType.toLowerCase();
  if (ct.includes('json')) return 'json';
  if (ct.includes('xml')) return 'xml';
  if (ct.split(';')[0].trim() === 'text/plain') return 'text';
  return null;
}

/** H-78: campos de texto de un cuerpo multipart/form-data; los ficheros se descartan. */
function multipartRows(body: string, contentType: string, warnings: string[]): Row[] | null {
  const boundary = /boundary=("?)([^";]+)\1/i.exec(contentType)?.[2];
  if (!boundary) return null;
  const rows: Row[] = [];
  for (const part of body.split(`--${boundary}`)) {
    const sep = /\r?\n\r?\n/.exec(part);
    if (!sep) continue;
    const head = part.slice(0, sep.index);
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    if (name === undefined) continue;
    const file = /filename="([^"]*)"/i.exec(head);
    if (file) {
      warnings.push(`Se descarta el fichero del campo ${name}.`);
      continue;
    }
    rows.push({ key: name, value: part.slice(sep.index + sep[0].length).replace(/\r?\n$/, ''), enabled: true });
  }
  return rows;
}

function queryRows(query: string): Row[] {
  return [...new URLSearchParams(query)].map(([key, value]) => ({ key, value, enabled: true }));
}

/**
 * H-75 a H-78: nota HTTP a partir de un comando cURL.
 * bases: URL base de los perfiles; defaults: cabeceras de «Ajustes → Cabeceras».
 */
export function importCurl(text: string, bases: (string | null)[], defaults: Row[]): CurlImport {
  const words = curlWords(text.trim());
  if (words.length === 0 || !/^curl(\.exe)?$/i.test(words[0])) throw new CurlError('El texto no es un comando cURL: debe empezar por curl.');
  const p = parseOptions(words);
  if (!p.url) throw new CurlError('El comando no tiene URL.');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(p.url) ? p.url : `http://${p.url}`);
  } catch {
    throw new CurlError(`La URL no es válida: ${p.url}`);
  }
  const warnings = [...p.warnings];
  const discarded = [...p.discarded];
  const content: HttpContent = structuredClone(EMPTY_CONTENT);
  content.endpoint = endpointOf(url, bases.filter((b): b is string => !!b), warnings);
  content.params = queryRows(url.search);

  const defaultNames = defaults.map((d) => d.key.trim().toLowerCase()).filter((n) => n !== '');
  let contentType: string | null = p.json ? 'application/json' : null;
  for (const [name, value] of p.headers) {
    const lower = name.toLowerCase();
    if (lower === 'content-type') contentType = value;
    else if (CALCULATED.includes(lower) || RESTRICTED_HEADERS.includes(lower) || BROWSER.includes(lower) || lower.startsWith('sec-') || defaultNames.includes(lower)) discarded.push(name);
    else content.headers.push({ key: name, value, enabled: true });
  }
  if (contentType !== null && !(p.form.length > 0 || p.data.length > 0)) discarded.push('Content-Type');

  const data = p.data.join('&');
  if (p.form.length > 0) {
    content.body = { ...content.body, mode: 'form-data', form: p.form.map(([key, value]) => ({ key, value, enabled: true })) };
  } else if (p.data.length > 0 && p.get) {
    content.params.push(...queryRows(data));
  } else if (p.data.length > 0) {
    const ct = contentType ?? 'application/x-www-form-urlencoded';
    const multipart = ct.toLowerCase().startsWith('multipart/form-data') ? multipartRows(data, ct, warnings) : null;
    if (multipart) content.body = { ...content.body, mode: 'form-data', form: multipart };
    else {
      const rawType = rawTypeOf(ct);
      content.body = { ...content.body, mode: 'raw', rawType: rawType ?? 'text', raw: data };
      // H-78: un Content-Type que LiteDD no genera se guarda como valor cambiado.
      if (rawType === null) content.generated['Content-Type'] = { value: ct, enabled: true };
    }
  }

  const method = p.method ?? (p.head ? 'HEAD' : (p.data.length > 0 && !p.get) || p.form.length > 0 ? 'POST' : 'GET');
  if (!METHODS.includes(method as HttpMethod)) throw new CurlError(`LiteDD no admite el método ${method}.`);
  content.method = method as HttpMethod;

  const unique = [...new Set(discarded)];
  return { title: `${content.method} ${content.endpoint}`.slice(0, 200), content, discarded: unique, warnings };
}

// ---------------------------------------------------------------- Exportar

/** Comillas simples de bash. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const VARIABLE = /#\{([^{}]+)\}/g;

/** H-79: nunca salen del ordenador en un comando copiado. */
const SECRET_HEADERS = ['authorization', 'cookie', 'x-csrf-token', 'x-userid', 'proxy-authorization'];

export interface CurlExport {
  command: string;
  /** H-79: variables sin valor, que quedan como #{nombre}. */
  missing: string[];
}

/**
 * H-79: comando cURL para bash con la URL base del perfil activo, sin contraseñas, cookies ni cabeceras del login.
 */
export function exportCurl(content: HttpContent, baseUrl: string, version: string, defaults: Row[]): CurlExport {
  const missing: string[] = [];
  const fill = (text: string, encode: (s: string) => string = (s) => s) =>
    text.replace(VARIABLE, (whole, raw: string) => {
      const name = raw.trim();
      const v = content.pathValues[name] ?? '';
      if (v.trim() === '') {
        if (!missing.includes(name)) missing.push(name);
        return whole;
      }
      return encode(v);
    });

  const params = content.params
    .filter((r) => r.enabled && r.key.trim() !== '')
    .map((r) => `${encodeURIComponent(fill(r.key))}=${encodeURIComponent(fill(r.value))}`);
  const url = joinUrl(baseUrl, fill(content.endpoint, encodeURIComponent)) + (params.length ? `?${params.join('&')}` : '');

  const headers: [string, string][] = [];
  const own = content.headers.filter((r) => r.enabled && r.key.trim() !== '');
  const ownNames = own.map((r) => r.key.trim().toLowerCase());
  const formData = content.body.mode === 'form-data';
  for (const g of generatedHeaders(content, version, false, defaults)) {
    const lower = g.name.toLowerCase();
    if (SECRET_HEADERS.includes(lower) || ownNames.includes(lower)) continue;
    // Con form-data, curl pone el Content-Type con su boundary.
    if (formData && lower === 'content-type') continue;
    const change = content.generated[g.name];
    if (!(change?.enabled ?? g.enabled)) continue;
    headers.push([g.name, fill(change?.value ?? g.defaultValue ?? '')]);
  }
  for (const r of own) {
    if (SECRET_HEADERS.includes(r.key.trim().toLowerCase())) continue;
    if (formData && r.key.trim().toLowerCase() === 'content-type') continue;
    headers.push([fill(r.key.trim()), fill(r.value)]);
  }

  const lines = [`curl ${shellQuote(url)}`];
  if (content.method === 'HEAD') lines.push('-I');
  else if (content.method !== 'GET') lines.push(`-X ${content.method}`);
  for (const [name, value] of headers) lines.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  if (content.body.mode === 'raw' && content.body.raw !== '') lines.push(`--data-raw ${shellQuote(fill(content.body.raw))}`);
  if (formData) {
    for (const r of content.body.form.filter((r) => r.enabled && r.key.trim() !== '')) lines.push(`--form-string ${shellQuote(`${fill(r.key)}=${fill(r.value)}`)}`);
  }
  return { command: lines.join(' \\\n  '), missing };
}
