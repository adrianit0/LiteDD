import type { JavaConstant } from './api';

/**
 * M-69, M-70, ADR-0037: lectura de los campos de un .java de constantes para la migración masiva. Solo entiende
 * literales, construcciones de los tipos envoltorio y referencias a otros campos del mismo texto; las operaciones no
 * se calculan.
 */

interface Token {
  t: 'id' | 'num' | 'str' | 'op' | 'bad';
  s: string;
  /** Texto ya sin escapes de un literal de texto o carácter. */
  v?: string;
}

type Value = { k: 'int'; v: bigint } | { k: 'dec'; v: string } | { k: 'str'; v: string } | { k: 'bool'; v: boolean };

/** Tipo que se está leyendo; name es el nombre binario sin paquete, con $ en las anidadas (Clase$Interna). */
interface Frame {
  pkg: string;
  name: string;
  iface: boolean;
  /** En un enum, hasta el primer «;» van sus constantes. */
  enumHead: boolean;
}

interface Field {
  pkg: string;
  owner: string;
  /** null: sin valor inicial. */
  expr: Token[] | null;
}

const ID = /[\p{L}_$][\p{L}\p{N}_$]*/uy;
const NUM = /0[xX][\da-fA-F_]+[lL]?|0[bB][01_]+[lL]?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[fFdDlL]?/y;
const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record']);
const MODIFIERS = new Set([
  'public',
  'protected',
  'private',
  'static',
  'final',
  'transient',
  'volatile',
  'abstract',
  'native',
  'synchronized',
  'strictfp',
  'default',
]);
/** Bits de cada conversión entera; null en las decimales. */
const CAST_BITS = new Map<string, number | null>([
  ['byte', 8],
  ['short', 16],
  ['int', 32],
  ['long', 64],
  ['float', null],
  ['double', null],
]);
const ESCAPES = new Map([
  ['b', '\b'],
  ['t', '\t'],
  ['n', '\n'],
  ['f', '\f'],
  ['r', '\r'],
  ['s', ' '],
  ['"', '"'],
  ["'", "'"],
  ['\\', '\\'],
]);
const WELL_KNOWN = new Map<string, Value>([
  ['Boolean.TRUE', { k: 'bool', v: true }],
  ['Boolean.FALSE', { k: 'bool', v: false }],
  ['BigDecimal.ZERO', { k: 'int', v: 0n }],
  ['BigDecimal.ONE', { k: 'int', v: 1n }],
  ['BigDecimal.TEN', { k: 'int', v: 10n }],
]);

/** M-70: «paquete.Clase@CAMPO» (o «Clase@CAMPO» si el texto no tiene package) → valor; null si no se puede leer. */
export function readJavaConstants(source: string): Map<string, string | null> {
  const fields = collectFields(tokenize(source));
  const memo = new Map<string, Value | null | 'busy'>();

  const valueOf = (key: string): Value | null => {
    const known = memo.get(key);
    if (known === 'busy') return null;
    if (known !== undefined) return known;
    const field = fields.get(key);
    memo.set(key, 'busy');
    const value = field?.expr ? evaluate(field.expr, (path) => resolve(field, path)) : null;
    memo.set(key, value);
    return value;
  };

  const resolve = (from: Field, path: string[]): Value | null => {
    const key = referenceKeys(from, path).find((k) => fields.has(k));
    return key ? valueOf(key) : null;
  };

  const out = new Map<string, string | null>();
  for (const key of fields.keys()) {
    const value = valueOf(key);
    const text = value && asText(value);
    // M-66: un valor vacío quita la constante, y el campo de la tabla es de una línea.
    out.set(key, text && text.trim() !== '' && !/[\r\n]/.test(text) ? text : null);
  }
  return out;
}

export interface Migration {
  /** Nombre → valor nuevo, solo de las constantes cuyo valor cambia. */
  values: Record<string, string>;
  /** Constantes que ya tenían ese valor. */
  same: number;
  /** Campos del texto que no están en la lista y no se añaden. */
  outside: number;
  /** Nombres cortos de las constantes de la lista cuyo valor no se ha podido leer. */
  unreadable: string[];
}

