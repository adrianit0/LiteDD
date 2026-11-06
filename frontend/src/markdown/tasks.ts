/** Marcador de lista (con citas y sangría delante) seguido de la casilla «[ ]», «[x]» o «[X]». */
const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\] )/;

/**
 * N-31, ADR-0044: marca o desmarca la casilla de tareas de la línea indicada (desde 0). Si esa línea ya no es una
 * tarea, devuelve el contenido sin cambios. Conserva los finales de línea.
 */
export function toggleTask(content: string, line: number): string {
  const lines = content.split('\n');
  const text = lines[line];
  const match = text === undefined ? null : TASK_LINE.exec(text);
  if (!text || !match) return content;
  lines[line] = match[1] + (match[2] === ' ' ? 'x' : ' ') + text.slice(match[1].length + 1);
  return lines.join('\n');
}
