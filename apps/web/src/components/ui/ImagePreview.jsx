import { useState } from 'react';
import { Icon24DismissOverlay } from '@vkontakte/icons';

// Перенесённый паттерн DishImagePreview: миниатюра открывает полноэкранное фото.
export function ImagePreview({ title, src, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!src) {
    return <div className="media-preview__placeholder" aria-label={`${title}: без изображения`}>{placeholder}</div>;
  }

  return <>
    <button type="button" className="media-preview__button" aria-label={`Открыть изображение: ${title}`} onClick={() => setIsOpen(true)}>
      <img className="media-preview__image" src={src} alt={title} />
    </button>
    {isOpen ? <div className="image-modal-backdrop" role="presentation" onClick={() => setIsOpen(false)}>
      <section className="image-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="image-modal__close" aria-label="Закрыть изображение" onClick={() => setIsOpen(false)}><Icon24DismissOverlay width={24} height={24} /></button>
        <img className="image-modal__image" src={src} alt={title} />
      </section>
    </div> : null}
  </>;
}
