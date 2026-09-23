import { Panel, Typography } from '@maxhub/max-ui';
import { Icon28BookSpreadOutline } from '@vkontakte/icons';
import { PageHeader } from '../components/layout/PageHeader';
import { ListRow } from '../components/ui/ListRow';
import { Section } from '../components/ui/Section';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatusBadge } from '../components/ui/StatusBadge';
import { historyItems } from '../data/mockData';
import { useState } from 'react';

export function HistoryPage({ onBack }) {
  const [filter, setFilter] = useState('all');
  const visible = filter === 'all' ? historyItems : historyItems.filter((item) => item.tone === filter);
  return <Panel mode="primary" className="inner-panel"><PageHeader title="История" onBack={onBack} />
    <main className="panel-content"><Typography.Body className="page-lead">Завершённые приёмки и их результаты</Typography.Body>
      <SegmentedControl label="Фильтр истории" value={filter} onChange={setFilter} items={[{ id: 'all', label: 'Все' }, { id: 'green', label: 'Принято' }, { id: 'orange', label: 'Замечания' }]} />
      <Section title="Последние операции"><div className="list-card">{visible.map((item) => <ListRow key={item.title} title={item.title} description={item.date} icon={Icon28BookSpreadOutline} tone={item.tone} trailing={<StatusBadge tone={item.tone}>{item.result}</StatusBadge>} />)}</div></Section>
    </main>
  </Panel>;
}
