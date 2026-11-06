import { dropNote, markDropTarget, NOTE_DROP, type NoteDropDetail } from './noteDrop';

/** W-19: el árbol suelta notas sobre el lienzo de un workflow en edición (ADR-0041). */
describe('W-19 soltar una nota del árbol sobre un workflow', () => {
  let canvas: HTMLDivElement;
  let node: HTMLDivElement;
  let received: NoteDropDetail[];

  beforeEach(() => {
    canvas = document.createElement('div');
    canvas.className = 'wf-canvas editable';
    node = document.createElement('div');
    canvas.appendChild(node);
    document.body.appendChild(canvas);
    received = [];
    canvas.addEventListener(NOTE_DROP, (e) => received.push((e as CustomEvent<NoteDropDetail>).detail));
    document.elementsFromPoint = vi.fn(() => [node, canvas, document.body]);
  });

  afterEach(() => {
    canvas.remove();
  });

  it('W-19 una nota HTTP o SQL llega al lienzo en edición que hay bajo el puntero', () => {
    expect(dropNote({ noteId: 'h1', type: 'http', clientX: 10, clientY: 20 })).toBe(true);
    expect(dropNote({ noteId: 's1', type: 'sql', clientX: 10, clientY: 20 })).toBe(true);
    expect(received.map((d) => d.noteId)).toEqual(['h1', 's1']);
  });

  it('W-19 otro tipo de nota, o un lienzo en consulta, no recibe nada', () => {
    expect(dropNote({ noteId: 'm1', type: 'md', clientX: 10, clientY: 20 })).toBe(false);
    canvas.className = 'wf-canvas';
    expect(dropNote({ noteId: 'h1', type: 'http', clientX: 10, clientY: 20 })).toBe(false);
    expect(received).toEqual([]);
  });

  it('W-19 mientras se arrastra, el lienzo que la recibiría se resalta', () => {
    markDropTarget({ clientX: 10, clientY: 20, type: 'http' });
    expect(canvas.classList.contains('drop-target')).toBe(true);
    markDropTarget({ clientX: 10, clientY: 20, type: 'md' });
    expect(canvas.classList.contains('drop-target')).toBe(false);
    markDropTarget({ clientX: 10, clientY: 20, type: 'sql' });
    dropNote({ noteId: 's1', type: 'sql', clientX: 10, clientY: 20 });
    expect(canvas.classList.contains('drop-target')).toBe(false);
  });
});
