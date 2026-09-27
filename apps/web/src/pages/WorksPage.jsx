import { Panel, Typography } from '@maxhub/max-ui';
import { Icon24AddCircle } from '@vkontakte/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { PhotoGallery, PhotoStrip } from '../components/common/PhotoStrip';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/LegacyButton';
import { SearchInput } from '../components/ui/SearchInput';
import { ResidentWorkDetails } from './ResidentWorkDetails';
import { allPages, formatDate, workStatuses } from './residentApi';
import { createChairmanWork, loadWorkForm } from './chairmanApi';
import './WorksPage.css';

const FILTERS = [{ id: 'all', label: 'Все' }, { id: 'NEW', label: 'Новая' }, { id: 'IN_REVIEW', label: 'Рассматривается' }, { id: 'IN_PROGRESS', label: 'В работе' }, { id: 'WAITING', label: 'Ожидает' }, { id: 'ACCEPTED', label: 'Принята' }];
const TYPES = [{ id: 'all', label: 'Все' }, { id: 'observation', label: 'Наблюдения' }, { id: 'work', label: 'Работы' }];

export function WorksPage({ onBack, onOpenReport, houseId, houses = [], onHouseChange, canCreateObservation, canViewObservations }) {
  const [filter, setFilter] = useState('all');
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [eventsData, setEventsData] = useState([]);
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [createForm, setCreateForm] = useState(null);
  const [draft, setDraft] = useState({ executorUserId: '', title: '', description: '', category: '' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(houseId));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const reload = useCallback(async (signal) => {
    if (!houseId) { setEventsData([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [works, observations] = await Promise.all([
        allPages(`/api/houses/${houseId}/works`, {}, { signal }),
        canViewObservations ? allPages(`/api/houses/${houseId}/observations`, {}, { signal }) : Promise.resolve({ items: [] }),
      ]);
      if (!signal?.aborted) setEventsData([...works.items.map((item) => ({ ...item, kind: 'work', when: item.date })), ...observations.items.map((item) => ({ ...item, kind: 'observation', when: item.createdAt }))]);
    } catch (failure) { if (!signal?.aborted) setError(failure.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [houseId, canViewObservations]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => { if (!controller.signal.aborted) return reload(controller.signal); }); return () => controller.abort(); }, [reload, revision]);
  const events = useMemo(() => eventsData.filter((item) => (filter === 'all' || item.status === filter) && (type === 'all' || item.kind === type) && (!query.trim() || `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => new Date(b.when) - new Date(a.when)), [eventsData, filter, type, query]);
  const openCreate = async () => {
    setBusy(true); setError('');
    try { setCreateForm(await loadWorkForm(houseId)); setDraft({ executorUserId: '', title: selectedObservation.title, description: selectedObservation.description, category: selectedObservation.category }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true); setError('');
    try {
      const work = await createChairmanWork(houseId, { executorUserId: Number(draft.executorUserId), title: draft.title.trim(), description: draft.description.trim(), category: draft.category, sourceObservationId: selectedObservation.id });
      setCreateForm(null); setSelectedObservation(null); setSelectedWorkId(work.id); setRevision((value) => value + 1);
    } catch (failure) { setError(failure.message); if (failure.status === 409) setRevision((value) => value + 1); }
    finally { setBusy(false); }
  };
  if (selectedWorkId) return <ResidentWorkDetails workId={selectedWorkId} onBack={() => { setSelectedWorkId(null); setRevision((value) => value + 1); }} />;
  if (selectedObservation) return <Panel mode="primary" className="inner-panel house-events-panel"><PageHeader title="Наблюдение" onBack={() => setSelectedObservation(null)} /><main className="panel-content house-events-content"><section className="active-work-details__card"><Typography.Title variant="small-strong">{selectedObservation.title}</Typography.Title><Typography.Label>ID {selectedObservation.id} · {formatDate(selectedObservation.createdAt)}</Typography.Label><Typography.Body>{workStatuses[selectedObservation.status]}</Typography.Body><Typography.Body>{selectedObservation.description}</Typography.Body><PhotoStrip photos={selectedObservation.media} title={selectedObservation.title} onOpen={(index) => setGallery({ title: selectedObservation.title, photos: selectedObservation.media, index })} />{selectedObservation.linkedWork ? <Button onClick={() => { setSelectedObservation(null); setSelectedWorkId(selectedObservation.linkedWork.id); }}>Создана работа №{selectedObservation.linkedWork.id}</Button> : selectedObservation.actions?.createWork ? <Button disabled={busy} onClick={() => void openCreate()}>Создать работу</Button> : null}{error ? <ErrorState message={error} onRetry={() => void openCreate()} /> : null}</section></main>{createForm ? <Modal className="home-access-modal" title="Создать работу по наблюдению" onClose={() => setCreateForm(null)} actions={<><Button mode="secondary" onClick={() => setCreateForm(null)}>Отмена</Button><Button disabled={busy || !draft.executorUserId || !draft.title.trim() || !draft.description.trim() || !draft.category} onClick={() => void create()}>Создать</Button></>}><div className="chairman-form"><label>Название<input maxLength={255} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></label><label>Описание<textarea maxLength={10000} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} /></label><label>Категория<input value={draft.category} onChange={(event) => setDraft((value) => ({ ...value, category: event.target.value }))} /></label><label>Исполнитель<select value={draft.executorUserId} onChange={(event) => setDraft((value) => ({ ...value, executorUserId: event.target.value }))}><option value="">Выберите исполнителя</option>{createForm.executors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></Modal> : null}{gallery ? <PhotoGallery key={`${gallery.title}-${gallery.index}`} {...gallery} initialIndex={gallery.index} onClose={() => setGallery(null)} /> : null}</Panel>;
  return <Panel mode="primary" className="inner-panel house-events-panel"><PageHeader title="События дома" onBack={onBack} /><main className="panel-content house-events-content"><section className="house-events-layout">
    <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
    {!houseId ? <EmptyState message="Сначала выберите дом" detail="После выбора дома здесь появятся его события." /> : <>
      <div className="house-events-toolbar">{canCreateObservation ? <button type="button" className="house-events-toolbar__report" onClick={onOpenReport}><span className="house-events-toolbar__report-icon"><Icon24AddCircle /></span><span className="house-events-toolbar__report-copy"><b>Сообщить о проблеме</b><small>Новое наблюдение жителя</small></span></button> : null}<SearchInput placeholder="Поиск событий" value={query} onChange={(event) => setQuery(typeof event === 'string' ? event : event.target.value)} /></div>
      <div className="house-events-filters" role="tablist" aria-label="Тип события">{TYPES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={type === item.id} className={`house-events-filter${type === item.id ? ' house-events-filter--active' : ''}`} onClick={() => setType(item.id)}>{item.label}</button>)}</div>
      <div className="house-events-filters" role="tablist" aria-label="Статус события">{FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`house-events-filter${filter === item.id ? ' house-events-filter--active' : ''}`} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
      {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRevision((value) => value + 1); }} /> : events.length ? <section className="house-events-list" aria-label="События дома">{events.map((event) => <article key={`${event.kind}-${event.id}`} className={`house-event-card house-event-card--${event.kind}`} role="button" tabIndex={0} onClick={(item) => { if (!item.target.closest('.photo-strip-wrap')) { if (event.kind === 'work') setSelectedWorkId(event.id); else setSelectedObservation(event); } }} onKeyDown={(item) => { if (item.key === 'Enter') { if (event.kind === 'work') setSelectedWorkId(event.id); else setSelectedObservation(event); } }}><div className="house-event-card__main"><Typography.Label className="house-event-card__type">{event.kind === 'work' ? 'Работа' : 'Наблюдение жителя'}</Typography.Label><div className="house-event-card__head"><Typography.Title variant="small-strong" className="work-card-title">{event.title}</Typography.Title><Typography.Label>ID {event.id}</Typography.Label></div><div className="house-event-card__statuses"><span>{workStatuses[event.status]}</span></div><Typography.Label className="house-event-card__date">{formatDate(event.when)}</Typography.Label><Typography.Body variant="medium" className="house-event-card__description">{event.description}</Typography.Body>{event.kind === 'observation' && event.linkedWork ? <Typography.Label>Создана работа №{event.linkedWork.id}</Typography.Label> : null}</div><PhotoStrip photos={event.media} title={event.title} onOpen={(index) => setGallery({ title: event.title, photos: event.media, index })} /></article>)}</section> : <EmptyState message="Событий не найдено." />}
    </>}
  </section></main>{gallery ? <PhotoGallery key={`${gallery.title}-${gallery.index}`} {...gallery} initialIndex={gallery.index} onClose={() => setGallery(null)} /> : null}</Panel>;
}
