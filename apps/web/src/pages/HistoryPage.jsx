import { Panel, Typography } from '@maxhub/max-ui';
import { Icon28BookSpreadOutline } from '@vkontakte/icons';
import { PageHeader } from '../components/layout/PageHeader';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { ListRow } from '../components/ui/ListRow';
import { Section } from '../components/ui/Section';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useEffect, useState } from 'react';
import { allPages, formatDate, workStatuses } from './residentApi';

export function HistoryPage({ onBack, houseId }) {
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(houseId));
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!houseId) return;
    let active = true;
    Promise.resolve().then(() => { if (active) { setLoading(true); setError(''); setItems([]); } return Promise.all(['active', 'history'].map((tab) => allPages(`/api/houses/${houseId}/observations`, { tab }))); }).then((data) => { if (active) setItems(data.flatMap((page) => page.items)); }).catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [houseId, revision]);
  const visible = items.filter((item) => filter === 'all' || (filter === 'green' ? item.status === 'ACCEPTED' : item.status === 'WAITING'));
  return <Panel mode="primary" className="inner-panel"><PageHeader title="История" onBack={onBack} />
    <main className="panel-content"><Typography.Body className="page-lead">Реальные работы дома и их текущие статусы</Typography.Body>
      <SegmentedControl label="Фильтр истории" value={filter} onChange={setFilter} items={[{ id: 'all', label: 'Все' }, { id: 'green', label: 'Принято' }, { id: 'orange', label: 'Замечания' }]} />
      <Section title="Работы дома"><div className="list-card">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRevision((value) => value + 1); }} /> : !houseId ? <EmptyState message="Выберите дом, чтобы увидеть историю." /> : visible.length ? visible.map((item) => <ListRow key={item.id} title={item.title} description={formatDate(item.createdAt)} icon={Icon28BookSpreadOutline} tone={item.status === 'ACCEPTED' ? 'green' : 'orange'} trailing={<StatusBadge tone={item.status === 'ACCEPTED' ? 'green' : 'orange'}>{workStatuses[item.status]}</StatusBadge>} />) : <EmptyState message="Работ с таким статусом пока нет." />}</div></Section>
    </main>
  </Panel>;
}
