import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface Props {
  title: string;
  children: ReactNode;
  actions: DialogAction[];
  /** Esc cierra el diálogo; sin onCancel hay que elegir una acción. */
  onCancel?: () => void;
}

/** Diálogo modal para confirmaciones destructivas y conflictos (U-07). */
export function Dialog({ title, children, actions, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && onCancel) {
      e.stopPropagation();
      onCancel();
    }
    // Mantiene el foco dentro del diálogo (U-08).
    if (e.key === 'Tab') {
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.shiftKey ? index - 1 : index + 1;
      e.preventDefault();
      buttons[(next + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref} onKeyDown={onKeyDown}>
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" className={a.primary ? 'primary' : undefined} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
