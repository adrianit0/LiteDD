/**
 * Contenido de un workflow y operaciones puras sobre él (W-10 a W-52, W-90 a W-99, ADR-0031, ADR-0041). El formato
 * es el mismo que guarda y valida el servidor (W-80, W-81).
 */

export type NodeKind = 'start' | 'finish' | 'login' | 'http' | 'sql' | 'wait' | 'input' | 'condition' | 'foreach' | 'break' | 'set';

/** W-12, W-90: la salida de una flecha. Sin valor, la salida normal; la Condición tiene «Sí» y «No». */
export type Out = 'yes' | 'no' | undefined;

export interface WfRow {
  name: string;
  value: string;
}

/** W-97: una fila de Cambiar valor. */
export interface WfAssignment {
  target: string;
  value: string;
}

export interface WfPoint {
  x: number;
  y: number;
}

export interface WfNode {
  id: string;
  kind: NodeKind;
  name?: string;
  x: number;
  y: number;
  /** HTTP y SQL */
  noteId?: string;
  values?: Record<string, string>;
  /** Espera */
  seconds?: string;
  /** Input */
  rows?: WfRow[];
  /** Condición */
  condition?: string;
  /** Bucle */
  list?: string;
  /** Cambiar valor */
  assignments?: WfAssignment[];
}

export interface WfEdge {
  from: string;
  /** W-12: la salida de la que parte; sin valor, la normal. */
  out?: 'yes' | 'no';
  to: string;
  /** W-18: los codos. */
  points?: WfPoint[];
}

export interface WfOptions {
  sameInputs: boolean;
  stopOnError: boolean;
  stopOnMissing: boolean;
  lockValues: boolean;
}

export interface Workflow {
  options: WfOptions;
  nodes: WfNode[];
  edges: WfEdge[];
}

/** Valores de consulta de una pestaña: por nodo y campo (W-51). */
export type NodeValues = Record<string, Record<string, string>>;

/** W-11 */
export const GRID = 16;
/** W-14: distancia entre un nodo y el siguiente al insertarlo. */
export const STEP_X = 192;
/** W-16 */
export const MAX_NODES = 100;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export const KIND_LABEL: Record<NodeKind, string> = {
  start: 'Start',
  finish: 'Finish',
  http: 'HTTP',
  sql: 'SQL',
  wait: 'Espera',
  input: 'Input',
  login: 'Login',
  condition: 'Condición',
  foreach: 'Bucle',
  break: 'Break',
  set: 'Cambiar valor',
};

/** W-22: nombre propuesto de cada tipo de nodo; en HTTP y SQL, si el título no da uno. */
const DEFAULT_NAME: Partial<Record<NodeKind, string>> = {
  http: 'Http1',
  sql: 'Sql1',
  wait: 'Espera1',
  login: 'Login1',
  input: 'Input1',
  condition: 'Condicion1',
  foreach: 'Bucle1',
  break: 'Break1',
  set: 'Cambiar1',
};

/** W-40: un workflow nuevo solo tiene marcada «Parar si error». */
export const DEFAULT_OPTIONS: WfOptions = { sameInputs: false, stopOnError: true, stopOnMissing: false, lockValues: false };

/** W-02: Start unido a Finish. */
export function initialWorkflow(): Workflow {
  return {
    options: { ...DEFAULT_OPTIONS },
    nodes: [
      { id: 'start', kind: 'start', x: 32, y: 160 },
      { id: 'finish', kind: 'finish', x: 352, y: 160 },
    ],
    edges: [{ from: 'start', to: 'finish' }],
  };
}

/** W-80: el contenido guardado; vacío es un workflow nuevo. Un contenido ilegible también lo es, sin romper la vista. */
export function parseWorkflow(content: string): Workflow {
  if (content.trim() === '') return initialWorkflow();
  try {
    const raw = JSON.parse(content) as Partial<Omit<Workflow, 'options'>> & { options?: Partial<WfOptions> };
    const o: Partial<WfOptions> = raw.options ?? {};
    return {
      options: {
        sameInputs: o.sameInputs === true,
        stopOnError: o.stopOnError !== false,
        stopOnMissing: o.stopOnMissing === true,
        lockValues: o.lockValues === true,
      },
      nodes: (raw.nodes ?? []).map((n) => ({ ...n, x: n.x ?? 0, y: n.y ?? 0 })),
      edges: (raw.edges ?? []).map((e) => edge(e.from, e.out || undefined, e.to, e.points)),
    };
  } catch {
    return initialWorkflow();
  }
}

