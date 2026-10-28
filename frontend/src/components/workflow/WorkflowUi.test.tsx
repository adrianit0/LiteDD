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
import { chain, parseWorkflow } from '../../workflow/model';
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
    expect(chain(saved()).map((n) => n.name ?? n.kind)).toEqual(['start', 'Input1', 'Http1', 'Espera1', 'finish']);
    expect(useTabs.getState().tabs[0].status).toBe('pending');
  });

  it('W-14 W-29 sin selección, «+ Login» deja el nodo suelto y su «Usuario» se guarda en values.user', async () => {
    await mount('', 'edit');
    fireEvent.click(screen.getByRole('button', { name: '+ Login' }));
    expect(chain(saved()).map((n) => n.kind)).toEqual(['start', 'finish']);
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
    expect(chain(saved()).map((n) => n.id)).toEqual(['start', 'n1', 'n3', 'finish']);
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
    expect(chain(saved()).map((n) => n.id)).toEqual(['start', 'n1', 'n3', 'finish']);
    fireEvent.change(screen.getByLabelText('Valor 1'), { target: { value: '$Espera1' } });
    expect(screen.getByText('Espera1 no va antes en la cadena: valdrá null')).toBeTruthy();
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
    expect(screen.getByText('Nodo 2 de 3')).toBeTruthy();
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
