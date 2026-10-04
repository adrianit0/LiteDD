import type { FormatAction } from './formatting';

interface Button {
  action: FormatAction;
  label: string;
  text: string;
  shortcut?: string;
}

/** N-20: botones en el orden de la especificación. */
export const FORMAT_BUTTONS: Button[] = [
  { action: 'bold', label: 'Negrita', text: 'B', shortcut: 'Control+B' },
  { action: 'italic', label: 'Cursiva', text: 'I', shortcut: 'Control+I' },
  { action: 'strike', label: 'Tachado', text: 'S' },
  { action: 'code', label: 'Código en línea', text: '`' },
  { action: 'h1', label: 'Título 1', text: 'H1' },
  { action: 'h2', label: 'Título 2', text: 'H2' },
  { action: 'h3', label: 'Título 3', text: 'H3' },
  { action: 'bullet', label: 'Lista', text: '•' },
  { action: 'ordered', label: 'Lista numerada', text: '1.' },
  { action: 'task', label: 'Lista de tareas', text: '☐' },
  { action: 'quote', label: 'Cita', text: '❝' },
  { action: 'codeBlock', label: 'Bloque de código', text: '{ }' },
  { action: 'link', label: 'Enlace', text: '🔗' },
  { action: 'noteLink', label: 'Enlace a nota', text: '[[ ]]' },
  { action: 'image', label: 'Imagen', text: '🖼' },
  { action: 'table', label: 'Tabla', text: '▦' },
  { action: 'hr', label: 'Línea horizontal', text: '―' },
];

export function FormatToolbar({ onFormat }: { onFormat: (action: FormatAction) => void }) {
  return (
    <div className="format-toolbar" role="toolbar" aria-label="Formato">
      {FORMAT_BUTTONS.map((b) => (
        <button
          key={b.action}
          type="button"
          className={`tool tool-${b.action}`}
          title={b.shortcut ? `${b.label} (${b.shortcut.replace('Control', 'Ctrl')})` : b.label}
          aria-label={b.label}
          aria-keyshortcuts={b.shortcut}
          // Evita que el editor pierda la selección al pulsar con el ratón.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onFormat(b.action)}
        >
          {b.text}
        </button>
      ))}
    </div>
  );
}
