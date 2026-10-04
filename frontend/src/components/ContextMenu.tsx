import { useEffect, useRef, type KeyboardEvent } from 'react';

export interface MenuItem {
  label: string;
  shortcut?: string;
  onSelect: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** Menú contextual manejable con teclado (N-04, U-08). */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      previous?.focus();
    };
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    const entries = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') entries[(index + 1) % entries.length]?.focus();
    else if (e.key === 'ArrowUp') entries[(index - 1 + entries.length) % entries.length]?.focus();
    else if (e.key === 'Escape' || e.key === 'Tab') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Mantiene el menú dentro de la ventana.
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - items.length * 32 - 16);

  return (
    <div className="context-menu" role="menu" ref={ref} style={{ left, top }} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            item.onSelect();
          }}
        >
          <span>{item.label}</span>
          {item.shortcut && <span className="muted">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}