/** M-69: cruza el texto con la lista; compara con lo escrito en la tabla. null si el texto no tiene campos. */
export function migrate(source: string, constants: JavaConstant[], drafts: Record<string, string>): Migration | null {
  const fields = readJavaConstants(source);
  if (fields.size === 0) return null;
  const result: Migration = { values: {}, same: 0, outside: 0, unreadable: [] };
  const matched = new Set<string>();
  for (const c of constants) {
    const withoutPackage = c.packageName ? c.name.slice(c.packageName.length + 1) : c.name;
    const key = [c.name, withoutPackage].find((k) => fields.has(k));
    if (key === undefined) continue;
    matched.add(key);
    const value = fields.get(key);
    if (value == null) result.unreadable.push(c.shortName);
    else if (value.trim() === (drafts[c.name] ?? '').trim()) result.same++;
    else result.values[c.name] = value;
  }
  result.outside = fields.size - matched.size;
  return result;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (src.startsWith('//', i)) {
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
    } else if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (src.startsWith('"""', i)) {
      // Bloque de texto: no se lee.
      const end = src.indexOf('"""', i + 3);
      i = end < 0 ? src.length : end + 3;
      out.push({ t: 'bad', s: '"""' });
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      const v = src[j] === c ? unescapeJava(src.slice(i + 1, j)) : null;
      out.push(v === null ? { t: 'bad', s: src.slice(i, j) } : { t: 'str', s: src.slice(i, j + 1), v });
      i = j + 1;
    } else {
      const m = match(ID, src, i) ?? match(NUM, src, i);
      const s = m ?? c;
      out.push({ t: m === null ? 'op' : /\d|\./.test(s[0]) ? 'num' : 'id', s });
      i += s.length;
    }
  }
  return out;
}

function match(re: RegExp, src: string, at: number): string | null {
  re.lastIndex = at;
  const m = re.exec(src);
  return m && m[0] ? m[0] : null;
}

function unescapeJava(raw: string): string | null {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') {
      out += raw[i];
      continue;
    }
    const next = raw[++i];
    const simple = ESCAPES.get(next);
    if (simple !== undefined) {
      out += simple;
    } else if (next === 'u') {
      while (raw[i + 1] === 'u') i++;
      const hex = raw.slice(i + 1, i + 5);
      if (!/^[\da-fA-F]{4}$/.test(hex)) return null;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else {
      const octal = /^(?:[0-3][0-7]{0,2}|[0-7]{1,2})/.exec(raw.slice(i));
      if (!octal) return null;
      out += String.fromCharCode(parseInt(octal[0], 8));
      i += octal[0].length - 1;
    }
  }
  return out;
}

/** Recorre los tipos y guarda sus campos static (en una interfaz, todos) con la expresión de su valor. */
function collectFields(tokens: Token[]): Map<string, Field> {
  const fields = new Map<string, Field>();
  const frames: Frame[] = [];
  let pkg = '';
  let pending: Omit<Frame, 'pkg'> | null = null;
  let stmt: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const top = frames.at(-1);
    if (tok.t === 'op' && tok.s === '{') {
      if (pending) {
        frames.push({ ...pending, pkg, name: top ? `${top.name}$${pending.name}` : pending.name });
        pending = null;
        stmt = [];
      } else {
        const end = closing(tokens, i);
        // En un valor inicial, las llaves son parte de la expresión; si no, es un método o un bloque.
        if (assignAt(stmt) >= 0) stmt.push(...tokens.slice(i, end + 1));
        else stmt = [];
        i = end;
      }
    } else if (tok.t === 'op' && tok.s === '}') {
      frames.pop();
      pending = null;
      stmt = [];
    } else if (tok.t === 'op' && tok.s === ';') {
      if (!top) {
        if (stmt[0]?.s === 'package') pkg = stmt.filter((t) => t.t === 'id').slice(1).map((t) => t.s).join('.');
      } else if (top.enumHead) {
        top.enumHead = false;
      } else {
        declare(stmt, top, fields);
      }
      stmt = [];
    } else if (
      tok.t === 'id' &&
      TYPE_KEYWORDS.has(tok.s) &&
      tokens[i + 1]?.t === 'id' &&
      stmt.at(-1)?.s !== '.' &&
      assignAt(stmt) < 0
    ) {
      pending = { name: tokens[i + 1].s, iface: tok.s === 'interface', enumHead: tok.s === 'enum' };
      i++;
    } else {
      stmt.push(tok);
    }
  }
  return fields;
}

/** Índice de la llave, paréntesis o corchete que cierra el de «at». */
function closing(tokens: Token[], at: number): number {
  let depth = 0;
  for (let i = at; i < tokens.length; i++) {
    if (tokens[i].t !== 'op') continue;
    if ('{(['.includes(tokens[i].s)) depth++;
    else if ('})]'.includes(tokens[i].s) && --depth === 0) return i;
  }
  return tokens.length - 1;
}

/** Posición del primer «=» fuera de paréntesis, o -1. */
function assignAt(stmt: Token[]): number {
  let depth = 0;
  for (let i = 0; i < stmt.length; i++) {
    const s = stmt[i].t === 'op' ? stmt[i].s : '';
    if (s === '(') depth++;
    else if (s === ')') depth--;
    else if (s === '=' && depth === 0) return i;
  }
  return -1;
}