export function serializeWorkflow(w: Workflow): string {
  return JSON.stringify(w);
}

/** Una flecha sin claves vacías, para que el contenido guardado no cambie al leerlo y escribirlo. */
function edge(from: string, out: Out, to: string, points?: WfPoint[]): WfEdge {
  const e: WfEdge = { from, to };
  if (out) e.out = out;
  if (points && points.length > 0) e.points = points;
  return e;
}

export function isNamed(n: WfNode): boolean {
  return n.kind !== 'start' && n.kind !== 'finish';
}

export function label(n: WfNode): string {
  return isNamed(n) && n.name ? n.name : KIND_LABEL[n.kind];
}

/** W-12: las salidas de un nodo: ninguna en Finish, «Sí» y «No» en la Condición y una en los demás. */
export function outsOf(n: WfNode): Out[] {
  if (n.kind === 'finish') return [];
  if (n.kind === 'condition') return ['yes', 'no'];
  return [undefined];
}

/** La clave de una flecha: su origen y su salida, que solo tiene una flecha. */
export function edgeKey(from: string, out: Out): string {
  return `${from}:${out ?? ''}`;
}

export function findEdge(w: Workflow, from: string, out: Out): WfEdge | undefined {
  return w.edges.find((e) => e.from === from && e.out === out);
}

export function nextOf(w: Workflow, id: string, out?: Out): string | undefined {
  return findEdge(w, id, out)?.to;
}

/** W-15, W-17: los nodos a los que se llega desde Start, en anchura y con «Sí» antes que «No». */
export function flow(w: Workflow): WfNode[] {
  const byId = new Map(w.nodes.map((n) => [n.id, n]));
  const start = w.nodes.find((n) => n.kind === 'start');
  const out: WfNode[] = [];
  const seen = new Set<string>();
  const queue = start ? [start] : [];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    for (const o of outsOf(n)) {
      const to = nextOf(w, n.id, o);
      const next = to ? byId.get(to) : undefined;
      if (next) queue.push(next);
    }
  }
  return out;
}

/** W-15, W-61: las salidas de los nodos del flujo que no tienen flecha. */
export function openOutputs(w: Workflow): { id: string; out: Out }[] {
  const open: { id: string; out: Out }[] = [];
  for (const n of flow(w)) {
    for (const o of outsOf(n)) if (!findEdge(w, n.id, o)) open.push({ id: n.id, out: o });
  }
  return open;
}

/** W-17: el flujo primero y, al final, los nodos que están fuera de él. */
export function tabOrder(w: Workflow): WfNode[] {
  const inFlow = flow(w);
  const ids = new Set(inFlow.map((n) => n.id));
  return [...inFlow, ...w.nodes.filter((n) => !ids.has(n.id))];
}

/** Los nodos a los que se llega desde id siguiendo las flechas, id incluido. */
function reachable(w: Workflow, id: string): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const e of w.edges) if (e.from === current) queue.push(e.to);
  }
  return seen;
}

/** W-36: los nodos desde los que se llega a id: los que pueden ir antes que él. */
function ancestors(w: Workflow, id: string): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of w.edges) {
      if (e.to === current && !seen.has(e.from)) {
        seen.add(e.from);
        queue.push(e.from);
      }
    }
  }
  return seen;
}

/** W-12: una flecha de from a to cerraría un ciclo si desde to ya se llega a from. */
export function wouldCycle(w: Workflow, from: string, to: string): boolean {
  return reachable(w, to).has(from);
}

function newId(w: Workflow): string {
  const used = new Set(w.nodes.map((n) => n.id));
  let i = 1;
  while (used.has(`n${i}`)) i++;
  return `n${i}`;
}

