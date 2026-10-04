import { useDialogs } from '../stores/dialogStore';
import { Dialog } from './Dialog';

/** Muestra el diálogo de confirmación pendiente (U-07). */
export function DialogHost() {
  const current = useDialogs((s) => s.current);
  if (!current) return null;
  const answer = useDialogs.getState().answer;
  return (
    <Dialog
      title={current.title}
      onCancel={() => answer(current.cancelValue)}
      actions={current.options.map((o) => ({ label: o.label, primary: o.primary, onClick: () => answer(o.value) }))}
    >
      <p>{current.body}</p>
    </Dialog>
  );
}
