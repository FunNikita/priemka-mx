import { Panel, Typography } from '@maxhub/max-ui';
import { useMemo, useRef, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { SearchInput } from '../components/ui/SearchInput';
import { CouncilWorkPage } from './CouncilWorkPage';
import './WorksPage.css';

const WORK_PHOTO = 'https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'assigned', label: 'Назначены' },
  { id: 'repeat', label: 'Повторные' },
  { id: 'completed', label: 'Завершены' },
];

const INSPECTIONS = [
  { id: 1221312, title: 'Освещение у входа', place: 'Подъезд 2, 1 этаж', inspectionType: 'assigned', status: 'waiting-review', statusLabel: 'Назначена', statusTone: 'assigned', tone: 'blue', createdAt: '18.09.2026', displayDate: 'Сегодня до 18:00', deadline: '24.09.2026', description: 'Исполнитель сообщил о завершении работ. Нужно пройти чек-лист.', executor: 'Иван Петров', image: WORK_PHOTO, photos: [WORK_PHOTO, WORK_PHOTO] },
  { id: 1221313, title: 'Доводчик входной двери', place: 'Подъезд 1', inspectionType: 'repeat', status: 'waiting-review', statusLabel: 'Повторная', statusTone: 'repeat', tone: 'orange', createdAt: '16.09.2026', displayDate: 'Завтра до 12:00', deadline: '25.09.2026', description: 'Исполнитель устранил замечание и добавил фотографии «после».', executor: 'Иван Петров', image: WORK_PHOTO, photos: [WORK_PHOTO, WORK_PHOTO] },
  { id: 1221308, title: 'Ремонт перил у подъезда', place: 'Подъезд 3', inspectionType: 'completed', status: 'accepted', statusLabel: 'Завершена', statusTone: 'completed', tone: 'green', createdAt: '12.09.2026', displayDate: '20 сентября 14:30', deadline: '20.09.2026', description: 'Перила закреплены, замечаний по результатам проверки нет.', executor: 'ООО «Домсервис»', image: WORK_PHOTO, photos: [WORK_PHOTO, WORK_PHOTO] },
];

export function InspectionsPage() {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedInspection, setSelectedInspection] = useState(null);
  const filtersRef = useRef(null);
  const inspections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return INSPECTIONS.filter((inspection) => (filter === 'all' || inspection.inspectionType === filter) && (!normalizedQuery || `${inspection.title} ${inspection.place} ${inspection.executor}`.toLowerCase().includes(normalizedQuery)));
  }, [filter, query]);

  if (selectedInspection) return <CouncilWorkPage inspection={selectedInspection} onBack={() => setSelectedInspection(null)} />;

  return <Panel mode="primary" className="inner-panel house-events-panel inspections-panel">
    <PageHeader title="Проверки" />
    <main className="panel-content house-events-content">
      <section className="house-events-layout">
        <SearchInput placeholder="Поиск" value={query} onChange={(event) => setQuery(typeof event === 'string' ? event : event.target.value)} />
        <div ref={filtersRef} className="house-events-filters inspections-filters" role="tablist" aria-label="Фильтр проверок">
          {FILTERS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`house-events-filter${filter === item.id ? ' house-events-filter--active' : ''}`} onClick={(event) => { setFilter(item.id); event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }}>{item.label}</button>)}
        </div>
        <div className="house-events-list">{inspections.length ? inspections.map((inspection) => <InspectionCard key={inspection.id} inspection={inspection} onOpen={() => setSelectedInspection(inspection)} />) : <div className="house-events-empty"><Typography.Body>Проверки не найдены.</Typography.Body></div>}</div>
      </section>
    </main>
  </Panel>;
}

function InspectionCard({ inspection, onOpen }) {
  return <article className="house-event-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}>
    <button type="button" className="house-event-card__gallery-trigger" aria-label={`Открыть фотографии: ${inspection.title}`} onClick={(event) => { event.stopPropagation(); onOpen(); }}><img src={inspection.photos[0]} alt="" />{inspection.photos.length > 1 ? <span>+{inspection.photos.length - 1}</span> : null}</button>
    <div className="house-event-card__main">
      <div className="house-event-card__head"><Typography.Title variant="small-strong" className="work-card-title">{inspection.title}</Typography.Title><Typography.Label>ID {inspection.id}</Typography.Label></div>
      <div className="house-event-card__statuses"><span className={`inspection-status--${inspection.statusTone}`}>{inspection.statusLabel}</span>{inspection.inspectionType !== 'completed' ? <span className="inspection-status--checking">Вы проверяете</span> : null}</div>
      <Typography.Label className="house-event-card__date">{inspection.displayDate}</Typography.Label>
      <Typography.Body variant="medium" className="house-event-card__description">{inspection.description}</Typography.Body>
    </div>
  </article>;
}
