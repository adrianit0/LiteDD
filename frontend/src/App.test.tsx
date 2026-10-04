import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('muestra la pantalla vacía «LiteDD»', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'LiteDD' })).toBeTruthy();
    expect(screen.getByText('No hay ninguna nota abierta.')).toBeTruthy();
  });
});
