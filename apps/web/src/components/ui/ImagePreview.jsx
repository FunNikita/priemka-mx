import { useState } from 'react';
import { photoPreviewUrl } from '../common/photoPreviewUrl';
import { PhotoGallery } from '../common/PhotoStrip';

// Перенесённый паттерн DishImagePreview: миниатюра открывает полноэкранное фото.
export function ImagePreview({ title, src, photo, placeholder, onOpen }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!src) {
    return <div className="media-preview__placeholder" aria-label={`${title}: без изображения`}>{placeholder}</div>;
  }

  return <>
    <button type="button" className="media-preview__button" aria-label={`Открыть изображение: ${title}`} onClick={onOpen ?? (() => setIsOpen(true))}>
      <img className="media-preview__image" src={photoPreviewUrl(photo ?? src)} alt={title} draggable={false} />
    </button>
    {isOpen && !onOpen ? <PhotoGallery photos={[photo ?? { url: src }]} title={title} onClose={() => setIsOpen(false)} /> : null}
  </>;
}
