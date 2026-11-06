import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { api, DEFAULT_CONFIG, type WorkflowAnalysis, type WorkflowEvent } from '../../api';
import { NotePane } from '../NotePane';
import { TypeIcon } from '../TypeIcon';
import { newNoteItems } from '../../actions';
import { useActiveTab, useTabs } from '../../stores/tabsStore';
import { useWorkflowRuns } from '../../stores/workflowRunStore';
import { useHttpProfile } from '../../stores/httpProfileStore';
import { useTree } from '../../stores/treeStore';
import { useUi } from '../../stores/uiStore';
import { flow, parseWorkflow } from '../../workflow/model';
import { NOTE_DROP } from '../../workflow/noteDrop';
import type { Note, TreeNode } from '../../types';

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      saveNote: vi.fn(),
      putSession: vi.fn(),
      putSettings: vi.fn(),
      tags: vi.fn(),
      workflowAnalyze: vi.fn(),
      workflowExecute: vi.fn(),
      workflowCancel: vi.fn(),
      httpProfile: vi.fn(),
      appVersion: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

const LINEAR = JSON.stringify({
  options: { stopOnError: true },
  nodes: [
    { id: 'start', kind: 'start', x: 32, y: 160 },
    { id: 'n1', kind: 'input', name: 'Input1', x: 224, y: 160, rows: [{ name: 'id', value: '54' }] },
    { id: 'n2', kind: 'http', name: 'Conn1', x: 416, y: 160, noteId: 'h1', values: { id: '$Input1.id' } },
    { id: 'n3', kind: 'wait', name: 'Espera1', x: 608, y: 160, seconds: '1' },
    { id: 'finish', kind: 'finish', x: 800, y: 160 },
  ],
  edges: [
    { from: 'start', to: 'n1' },
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
    { from: 'n3', to: 'finish' },
  ],
});

const workflowNote = (content: string, over: Partial<Note> = {}): Note => ({
  id: 'w1',
  parentId: null,
  position: 0,
  type: 'workflow',
  title: 'Alta de cliente',
  description: '',
  content,
  favorite: false,
  tags: [],
  version: 3,
  createdAt: '2026-10-28T08:00:00Z',
  updatedAt: '2026-10-28T08:00:00Z',
  ...over,
});

const tree = (id: string, type: TreeNode['type'], title: string): TreeNode => ({
  id, parentId: null, position: 0, type, title, description: '', favorite: false, tags: [],
});

const analysis: WorkflowAnalysis = {
  notes: [
    { id: 'h1', state: 'active', type: 'http', title: 'Tareas', method: 'GET', endpoint: '/user/#{id}/tasks', fields: [{ name: 'id' }], values: { id: '5' } },
    { id: 'h2', state: 'active', type: 'http', title: 'Alta de usuario', method: 'POST', endpoint: '/users', fields: [{ name: 'name' }], values: { name: 'demo' } },
  ],
  lastValues: {},
};

function Pane() {
  const tab = useActiveTab();
  return tab ? <NotePane key={tab.id} tab={tab} /> : null;
}

async function mount(content: string, mode: 'view' | 'edit' = 'view') {
  await act(async () => {
    await useTabs.getState().open('w1', { note: workflowNote(content), mode });
  });
  render(<Pane />);
  await act(async () => {});
}

const saved = () => parseWorkflow(useTabs.getState().tabs[0].content);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.appVersion.mockResolvedValue('0.1.0');
  mocked.putSession.mockResolvedValue({ tabs: [] });
  mocked.tags.mockResolvedValue([]);
  mocked.saveNote.mockImplementation(async (id, title, content, baseVersion) => workflowNote(content, { id, title, version: baseVersion + 1 }));
  mocked.workflowAnalyze.mockImplementation(async (ids: string[]) => ({
    notes: analysis.notes.filter((n) => ids.includes(n.id)),
    lastValues: { n1: { id: '77' } },
  }));
  mocked.workflowCancel.mockResolvedValue({ cancelled: true });
  mocked.httpProfile.mockResolvedValue({ active: 'local' });
  useUi.setState({ config: { ...DEFAULT_CONFIG } });
  useTabs.setState({ tabs: [], activeId: null, restored: false });
  useWorkflowRuns.setState({ runs: {} });
  useHttpProfile.setState({ active: 'local' });
  useTree.setState({ nodes: [tree('h1', 'http', 'Tareas'), tree('h2', 'http', 'Alta de usuario'), tree('s1', 'sql', 'Libros')] });
});

