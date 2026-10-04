import { create } from 'zustand';
import { api } from '../api';

/**
 * Caché de imágenes adjuntas como URL data: (N-92, ADR-0016). Una imagen pendiente se pide una
 * vez; la vista se vuelve a pintar cuando llega.
 */
interface AttachmentCache {
  urls: Record<string, string>;
  failed: Record<string, true>;
  load: (ids: string[]) => void;
  remember: (id: string, url: string) => void;
}

const pending = new Set<string>();

export const useAttachments = create<AttachmentCache>((set, get) => ({
  urls: {},
  failed: {},

  load(ids) {
    for (const id of ids) {
      if (get().urls[id] || get().failed[id] || pending.has(id)) continue;
      pending.add(id);
      api
        .attachmentDataUrl(id)
        .then((url) => set({ urls: { ...get().urls, [id]: url } }))
        .catch(() => set({ failed: { ...get().failed, [id]: true } }))
        .finally(() => pending.delete(id));
    }
  },

  remember(id, url) {
    set({ urls: { ...get().urls, [id]: url } });
  },
}));
