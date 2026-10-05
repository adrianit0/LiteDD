import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import type { EditorView } from '@codemirror/view';
import { MySQL, sql } from '@codemirror/lang-sql';
import { markdownBindings, sqlBindings } from './NoteEditor';

function press(key: string, doc: string, cursor: number, format = vi.fn()) {
  const binding = markdownBindings(format).find((b) => b.key === key)!;
  let state = EditorState.create({ doc, selection: EditorSelection.cursor(cursor), extensions: [markdown()] });
  const target = {
    get state() {
      return state;
    },
    dispatch: (tr: Transaction) => {
      state = tr.state;
    },
  } as unknown as EditorView;
  const handled = binding.run!(target);
  return { handled, doc: state.doc.toString(), format };
}

describe('N-22 atajos del editor Markdown', () => {
  it('Ctrl+B y Ctrl+I aplican negrita y cursiva', () => {
    expect(press('Mod-b', 'x', 0).format).toHaveBeenCalledWith('bold');
    expect(press('Mod-i', 'x', 0).format).toHaveBeenCalledWith('italic');
  });

  it('Intro continúa la lista', () => {
    expect(press('Enter', '- uno', 5).doc).toBe('- uno\n- ');
    expect(press('Enter', '1. uno', 6).doc).toBe('1. uno\n2. ');
    expect(press('Enter', '- [ ] uno', 9).doc).toBe('- [ ] uno\n- [ ] ');
  });

  it('el tabulador sangra la línea de la lista', () => {
    const r = press('Tab', '- uno\n- dos', 9);
    expect(r.handled).toBe(true);
    expect(r.doc.split('\n')[1]).toMatch(/^\s+- dos$/);
  });
});

describe('Q-83 sangría del editor SQL', () => {
  function enter(doc: string, cursor: number | [number, number]) {
    const binding = sqlBindings().find((b) => b.key === 'Enter')!;
    const selection = Array.isArray(cursor) ? EditorSelection.range(cursor[0], cursor[1]) : EditorSelection.cursor(cursor);
    let state = EditorState.create({ doc, selection, extensions: [sql({ dialect: MySQL })] });
    const target = {
      get state() {
        return state;
      },
      dispatch: (tr: Transaction) => {
        state = tr.state;
      },
    } as unknown as EditorView;
    const handled = binding.run!(target);
    return { handled, doc: state.doc.toString(), cursor: state.selection.main.head };
  }

  it('Q-83 Intro mantiene los tabuladores de la línea actual', () => {
    const doc = 'SELECT *\n\t\tFROM litedd_demo.customer';
    const r = enter(doc, doc.length);
    expect(r.handled).toBe(true);
    expect(r.doc).toBe(doc + '\n\t\t');
    expect(r.cursor).toBe(r.doc.length);
  });

  it('Q-83 Intro mantiene los espacios y no añade sangría a una línea sin ella', () => {
    expect(enter('    WHERE id = #{id}', 20).doc).toBe('    WHERE id = #{id}\n    ');
    expect(enter('SELECT 1', 8).doc).toBe('SELECT 1\n');
  });

  it('Q-83 a mitad de línea parte el texto y la nueva línea lleva la misma sangría', () => {
    expect(enter('\tWHERE a = 1 AND b = 2', 12).doc).toBe('\tWHERE a = 1\n\t AND b = 2');
  });

  it('Q-83 con el cursor dentro de la sangría solo copia la parte anterior', () => {
    expect(enter('\t\tFROM x', 1).doc).toBe('\t\n\t\tFROM x');
  });

  it('Q-83 sustituye la selección por el salto de línea con sangría', () => {
    expect(enter('\tSELECT a, b', [8, 12]).doc).toBe('\tSELECT \n\t');
  });
});