describe('notas workflow', () => {
  it('W-01 W-84 «Nota Workflow» en el menú «Nuevo» e icono WF', () => {
    expect(newNoteItems(null).map((i) => i.label)).toContain('Nota Workflow');
    render(<TypeIcon type="workflow" />);
    expect(screen.getByRole('img', { name: 'Workflow' }).textContent).toBe('WF');
  });

  it('W-02 W-14 con Start seleccionado, un workflow nuevo se monta con los botones sin dibujar flechas', async () => {
    await mount('', 'edit');
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Input' }));
    fireEvent.click(screen.getByRole('button', { name: '+ HTTP' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Espera' }));
    expect(flow(saved()).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Http1', 'Espera1', 'finish']);
    expect(useTabs.getState().tabs[0].status).toBe('pending');
  });

  it('W-14 W-29 sin selección, «+ Login» deja el nodo suelto y su «Usuario» se guarda en values.user', async () => {
    await mount('', 'edit');
    fireEvent.click(screen.getByRole('button', { name: '+ Login' }));
    expect(flow(saved()).map((n) => n.kind)).toEqual(['start', 'finish']);
    const login = saved().nodes.find((n) => n.kind === 'login')!;
    expect(login).toMatchObject({ name: 'Login1', values: { user: '' } });
    expect(screen.getByRole('button', { name: 'Login Login1' }).className).toContain('loose');
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: '$Input1.user' } });
    expect(saved().nodes.find((n) => n.kind === 'login')!.values).toEqual({ user: '$Input1.user' });
    expect(screen.getByText('No hay ningún nodo llamado Input1')).toBeTruthy();
  });

  it('W-40 las casillas se guardan; solo «Parar si error» viene marcada', async () => {
    await mount('', 'edit');
    const options = within(screen.getByRole('group', { name: 'Casillas' }));
    expect(options.getByLabelText<HTMLInputElement>('Parar si error').checked).toBe(true);
    expect(options.getByLabelText<HTMLInputElement>('Fijar valores de input').checked).toBe(false);
    fireEvent.click(options.getByLabelText('Parar si no existe input'));
    expect(saved().options.stopOnMissing).toBe(true);
  });

  it('W-13 Supr borra el nodo seleccionado y une a sus vecinos', async () => {
    await mount(LINEAR, 'edit');
    fireEvent.keyDown(screen.getByRole('button', { name: 'HTTP Conn1' }), { key: 'Delete' });
    expect(flow(saved()).map((n) => n.id)).toEqual(['start', 'n1', 'n3', 'finish']);
  });

  it('W-22 W-23 elegir la nota propone el nombre y muestra sus variables con sus valores', async () => {
    await mount('', 'edit');
    fireEvent.click(screen.getByRole('button', { name: '+ HTTP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Elegir nota…' }));
    fireEvent.click(screen.getByRole('option', { name: /Alta de usuario/ }));
    await act(async () => {});
    const node = saved().nodes.find((n) => n.kind === 'http')!;
    expect(node).toMatchObject({ noteId: 'h2', name: 'AltaDeUsuario', values: { name: 'demo' } });
    expect(screen.getByLabelText<HTMLInputElement>('name').value).toBe('demo');
  });

  it('W-17 W-36 «Sale hacia» une sin ratón y se avisa de referencias que no van antes', async () => {
    await mount(LINEAR, 'edit');
    fireEvent.click(screen.getByRole('button', { name: 'Input Input1' }));
    fireEvent.change(screen.getByLabelText('Sale hacia'), { target: { value: 'n3' } });
    expect(flow(saved()).map((n) => n.id)).toEqual(['start', 'n1', 'n3', 'finish']);
    fireEvent.change(screen.getByLabelText('Valor 1'), { target: { value: '$Espera1' } });
    expect(screen.getByText('Espera1 no va antes en el flujo: valdrá null')).toBeTruthy();
  });

  it('W-50 W-51 en consulta, los Input arriba con los valores de la última ejecución, y «Restablecer»', async () => {
    await mount(LINEAR);
    const form = within(screen.getByRole('group', { name: 'Input' }));
    expect(form.getByLabelText<HTMLInputElement>('id').value).toBe('77');
    fireEvent.change(form.getByLabelText('id'), { target: { value: '9' } });
    expect(useTabs.getState().tabs[0].workflow?.values.n1).toEqual({ id: '9' });
    // Los valores de consulta no cambian el workflow guardado.
    expect(useTabs.getState().tabs[0].status).toBe('saved');
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }));
    expect(form.getByLabelText<HTMLInputElement>('id').value).toBe('54');
  });

  it('W-44 con «Fijar valores de input», en consulta solo se cambian los Input', async () => {
    await mount(LINEAR.replace('"stopOnError":true', '"stopOnError":true,"lockValues":true'));
    fireEvent.click(screen.getByRole('button', { name: 'HTTP Conn1' }));
    const panel = within(screen.getByRole('complementary', { name: 'Nodo Conn1' }));
    expect(panel.getByLabelText<HTMLInputElement>('id').readOnly).toBe(true);
    expect(panel.getByText('Valores fijados: se cambian en edición.')).toBeTruthy();
  });

  it('W-60 W-70 W-71 W-72 «Ejecutar» envía los valores, pinta los estados y muestra el resultado', async () => {
    let emit: (e: WorkflowEvent) => void = () => {};
    let finish: () => void = () => {};
    mocked.workflowExecute.mockImplementation((_req, onEvent) => {
      emit = onEvent;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await mount(LINEAR);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ejecutar' }));
    });
    expect(mocked.workflowExecute.mock.calls[0][0]).toMatchObject({
      noteId: 'w1',
      version: 3,
      profileId: 'local',
      values: { n1: { id: '77' }, n2: { id: '$Input1.id' }, n3: { seconds: '1' } },
    });
    await act(async () => {
      emit({ type: 'start', chain: ['start', 'n1', 'n2', 'n3', 'finish'] });
      emit({ type: 'node', nodeId: 'start', status: 'ok', millis: 0 });
      emit({ type: 'node', nodeId: 'n1', status: 'running' });
      emit({ type: 'node', nodeId: 'n1', status: 'ok', millis: 0, values: { id: '77' } });
      emit({ type: 'node', nodeId: 'n2', status: 'running' });
    });
    expect(screen.getByRole('button', { name: 'Input Input1, correcto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'HTTP Conn1, en curso' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Espera Espera1, pendiente' })).toBeTruthy();
    // W-71: el avance es el nodo en curso.
    expect(screen.getByText('Conn1', { selector: '.wf-progress' })).toBeTruthy();
    await act(async () => {
      emit({
        type: 'node', nodeId: 'n2', status: 'error', millis: 120, values: { id: '77' },
        error: { code: 'http_status', message: 'Respondió 404 Not Found' },
      });
      emit({ type: 'end', status: 'stopped', errors: 1, millis: 130, message: 'Detenido por error en Conn1' });
      finish();
    });
    expect(within(screen.getByRole('toolbar', { name: 'Barra de ejecución' })).getByRole('status').textContent)
      .toBe('Detenido por error en Conn1');
    expect(screen.getByRole('button', { name: 'Espera Espera1, no ejecutado' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'HTTP Conn1, error' }));
    const panel = within(screen.getByRole('complementary', { name: 'Nodo Conn1' }));
    expect(panel.getByText('Respondió 404 Not Found')).toBeTruthy();
    expect(panel.getByText('77')).toBeTruthy();
  });

  it('W-74 W-75 W-76 W-77 cada ejecución queda en «Ejecución», con lo escrito, lo que entró y lo que no existía', async () => {
    let count = 0;
    mocked.workflowExecute.mockImplementation(async (_req, onEvent) => {
      const first = ++count === 1;
      onEvent({ type: 'start', chain: ['start', 'n1', 'n2', 'n3', 'finish'] });
      onEvent({ type: 'node', nodeId: 'n1', status: 'ok', millis: 0, raw: { id: '54' }, values: { id: '54' } });
      onEvent({
        type: 'node', nodeId: 'n2', status: first ? 'ok' : 'error', millis: 5,
        raw: { id: first ? '$Input1.id' : '$Input1.nada' }, values: { id: first ? '54' : null },
        missing: first ? undefined : ['$Input1.nada'],
        error: first ? undefined : { code: 'http_status', message: 'Respondió 404 Not Found' },
      });
      onEvent({ type: 'end', status: first ? 'finished' : 'stopped', errors: first ? 0 : 1, millis: 10,
        message: first ? 'Terminado' : 'Detenido por error en Conn1' });
    });
    await mount(LINEAR);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ejecutar' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ejecutar' }));
    });
    const select = screen.getByLabelText<HTMLSelectElement>('Ejecución');
    expect(select.options).toHaveLength(2);
    expect(select.options[0].textContent).toContain('Detenido por error en Conn1');
    expect(select.options[1].textContent).toContain('Terminado');
    // W-77: sin nodo seleccionado, el resumen de la última, con la referencia que no existía.
    const summary = within(screen.getByRole('complementary', { name: 'Resumen de la ejecución' }));
    expect(summary.getByText('$Input1.nada', { selector: '.wf-entered > code' })).toBeTruthy();
    expect(summary.getByText((_, el) => el?.className === 'wf-warning' && el.textContent === '$Input1.nada no existe → null')).toBeTruthy();
    // W-75: elegir la anterior cambia el lienzo y el panel.
    fireEvent.change(select, { target: { value: select.options[1].value } });
    fireEvent.click(screen.getByRole('button', { name: 'HTTP Conn1, correcto' }));
    const panel = within(screen.getByRole('complementary', { name: 'Nodo Conn1' }));
    expect(panel.getByText('$Input1.id', { selector: 'code' })).toBeTruthy();
    expect(panel.getByText('54', { selector: 'code' })).toBeTruthy();
  });

  it('W-74 se guardan como mucho 20 ejecuciones', async () => {
    mocked.workflowExecute.mockImplementation(async (_req, onEvent) => {
      onEvent({ type: 'start', chain: ['start', 'finish'] });
      onEvent({ type: 'end', status: 'finished', errors: 0, millis: 1, message: 'Terminado' });
    });
    await mount(LINEAR);
    const tabId = useTabs.getState().tabs[0].id;
    for (let i = 0; i < 21; i++) {
      await act(async () => {
        await useWorkflowRuns.getState().execute(tabId, {});
      });
    }
    expect(useWorkflowRuns.getState().runs[tabId].executions).toHaveLength(20);
  });

  it('W-60 W-17 con el foco en un nodo, Ctrl+Intro sigue llegando a los atajos globales', async () => {
    await mount(LINEAR);
    const seen: string[] = [];
    const listener = (e: KeyboardEvent) => seen.push(`${e.ctrlKey ? 'Ctrl+' : ''}${e.key}`);
    window.addEventListener('keydown', listener);
    try {
      fireEvent.keyDown(screen.getByRole('button', { name: 'HTTP Conn1' }), { key: 'Enter', ctrlKey: true });
      expect(seen).toEqual(['Ctrl+Enter']);
    } finally {
      window.removeEventListener('keydown', listener);
    }
  });

  it('W-27 el campo de la espera se llama «Segundos»', async () => {
    await mount(LINEAR, 'edit');
    fireEvent.click(screen.getByRole('button', { name: 'Espera Espera1' }));
    expect(screen.getByLabelText<HTMLInputElement>('Segundos').value).toBe('1');
  });

  it('W-61 los motivos de no ejecutar se listan', async () => {
    const { ApiError } = await vi.importActual<typeof import('../../api')>('../../api');
    mocked.workflowExecute.mockRejectedValue(new ApiError(400, 'workflow_invalid', 'No se puede ejecutar', ['«Conn1» no tiene nota']));
    await mount(LINEAR);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ejecutar' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('«Conn1» no tiene nota');
    // W-74: un error previo no es una ejecución.
    expect(screen.queryByLabelText('Ejecución')).toBeNull();
  });
});

