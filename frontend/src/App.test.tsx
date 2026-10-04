import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { api } from './api';
import { useNote } from './stores/noteStore';
import { useTree } from './stores/treeStore';
import { useUi } from './stores/uiStore';
import type { Note } from './types';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, api: { getNote: vi.fn(), saveNote: vi.fn(), tree: vi.fn(), createNote: vi.fn(), getSettings: vi.fn(), putSettings: vi.fn() } };
});

const mocked = vi.mocked(api);

const created: Note = {
  id: 'nuevo',
  parentId: null,
  position: 0,
  type: 'md',
  title: 'Sin título',
  content: '',
  favorite: false,
  tags: [],
  version: 1,
  createdAt: '2026-10-04T08:00:00Z',
  updatedAt: '2026-10-04T08:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.tree.mockResolvedValue([]);
  mocked.getSettings.mockResolvedValue({});
  mocked.putSettings.mockResolvedValue({});
  mocked.createNote.mockResolvedValue(created);
  useNote.setState({ note: null });
  useTree.setState({ nodes: [] });
  useUi.setState({ sidebarVisible: true });
});

describe('App', () => {
  it('muestra la pantalla vacía «LiteDD» con el panel de notas', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'LiteDD' })).toBeTruthy();
    expect(screen.getByText('No hay ninguna nota abierta.')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Panel de notas' })).toBeTruthy();
  });

  it('N-05 N-06 «Nueva nota Markdown» crea en la raíz y abre en edición con el título seleccionado', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+ Nueva nota Markdown' }));
    const input = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Título' });
    expect(mocked.createNote).toHaveBeenCalledWith(null, 'md');
    expect(input.value).toBe('Sin título');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Sin título'.length]);
    // N-20: en edición aparece la barra de formato con todos sus botones.
    expect(screen.getByRole('toolbar', { name: 'Formato' }).querySelectorAll('button')).toHaveLength(17);
  });

  it('N-05 Alt+Mayús+N crea una nota SQL', async () => {
    mocked.createNote.mockResolvedValue({ ...created, type: 'sql' });
    render(<App />);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'N', altKey: true, shiftKey: true });
    });
    expect(mocked.createNote).toHaveBeenCalledWith(null, 'sql');
  });

  it('U-01 Alt+B oculta y muestra el panel izquierdo', async () => {
    render(<App />);
    await act(async () => {});
    await act(async () => {
      fireEvent.keyDown(window, { key: 'b', altKey: true });
    });
    expect(screen.queryByRole('complementary', { name: 'Panel de notas' })).toBeNull();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'b', altKey: true });
    });
    expect(screen.getByRole('complementary', { name: 'Panel de notas' })).toBeTruthy();
  });

  it('N-11 N-32 en consulta se ve el Markdown y un enlace a nota la abre', async () => {
    mocked.getNote.mockResolvedValue({ ...created, id: 'destino', title: 'Destino', content: 'texto destino' });
    await act(async () => {
      await useNote.getState().openNote({ ...created, title: 'Origen', content: '# Hola\n\n[ir](litedd://note/destino)' });
    });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Hola' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'ir' }));
    });
    expect(mocked.getNote).toHaveBeenCalledWith('destino');
    expect(await screen.findByText('texto destino')).toBeTruthy();
  });
});