/** Modificadores, tipo y uno o varios «NOMBRE [= valor]» separados por comas. */
function declare(stmt: Token[], frame: Frame, fields: Map<string, Field>) {
  const toks = withoutAnnotations(stmt);
  let i = 0;
  let isStatic = frame.iface;
  while (toks[i]?.t === 'id' && MODIFIERS.has(toks[i].s)) {
    if (toks[i].s === 'static') isStatic = true;
    i++;
  }
  i = skipType(toks, i);
  while (i >= 0 && toks[i]?.t === 'id') {
    const name = toks[i++].s;
    while (toks[i]?.s === '[' && toks[i + 1]?.s === ']') i += 2;
    let expr: Token[] | null = null;
    if (toks[i]?.s === '=') {
      const end = expressionEnd(toks, i + 1);
      expr = toks.slice(i + 1, end);
      i = end;
    } else if (i < toks.length && toks[i].s !== ',') {
      return; // Un método sin cuerpo, no un campo.
    }
    if (isStatic) fields.set(`${frame.pkg ? `${frame.pkg}.` : ''}${frame.name}@${name}`, { pkg: frame.pkg, owner: frame.name, expr });
    if (toks[i]?.s !== ',') return;
    i++;
  }
}

function withoutAnnotations(stmt: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < stmt.length; i++) {
    if (stmt[i].s !== '@' || stmt[i + 1]?.t !== 'id') {
      out.push(stmt[i]);
      continue;
    }
    i++;
    while (stmt[i + 1]?.s === '.' && stmt[i + 2]?.t === 'id') i += 2;
    if (stmt[i + 1]?.s === '(') i = closing(stmt, i + 1);
  }
  return out;
}

/** Salta «a.b.Tipo<…>[]» y devuelve la posición siguiente, o -1 si no hay tipo. */
function skipType(toks: Token[], at: number): number {
  if (toks[at]?.t !== 'id') return -1;
  let i = at + 1;
  while (toks[i]?.s === '.' && toks[i + 1]?.t === 'id') i += 2;
  if (toks[i]?.s === '<') {
    let depth = 0;
    do {
      if (toks[i].s === '<') depth++;
      else if (toks[i].s === '>') depth--;
      i++;
    } while (depth > 0 && i < toks.length);
  }
  while (toks[i]?.s === '[' && toks[i + 1]?.s === ']') i += 2;
  return i;
}

/** Fin del valor inicial: la primera coma fuera de paréntesis, corchetes y llaves, o el final. */
function expressionEnd(toks: Token[], at: number): number {
  let depth = 0;
  for (let i = at; i < toks.length; i++) {
    const s = toks[i].t === 'op' ? toks[i].s : '';
    if ('([{'.includes(s) && s) depth++;
    else if (')]}'.includes(s) && s) depth--;
    else if (s === ',' && depth === 0) return i;
  }
  return toks.length;
}

/** Claves en las que se busca una referencia: la clase y las que la contienen, y el nombre con paquete. */
function referenceKeys(from: Field, path: string[]): string[] {
  const field = path[path.length - 1];
  const type = path.slice(0, -1);
  const prefix = from.pkg ? `${from.pkg}.` : '';
  const keys: string[] = [];
  for (let scope = from.owner; ; scope = scope.slice(0, scope.lastIndexOf('$'))) {
    keys.push(`${prefix}${[scope, ...type].join('$')}@${field}`);
    if (!scope.includes('$')) break;
  }
  if (type.length > 0) keys.push(`${prefix}${type.join('$')}@${field}`);
  for (let n = 1; n < type.length; n++) keys.push(`${type.slice(0, n).join('.')}.${type.slice(n).join('$')}@${field}`);
  return keys;
}

