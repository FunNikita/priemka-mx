import { useCallback, useEffect, useState } from 'react';
import { Panel, Typography } from '@maxhub/max-ui';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/LegacyButton';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { PhotoGallery } from '../components/common/PhotoStrip';
import { photoPreviewUrl } from '../components/common/photoPreviewUrl';
import { allPages, formatDate, previewText, request, workStatuses } from './residentApi';
import { ObservationDetail } from './ObservationDetail';
import { CouncilHouseChat } from './CouncilHouseChat';

export function ResidentHome({ onOpen, houseId, onHouseChange, houses, userId }) {
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [watchingId, setWatchingId] = useState(null);
  const [watchError, setWatchError] = useState(null);
  const [selectedObservationId, setSelectedObservationId] = useState(null);
  const [photoGallery, setPhotoGallery] = useState(null);
  const membership = houses?.find((item) => item.id === houseId);
  const canViewObservations = Boolean(membership?.permissions?.viewObservations);

  const reload = useCallback(async (signal) => {
    if (!houseId) { setWorks([]); return; }
    setLoading(true); setError('');
    try {
      const observations = canViewObservations ? await allPages(`/api/houses/${houseId}/observations`, { tab: 'active' }, { signal }) : { items: [] };
      if (!signal?.aborted) setWorks(observations.items.map((item) => ({ ...item, kind: 'observation', date: item.createdAt })));
    } catch (failure) { if (!signal?.aborted) setError(failure.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [houseId, canViewObservations]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => reload(controller.signal)); return () => controller.abort(); }, [reload]);

  const watchEvent = async (observationId) => {
    if (watchingId !== null) return;
    const key = `observation-${observationId}`;
    setWatchingId(key); setWatchError(null);
    try {
      await request(`/api/observations/${observationId}/watch`, { method: 'POST' });
      await reload();
    } catch (failure) {
      setWatchError({ key, message: failure.message });
      if (failure.status === 409) await reload();
    } finally { setWatchingId(null); }
  };

  if (selectedObservationId) return <ObservationDetail observationId={selectedObservationId} onBack={() => { setSelectedObservationId(null); void reload(); }} />;

  return <Panel mode="primary" className="home-panel">
    <PageHeader title="Главная" />
    <main className="panel-content"><div className="home-sections">
      <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
      {!houseId ? <EmptyState message="Сначала выберите дом" /> : <>{membership?.permissions?.viewHouseChat ? <CouncilHouseChat houseId={houseId} house={houses?.find((item) => item.id === houseId)} /> : null}<section className="home-active-works"><Typography.Headline className="home-section-title">Активные события</Typography.Headline><div className="home-active-works__list">
        {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : works.length ? works.map((work) => <article key={`${work.kind}-${work.id}`} className="home-active-work" onClick={(event) => { if (!event.target.closest('button, .image-modal-backdrop')) { setSelectedObservationId(work.id); } }}><div className="home-active-work__head"><Typography.Title variant="small-strong" className="work-card-title">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div><div className="home-active-work__statuses"><span>{workStatuses[work.status]}</span>{work.isWatching && work.author?.id !== userId ? <span className="home-active-work__status--observed">Вы наблюдаете</span> : null}</div>{work.media.length ? <div className="home-active-work__photos">{work.media.map((photo, index) => <button key={photo.id} type="button" className="media-preview__button" aria-label={`Открыть фото ${index + 1}`} onClick={(event) => { event.stopPropagation(); setPhotoGallery({ photos: work.media, title: work.title, index }); }}><img className="media-preview__image" src={photoPreviewUrl(photo)} alt={`${work.title}: фото ${index + 1}`} /></button>)}</div> : null}<Typography.Label className="home-active-work__date">{formatDate(work.date)}</Typography.Label><Typography.Body variant="medium" className="home-active-work__description">{previewText(work.description)}</Typography.Body>{work.isWatching === false ? <Button className="home-active-work__observe" mode="secondary" appearance="neutral" size="medium" stretched disabled={watchingId !== null} onClick={(event) => { event.stopPropagation(); void watchEvent(work.id); }}>Стать наблюдателем</Button> : null}{watchError?.key === `${work.kind}-${work.id}` ? <Typography.Body role="alert">{watchError.message}</Typography.Body> : null}</article>) : <EmptyState message="Событий пока нет." />}
        {photoGallery ? <PhotoGallery photos={photoGallery.photos} title={photoGallery.title} initialIndex={photoGallery.index} onClose={() => setPhotoGallery(null)} /> : null}
      </div></section></>}
      {houseId && membership?.permissions?.createObservation ? <Button mode="secondary" appearance="themed" size="medium" stretched onClick={() => onOpen('report-problem')}>Сообщить о проблеме</Button> : null}
    </div></main>
  </Panel>;
}
