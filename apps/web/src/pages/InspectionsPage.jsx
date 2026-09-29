import { Panel, Typography } from '@maxhub/max-ui';
import { useMemo, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchInput } from '../components/ui/SearchInput';
import { CouncilWorkPage } from './CouncilWorkPage';
import { formatDate, previewText, workStatuses } from './residentApi';
import { useCouncilTasks } from './useCouncilTasks';
import './WorksPage.css';

export function InspectionsPage({ houseId, embedded = false, assignedOnly = false, hideSearch = false, onOpenInspection, showTitle = false, showHistory = false, title = 'Проверки' }) {
  const [filter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedInspection, setSelectedInspection] = useState(null);
  const { tasks, loading, error, reload } = useCouncilTasks(houseId);
  const inspections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks.filter((inspection) => (!assignedOnly || (['assignment', 'reinspection'].includes(inspection.kind) && inspection.status !== 'COMPLETED')) && (filter === 'all' || (filter === 'repeat' ? inspection.kind === 'reinspection' && inspection.status !== 'COMPLETED' : filter === 'completed' ? inspection.status === 'COMPLETED' : inspection.kind === 'assignment' && inspection.status !== 'COMPLETED')) && (!normalizedQuery || (inspection.observation ?? inspection.work).title.toLowerCase().includes(normalizedQuery)));
  }, [assignedOnly, filter, query, tasks]);
  const history = useMemo(() => {
    const byWork = new Map();
    for (const inspection of tasks.filter((task) => task.status === 'COMPLETED')) {
      const workId = inspection.work.id;
      const current = byWork.get(workId);
      if (current) current.count += 1;
      else byWork.set(workId, { ...inspection, count: 1 });
      const grouped = byWork.get(workId);
      const isNewerRepeat = inspection.kind === 'reinspection' && (grouped.kind !== 'reinspection' || inspection.id > grouped.id);
      if (isNewerRepeat) byWork.set(workId, { ...inspection, count: grouped.count });
    }
    return [...byWork.values()];
  }, [tasks]);
  const hasInspections = assignedOnly ? inspections.length > 0 : tasks.length > 0;

  if (selectedInspection && !onOpenInspection) return <CouncilWorkPage inspection={{ ...selectedInspection, apiKind: true }} onUpdated={reload} onBack={() => { setSelectedInspection(null); void reload(); }} />;

  const content = <main className="panel-content house-events-content">
      <section className="house-events-layout">
        {showTitle && (!assignedOnly || loading || Boolean(error) || inspections.length > 0) ? <Typography.Headline className="home-section-title">{title}</Typography.Headline> : null}
        {loading ? <div className="house-events-list"><LoadingSpinner /></div> : error ? <div className="house-events-list"><ErrorState message={error} onRetry={() => void reload()} /></div> : <>
          {assignedOnly ? <>
            {inspections.length ? <div className="house-events-list">{inspections.map((inspection) => <InspectionCard key={`${inspection.kind}-${inspection.id}`} inspection={inspection} onOpen={() => (onOpenInspection ? onOpenInspection(inspection) : setSelectedInspection(inspection))} />)}</div> : null}
            {showHistory ? <section className="council-inspection-history"><Typography.Headline className="home-section-title">Все проверки</Typography.Headline>{history.length ? <div className="house-events-list">{history.map((inspection) => <InspectionCard key={`history-${inspection.work.id}`} inspection={inspection} count={inspection.count} onOpen={() => (onOpenInspection ? onOpenInspection(inspection) : setSelectedInspection(inspection))} />)}</div> : <EmptyState message="Завершённых проверок пока нет." />}</section> : null}
          </> : hasInspections ? <>{hideSearch ? null : <SearchInput placeholder="Поиск" value={query} onChange={(event) => setQuery(typeof event === 'string' ? event : event.target.value)} />}<div className="house-events-list">{inspections.length ? inspections.map((inspection) => <InspectionCard key={`${inspection.kind}-${inspection.id}`} inspection={inspection} onOpen={() => (onOpenInspection ? onOpenInspection(inspection) : setSelectedInspection(inspection))} />) : <EmptyState message="По выбранному фильтру проверок нет." />}</div></> : <EmptyState message="Проверки ещё не назначены. Здесь появятся работы, которые нужно будет проверить." />}
        </>}
      </section>
    </main>;
  return embedded ? <div className="inspections-embedded-content">{content}</div> : <Panel mode="primary" className="inner-panel house-events-panel inspections-panel"><PageHeader title="Проверки" />{content}</Panel>;
}

function InspectionCard({ inspection, onOpen }) {
  const work = inspection.observation ?? inspection.work;
  const status = workStatuses[work.status] ?? work.status;
  const photos = work.media?.length ? work.media : work.sourceObservation?.media ?? [];
  return <article className={`house-event-card${photos.length ? '' : ' house-event-card--without-image'}`} role="button" tabIndex={0} onClick={(event) => { if (!event.target.closest('.media-preview__button, .image-modal-backdrop')) onOpen(); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}>
    <div className="house-event-card__main">
      <div className="house-event-card__head"><Typography.Title variant="small-strong" className="work-card-title">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div>
      <div className="house-event-card__statuses"><span>{status}</span>{inspection.status !== 'COMPLETED' ? <span className="inspection-status--checking">Вы проверяете</span> : null}</div>
      {photos.length ? <PhotoGroup photos={photos} title={work.title} className={`house-event-card__photos${photos.length > 2 ? ' house-event-card__photos--scrollable' : ''}`} /> : null}
      <Typography.Label className="house-event-card__date">{formatDate(work.createdAt ?? work.date)}</Typography.Label>
      <Typography.Body variant="medium" className="house-event-card__description">{previewText(work.description)}</Typography.Body>
    </div>
  </article>;
}
