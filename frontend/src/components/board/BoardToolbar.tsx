import type { ReactNode } from 'react';
import { FONT_SIZES, MAX_STROKE, MIN_STROKE, PALETTE } from '../../board/engine';

export type Tool = 'brush' | 'eraser' | 'text' | 'fill' | 'select';

export interface ToolSettings {
  tool: Tool;
  color: string;
  stroke: number;
  fontSize: number;
}

const TOOLS: { tool: Tool; label: string; icon: string; hint: string }[] = [
  { tool: 'brush', label: 'Pincel', icon: '✎', hint: 'Pinta a mano alzada' },
  { tool: 'eraser', label: 'Goma', icon: '⌫', hint: 'Borra pintando de blanco' },
  { tool: 'text', label: 'Texto', icon: 'T', hint: 'Clic para escribir; Escape o un clic fuera lo fija' },
  { tool: 'fill', label: 'Relleno', icon: '◧', hint: 'Rellena la zona del mismo color' },
  { tool: 'select', label: 'Selección', icon: '⬚', hint: 'Arrastra para seleccionar; Supr, Ctrl+C y Ctrl+X' },
];

interface Props {
  settings: ToolSettings;
  onChange: (changes: Partial<ToolSettings>) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** B-04: copiar y descargar. */
  children: ReactNode;
}

/** B-10 a B-18: barra de herramientas de la pizarra en edición. */
export function BoardToolbar({ settings, onChange, canUndo, canRedo, onUndo, onRedo, children }: Props) {
  // Los botones no se quedan el foco: así los atajos siguen yendo al lienzo.
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  return (
    <div className="board-toolbar" role="toolbar" aria-label="Herramientas de la pizarra">
      <div className="board-group">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            className="tool"
            aria-pressed={settings.tool === t.tool}
            title={`${t.label}: ${t.hint}`}
            onMouseDown={keepFocus}
            onClick={() => onChange({ tool: t.tool })}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      <div className="board-group" role="group" aria-label="Color">
        {PALETTE.map((c) => (
          <button
            key={c.value}
            type="button"
            className="swatch"
            aria-label={c.name}
            title={c.name}
            aria-pressed={settings.color === c.value}
            style={{ background: c.value }}
            onMouseDown={keepFocus}
            onClick={() => onChange({ color: c.value })}
          />
        ))}
        <input type="color" aria-label="Otro color" title="Otro color" value={settings.color} onChange={(e) => onChange({ color: e.target.value })} />
      </div>
      <div className="board-group">
        <label className="board-field">
          Grosor
          <input
            type="range"
            min={MIN_STROKE}
            max={MAX_STROKE}
            value={settings.stroke}
            onChange={(e) => onChange({ stroke: Number(e.target.value) })}
          />
          <span className="board-value">{settings.stroke} px</span>
        </label>
        <label className="board-field">
          Letra
          <select value={settings.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })}>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} px
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="board-group">
        <button type="button" className="tool" disabled={!canUndo} onMouseDown={keepFocus} onClick={onUndo} aria-keyshortcuts="Control+Z" title="Deshacer (Ctrl+Z)">
          ↶ Deshacer
        </button>
        <button
          type="button"
          className="tool"
          disabled={!canRedo}
          onMouseDown={keepFocus}
          onClick={onRedo}
          aria-keyshortcuts="Control+Y Control+Shift+Z"
          title="Rehacer (Ctrl+Y)"
        >
          ↷ Rehacer
        </button>
      </div>
      <div className="board-group board-end">
        <span className="muted board-hint">Ctrl+V pega una imagen</span>
        {children}
      </div>
    </div>
  );
}
