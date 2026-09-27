import { Panel, Typography } from '@maxhub/max-ui';
import { useMemo, useRef, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchInput } from '../components/ui/SearchInput';
import { CouncilWorkPage } from './CouncilWorkPage';
import { useCouncilTasks } from './useCouncilTasks';
import './WorksPage.css';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'assigned', label: 'Назначены' },
  { id: 'repeat', label: 'Повторные' },
  { id: 'completed', label: 'Завершены' },
];

export function InspectionsPage({ houseId }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedInspection, setSelectedInspection] = useState(null);
  const filtersRef = useRef(null);
  const { tasks, loading, error, reload } = useCouncilTasks(houseId);
  const inspections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks.filter((inspection) => (filter === 'all' || (filter === 'repeat' ? inspection.kind === 'reinspection' && inspection.status !== 'COMPLETED' : filter === 'completed' ? inspection.status === 'COMPLETED' : inspection.kind === 'assignment' && inspection.status !== 'COMPLETED')) && (!normalizedQuery || inspection.work.title.toLowerCase().includes(normalizedQuery)));
  }, [filter, query, tasks]);

  if (selectedInspection) return <CouncilWorkPage inspection={{ ...selectedInspection, apiKind: true }} onUpdated={reload} onBack={() => { setSelectedInspection(null); void reload(); }} />;

  return <Panel mode="primary" className="inner-panel house-events-panel inspections-panel">
    <PageHeader title="Проверки" />
    <main className="panel-content house-events-content">
      <section className="house-events-layout">
        <SearchInput placeholder="Поиск" value={query} onChange={(event) => setQuery(typeof event === 'string' ? event : event.target.value)} />
        <div ref={filtersRef} className="house-events-filters inspections-filters" role="tablist" aria-label="Фильтр проверок">
          {FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`house-events-filter${filter === item.id ? ' house-events-filter--active' : ''}`} onClick={(event) => { setFilter(item.id); event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }}>{item.label}</button>)}
        </div>
        <div className="house-events-list">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : inspections.length ? inspections.map((inspection) => <InspectionCard key={`${inspection.kind}-${inspection.id}`} inspection={inspection} onOpen={() => setSelectedInspection(inspection)} />) : <EmptyState message="Проверки не найдены." />}</div>
      </section>
    </main>
  </Panel>;
}

function InspectionCard({ inspection, onOpen }) {
  const label = inspection.status === 'COMPLETED' ? 'Завершена' : inspection.kind === 'reinspection' ? 'Повторная' : inspection.status === 'IN_PROGRESS' ? 'В процессе' : 'Назначена';
  const tone = inspection.status === 'COMPLETED' ? 'completed' : inspection.kind === 'reinspection' ? 'repeat' : 'assigned';
  return <article className="house-event-card house-event-card--without-image" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}>
    <div className="house-event-card__main">
      <div className="house-event-card__head"><Typography.Title variant="small-strong" className="work-card-title">{inspection.work.title}</Typography.Title><Typography.Label>ID {inspection.work.id}</Typography.Label></div>
      <div className="house-event-card__statuses"><span className={`inspection-status--${tone}`}>{label}</span>{inspection.status !== 'COMPLETED' ? <span className="inspection-status--checking">Вы проверяете</span> : null}</div>
    </div>
  </article>;
}
