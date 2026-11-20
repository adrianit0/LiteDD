import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { makeOptional } from './optional';

/** Q-81: inserciones de la barra del editor SQL; «optional» es «Hacer opcional» (Q-86). */
export type SnippetKind = 'param' | 'if' | 'where' | 'choose' | 'foreach' | 'trim' | 'cdata' | 'optional';

interface Snippet {
  before: string;
  after: string;
  /** Texto si no hay selección. */
  placeholder: string;
}

const SNIPPETS: Record<Exclude<SnippetKind, 'optional'>, Snippet> = {
  param: { before: '#{', after: '}', placeholder: 'nombre' },
  if: { before: '<if test="nombre != null">\n  ', after: '\n</if>', placeholder: 'AND columna = #{nombre}' },
  where: { before: '<where>\n  ', after: '\n</where>', placeholder: '<if test="nombre != null">AND columna = #{nombre}</if>' },
  choose: {
    before: '<choose>\n  <when test="nombre != null">',
    after: '</when>\n  <otherwise></otherwise>\n</choose>',
    placeholder: 'AND columna = #{nombre}',
  },
  foreach: {
    before: '<foreach collection="lista" item="item" open="(" separator="," close=")">',
    after: '</foreach>',
    placeholder: '#{item}',
  },
  trim: { before: '<trim prefix="WHERE" prefixOverrides="AND |OR ">\n  ', after: '\n</trim>', placeholder: 'AND columna = #{nombre}' },
  cdata: { before: '<![CDATA[ ', after: ' ]]>', placeholder: 'columna < 10' },
};

/** Envuelve la selección o inserta la plantilla con el hueco seleccionado. */
export function insertSnippet(state: EditorState, kind: SnippetKind): TransactionSpec {
  if (kind === 'optional') return makeOptional(state) ?? {};
  const { before, after, placeholder } = SNIPPETS[kind];
  const { from, to } = state.selection.main;
  const inner = from === to ? placeholder : state.sliceDoc(from, to);
  return {
    changes: { from, to, insert: before + inner + after },
    selection: EditorSelection.range(from + before.length, from + before.length + inner.length),
  };
}

export const SNIPPET_BUTTONS: { kind: SnippetKind; label: string; text: string }[] = [
  { kind: 'param', label: 'Variable #{}', text: '#{}' },
  { kind: 'if', label: 'Condición <if>', text: '<if>' },
  { kind: 'where', label: 'Cláusula <where>', text: '<where>' },
  { kind: 'choose', label: 'Alternativas <choose>', text: '<choose>' },
  { kind: 'foreach', label: 'Lista <foreach>', text: '<foreach>' },
  { kind: 'trim', label: 'Recorte <trim>', text: '<trim>' },
  { kind: 'cdata', label: 'Texto literal CDATA', text: 'CDATA' },
  { kind: 'optional', label: 'Hacer opcional (Ctrl+Mayús+F)', text: 'Opcional' },
];
