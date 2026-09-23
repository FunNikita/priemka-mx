import { Avatar, Button, Panel, Typography } from '@maxhub/max-ui';
import { Icon20ChevronLeftOutline, Icon20ChevronRight, Icon20ChevronRightOutline, Icon24AddCircle, Icon24Attach, Icon24DeleteOutline, Icon24Dismiss, Icon24DismissOverlay, Icon24LocationOutline, Icon28WriteOutline } from '@vkontakte/icons';
import { useEffect, useMemo, useRef, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { SearchInput } from '../components/ui/SearchInput';
import { ActiveWorkDetails } from './HomePage';
import { Modal } from '../components/ui/Modal';
import { ImagePreview } from '../components/ui/ImagePreview';
import { StatusBadge } from '../components/ui/StatusBadge';
import './WorksPage.css';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новая' },
  { id: 'review', label: 'Рассматривается' },
  { id: 'progress', label: 'В работе' },
  { id: 'waiting-review', label: 'Ожидает' },
  { id: 'accepted', label: 'Принята' },
];

const WORK_PHOTO = 'https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg';
const WORK_PHOTOS = [WORK_PHOTO, WORK_PHOTO, WORK_PHOTO];

const EVENTS = [
  { id: 1, title: 'Не работает освещение у входа', place: 'Подъезд 2, 1 этаж', status: 'new', statusLabel: 'Новая', tone: 'blue', createdAt: '18.09.2026', displayDate: '12 сентября 12:00', description: 'Не работает освещение у входа в подъезд. Нужна проверка и замена лампы.', deadline: '21.09.2026', executor: null, image: WORK_PHOTO, photos: WORK_PHOTOS },
  { id: 2, title: 'Проверка протечки в подвале', place: 'Корпус А, подвал', status: 'review', statusLabel: 'На рассмотрении', tone: 'orange', createdAt: '17.09.2026', displayDate: '11 сентября 16:30', description: 'В подвале замечены следы протечки. Нужен осмотр инженерных коммуникаций.', deadline: '20.09.2026', executor: 'ООО «Домсервис»', image: WORK_PHOTO, photos: WORK_PHOTOS },
  { id: 3, title: 'Ремонт доводчика входной двери', place: 'Подъезд 1', status: 'progress', statusLabel: 'В работе', tone: 'purple', createdAt: '16.09.2026', displayDate: '10 сентября 09:15', description: 'Дверь закрывается не до конца. Заявка передана управляющей компании.', deadline: '23.09.2026', executor: 'Иван Петров', image: WORK_PHOTO, photos: WORK_PHOTOS },
  { id: 4, title: 'Повторная проверка детской площадки', place: 'Двор, игровая зона', status: 'waiting-review', statusLabel: 'Ожидает проверки', tone: 'orange', createdAt: '14.09.2026', displayDate: '8 сентября 14:20', description: 'После ремонта требуется повторно проверить безопасное покрытие площадки.', deadline: null, executor: 'Управляющая компания', image: WORK_PHOTO, photos: WORK_PHOTOS },
  { id: 5, title: 'Убрана наледь у подъезда', place: 'Подъезд 3', status: 'accepted', statusLabel: 'Принята', tone: 'green', createdAt: '12.09.2026', displayDate: '6 сентября 08:40', description: 'Наледь у входа убрана, проход к подъезду безопасен.', deadline: '13.09.2026', executor: 'ООО «Домсервис»', image: WORK_PHOTO, photos: WORK_PHOTOS },
];

