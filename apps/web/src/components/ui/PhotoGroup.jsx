import { useState } from 'react';
import { PhotoGallery } from '../common/PhotoStrip';
import { ImagePreview } from './ImagePreview';

export function PhotoGroup({ photos = [], title = 'Фото', className, renderPhoto }) {
  const [index, setIndex] = useState(null);
  return <>
    <div className={className}>
      {photos.map((photo, photoIndex) => {
        const open = () => setIndex(photoIndex);
        if (renderPhoto) return renderPhoto(photo, photoIndex, open);
        return <ImagePreview key={photo.id ?? `${photo.url ?? photo}-${photoIndex}`} title={`${title}: фото ${photoIndex + 1}`} src={photo.url ?? photo} photo={typeof photo === 'object' ? photo : undefined} onOpen={open} />;
      })}
    </div>
    {index !== null ? <PhotoGallery photos={photos} title={title} initialIndex={index} onClose={() => setIndex(null)} /> : null}
  </>;
}