describe('control del flujo, codos y notas arrastradas (ADR-0041)', () => {
  const LOOP = JSON.stringify({
    options: { stopOnError: false },
    nodes: [
      { id: 'start', kind: 'start', x: 32, y: 160 },
      { id: 'f', kind: 'foreach', name: 'Bucle1', x: 224, y: 160, list: '$Query1' },
      { id: 'e', kind: 'http', name: 'Eco', x: 416, y: 160, noteId: 'h1', values: { id: '$Bucle1.id' } },
      { id: 'finish', kind: 'finish', x: 608, y: 160 },
    ],
    edges: [
      { from: 'start', to: 'f' },
      { from: 'f', to: 'e' },
      { from: 'e', to: 'finish' },
    ],
  });

  it('W-14 W-90 W-17 W-91 una Condición insertada tiene dos «Sale hacia» y marca la condición mal escrita', async () => {
    await mount(LINEAR, 'edit');
    fireEvent.click(screen.getByRole('button', { name: 'Input Input1' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Condición' }));
    const cond = saved().nodes.find((n) => n.kind === 'condition')!;
    expect(cond.name).toBe('Condicion1');
    expect(screen.getByLabelText<HTMLSelectElement>('Si se cumple, sale hacia').value).toBe('n2');
    // W-15: la salida «No» todavía no tiene flecha.
    expect(document.querySelector(`[data-node-id="${cond.id}"] .wf-port.out.no.open`)).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Si no, sale hacia'), { target: { value: 'n3' } });
    expect(saved().edges).toContainEqual({ from: cond.id, out: 'no', to: 'n3' });
    expect(document.querySelector('.wf-port.out.open')).toBeNull();
    fireEvent.change(screen.getByLabelText('Condición'), { target: { value: '$Input1.id ==' } });
    expect(screen.getAllByText('Falta un valor al final').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Condición'), { target: { value: '$Input1.id == 54' } });
    expect(screen.queryByText('Falta un valor al final')).toBeNull();
    expect(saved().nodes.find((n) => n.id === cond.id)!.condition).toBe('$Input1.id == 54');
  });

  it('W-12 «Sale hacia» no ofrece los nodos con los que se cerraría un ciclo', async () => {
    await mount(LINEAR, 'edit');
    fireEvent.click(screen.getByRole('button', { name: 'Espera Espera1' }));
    const options = [...screen.getByLabelText<HTMLSelectElement>('Sale hacia').options].map((o) => o.textContent);
    expect(options).toEqual(['— Ninguno —', 'Finish']);
  });

  it('W-97 Cambiar valor guarda sus filas y marca los destinos que no son una referencia', async () => {
    await mount(LINEAR, 'edit');
    fireEvent.click(screen.getByRole('button', { name: 'HTTP Conn1' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Cambiar valor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir cambio' }));
    fireEvent.change(screen.getByLabelText('Destino 1'), { target: { value: 'Conn1.data' } });
    expect(screen.getByText('El destino es una referencia sola, como $Http1.data.valor')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Destino 1'), { target: { value: '$Conn1.data.valor' } });
    fireEvent.change(screen.getByLabelText('Nuevo valor 1'), { target: { value: '$Input1.id' } });
    expect(screen.queryByText('El destino es una referencia sola, como $Http1.data.valor')).toBeNull();
    expect(saved().nodes.find((n) => n.kind === 'set')).toMatchObject({
      name: 'Cambiar1',
      assignments: [{ target: '$Conn1.data.valor', value: '$Input1.id' }],
    });
  });

  it('W-18 arrastrar una flecha crea un codo, que se quita con doble clic', async () => {
    await mount(LINEAR, 'edit');
    const arrow = screen.getByRole('button', { name: 'Flecha de Conn1 a Espera1' });
    const canvas = document.querySelector('.wf-canvas')!;
    fireEvent.pointerDown(arrow, { clientX: 500, clientY: 300, button: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 520, clientY: 330, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 520, clientY: 330, pointerId: 1 });
    expect(saved().edges.find((e) => e.from === 'n2')!.points).toEqual([{ x: 528, y: 336 }]);
    fireEvent.doubleClick(screen.getByLabelText('Codo 1'));
    expect(saved().edges.find((e) => e.from === 'n2')).not.toHaveProperty('points');
    // Un clic sin mover solo la selecciona.
    fireEvent.pointerDown(arrow, { clientX: 500, clientY: 300, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 300, pointerId: 1 });
    expect(saved().edges.find((e) => e.from === 'n2')).not.toHaveProperty('points');
    expect(arrow.getAttribute('aria-pressed')).toBe('true');
  });

  it('W-19 una nota HTTP soltada sobre el lienzo en edición crea su nodo donde se suelta; en consulta, no', async () => {
    await mount(LINEAR, 'edit');
    const canvas = document.querySelector('.wf-canvas')!;
    await act(async () => {
      canvas.dispatchEvent(new CustomEvent(NOTE_DROP, { detail: { noteId: 'h2', type: 'http', clientX: 400, clientY: 400 } }));
    });
    expect(saved().nodes.find((n) => n.noteId === 'h2')).toMatchObject({
      kind: 'http', name: 'AltaDeUsuario', values: { name: 'demo' }, x: 320, y: 368,
    });
    expect(flow(saved()).map((n) => n.id)).toEqual(['start', 'n1', 'n2', 'n3', 'finish']);
    expect(screen.getByRole('complementary', { name: 'Nodo AltaDeUsuario' })).toBeTruthy();
  });

  it('W-19 en consulta, soltar una nota no hace nada', async () => {
    await mount(LINEAR);
    await act(async () => {
      document.querySelector('.wf-canvas')!.dispatchEvent(
        new CustomEvent(NOTE_DROP, { detail: { noteId: 'h2', type: 'http', clientX: 400, clientY: 400 } }),
      );
    });
    expect(saved().nodes.some((n) => n.noteId === 'h2')).toBe(false);
  });

  it('W-71 W-77 W-79 con un Bucle, el selector «Iteración» elige la vuelta y el resumen marca las que fallaron', async () => {
    let emit: (e: WorkflowEvent) => void = () => {};
    let finish: () => void = () => {};
    mocked.workflowExecute.mockImplementation((_req, onEvent) => {
      emit = onEvent;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    await mount(LOOP);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ejecutar' }));
    });
    await act(async () => {
      emit({ type: 'start', chain: ['start', 'f', 'e', 'finish'] });
      emit({ type: 'node', nodeId: 'start', status: 'ok', millis: 0 });
      emit({ type: 'node', nodeId: 'f', status: 'ok', millis: 0, raw: { list: '$Query1' }, items: 2 });
      emit({ type: 'iteration', nodeId: 'f', iteration: [1], total: 2, item: '{"id":1}' });
      emit({ type: 'node', nodeId: 'e', iteration: [1], status: 'running' });
    });
    expect(screen.getByText('Eco · Bucle1 1 de 2', { selector: '.wf-progress' })).toBeTruthy();
    await act(async () => {
      emit({ type: 'node', nodeId: 'e', iteration: [1], status: 'ok', millis: 3, raw: { id: '$Bucle1.id' }, values: { id: '1' } });
      emit({ type: 'node', nodeId: 'finish', iteration: [1], status: 'ok', millis: 0 });
      emit({ type: 'iteration', nodeId: 'f', iteration: [2], total: 2, item: '{"id":2}' });
      emit({
        type: 'node', nodeId: 'e', iteration: [2], status: 'error', millis: 4, raw: { id: '$Bucle1.id' }, values: { id: '2' },
        error: { code: 'http_status', message: 'Respondió 404 Not Found' },
      });
      emit({ type: 'node', nodeId: 'finish', iteration: [2], status: 'ok', millis: 0 });
      emit({ type: 'end', status: 'finished', errors: 1, millis: 9, message: 'Terminado con 1 error' });
      finish();
    });
    // Por defecto, la última vuelta.
    expect(screen.getByRole('button', { name: 'HTTP Eco, error' })).toBeTruthy();
    const summary = within(screen.getByRole('complementary', { name: 'Resumen de la ejecución' }));
    const picker = summary.getByLabelText<HTMLSelectElement>('Iteración');
    expect([...picker.options].map((o) => o.textContent)).toEqual(['Bucle1 1 de 2', '✗ Bucle1 2 de 2']);
    expect(within(summary.getByRole('group', { name: 'Iteraciones con error' })).getByRole('button', { name: '2' })).toBeTruthy();
    // El Bucle muestra cuántos elementos tenía su lista.
    expect(summary.getByText('2 elementos', { selector: 'code' })).toBeTruthy();
    fireEvent.change(picker, { target: { value: '1' } });
    expect(screen.getByRole('button', { name: 'HTTP Eco, correcto' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'HTTP Eco, correcto' }));
    const panel = within(screen.getByRole('complementary', { name: 'Nodo Eco' }));
    expect(panel.getByText('1', { selector: '.wf-entered code' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bucle Bucle1, correcto' }));
    const loop = within(screen.getByRole('complementary', { name: 'Nodo Bucle1' }));
    expect(loop.getByText('{"id":1}', { selector: 'code' })).toBeTruthy();
    expect(loop.getByText('Se cambia en edición.')).toBeTruthy();
  });
});
