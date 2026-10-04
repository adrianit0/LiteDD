import { splitMarked } from '../search';

/** N-71: texto con lo encontrado resaltado, sin interpretar HTML. */
export function Marked({ text }: { text: string }) {
  return (
    <>
      {splitMarked(text).map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}
