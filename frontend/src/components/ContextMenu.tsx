import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface MenuItem {
  label: string;
  shortcut?: string;
  onSelect?: () => void;
  /** Submenú que se despliega a la derecha (ADR-0026). */
  submenu?: MenuItem[];
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 240;

/** Entradas del menú al que pertenece el elemento, sin las de sus submenús. */
function entriesOf(element: Element | null): HTMLElement[] {
  const menu = element?.closest('[role="menu"]');
  if (!menu) return [];
  return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter((e) => e.closest('[role="menu"]') === menu);
}

/** Menú contextual manejable con teclado (N-04, U-08), con submenús a la derecha (ADR-0026). */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);

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

  const openSubmenu = (label: string) => {
    setOpenSub(label);
    requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>(`[data-submenu="${CSS.escape(label)}"] [role="menuitem"]`)?.focus(),
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const active = e.target as HTMLElement;
    const entries = entriesOf(active);
    const index = entries.indexOf(active as HTMLElement);
    const inSubmenu = !!active?.closest('[data-submenu]');
    const parentLabel = active?.dataset.parent;
    if (e.key === 'ArrowDown') entries[(index + 1) % entries.length]?.focus();
    else if (e.key === 'ArrowUp') entries[(index - 1 + entries.length) % entries.length]?.focus();
    else if (e.key === 'ArrowRight' && parentLabel) openSubmenu(parentLabel);
    else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && inSubmenu) {
      const label = openSub;
      setOpenSub(null);
      if (label) ref.current?.querySelector<HTMLElement>(`[data-parent="${CSS.escape(label)}"]`)?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Mantiene el menú dentro de la ventana; el submenú se abre a la izquierda si no cabe a la derecha.
  const left = Math.min(x, window.innerWidth - MENU_WIDTH);
  const top = Math.min(y, window.innerHeight - items.length * 32 - 16);
  const subLeft = left + MENU_WIDTH * 2 > window.innerWidth;

  const select = (item: MenuItem) => {
    onClose();
    item.onSelect?.();
  };

  return (
    <div className="context-menu" role="menu" ref={ref} style={{ left, top }} onKeyDown={onKeyDown}>
      {items.map((item) =>
        item.submenu ? (
          <div key={item.label} className="context-submenu-host" onMouseEnter={() => setOpenSub(item.label)}>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-haspopup="menu"
              aria-expanded={openSub === item.label}
              data-parent={item.label}
              onClick={(e) => {
                e.stopPropagation();
                openSubmenu(item.label);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  openSubmenu(item.label);
                }
              }}
            >
              <span>{item.label}</span>
              <span className="muted">▸</span>
            </button>
            {openSub === item.label && (
              <div
                className={`context-menu context-submenu${subLeft ? ' context-submenu-left' : ''}`}
                role="menu"
                aria-label={item.label}
                data-submenu={item.label}
              >
                {item.submenu.map((sub) => (
                  <button
                    key={sub.label}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      select(sub);
                    }}
                  >
                    <span>{sub.label}</span>
                    {sub.shortcut && <span className="muted">{sub.shortcut}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onMouseEnter={() => setOpenSub(null)}
            onClick={(e) => {
              e.stopPropagation();
              select(item);
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="muted">{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
