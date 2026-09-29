import { Panel, Typography } from '@maxhub/max-ui';
import { useMemo, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { PhotoGallery } from '../components/common/PhotoStrip';
import { photoPreviewUrl } from '../components/common/photoPreviewUrl';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchInput } from '../components/ui/SearchInput';
import { CouncilWorkPage } from './CouncilWorkPage';
import { formatDate, previewText } from './residentApi';
import { useCouncilTasks } from './useCouncilTasks';
import './WorksPage.css';

export function InspectionsPage({ houseId, embedded = false, assignedOnly = false, hideSearch = false, onOpenInspection, showTitle = false, title = 'Проверки' }) {
  const [filter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedInspection, setSelectedInspection] = useState(null);
  const { tasks, loading, error, reload } = useCouncilTasks(houseId);
  const inspections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks.filter((inspection) => (!assignedOnly || (inspection.kind === 'assignment' && inspection.status !== 'COMPLETED')) && (filter === 'all' || (filter === 'repeat' ? inspection.kind === 'reinspection' && inspection.status !== 'COMPLETED' : filter === 'completed' ? inspection.status === 'COMPLETED' : inspection.kind === 'assignment' && inspection.status !== 'COMPLETED')) && (!normalizedQuery || (inspection.observation ?? inspection.work).title.toLowerCase().includes(normalizedQuery)));
  }, [assignedOnly, filter, query, tasks]);
  const hasInspections = assignedOnly ? inspections.length > 0 : tasks.length > 0;

  if (assignedOnly && !loading && !error && !hasInspections) return null;
  if (selectedInspection && !onOpenInspection) return <CouncilWorkPage inspection={{ ...selectedInspection, apiKind: true }} onUpdated={reload} onBack={() => { setSelectedInspection(null); void reload(); }} />;

  const content = <main className="panel-content house-events-content">
      <section className="house-events-layout">
        {loading ? <div className="house-events-list"><LoadingSpinner /></div> : error ? <div className="house-events-list"><ErrorState message={error} onRetry={() => void reload()} /></div> : hasInspections ? <>{hideSearch ? null : <SearchInput placeholder="Поиск" value={query} onChange={(event) => setQuery(typeof event === 'string' ? event : event.target.value)} />}
          <div className="house-events-list">{inspections.length ? inspections.map((inspection) => <InspectionCard key={`${inspection.kind}-${inspection.id}`} inspection={inspection} onOpen={() => (onOpenInspection ? onOpenInspection(inspection) : setSelectedInspection(inspection))} />) : <EmptyState message="По выбранному фильтру проверок нет." />}</div>
        </> : <EmptyState message="Проверки ещё не назначены. Здесь появятся работы, которые нужно будет проверить." />}
      </section>
    </main>;
  return embedded ? <div className="inspections-embedded-content">{showTitle ? <Typography.Headline className="home-section-title">{title}</Typography.Headline> : null}{content}</div> : <Panel mode="primary" className="inner-panel house-events-panel inspections-panel"><PageHeader title="Проверки" />{content}</Panel>;
}

function InspectionCard({ inspection, onOpen }) {
  const [galleryIndex, setGalleryIndex] = useState(null);
  const work = inspection.observation ?? inspection.work;
  const label = inspection.status === 'COMPLETED' ? 'Завершена' : inspection.kind === 'reinspection' ? 'Повторная' : 'Назначена';
  const tone = inspection.status === 'COMPLETED' ? 'completed' : inspection.kind === 'reinspection' ? 'repeat' : 'assigned';
  const photos = work.media?.length ? work.media : work.sourceObservation?.media ?? [];
  return <article className={`house-event-card${photos.length ? '' : ' house-event-card--without-image'}`} role="button" tabIndex={0} onClick={(event) => { if (!event.target.closest('.house-event-card__gallery-trigger')) onOpen(); }} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}>
    <div className="house-event-card__main">
      <div className="house-event-card__head"><Typography.Title variant="small-strong" className="work-card-title">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div>
      <div className="house-event-card__statuses"><span className={`inspection-status--${tone}`}>{label}</span>{inspection.status !== 'COMPLETED' ? <span className="inspection-status--checking">Вы проверяете</span> : null}</div>
      {photos.length ? <button type="button" className="house-event-card__gallery-trigger" aria-label={`Открыть фотографии: ${work.title}`} onClick={(event) => { event.stopPropagation(); setGalleryIndex(0); }}>{photos.map((photo, index) => <img key={photo.id ?? index} src={photoPreviewUrl(photo)} alt="" />)}{photos.length > 1 ? <span>+{photos.length - 1}</span> : null}</button> : null}
      <Typography.Label className="house-event-card__date">{formatDate(work.createdAt ?? work.date)}</Typography.Label>
      <Typography.Body variant="medium" className="house-event-card__description">{previewText(work.description)}</Typography.Body>
    </div>
    {galleryIndex !== null ? <PhotoGallery photos={photos} title={work.title} initialIndex={galleryIndex} onClose={() => setGalleryIndex(null)} /> : null}
  </article>;
}
