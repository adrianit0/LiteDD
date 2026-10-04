/** Tipos de la API /api/sql. */
export type SqlType = 'string' | 'int' | 'long' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'list';

export interface SqlVariable {
  name: string;
  type: SqlType;
  elementType: SqlType | null;
  textual: boolean;
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
  forbiddenClause: string | null;
  errors: SqlError[];
  /** ADR-0014: solo si se pidió con noteId. */
  lastValues?: Record<string, string | null>;
}

export interface Column {
  label: string;
  type: string;
  numeric: boolean;
}

export interface FinalSql {
  withPlaceholders: string;
  parameters: { index: number; value: unknown; type: string }[];
  inlined: string;
}

export interface ExecuteResponse {
  kind: 'query' | 'meta' | 'statement';
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
export const DEFAULT_PAGE_SIZE = 20;
