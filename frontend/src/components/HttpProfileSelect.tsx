import { LOCAL_PROFILE_ID } from '../api';
import { useActiveProfile, useHttpProfile } from '../stores/httpProfileStore';
import { useUi } from '../stores/uiStore';

/**
 * U-12: destino de las notas HTTP, a la izquierda del estado de la conexión. Solo aparece con los entornos de
 * preproducción permitidos (H-62); fuera de Local usa el color de aviso (propuesta A de ADR-0028).
 */
export function HttpProfileSelect() {
  const http = useUi((s) => s.config.http);
  const profile = useActiveProfile(http);
  if (!http.preproduction) return null;

  const choose = (id: string) =>
    void useHttpProfile
      .getState()
      .select(id)
      .catch((e: Error) => useUi.getState().notify(e.message, 'error'));

  return (
    <select
      className={profile.id === LOCAL_PROFILE_ID ? 'profile-select' : 'profile-select profile-preproduction'}
      aria-label="Destino de las notas HTTP"
      title="Destino de las notas HTTP"
      value={profile.id}
      onChange={(e) => choose(e.target.value)}
    >
      {http.profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