export function WorksPage({ onBack, onOpenReport }) {
  const [filter, setFilter] = useState('all');
  const [eventsData, setEventsData] = useState(EVENTS);
  const [query, setQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [observedEventIds, setObservedEventIds] = useState(() => EVENTS.map((event) => event.id));
  const [galleryEvent, setGalleryEvent] = useState(null);
  const filtersRef = useRef(null);

  useEffect(() => {
    const filters = filtersRef.current;
    if (!filters || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let frameId;
    let stopped = false;
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frameId);
    };
    const showScrollHint = () => {
      const distance = Math.min(4, filters.scrollWidth - filters.clientWidth);
      if (distance <= 0) return;

      const startedAt = performance.now();
      const moveDuration = 420;
      const pauseDuration = 180;
      const totalDuration = moveDuration * 2 + pauseDuration;
      const easeOut = (value) => 1 - (1 - value) ** 3;
      const tick = (now) => {
        if (stopped) return;
        const elapsed = now - startedAt;
        let offset = 0;
        if (elapsed < moveDuration) offset = distance * easeOut(elapsed / moveDuration);
        else if (elapsed < moveDuration + pauseDuration) offset = distance;
        else if (elapsed < totalDuration) offset = distance * (1 - easeOut((elapsed - moveDuration - pauseDuration) / moveDuration));
        filters.scrollLeft = offset;
        if (elapsed < totalDuration) frameId = requestAnimationFrame(tick);
        else filters.scrollLeft = 0;
      };
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(showScrollHint);
    filters.addEventListener('pointerdown', stop, { once: true });
    filters.addEventListener('wheel', stop, { once: true, passive: true });
    return () => {
      cancelAnimationFrame(frameId);
      filters.removeEventListener('pointerdown', stop);
      filters.removeEventListener('wheel', stop);
    };
  }, []);

  const selectFilter = (nextFilter, element) => {
    setFilter(nextFilter);
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };
  const events = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = eventsData.filter((event) => (filter === 'all' || event.status === filter) && (!normalizedQuery || `${event.title} ${event.place} ${event.executor ?? ''}`.toLowerCase().includes(normalizedQuery)));
    return result.sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));
  }, [eventsData, filter, query]);

  if (selectedEvent) {
    const work = {
      id: String(selectedEvent.id),
      title: selectedEvent.title.replace(/^Не работает /, ''),
      status: selectedEvent.statusLabel,
      review: selectedEvent.status === 'new' ? 'Ожидает проверки' : null,
      description: selectedEvent.description,
      photos: selectedEvent.photos ?? (selectedEvent.image ? [selectedEvent.image] : []),
    };
    return <ActiveWorkDetails work={work} isObserved={observedEventIds.includes(selectedEvent.id)} onBack={() => setSelectedEvent(null)} onStopObserving={() => setObservedEventIds((ids) => ids.filter((id) => id !== selectedEvent.id))} onReportResolved={() => setEventsData((items) => items.map((item) => item.id === selectedEvent.id ? { ...item, status: 'waiting-review', statusLabel: 'Ожидает проверки' } : item))} />;
  }

  return <Panel mode="primary" className="inner-panel house-events-panel">
    <PageHeader title="События дома" onBack={onBack} />
    <main className="panel-content house-events-content">
      <section className="house-events-shell">
        <div className="house-events-toolbar">
          <button type="button" className="house-events-toolbar__report" onClick={onOpenReport}><span className="house-events-toolbar__report-icon"><Icon24AddCircle /></span><span className="house-events-toolbar__report-copy"><b>Сообщить о проблеме</b><small>Новое обращение в управляющую компанию</small></span><Icon20ChevronRight className="house-events-toolbar__report-chevron" /></button>
          <SearchInput placeholder="Поиск событий" value={query} onChange={(event) => setQuery(typeof event === 'string' ? event : event.target.value)} />
        </div>
        <div ref={filtersRef} className="house-events-filters" role="tablist" aria-label="Фильтр событий дома">
          {FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`house-events-filter${filter === item.id ? ' house-events-filter--active' : ''}`} onClick={(event) => selectFilter(item.id, event.currentTarget)}>{item.label}</button>)}
        </div>
        <section className="house-events-list" aria-label="Обращения жителей">
          {events.map((event) => { const photos = event.photos ?? (event.image ? [event.image] : []); return <article key={event.id} className="house-event-card" role="button" tabIndex={0} onClick={(item) => { if (!item.target.closest('.house-event-card__gallery-trigger')) setSelectedEvent(event); }} onKeyDown={(item) => { if (item.key === 'Enter') setSelectedEvent(event); }}><button type="button" className="house-event-card__gallery-trigger" aria-label={`Открыть фотографии: ${event.title}`} onClick={() => setGalleryEvent({ title: event.title, photos })}>{photos.length ? <img src={photos[0]} alt="" /> : <i aria-hidden="true" />}{photos.length > 1 ? <span>+{photos.length - 1}</span> : null}</button><div className="house-event-card__main"><div className="house-event-card__head"><Typography.Title variant="small-strong" className="work-card-title">{event.title}</Typography.Title><Typography.Label>ID {event.id}</Typography.Label></div><div className="house-event-card__statuses"><span>{event.statusLabel}</span></div><Typography.Label className="house-event-card__date">{event.displayDate}</Typography.Label><Typography.Body variant="medium" className="house-event-card__description">{event.description}</Typography.Body></div></article>; })}
        </section>


        {!events.length ? <div className="house-events-empty"><Typography.Body>Событий с таким статусом пока нет.</Typography.Body></div> : null}
      </section>
    </main>
    {galleryEvent ? <EventPhotoGallery title={galleryEvent.title} photos={galleryEvent.photos} onClose={() => setGalleryEvent(null)} /> : null}
  </Panel>;
}

