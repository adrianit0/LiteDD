import { create } from 'zustand';
import type { ReactNode } from 'react';

/** Diálogos de confirmación (U-07): se piden con ask() y devuelven la opción elegida. */
export interface DialogOption<T extends string> {
  value: T;
  label: string;
  primary?: boolean;
}

interface DialogRequest {
  title: string;
  body: ReactNode;
  options: DialogOption<string>[];
  /** Valor que devuelve Esc. */
  cancelValue: string;
  resolve: (value: string) => void;
}

interface DialogState {
  current: DialogRequest | null;
  answer: (value: string) => void;
}

export const useDialogs = create<DialogState>((set, get) => ({
  current: null,
  answer(value) {
    const current = get().current;
    set({ current: null });
    current?.resolve(value);
  },
}));

export function ask<T extends string>(request: {
  title: string;
  body: ReactNode;
  options: DialogOption<T>[];
  cancelValue: T;
}): Promise<T> {
  return new Promise<T>((resolve) => {
    // Un diálogo nuevo sustituye al anterior, que se da por cancelado.
    useDialogs.getState().current?.resolve(useDialogs.getState().current!.cancelValue);
    useDialogs.setState({ current: { ...request, resolve: resolve as (v: string) => void } });
  });
}
