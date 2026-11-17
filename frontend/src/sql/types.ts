/** Tipos de la API /api/sql. */
export type SqlType = 'string' | 'int' | 'long' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'list';

export interface SqlVariable {
  name: string;
  type: SqlType;
  elementType: SqlType | null;
  textual: boolean;
  /** Q-111: el tipo personalizado tal como se usa (catalogo5); type es string. */
  customType?: string | null;
}

export interface SqlError {
  code: string;
  message: string;
  line: number | null;
  column: number | null;
  variable: string | null;
}

export interface Analysis {
  variables: SqlVariable[];
  /** query, meta o statement; null si no se pudo renderizar. */
  kind: 'query' | 'meta' | 'statement' | null;
  /** Ausente cuando no hay cláusula prohibida. */
  forbiddenClause?: string | null;
  errors: SqlError[];
  /** ADR-0014: solo si se pidió con noteId. */
  lastValues?: Record<string, string | null>;
}

export interface Column {
  label: string;
  type: string;
  numeric: boolean;
  /** Q-102: tabla y columna de las que sale tal cual, si son del esquema de la conexión. */
  table?: string;
  column?: string;
}

/** Q-103: table.column tiene una clave foránea de una sola columna hacia referencedTable. */
export interface ForeignKey {
  table: string;
  column: string;
  referencedTable: string;
}

/** Q-105: etiquetas y primera fila de la nota de una referencia; sin filas, row no llega. */
export interface LookupResult {
  columns: string[];
  row?: (string | null)[];
}

export interface FinalSql {
  withPlaceholders: string;
  parameters: { index: number; value: unknown; type: string }[];
  inlined: string;
}

export interface ExecuteResponse {
  /** explain: plan de «Explicar» (Q-48). */
  kind: 'query' | 'meta' | 'statement' | 'explain';
  columns?: Column[];
  rows?: (string | null)[][];
  truncatedCells?: [number, number][];
  hasMore?: boolean;
  total?: number;
  capReached?: boolean;
  serverMillis?: number;
  finalSql: FinalSql;
  warning?: string;
  forbiddenClause?: string;
}

export interface Sort {
  column: number;
  direction: 'asc' | 'desc';
}

/** Q-50: null es «Sin límite». */
export const PAGE_SIZES: (number | null)[] = [10, 20, 50, 100, 200, 500, null];

/** Q-84: una tabla o vista del esquema de la conexión, con sus columnas en orden. */
export interface SchemaTable {
  name: string;
  columns: string[];
}
