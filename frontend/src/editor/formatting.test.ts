import { EditorSelection, EditorState } from '@codemirror/state';
import { applyFormat, type FormatAction } from './formatting';

/** Estado con la selección marcada por [ y ] (o un cursor con |). */
function stateOf(marked: string): EditorState {
  const cursor = marked.indexOf('|');
  if (cursor >= 0) {
    return EditorState.create({ doc: marked.replace('|', ''), selection: EditorSelection.cursor(cursor) });
  }
  const from = marked.indexOf('[');
  const to = marked.indexOf(']') - 1;
  return EditorState.create({ doc: marked.replace('[', '').replace(']', ''), selection: EditorSelection.range(from, to) });
}

function run(state: EditorState, action: FormatAction): EditorState {
  return state.update(applyFormat(state, action)).state;
}

function selected(state: EditorState): string {
  return state.sliceDoc(state.selection.main.from, state.selection.main.to);
}

describe('N-20 N-21 barra de formato', () => {
  it.each([
    ['bold', '**'],
    ['italic', '*'],
    ['strike', '~~'],
    ['code', '`'],
  ] as const)('%s envuelve la selección y la quita al repetir', (action, marker) => {
    const wrapped = run(stateOf('a [palabra] b'), action);
    expect(wrapped.doc.toString()).toBe(`a ${marker}palabra${marker} b`);
    expect(selected(wrapped)).toBe('palabra');
    const unwrapped = run(wrapped, action);
    expect(unwrapped.doc.toString()).toBe('a palabra b');
  });

  it('bold quita los marcadores si la selección los incluye', () => {
    expect(run(stateOf('[**x**]'), 'bold').doc.toString()).toBe('x');
  });

  it('italic no confunde la negrita con cursiva', () => {
    expect(run(stateOf('**[x]**'), 'italic').doc.toString()).toBe('***x***');
    expect(run(stateOf('***[x]***'), 'italic').doc.toString()).toBe('**x**');
  });

  it('sin selección inserta una plantilla con el texto seleccionado', () => {
    const s = run(stateOf('a |'), 'bold');
    expect(s.doc.toString()).toBe('a **texto**');
    expect(selected(s)).toBe('texto');
  });

  it.each([
    ['h1', '# '],
    ['h2', '## '],
    ['h3', '### '],
    ['bullet', '- '],
    ['task', '- [ ] '],
    ['quote', '> '],
  ] as const)('%s pone y quita el prefijo de línea', (action, prefix) => {
    const on = run(stateOf('tí|tulo'), action);
    expect(on.doc.toString()).toBe(`${prefix}título`);
    expect(run(on, action).doc.toString()).toBe('título');
  });

  it('lista numerada numera cada línea y se quita', () => {
    const on = run(stateOf('[uno\ndos]'), 'ordered');
    expect(on.doc.toString()).toBe('1. uno\n2. dos');
    expect(run(EditorState.create({ doc: on.doc.toString(), selection: EditorSelection.range(0, on.doc.length) }), 'ordered').doc.toString()).toBe('uno\ndos');
  });

  it('cambiar de título 1 a título 2 sustituye el prefijo', () => {
    expect(run(stateOf('# tí|tulo'), 'h2').doc.toString()).toBe('## título');
  });

  it('bloque de código envuelve las líneas y se quita', () => {
    const on = run(stateOf('[SELECT 1]'), 'codeBlock');
    expect(on.doc.toString()).toBe('```\nSELECT 1\n```');
    const inside = EditorState.create({ doc: on.doc.toString(), selection: EditorSelection.cursor(5) });
    expect(run(inside, 'codeBlock').doc.toString()).toBe('SELECT 1');
  });

  it('enlace envuelve el texto, selecciona la URL y se quita', () => {
    const on = run(stateOf('[sitio]'), 'link');
    expect(on.doc.toString()).toBe('[sitio](url)');
    expect(selected(on)).toBe('url');
    const all = EditorState.create({ doc: on.doc.toString(), selection: EditorSelection.range(0, on.doc.length) });
    expect(run(all, 'link').doc.toString()).toBe('sitio');
  });

  it('enlace a nota e imagen insertan su plantilla (ADR-0006)', () => {
    expect(run(stateOf('|'), 'noteLink').doc.toString()).toBe('[texto](litedd://note/)');
    expect(run(stateOf('|'), 'image').doc.toString()).toBe('![descripción](url)');
  });

  it('tabla y línea horizontal se insertan en su propio bloque', () => {
    expect(run(stateOf('párrafo|'), 'table').doc.toString()).toBe(
      'párrafo\n\n| Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |\n',
    );
    expect(run(stateOf('|'), 'hr').doc.toString()).toBe('---\n');
  });
});
