import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon20ChevronLeftOutline, Icon20ChevronRightOutline, Icon20ReplayOutline, Icon24DismissOverlay } from '@vkontakte/icons';
import { LoadingSpinner } from './LoadingSpinner';
import './PhotoStrip.css';

function PhotoImage({ url, alt, full = false }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState('loading');
  return <span className={`photo-image${full ? ' photo-image--full' : ''}`}>
    {state === 'loading' ? <LoadingSpinner /> : null}
    {state === 'error' ? <button type="button" className="photo-image__retry" aria-label="Повторить загрузку фото" onClick={(event) => { event.stopPropagation(); setState('loading'); setAttempt((value) => value + 1); }}><Icon20ReplayOutline /></button> : null}
    <img key={`${url}-${attempt}`} src={attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url} alt={alt} loading={full ? 'eager' : 'lazy'} decoding="async" draggable="false" className={state === 'loaded' ? 'photo-image__loaded' : ''} onLoad={() => setState('loaded')} onError={() => setState('error')} />
  </span>;
}

export function PhotoStrip({ photos = [], title = 'Фото', onOpen }) {
  const strip = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const update = () => { const el = strip.current; if (el) setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 }); };
  useEffect(() => { update(); if (typeof ResizeObserver === "undefined") return undefined; const observer = new ResizeObserver(update); if (strip.current) observer.observe(strip.current); return () => observer.disconnect(); }, [photos.length]);
  if (!photos.length) return null;
  return <div className="photo-strip-wrap">
    {edge.left ? <button type="button" className="photo-strip-arrow photo-strip-arrow--left" aria-label="Прокрутить фото влево" onClick={() => strip.current?.scrollBy({ left: -216, behavior: 'smooth' })}><Icon20ChevronLeftOutline /></button> : null}
    <div ref={strip} className="photo-strip" onScroll={update} onPointerDown={(event) => { if (event.pointerType === 'mouse' && !event.target.closest('button')) drag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false }; }} onPointerMove={(event) => { if (drag.current) { const delta = event.clientX - drag.current.x; if (Math.abs(delta) > 5 && !drag.current.moved) { drag.current.moved = true; event.currentTarget.setPointerCapture?.(event.pointerId); } event.currentTarget.scrollLeft = drag.current.scroll - delta; } }} onPointerUp={() => { suppressClick.current = Boolean(drag.current?.moved); drag.current = null; }}>{photos.map((photo, index) => <div key={photo.id ?? `${photo.url}-${index}`} className="photo-strip__item" role="button" tabIndex={0} aria-label={`Открыть фото ${index + 1}`} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onOpen?.(index); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); onOpen?.(index); } }}><PhotoImage url={photo.url ?? photo} alt={`${title}: фото ${index + 1}`} /></div>)}</div>
    {edge.right ? <button type="button" className="photo-strip-arrow photo-strip-arrow--right" aria-label="Прокрутить фото вправо" onClick={() => strip.current?.scrollBy({ left: 216, behavior: 'smooth' })}><Icon20ChevronRightOutline /></button> : null}
  </div>;
}

export function PhotoGallery({ photos = [], title = 'Фото', initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const move = useCallback((delta) => setIndex((value) => Math.max(0, Math.min(photos.length - 1, value + delta))), [photos.length]);
  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, move]);
  if (!photos.length) return null;

  const onPhotoClick = (event) => {
    if (event.target.closest('button')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) / bounds.width;
    if (position < 0.3 && index > 0) move(-1);
    if (position > 0.7 && index < photos.length - 1) move(1);
  };

  return <div className="image-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="image-modal event-photo-gallery" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <button type="button" className="image-modal__close" aria-label="Закрыть изображения" onClick={onClose}><Icon24DismissOverlay width={24} height={24} /></button>
      <div className="photo-gallery-area" onClick={onPhotoClick}><PhotoImage key={index} url={photos[index].url ?? photos[index]} alt={`${title}: фото ${index + 1}`} full /></div>
      {index > 0 ? <button type="button" className="event-photo-gallery__arrow event-photo-gallery__arrow--previous" aria-label="Предыдущее фото" onClick={() => move(-1)}><Icon20ChevronLeftOutline /></button> : null}
      {index < photos.length - 1 ? <button type="button" className="event-photo-gallery__arrow event-photo-gallery__arrow--next" aria-label="Следующее фото" onClick={() => move(1)}><Icon20ChevronRightOutline /></button> : null}
      <span className="event-photo-gallery__counter">{index + 1} / {photos.length}</span>
    </section>
  </div>;
}
