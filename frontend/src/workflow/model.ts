/**
 * Contenido de un workflow y operaciones puras sobre él (W-10 a W-52, ADR-0031). El formato es el mismo que
 * guarda y valida el servidor (W-80, W-81).
 */

export type NodeKind = 'start' | 'finish' | 'login' | 'http' | 'sql' | 'wait' | 'input';

export interface WfRow {
  name: string;
  value: string;
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
}

export interface WfEdge {
  from: string;
  to: string;
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
      edges: raw.edges ?? [],
    };
  } catch {
    return initialWorkflow();
  }
}

export function serializeWorkflow(w: Workflow): string {
  return JSON.stringify(w);
}

export function isNamed(n: WfNode): boolean {
  return n.kind !== 'start' && n.kind !== 'finish';
}

export function label(n: WfNode): string {
  return isNamed(n) && n.name ? n.name : KIND_LABEL[n.kind];
}

function nextOf(w: Workflow, id: string): string | undefined {
  return w.edges.find((e) => e.from === id)?.to;
}

function previousOf(w: Workflow, id: string): string | undefined {
  return w.edges.find((e) => e.to === id)?.from;
}

/** W-15: el camino desde Start siguiendo las flechas. */
export function chain(w: Workflow): WfNode[] {
  const byId = new Map(w.nodes.map((n) => [n.id, n]));
  const out: WfNode[] = [];
  const seen = new Set<string>();
  let current = w.nodes.find((n) => n.kind === 'start');
  while (current && !seen.has(current.id)) {
    out.push(current);
    seen.add(current.id);
    const to = nextOf(w, current.id);
    current = to ? byId.get(to) : undefined;
  }
  return out;
}

export function reachesFinish(w: Workflow): boolean {
  return chain(w).at(-1)?.kind === 'finish';
}

/** W-17: la cadena primero y, al final, los nodos que están fuera de ella. */
export function tabOrder(w: Workflow): WfNode[] {
  const inChain = chain(w);
  const ids = new Set(inChain.map((n) => n.id));
  return [...inChain, ...w.nodes.filter((n) => !ids.has(n.id))];
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
  const fallback = kind === 'http' ? 'Http1' : kind === 'sql' ? 'Sql1' : kind === 'wait' ? 'Espera1' : kind === 'login' ? 'Login1' : 'Input1';
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

/**
 * W-14: con un nodo seleccionado, inserta el nuevo tras él (con Finish, justo antes de Finish): se coloca a la derecha
 * de su predecesor y los que lo siguen en la cadena se desplazan lo justo. Sin selección, el nodo queda suelto, sin
 * flechas, debajo de los demás (ADR-0032).
 */
export function insertNode(w: Workflow, kind: NodeKind, selectedId: string | null): { workflow: Workflow; id: string } | null {
  if (w.nodes.length >= MAX_NODES || kind === 'start' || kind === 'finish') return null;
  const id = newId(w);
  const node: WfNode = { id, kind, name: proposeName(w, kind), x: 0, y: 0 };
  if (kind === 'wait') node.seconds = '1';
  if (kind === 'input') node.rows = [];
  if (kind === 'http' || kind === 'sql') node.values = {};
  if (kind === 'login') node.values = { user: '' };
  const selected = selectedId ? w.nodes.find((n) => n.id === selectedId) : undefined;
  if (!selected) {
    const start = w.nodes.find((n) => n.kind === 'start');
    node.x = snap((start?.x ?? 0) + STEP_X);
    node.y = snap(Math.max(...w.nodes.map((n) => n.y)) + STEP_Y);
    return { workflow: { ...w, nodes: [...w.nodes, node] }, id };
  }
  const afterId = selected.kind === 'finish' ? previousOf(w, selected.id) : selected.id;
  const after = w.nodes.find((n) => n.id === afterId) ?? w.nodes.find((n) => n.kind === 'start')!;
  node.x = snap(after.x + STEP_X);
  node.y = after.y;
  const next = nextOf(w, after.id);
  // Los que siguen en la cadena se desplazan a la derecha lo justo para dejarle sitio.
  const following = new Set<string>();
  for (let cur = next; cur && !following.has(cur); cur = nextOf(w, cur)) following.add(cur);
  const nextX = w.nodes.find((n) => n.id === next)?.x ?? Infinity;
  const shift = Math.max(0, node.x + STEP_X - nextX);
  const nodes = w.nodes.map((n) => (following.has(n.id) ? { ...n, x: n.x + shift } : n));
  const edges = w.edges.filter((e) => e.from !== after.id);
  edges.push({ from: after.id, to: id });
  if (next) edges.push({ from: id, to: next });
  return { workflow: { ...w, nodes: [...nodes, node], edges }, id };
}

/** W-13: Start y Finish no se borran; un nodo intermedio deja unidos a sus vecinos. */
export function removeNode(w: Workflow, id: string): Workflow {
  const node = w.nodes.find((n) => n.id === id);
  if (!node || !isNamed(node)) return w;
  const prev = previousOf(w, id);
  const next = nextOf(w, id);
  const edges = w.edges.filter((e) => e.from !== id && e.to !== id);
  if (prev && next) edges.push({ from: prev, to: next });
  return { ...w, nodes: w.nodes.filter((n) => n.id !== id), edges };
}

/** W-12: una flecha por salida y por entrada; la nueva sustituye a las que hubiera. */
export function connect(w: Workflow, from: string, to: string): Workflow {
  const a = w.nodes.find((n) => n.id === from);
  const b = w.nodes.find((n) => n.id === to);
  if (!a || !b || from === to || a.kind === 'finish' || b.kind === 'start') return w;
  const edges = w.edges.filter((e) => e.from !== from && e.to !== to);
  edges.push({ from, to });
  return { ...w, edges };
}

export function removeEdge(w: Workflow, from: string): Workflow {
  return { ...w, edges: w.edges.filter((e) => e.from !== from) };
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

/** W-36: avisos de las referencias a nombres que no existen o a nodos que no van antes en la cadena. */
export function referenceWarnings(w: Workflow, nodeId: string, text: string): string[] {
  const order = chain(w);
  const position = order.findIndex((n) => n.id === nodeId);
  const warnings: string[] = [];
  for (const name of referencedNames(text)) {
    const target = w.nodes.find((n) => n.name === name);
    if (!target) {
      warnings.push(`No hay ningún nodo llamado ${name}`);
      continue;
    }
    const at = order.findIndex((n) => n.id === target.id);
    if (position < 0 || at < 0 || at >= position) warnings.push(`${name} no va antes en la cadena: valdrá null`);
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

/** W-41: al marcar la casilla, cada nombre toma el valor del primer nodo de la cadena que lo tiene. */
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

/** Los campos de un nodo: variables de su nota, usuario del Login, segundos o filas del Input. */
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

/** W-44: con «Fijar valores de input», en consulta solo se cambian los Input. */
export function isEditableInView(w: Workflow, n: WfNode): boolean {
  return n.kind === 'input' || (!w.options.lockValues && n.kind !== 'start' && n.kind !== 'finish');
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