/** W-22: sin acentos ni signos y con cada palabra en mayúscula inicial. */
export function nameFromTitle(title: string): string {
  const plain = title.normalize('NFD').replace(/\p{M}+/gu, '');
  const words = plain.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('').slice(0, 40);
  return NAME.test(name) ? name : '';
}

/** W-22: el nombre propuesto, libre en el workflow sin distinguir mayúsculas. */
export function proposeName(w: Workflow, kind: NodeKind, title = '', exceptId?: string): string {
  const used = new Set(w.nodes.filter((n) => n.id !== exceptId && n.name).map((n) => n.name!.toLowerCase()));
  const fallback = DEFAULT_NAME[kind] ?? 'Nodo1';
  const base = (kind === 'http' || kind === 'sql') && title ? nameFromTitle(title) || fallback : fallback;
  if (!used.has(base.toLowerCase())) return base;
  const stem = base.replace(/\d+$/, '').slice(0, 36);
  for (let i = 2; ; i++) {
    const candidate = `${stem}${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

function snap(v: number): number {
  return Math.max(0, Math.round(v / GRID) * GRID);
}

/** W-14: distancia vertical de un nodo suelto respecto al nodo más bajo. */
const STEP_Y = 128;

/** Un nodo nuevo con los valores de serie de su tipo. */
function blankNode(w: Workflow, kind: NodeKind, id: string): WfNode {
  const node: WfNode = { id, kind, name: proposeName(w, kind), x: 0, y: 0 };
  if (kind === 'wait') node.seconds = '1';
  if (kind === 'input') node.rows = [];
  if (kind === 'http' || kind === 'sql') node.values = {};
  if (kind === 'login') node.values = { user: '' };
  if (kind === 'condition') node.condition = '';
  if (kind === 'foreach') node.list = '';
  if (kind === 'set') node.assignments = [];
  return node;
}

/**
 * W-14: con un nodo seleccionado, inserta el nuevo tras él, y tras una Condición en su salida «Sí»: se coloca a su
 * derecha y lo que lo sigue se desplaza lo justo. Con Finish seleccionado, el nuevo recibe las flechas que llegaban a
 * Finish. Sin selección, el nodo queda suelto, sin flechas, debajo de los demás (ADR-0032).
 */
export function insertNode(w: Workflow, kind: NodeKind, selectedId: string | null): { workflow: Workflow; id: string } | null {
  if (w.nodes.length >= MAX_NODES || kind === 'start' || kind === 'finish') return null;
  const id = newId(w);
  const node = blankNode(w, kind, id);
  const selected = selectedId ? w.nodes.find((n) => n.id === selectedId) : undefined;
  const start = w.nodes.find((n) => n.kind === 'start')!;
  if (!selected) {
    node.x = snap(start.x + STEP_X);
    node.y = snap(Math.max(...w.nodes.map((n) => n.y)) + STEP_Y);
    return { workflow: { ...w, nodes: [...w.nodes, node] }, id };
  }
  // Las flechas que pasan a llegar al nodo nuevo y el nodo al que sale.
  let incoming: { from: string; out: Out }[];
  let next: string | undefined;
  if (selected.kind === 'finish') {
    incoming = w.edges.filter((e) => e.to === selected.id).map((e) => ({ from: e.from, out: e.out }));
    next = selected.id;
  } else {
    const out = outsOf(selected)[0];
    incoming = [{ from: selected.id, out }];
    next = nextOf(w, selected.id, out);
  }
  const anchor = w.nodes.find((n) => n.id === incoming[0]?.from) ?? start;
  node.x = snap(anchor.x + STEP_X);
  node.y = anchor.y;
  // Lo que sigue se desplaza a la derecha lo justo para dejarle sitio.
  const following = next ? reachable(w, next) : new Set<string>();
  const nextX = w.nodes.find((n) => n.id === next)?.x ?? Infinity;
  const shift = Math.max(0, node.x + STEP_X - nextX);
  const nodes = w.nodes.map((n) => (following.has(n.id) ? { ...n, x: n.x + shift } : n));
  const replaced = new Set(incoming.map((i) => edgeKey(i.from, i.out)));
  const edges = w.edges.filter((e) => !replaced.has(edgeKey(e.from, e.out)));
  for (const i of incoming) edges.push(edge(i.from, i.out, id));
  if (next) edges.push(edge(id, outsOf(node)[0], next));
  return { workflow: { ...w, nodes: [...nodes, node], edges }, id };
}

/**
 * W-19: un nodo HTTP o SQL con una nota, suelto donde se soltó la nota, con el nombre y los valores de W-22 a W-24.
 */
export function addNoteNode(
  w: Workflow,
  kind: 'http' | 'sql',
  noteId: string,
  title: string,
  values: Record<string, string>,
  x: number,
  y: number,
): { workflow: Workflow; id: string } | null {
  if (w.nodes.length >= MAX_NODES) return null;
  const id = newId(w);
  const node: WfNode = { id, kind, name: proposeName(w, kind, title), x: snap(x), y: snap(y), noteId, values };
  return { workflow: { ...w, nodes: [...w.nodes, node] }, id };
}

/**
 * W-13: Start y Finish no se borran. Si la salida del nodo tenía flecha, los que llegaban a él quedan unidos a su
 * sucesor; una Condición, con dos salidas, solo pierde sus flechas.
 */
export function removeNode(w: Workflow, id: string): Workflow {
  const node = w.nodes.find((n) => n.id === id);
  if (!node || !isNamed(node)) return w;
  const outs = outsOf(node);
  const next = outs.length === 1 ? nextOf(w, id, outs[0]) : undefined;
  const edges = w.edges.filter((e) => e.from !== id && e.to !== id);
  if (next) {
    for (const e of w.edges) if (e.to === id && e.from !== next) edges.push(edge(e.from, e.out, next));
  }
  return { ...w, nodes: w.nodes.filter((n) => n.id !== id), edges };
}

/**
 * W-12: una flecha por salida, que sustituye a la que hubiera; una entrada admite varias. No se une un nodo consigo
 * mismo ni se cierra un ciclo.
 */
export function connect(w: Workflow, from: string, out: Out, to: string): Workflow {
  const a = w.nodes.find((n) => n.id === from);
  const b = w.nodes.find((n) => n.id === to);
  if (!a || !b || from === to || a.kind === 'finish' || b.kind === 'start' || !outsOf(a).includes(out)) return w;
  if (wouldCycle(w, from, to)) return w;
  const edges = w.edges.filter((e) => !(e.from === from && e.out === out));
  edges.push(edge(from, out, to));
  return { ...w, edges };
}

export function removeEdge(w: Workflow, from: string, out?: Out): Workflow {
  return { ...w, edges: w.edges.filter((e) => !(e.from === from && e.out === out)) };
}

/** W-18: los codos de una flecha, ajustados a la rejilla. Sin codos, la flecha vuelve a ser una curva. */
export function setEdgePoints(w: Workflow, from: string, out: Out, points: WfPoint[]): Workflow {
  return {
    ...w,
    edges: w.edges.map((e) =>
      e.from === from && e.out === out ? edge(e.from, e.out, e.to, points.map((p) => ({ x: snap(p.x), y: snap(p.y) }))) : e,
    ),
  };
}

/** W-11: ajustado a la rejilla. */
export function moveNode(w: Workflow, id: string, x: number, y: number): Workflow {
  return { ...w, nodes: w.nodes.map((n) => (n.id === id ? { ...n, x: snap(x), y: snap(y) } : n)) };
}

export function updateNode(w: Workflow, id: string, changes: Partial<WfNode>): Workflow {
  return { ...w, nodes: w.nodes.map((n) => (n.id === id ? { ...n, ...changes } : n)) };
}

/** W-21: problema del nombre de un nodo, o null. */
export function nameProblem(w: Workflow, node: WfNode): string | null {
  if (!isNamed(node)) return null;
  const name = node.name ?? '';
  if (name === '') return 'Falta el nombre';
  if (!NAME.test(name)) return 'Solo letras sin acentos, números y _, empezando por una letra, hasta 40';
  const lower = name.toLowerCase();
  if (w.nodes.some((n) => n.id !== node.id && n.name?.toLowerCase() === lower)) return 'Ya hay otro nodo con este nombre';
  return null;
}

/** W-28: problema del nombre de una fila de un Input, o null. */
export function rowProblem(rows: WfRow[], index: number): string | null {
  const name = rows[index].name;
  if (!NAME.test(name)) return 'Nombre no válido';
  if (rows.some((r, i) => i !== index && r.name === name)) return 'Repetido';
  return null;
}

const isLetter = (c: string | undefined) => c !== undefined && /[A-Za-z]/.test(c);
const isWord = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

/** Un paso de una ruta desde pos (`.clave`, `[n]` o `["clave"]`), como en el servidor. Devuelve pos si no hay paso. */
function step(text: string, pos: number): number {
  const c = text[pos];
  if (c === '.') {
    let i = pos + 1;
    while (isWord(text[i])) i++;
    return i === pos + 1 ? pos : i;
  }
  if (c !== '[') return pos;
  if (isDigit(text[pos + 1])) {
    let i = pos + 1;
    while (isDigit(text[i])) i++;
    return text[i] === ']' && i - pos - 1 <= 9 ? i + 1 : pos;
  }
  if (text[pos + 1] === '"') {
    let i = pos + 2;
    while (i < text.length) {
      if (text[i] === '\\' && i + 1 < text.length) i += 2;
      else if (text[i] === '"') return text[i + 1] === ']' ? i + 2 : pos;
      else i++;
    }
  }
  return pos;
}

/** W-30: lo que ocupa la referencia que empieza en el `$` de from, o 0 si tras el `$` no hay una letra. */
function referenceLength(text: string, from: number): number {
  if (!isLetter(text[from + 1])) return 0;
  let pos = from + 2;
  while (isWord(text[pos])) pos++;
  for (let next = step(text, pos); next !== pos; next = step(text, pos)) pos = next;
  return pos - from;
}

/** W-93, W-97: el texto es una referencia sola, sin nada antes ni después. */
export function isSingleReference(text: string): boolean {
  return text.startsWith('$') && referenceLength(text, 0) === text.length;
}

/** W-97: problema del destino de una fila de Cambiar valor, o null. */
export function assignmentProblem(rows: WfAssignment[], index: number): string | null {
  const target = rows[index].target;
  if (!isSingleReference(target)) return 'El destino es una referencia sola, como $Http1.data.valor';
  if (rows.some((r, i) => i !== index && r.target === target)) return 'Repetido';
  return null;
}

/** W-91: el motivo por el que la condición no es válida, o null. Los mismos mensajes que el servidor. */
export function conditionProblem(text: string): string | null {
  if (text.trim() === '') return 'La condición está vacía';
  let pos = 0;
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const skip = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  };
  const rest = () => {
    const r = text.slice(pos).trim();
    return r.length > 20 ? `${r.slice(0, 20)}…` : r;
  };
  const accept = (token: string) => {
    skip();
    if (text.startsWith(token, pos)) {
      pos += token.length;
      return true;
    }
    return false;
  };
  const comparison = (): boolean => {
    skip();
    for (const op of ['==', '!=', '>=', '<=', '>', '<']) {
      if (text.startsWith(op, pos)) {
        pos += op.length;
        return true;
      }
    }
    return false;
  };
  const primary = (): void => {
    skip();
    if (pos >= text.length) fail('Falta un valor al final');
    const c = text[pos];
    if (c === '(') {
      pos++;
      or();
      if (!accept(')')) fail('Falta un paréntesis de cierre');
      return;
    }
    if (c === '$') {
      const length = referenceLength(text, pos);
      if (length === 0) fail('Tras «$» va el nombre de un nodo');
      pos += length;
      return;
    }
    if (c === '"') {
      let i = pos + 1;
      while (i < text.length) {
        if (text[i] === '\\' && i + 1 < text.length) i += 2;
        else if (text[i] === '"') {
          pos = i + 1;
          return;
        } else i++;
      }
      fail('Falta la comilla de cierre de un texto');
    }
    if (c === '-' || isDigit(c)) {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(pos));
      if (!m) fail('Número no válido');
      pos += m![0].length;
      return;
    }
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, pos) && !/[\p{L}\p{N}_]/u.test(text[pos + word.length] ?? '')) {
        pos += word.length;
        return;
      }
    }
    fail(c === ')' ? 'Sobra «)»' : `No se esperaba «${rest()}»: los textos van entre comillas`);
  };
  const unary = (): void => {
    skip();
    if (text[pos] === '!' && !text.startsWith('!=', pos)) {
      pos++;
      unary();
      return;
    }
    primary();
  };
  const compare = () => {
    unary();
    if (!comparison()) return;
    unary();
    if (comparison()) fail('Dos comparaciones seguidas necesitan paréntesis');
  };
  const and = () => {
    compare();
    while (accept('&&')) compare();
  };
  const or = () => {
    and();
    while (accept('||')) and();
  };
  try {
    or();
    skip();
    if (pos < text.length) fail(`Sobra «${rest()}»`);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** W-30, W-31: los nombres de nodo de las referencias de un texto. `$$` es un `$`. */
export function referencedNames(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '$') continue;
    if (text[i + 1] === '$') {
      i++;
      continue;
    }
    const m = /^[A-Za-z][A-Za-z0-9_]*/.exec(text.slice(i + 1));
    if (m) {
      out.push(m[0]);
      i += m[0].length;
    }
  }
  return out;
}

/** W-36: avisos de las referencias a nombres que no existen o a nodos que no van antes en el flujo. */
export function referenceWarnings(w: Workflow, nodeId: string, text: string): string[] {
  const inFlow = new Set(flow(w).map((n) => n.id));
  const before = ancestors(w, nodeId);
  const warnings: string[] = [];
  for (const name of referencedNames(text)) {
    const target = w.nodes.find((n) => n.name === name);
    if (!target) {
      warnings.push(`No hay ningún nodo llamado ${name}`);
      continue;
    }
    if (!inFlow.has(nodeId) || !inFlow.has(target.id) || !before.has(target.id)) {
      warnings.push(`${name} no va antes en el flujo: valdrá null`);
    }
  }
  return [...new Set(warnings)];
}

/** Campos de cada nodo HTTP y SQL, según las variables de su nota (W-23, W-24). */
export type FieldsByNode = Record<string, string[]>;

/**
 * W-41: con «Mismos inputs tendrá mismo valor», el valor de un campo pasa a todos los nodos HTTP y SQL que tienen
 * una variable con ese nombre.
 */
export function setFieldValue(w: Workflow, fields: FieldsByNode, nodeId: string, field: string, value: string): Workflow {
  const targets = w.options.sameInputs
    ? w.nodes.filter((n) => (n.kind === 'http' || n.kind === 'sql') && (n.id === nodeId || fields[n.id]?.includes(field)))
    : w.nodes.filter((n) => n.id === nodeId);
  const ids = new Set(targets.map((n) => n.id));
  return { ...w, nodes: w.nodes.map((n) => (ids.has(n.id) ? { ...n, values: { ...n.values, [field]: value } } : n)) };
}

/** W-41: al marcar la casilla, cada nombre toma el valor del primer nodo del flujo que lo tiene. */
export function unifyFields(w: Workflow, fields: FieldsByNode): Workflow {
  const first = new Map<string, string>();
  for (const n of tabOrder(w)) {
    if (n.kind !== 'http' && n.kind !== 'sql') continue;
    for (const f of fields[n.id] ?? []) {
      if (!first.has(f)) first.set(f, n.values?.[f] ?? '');
    }
  }
  return {
    ...w,
    nodes: w.nodes.map((n) => {
      if (n.kind !== 'http' && n.kind !== 'sql') return n;
      const values = { ...n.values };
      for (const f of fields[n.id] ?? []) values[f] = first.get(f) ?? '';
      return { ...n, values };
    }),
  };
}

/** W-26: un nodo deja de guardar las variables que su nota ya no tiene. Solo los nodos con campos conocidos. */
export function pruneValues(w: Workflow, fields: FieldsByNode): Workflow {
  let changed = false;
  const nodes = w.nodes.map((n) => {
    const known = fields[n.id];
    if (!known || (n.kind !== 'http' && n.kind !== 'sql') || !n.values) return n;
    const values = Object.fromEntries(Object.entries(n.values).filter(([f]) => known.includes(f)));
    if (Object.keys(values).length === Object.keys(n.values).length) return n;
    changed = true;
    return { ...n, values };
  });
  return changed ? { ...w, nodes } : w;
}

/** W-41 en consulta: el mismo reparto sobre los valores de la pestaña. */
export function setTabValue(
  w: Workflow,
  fields: FieldsByNode,
  values: NodeValues,
  nodeId: string,
  field: string,
  value: string,
): NodeValues {
  const node = w.nodes.find((n) => n.id === nodeId);
  const shared = w.options.sameInputs && (node?.kind === 'http' || node?.kind === 'sql');
  const ids = shared
    ? w.nodes.filter((n) => (n.kind === 'http' || n.kind === 'sql') && (n.id === nodeId || fields[n.id]?.includes(field))).map((n) => n.id)
    : [nodeId];
  const out = { ...values };
  for (const id of ids) out[id] = { ...out[id], [field]: value };
  return out;
}

/**
 * Los campos de consulta de un nodo: variables de su nota, usuario del Login, segundos o filas del Input. Condición,
 * Bucle y Cambiar valor no tienen: solo se cambian en edición (W-50).
 */
export function fieldsOf(n: WfNode, fields: FieldsByNode): string[] {
  if (n.kind === 'http' || n.kind === 'sql') return fields[n.id] ?? [];
  if (n.kind === 'login') return ['user'];
  if (n.kind === 'wait') return ['seconds'];
  if (n.kind === 'input') return (n.rows ?? []).map((r) => r.name);
  return [];
}

/** W-52: los valores guardados en edición. */
export function savedValue(n: WfNode, field: string): string {
  if (n.kind === 'wait') return n.seconds ?? '';
  if (n.kind === 'input') return n.rows?.find((r) => r.name === field)?.value ?? '';
  return n.values?.[field] ?? '';
}

export function savedValues(w: Workflow, fields: FieldsByNode): NodeValues {
  const out: NodeValues = {};
  for (const n of w.nodes) {
    const names = fieldsOf(n, fields);
    if (names.length === 0) continue;
    out[n.id] = Object.fromEntries(names.map((f) => [f, savedValue(n, f)]));
  }
  return out;
}

/** W-44, W-50: en consulta se cambian los Input y, sin «Fijar valores de input», Login, HTTP, SQL y Espera. */
export function isEditableInView(w: Workflow, n: WfNode): boolean {
  if (n.kind === 'input') return true;
  return !w.options.lockValues && (n.kind === 'login' || n.kind === 'http' || n.kind === 'sql' || n.kind === 'wait');
}

/**
 * W-51: los valores de consulta al abrir la pestaña: los de la última ejecución y, donde no los hay, los guardados.
 * Lo fijado (W-44) vale siempre lo guardado.
 */
export function initialTabValues(w: Workflow, fields: FieldsByNode, last: NodeValues | undefined): NodeValues {
  const saved = savedValues(w, fields);
  const out: NodeValues = {};
  for (const n of w.nodes) {
    if (!saved[n.id]) continue;
    const useLast = isEditableInView(w, n) ? last?.[n.id] : undefined;
    out[n.id] = Object.fromEntries(Object.entries(saved[n.id]).map(([f, v]) => [f, useLast?.[f] ?? v]));
  }
  return out;
}

/** W-51: un valor cambiado en edición pasa también a la consulta de la pestaña. */
export function editedValues(before: Workflow, after: Workflow, fields: FieldsByNode, tab: NodeValues): NodeValues {
  const old = savedValues(before, fields);
  const now = savedValues(after, fields);
  const out: NodeValues = { ...tab };
  for (const [id, values] of Object.entries(now)) {
    for (const [f, v] of Object.entries(values)) {
      if (old[id]?.[f] !== v || out[id]?.[f] === undefined) out[id] = { ...out[id], [f]: v };
    }
  }
  return out;
}

/** W-50: lo que se envía al ejecutar: solo lo que la pestaña puede cambiar. */
export function valuesToSend(w: Workflow, tab: NodeValues): NodeValues {
  const out: NodeValues = {};
  for (const n of w.nodes) {
    if (tab[n.id] && isEditableInView(w, n)) out[n.id] = tab[n.id];
  }
  return out;
}