function EventPhotoGallery({ title, photos, onClose }) {
  const [index, setIndex] = useState(0);
  if (!photos.length) return null;
  return <div className="image-modal-backdrop" role="presentation" onClick={onClose}><section className="image-modal event-photo-gallery" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}><button type="button" className="image-modal__close" aria-label="Закрыть изображения" onClick={onClose}><Icon24DismissOverlay width={24} height={24} /></button><img className="image-modal__image" src={photos[index]} alt={`${title}: фото ${index + 1}`} />{photos.length > 1 ? <><button type="button" className="event-photo-gallery__arrow event-photo-gallery__arrow--previous" aria-label="Предыдущее фото" onClick={() => setIndex((value) => (value - 1 + photos.length) % photos.length)}><Icon20ChevronLeftOutline /></button><button type="button" className="event-photo-gallery__arrow event-photo-gallery__arrow--next" aria-label="Следующее фото" onClick={() => setIndex((value) => (value + 1) % photos.length)}><Icon20ChevronRightOutline /></button><span className="event-photo-gallery__counter">{index + 1} / {photos.length}</span></> : null}</section></div>;
}

function EventDetails({ event, onBack }) {
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([]);
  const [editingCommentIndex, setEditingCommentIndex] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [editingCommentAttachments, setEditingCommentAttachments] = useState([]);
  const [reportedEarly, setReportedEarly] = useState(false);
  const [isChecklistDirty, setChecklistDirty] = useState(false);
  const [isChecklistSaved, setChecklistSaved] = useState(false);
  const [isChecklistHistoryOpen, setChecklistHistoryOpen] = useState(false);
  const [checklistComment, setChecklistComment] = useState('');
  const [checklistAttachments, setChecklistAttachments] = useState([]);
  const [isReviewCommentDirty, setReviewCommentDirty] = useState(false);
  const [isReviewCommentSaved, setReviewCommentSaved] = useState(false);
  const [historyOpenIds, setHistoryOpenIds] = useState(null);
  const checklistAttachmentRef = useRef(null);
  const attachmentRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [checklist, setChecklist] = useState([
    { label: 'Осмотр места обращения', done: false },
    { label: 'Проверка причины проблемы', done: false },
    { label: 'Устранение замечаний', done: false },
  ]);
  const executorPreview = event.executor ? (event.executor === 'Иван Петров' ? { name: 'Иван Петров', role: 'Электрик · освещение', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80' } : { name: event.executor, role: 'Исполнитель', photo: null }) : null;
  const eventContext = `${event.place.split(',')[0].toUpperCase()} — ${event.title.toLowerCase().includes('освещ') ? 'ОСВЕЩЕНИЕ' : 'ОБСЛУЖИВАНИЕ'}`;
  const resident = { name: 'Человек Человеков', role: 'Житель', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80' };
  const specialists = {
    'Мария Смирнова': { name: 'Мария Смирнова', role: 'Диспетчер', photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=96&q=80' },
    'Иван Петров': { name: 'Иван Петров', role: 'Мастер', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80' },
  };
  const history = [
    { id: 'status', order: 202609201000, date: `${event.status === 'accepted' ? '13.09.2026' : '20.09.2026'} · 10:00`, title: `Статус: ${event.statusLabel}`, author: specialists['Мария Смирнова'], actorLabel: 'Ответственный' },
    ...(event.executor ? [{ id: 'assigned', order: 202609190930, date: '19.09.2026 · 09:30', title: `Назначен исполнитель: ${event.executor}`, author: event.executor === 'Иван Петров' ? specialists['Иван Петров'] : specialists['Мария Смирнова'], actorLabel: 'Исполнитель' }] : []),
    { id: 'created', order: 202609180900, date: `${event.createdAt} · 09:00`, title: 'Обращение создано', author: resident, actorLabel: 'Автор обращения' },
    ...(isChecklistSaved ? [{ id: 'checklist', order: 202609181018, date: '18.09.2026 · 10:18', title: `Проверка сохранена: выполнено ${checklist.filter((item) => item.done).length} из ${checklist.length}`, author: resident, actorLabel: 'Проверку сохранил', checklist: checklist.map((item) => ({ ...item })) }] : []),
    ...comments.map((item, index) => ({ ...item, id: `comment-${index}`, order: 202609181019 + index, title: 'Добавлен комментарий', comment: item.text })),
    ...(reportedEarly ? [{ id: 'reported', order: 202609181020, date: '18.09.2026 · 10:20', title: 'Сообщено о решении', author: resident }] : []),
  ].sort((a, b) => b.order - a.order);
  const isHistoryEntryOpen = (id) => historyOpenIds === null ? id === history[0]?.id : historyOpenIds.includes(id);
  const toggleHistoryEntry = (id) => setHistoryOpenIds((current) => {
    const opened = current ?? (history[0] ? [history[0].id] : []);
    return opened.includes(id) ? opened.filter((itemId) => itemId !== id) : [...opened, id];
  });
  const sendComment = () => {
    const text = comment.trim();
    if (!text) return;
    setComments((items) => [...items, { date: '18.09.2026 · 10:18', text, attachments, author: { name: 'Человек Человеков', role: 'Житель', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80' } }]);
    setComment('');
    setAttachments([]);
  };
  const startEditingComment = (index) => {
    setEditingCommentIndex(index);
    setEditingCommentText(comments[index].text);
    setEditingCommentAttachments(comments[index].attachments ?? (comments[index].attachment ? [comments[index].attachment] : []));
  };
  const saveEditedComment = () => {
    const text = editingCommentText.trim();
    if (!text || editingCommentIndex === null) return;
    setComments((items) => items.map((item, index) => index === editingCommentIndex ? { ...item, text, attachments: editingCommentAttachments } : item));
    setEditingCommentIndex(null);
    setEditingCommentText('');
    setEditingCommentAttachments([]);
  };
  const sendReviewComment = () => {
    if (!checklistComment.trim() && !checklistAttachments.length) return;
    setComments((items) => [...items, { date: '18.09.2026 · 10:19', text: checklistComment.trim() || 'Фотографии к проверке', attachments: checklistAttachments, author: { name: 'Человек Человеков', role: 'Житель', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80' } }]);
    setChecklistComment('');
    setChecklistAttachments([]);
    setReviewCommentDirty(false);
    setReviewCommentSaved(true);
  };

  return <Panel mode="primary" className="inner-panel house-events-panel event-details-panel">
    <PageHeader title="Работа" onBack={onBack} />
    <main className="panel-content house-events-content">
      <section className="event-details-shell">
        <header className="event-details-head">
          <div>
            <Typography.Label className="event-details-context">{eventContext}</Typography.Label>
            <Typography.Title className="event-details-title">{event.title}</Typography.Title>
            <div className="event-details-meta"><span>Заявлено: <b>{event.createdAt}</b></span>{event.deadline ? <span>Срок: <b>{event.deadline}</b></span> : null}</div>
            {executorPreview ? <div className="event-details-assignee"><Typography.Label>Исполнитель</Typography.Label><span className="event-executor"><Avatar.Container size={28}><Avatar.Image src={executorPreview.photo} alt="" fallback="ИП" /></Avatar.Container><span><b>{executorPreview.name}</b><small>{executorPreview.role}</small></span></span></div> : null}
          </div>
          <StatusBadge tone={event.tone}>{event.statusLabel}</StatusBadge>
        </header>

        <DetailSection title="Чек-лист проверки">
          <ul className="event-checklist">
            {checklist.map((item, index) => <li key={item.label}><button type="button" className={item.done ? 'event-checklist__item--done' : ''} onClick={() => { setChecklist((items) => items.map((value, itemIndex) => itemIndex === index ? { ...value, done: !value.done } : value)); setChecklistDirty(true); setChecklistSaved(false); }}><i aria-hidden="true">{item.done ? '✓' : ''}</i><span>{item.label}</span></button></li>)}
          </ul>
          <div className="event-checklist__actions"><div className="event-checklist__buttons"><Button appearance="themed" mode="primary" disabled={!isChecklistDirty} onClick={() => { setChecklistDirty(false); setChecklistSaved(true); }}>Сохранить результаты</Button><Button appearance="themed" mode="secondary" disabled={reportedEarly || event.status === 'accepted'} onClick={() => setReportedEarly(true)}>{reportedEarly ? 'Сообщение отправлено' : <><span className="event-details__report-full">Сообщить о решении</span><span className="event-details__report-short">Сообщить о решении</span></>}</Button></div></div>
        </DetailSection>

        <DetailSection title="Комментарий">
          <div className="event-review-comment"><textarea value={checklistComment} onChange={(item) => { setChecklistComment(item.target.value); setReviewCommentDirty(true); setReviewCommentSaved(false); }} placeholder="Комментарий к проверке" rows="3" />
          <input ref={checklistAttachmentRef} className="event-comment__file-input" type="file" accept="image/*" multiple onChange={(item) => { const nextFiles = Array.from(item.target.files ?? []).map((file) => ({ name: file.name, url: URL.createObjectURL(file) })); setChecklistAttachments((files) => [...files, ...nextFiles].slice(0, 10)); setReviewCommentDirty(true); setReviewCommentSaved(false); item.target.value = ''; }} />
          {checklistAttachments.length ? <div className="event-checklist__attachments">{checklistAttachments.map((file, index) => <div key={file.url}><img src={file.url} alt={`Фото комментария ${index + 1}`} /><button type="button" aria-label="Удалить фото" onClick={() => { setChecklistAttachments((files) => files.filter((item) => item.url !== file.url)); setReviewCommentDirty(true); setReviewCommentSaved(false); }}><Icon24Dismiss width={16} height={16} /></button></div>)}</div> : null}
          <div className="event-review-comment__actions"><Button appearance="neutral" mode="secondary" iconBefore={<Icon24Attach width={20} height={20} />} disabled={checklistAttachments.length >= 10} onClick={() => checklistAttachmentRef.current?.click()}>Прикрепить фото</Button><Button appearance="themed" mode="primary" disabled={!isReviewCommentDirty} onClick={sendReviewComment}>Добавить комментарий</Button></div></div>
        </DetailSection>

        {event.image ? <DetailSection title="Фотографии"><div className="event-photo-grid"><ImagePreview title={`Фото: ${event.title}`} src={event.image} /></div></DetailSection> : null}

        <DetailSection title="История">
          <ol className="event-history">
            {history.map((item) => <HistoryEntry key={item.id} item={item} isOpen={isHistoryEntryOpen(item.id)} onToggle={() => toggleHistoryEntry(item.id)} />)}
          </ol>
        </DetailSection>

        <section className="event-comment" aria-label="Добавить комментарий">
          <Typography.Label>Комментарий</Typography.Label>
          <textarea value={comment} onChange={(item) => setComment(item.target.value)} placeholder="Напишите комментарий" rows="3" />
          <input ref={attachmentRef} className="event-comment__file-input" type="file" accept="image/*" multiple onChange={(item) => { const nextAttachments = Array.from(item.target.files ?? []).map((file) => ({ name: file.name, url: URL.createObjectURL(file) })); if (editingCommentIndex !== null) setEditingCommentAttachments((value) => [...value, ...nextAttachments].slice(0, 5)); else setAttachments((value) => [...value, ...nextAttachments].slice(0, 5)); item.target.value = ''; }} />
          {attachments.length ? <div className="event-comment__attachments">{attachments.map((file, index) => <div key={file.url} className="event-comment__attachment"><img src={file.url} alt={`Прикреплённая фотография ${index + 1}`} /><button type="button" aria-label="Удалить фотографию" onClick={() => setAttachments((items) => items.filter((item) => item.url !== file.url))}><Icon24Dismiss width={20} height={20} /></button></div>)}</div> : null}
          <div className="event-comment__actions"><Button className="event-comment__attach-button" appearance="neutral" mode="secondary" iconBefore={<Icon24Attach width={20} height={20} />} disabled={attachments.length >= 5} onClick={() => attachmentRef.current?.click()}><span className="event-comment__attach-label">Прикрепить фото</span></Button><Button className="event-comment__submit-button" appearance="themed" mode="primary" disabled={!comment.trim()} onClick={sendComment}>Добавить комментарий</Button></div>
        </section>

        {comments.length ? <DetailSection title="Комментарии"><div className="event-comments">{comments.map((item, index) => <article key={`${item.date}-${index}`}><div className="event-comments__author"><Avatar.Container size={32}><Avatar.Image src={item.author?.photo} alt="" fallback="ЧЧ" /></Avatar.Container><div className="event-comments__author-info"><Typography.Body>{item.author?.name ?? 'Человек Человеков'}</Typography.Body><Typography.Label>{`${item.author?.role ?? 'Житель'} · ${item.date}`}</Typography.Label></div></div>{editingCommentIndex === index ? <><textarea className="event-comments__edit" value={editingCommentText} onChange={(value) => setEditingCommentText(value.target.value)} rows="3" /><div className="event-comments__media">{editingCommentAttachments.map((file, fileIndex) => <div key={file.url} className="event-comments__attachment"><img src={file.url} alt={`Прикреплённая фотография ${fileIndex + 1}`} /><button type="button" aria-label="Удалить фото" onClick={() => setEditingCommentAttachments((items) => items.filter((item) => item.url !== file.url))}><Icon24Dismiss width={16} height={16} /></button></div>)}{editingCommentAttachments.length < 5 ? <button type="button" className="event-comments__add-photo" aria-label="Добавить фото" onClick={() => attachmentRef.current?.click()}><Icon24Attach width={22} height={22} /></button> : null}</div><div className="event-comments__edit-actions"><Button appearance="neutral" mode="secondary" onClick={() => { setEditingCommentIndex(null); setEditingCommentText(''); setEditingCommentAttachments([]); }}>Отмена</Button><Button appearance="themed" mode="primary" disabled={!editingCommentText.trim()} onClick={saveEditedComment}>Сохранить</Button></div></> : <><Typography.Body className="event-comments__text">{item.text}</Typography.Body>{(item.attachments ?? []).length ? <div className="event-comments__photos">{item.attachments.map((file, fileIndex) => <div key={file.url} className="event-comments__photo"><ImagePreview title={`Фото к комментарию ${index + 1}.${fileIndex + 1}`} src={file.url} /></div>)}</div> : null}<button type="button" className="event-comments__delete-button" aria-label="Удалить комментарий" onClick={() => setComments((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Icon24DeleteOutline width={20} height={20} /></button><button type="button" className="event-comments__edit-button" aria-label="Изменить комментарий" onClick={() => startEditingComment(index)}><Icon28WriteOutline width={20} height={20} /></button></>}</article>)}</div></DetailSection> : null}

      </section>
    </main>
  </Panel>;
}

function DetailSection({ title, children }) {
  return <section className="event-detail-section"><Typography.Title className="event-detail-section__title">{title}</Typography.Title>{children}</section>;
}

function HistoryEntry({ item, isOpen, onToggle }) {
  const isComment = Boolean(item.comment && item.author);
  return <li className={`event-history__entry${isOpen ? ' event-history__entry--open' : ''}`}>
    <button type="button" className="event-history__summary" onClick={onToggle}><time>{item.date}</time>{isComment ? <span className="event-history__summary-comment"><Avatar.Container size={28}><Avatar.Image src={item.author.photo} alt="" fallback="АМ" /></Avatar.Container><span><b>{item.author.name}</b><small>оставила комментарий</small></span></span> : <span>{item.title}</span>}<i aria-hidden="true">⌄</i></button>
    {isOpen ? <div className="event-history__details">
      {item.actorLabel ? <div className="event-history__detail-person"><Typography.Label>{item.actorLabel}</Typography.Label><HistoryPerson person={item.author} /></div> : null}
      {item.responsible ? <div className="event-history__detail-person"><Typography.Label>Новый ответственный</Typography.Label><HistoryPerson person={item.responsible} /></div> : null}
      {item.comment ? <Typography.Body className="event-history__comment-text">{item.comment}</Typography.Body> : null}
      {item.checklist ? <ul className="event-history__checklist-list">{item.checklist.map((check) => <li key={check.label} className={check.done ? 'event-history__checklist-done' : ''}><i aria-hidden="true">{check.done ? '✓' : '–'}</i>{check.label}</li>)}</ul> : null}
      {(item.attachments ?? []).length ? <div className="event-history__comment-photos">{item.attachments.map((file) => <ImagePreview key={file.url} title="Фото к изменению" src={file.url} />)}</div> : null}
    </div> : null}
  </li>;
}

function HistoryPerson({ person }) {
  if (!person) return null;
  return <div className="event-history__person"><Avatar.Container size={28}><Avatar.Image src={person.photo} alt="" fallback={person.name.slice(0, 2)} /></Avatar.Container><span><b>{person.name}</b><small>{person.role}</small></span></div>;
}

function AddressDialog({ address, onClose, onSave }) {
  const [draft, setDraft] = useState(address);
  const [isSuggestionsOpen, setSuggestionsOpen] = useState(false);
  const suggestions = ['г. Самара, ул. Ново-Садовая, д. 1', 'г. Самара, Московское шоссе, д. 15', 'г. Самара, ул. Осипенко, д. 3'];

  return <Modal title="Адрес дома" onClose={onClose} actions={<><Button appearance="neutral" mode="secondary" stretched onClick={onClose}>Отмена</Button><Button appearance="themed" mode="primary" stretched disabled={!draft.trim()} onClick={() => onSave(draft.trim())}>Сохранить</Button></>}>
    <label className="address-dialog-field"><span>Адрес</span><span className="address-dialog-combobox"><input value={draft} onChange={(event) => { setDraft(event.target.value); setSuggestionsOpen(true); }} placeholder="Город, улица, дом" autoFocus />{isSuggestionsOpen && draft.trim() ? <span className="address-dialog-suggestions">{suggestions.filter((item) => item.toLowerCase().includes(draft.trim().toLowerCase().slice(0, 8)) || draft.trim().length < 8).map((item) => <button key={item} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setDraft(item); setSuggestionsOpen(false); }}>{item}</button>)}</span> : null}</span></label>
    <div className="address-dialog-map-wrap"><Typography.Label>Или найдите дом на карте</Typography.Label><button type="button" className="address-dialog-map" aria-label="Выбрать адрес на карте" onClick={() => setDraft('г. Самара, ул. Ново-Садовая, д. 1')}><i className="address-dialog-map__pin" /><span>Нажмите на карту, чтобы выбрать дом</span></button></div>
  </Modal>;
}

function toDateValue(value) {
  const [day, month, year] = value.split('.').map(Number);
  return new Date(year, month - 1, day).getTime();
}
