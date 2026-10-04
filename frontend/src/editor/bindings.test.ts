import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import type { EditorView } from '@codemirror/view';
import { markdownBindings } from './NoteEditor';

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
