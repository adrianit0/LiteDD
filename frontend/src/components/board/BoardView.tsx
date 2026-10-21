import { useState } from 'react';
import { ImageViewer } from '../ImageViewer';
import { copyImage, dataUrlBlob, downloadImage } from '../../board/canvas';

/** B-04: «Copiar imagen» y «Descargar PNG», en consulta y en edición. png da la imagen de ese momento. */
export function ImageActions({ png, title }: { png: () => Promise<Blob>; title: string }) {
  return (
    <>
      <button type="button" onClick={() => void copyImage(png())} title="Copiar la pizarra al portapapeles como imagen">
        Copiar imagen
      </button>
      <button
        type="button"
        onClick={() =>
          void png()
            .then((blob) => downloadImage(blob, title))
            .catch(() => {})
        }
        title="Descargar la pizarra como fichero PNG"
      >
        Descargar PNG
      </button>
    </>
  );
}

/** B-02, B-04: la pizarra en consulta es una imagen que se abre en el visor (N-35). */
export function BoardView({ title, content }: { title: string; content: string }) {
  const [viewer, setViewer] = useState(false);
  if (content === '') {
    return <p className="muted view-empty">Pizarra vacía. Pulsa «Editar» o Ctrl+E para dibujar.</p>;
  }
  return (
    <div className="board-view">
      <div className="board-bar" role="toolbar" aria-label="Pizarra">
        <ImageActions png={() => Promise.resolve(dataUrlBlob(content))} title={title} />
      </div>
      <button type="button" className="board-open" onClick={() => setViewer(true)} title="Ampliar la pizarra">
        <img className="board-image" src={content} alt={title} draggable={false} />
      </button>
      {viewer && <ImageViewer src={content} alt={title} onClose={() => setViewer(false)} />}
    </div>
  );
}