/** M-70: literal, conversión, envoltorio o referencia, sin operaciones. */
function evaluate(tokens: Token[], resolve: (path: string[]) => Value | null): Value | null {
  let i = 0;
  const qualified = (): string[] => {
    const path = [tokens[i++].s];
    while (tokens[i]?.s === '.' && tokens[i + 1]?.t === 'id') {
      path.push(tokens[i + 1].s);
      i += 2;
    }
    return path;
  };
  const argument = (): Value | null => {
    if (tokens[i]?.s !== '(') return null;
    i++;
    const value = unary();
    if (tokens[i]?.s !== ')') return null;
    i++;
    return value;
  };
  const unary = (): Value | null => {
    const tok = tokens[i];
    if (!tok) return null;
    if (tok.t === 'op' && (tok.s === '-' || tok.s === '+')) {
      i++;
      const value = unary();
      return tok.s === '-' ? negate(value) : value && (value.k === 'int' || value.k === 'dec') ? value : null;
    }
    if (tok.t === 'op' && tok.s === '(') {
      const type = tokens[i + 1];
      if (type?.t === 'id' && CAST_BITS.has(type.s) && tokens[i + 2]?.s === ')') {
        i += 3;
        return cast(type.s, unary());
      }
      return argument();
    }
    if (tok.t === 'num') {
      i++;
      return numberValue(tok.s);
    }
    if (tok.t === 'str') {
      i++;
      return { k: 'str', v: tok.v ?? '' };
    }
    if (tok.t !== 'id') return null;
    if (tok.s === 'true' || tok.s === 'false') {
      i++;
      return { k: 'bool', v: tok.s === 'true' };
    }
    if (tok.s === 'new') {
      i++;
      if (tokens[i]?.t !== 'id') return null;
      const type = qualified();
      return wrap(type[type.length - 1], argument());
    }
    const path = qualified();
    if (tokens[i]?.s === '(') {
      return path.length >= 2 && path[path.length - 1] === 'valueOf' ? wrap(path[path.length - 2], argument()) : null;
    }
    return resolve(path) ?? WELL_KNOWN.get(path.slice(-2).join('.')) ?? null;
  };
  const value = unary();
  return i === tokens.length ? value : null;
}

/** Enteros en decimal (M-62 los usa como número); decimales como los escribe Java. */
function numberValue(literal: string): Value | null {
  const s = literal.replace(/_/g, '');
  try {
    if (/^0[xXbB]/.test(s)) return { k: 'int', v: BigInt(s.replace(/[lL]$/, '')) };
    if (/^\d+[lL]?$/.test(s)) {
      const digits = s.replace(/[lL]$/, '');
      return { k: 'int', v: digits.length > 1 && digits[0] === '0' ? BigInt(`0o${digits.slice(1)}`) : BigInt(digits) };
    }
  } catch {
    return null;
  }
  return decimal(Number(s.replace(/[fFdD]$/, '')));
}

function decimal(n: number): Value | null {
  if (!Number.isFinite(n)) return null;
  const s = String(n);
  if (s.includes('e')) return null;
  return { k: 'dec', v: Number.isInteger(n) ? `${s}.0` : s };
}

function negate(value: Value | null): Value | null {
  if (value?.k === 'int') return { k: 'int', v: -value.v };
  if (value?.k === 'dec') return { k: 'dec', v: value.v.startsWith('-') ? value.v.slice(1) : `-${value.v}` };
  return null;
}

/** (byte), (short), (int), (long), (float) y (double), como en Java. */
function cast(type: string, value: Value | null): Value | null {
  if (value?.k !== 'int' && value?.k !== 'dec') return null;
  const bits = CAST_BITS.get(type) ?? null;
  if (bits === null) return value.k === 'dec' ? value : decimal(Number(value.v));
  const whole = value.k === 'int' ? value.v : BigInt(Math.trunc(Number(value.v)));
  return { k: 'int', v: BigInt.asIntN(bits, whole) };
}

/** Tipo.valueOf(x) y new Tipo(x) de los tipos numéricos, String y Boolean. */
function wrap(type: string, value: Value | null): Value | null {
  if (!value) return null;
  switch (type) {
    case 'Integer':
    case 'Long':
    case 'Short':
    case 'Byte':
    case 'BigInteger':
      if (value.k === 'int') return value;
      return value.k === 'str' && /^-?\d+$/.test(value.v) ? { k: 'int', v: BigInt(value.v) } : null;
    case 'Double':
    case 'Float':
      if (value.k === 'dec') return value;
      if (value.k === 'int') return decimal(Number(value.v));
      return value.k === 'str' && /^-?(?:\d+\.?\d*|\.\d+)$/.test(value.v) ? decimal(Number(value.v)) : null;
    case 'BigDecimal':
      if (value.k === 'int' || value.k === 'dec') return value;
      if (value.k !== 'str' || !/^-?\d+(?:\.\d+)?$/.test(value.v)) return null;
      return value.v.includes('.') ? { k: 'dec', v: value.v } : { k: 'int', v: BigInt(value.v) };
    case 'String':
      return { k: 'str', v: asText(value) };
    case 'Boolean':
      if (value.k === 'bool') return value;
      return value.k === 'str' ? { k: 'bool', v: value.v.toLowerCase() === 'true' } : null;
    default:
      return null;
  }
}

function asText(value: Value): string {
  return value.k === 'int' || value.k === 'bool' ? String(value.v) : value.v;
}
