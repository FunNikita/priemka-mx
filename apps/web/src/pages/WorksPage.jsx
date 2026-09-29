import { Panel, Typography } from '@maxhub/max-ui';
import { Icon24AddCircle } from '@vkontakte/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { PhotoGallery } from '../components/common/PhotoStrip';
import { photoPreviewUrl } from '../components/common/photoPreviewUrl';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SearchInput } from '../components/ui/SearchInput';
import { ResidentWorkDetails } from './ResidentWorkDetails';
import { ObservationDetail } from './ObservationDetail';
import { allPages, formatDate, previewText, workStatuses } from './residentApi';
import './WorksPage.css';

const FILTERS = [{ id: 'all', label: 'Все' }, { id: 'NEW', label: 'Новая' }, { id: 'IN_REVIEW', label: 'Рассматривается' }, { id: 'IN_PROGRESS', label: 'В работе' }, { id: 'WAITING', label: 'Ожидает' }, { id: 'ACCEPTED', label: 'Принята' }];

export function WorksPage({ onBack, onOpenReport, houseId, houses = [], onHouseChange, canCreateObservation, userId }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [eventsData, setEventsData] = useState([]);
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [loading, setLoading] = useState(Boolean(houseId));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim().slice(0, 200)), 300); return () => clearTimeout(timer); }, [query]);
  const reload = useCallback(async (signal) => {
    if (!houseId) { setEventsData([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [activeObservations, historyObservations] = await Promise.all([
        allPages(`/api/houses/${houseId}/observations`, { tab: 'active', search }, { signal }),
        allPages(`/api/houses/${houseId}/observations`, { tab: 'history', search }, { signal }),
      ]);
      if (!signal?.aborted) setEventsData(activeObservations.items.concat(historyObservations.items).map((item) => ({ ...item, kind: 'observation', when: item.createdAt })));
    } catch (failure) { if (!signal?.aborted) setError(failure.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [houseId, search]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => { if (!controller.signal.aborted) return reload(controller.signal); }); return () => controller.abort(); }, [reload, revision]);
  const events = useMemo(() => eventsData.filter((item) => (filter === 'all' || item.status === filter) && (item.kind !== 'work' || !search || `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => new Date(b.when) - new Date(a.when)), [eventsData, filter, search]);
  if (selectedWorkId) return <ResidentWorkDetails workId={selectedWorkId} onBack={() => { setSelectedWorkId(null); setRevision((value) => value + 1); }} />;
  if (selectedObservation) return <ObservationDetail observationId={selectedObservation.id} onBack={() => { setSelectedObservation(null); setRevision((value) => value + 1); }} onOpenWork={(id) => { setSelectedObservation(null); setSelectedWorkId(id); }} />;
  return <Panel mode="primary" className="inner-panel house-events-panel"><PageHeader title="События" onBack={onBack} /><main className="panel-content house-events-content"><section className="house-events-layout">
    <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
    {!houseId ? <EmptyState message="Сначала выберите дом" detail="После выбора дома здесь появятся его события." /> : <>
      <div className="house-events-toolbar">{canCreateObservation ? <button type="button" className="house-events-toolbar__report" onClick={onOpenReport}><span className="house-events-toolbar__report-icon"><Icon24AddCircle /></span><span className="house-events-toolbar__report-copy"><b>Сообщить о проблеме</b><small>Новое наблюдение жителя</small></span></button> : null}<SearchInput placeholder="Поиск событий" value={query} onChange={(event) => setQuery(typeof event === 'string' ? event : event.target.value)} /></div>
      <div className="house-events-filters" role="tablist" aria-label="Статус события">{FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`house-events-filter${filter === item.id ? ' house-events-filter--active' : ''}`} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
      {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRevision((value) => value + 1); }} /> : events.length ? <section className="house-events-list" aria-label="События дома">{events.map((event) => <article key={`${event.kind}-${event.id}`} className={`house-event-card house-event-card--${event.kind}${event.media.length ? '' : ' house-event-card--without-image'}`} role="button" tabIndex={0} onClick={(item) => { if (!item.target.closest('.house-event-card__gallery-trigger')) { if (event.kind === 'work') setSelectedWorkId(event.id); else setSelectedObservation(event); } }} onKeyDown={(item) => { if (item.target === item.currentTarget && (item.key === 'Enter' || item.key === ' ')) { item.preventDefault(); if (event.kind === 'work') setSelectedWorkId(event.id); else setSelectedObservation(event); } }}>{event.media.length ? <button type="button" className="house-event-card__gallery-trigger" aria-label={`Открыть фотографии: ${event.title}`} onClick={(item) => { item.stopPropagation(); setGallery({ title: event.title, photos: event.media, index: 0 }); }}><img src={photoPreviewUrl(event.media[0])} alt="" />{event.media.length > 1 ? <span>+{event.media.length - 1}</span> : null}</button> : null}<div className="house-event-card__main"><div className="house-event-card__head"><Typography.Title variant="small-strong" className="work-card-title">{event.title}</Typography.Title><Typography.Label>ID {event.id}</Typography.Label></div><div className="house-event-card__statuses"><span>{workStatuses[event.status]}</span>{(event.isWatching && (event.kind !== "observation" || event.author?.id !== userId)) ? <span className="house-event-card__status--observed">Вы наблюдаете</span> : null}</div><Typography.Label className="house-event-card__date">{formatDate(event.when)}</Typography.Label><Typography.Body variant="medium" className="house-event-card__description">{previewText(event.description)}</Typography.Body></div></article>)}</section> : <EmptyState message="Событий не найдено." />}
    </>}
  </section></main>{gallery ? <PhotoGallery key={`${gallery.title}-${gallery.index}`} {...gallery} initialIndex={gallery.index} onClose={() => setGallery(null)} /> : null}</Panel>;
}
