import { Panel, Typography } from '@maxhub/max-ui';
import { Icon24MessageOutline } from '@vkontakte/icons';
import { PageHeader } from '../components/layout/PageHeader';
import { ListRow } from '../components/ui/ListRow';
import { Section } from '../components/ui/Section';
import { notificationItems } from '../data/mockData';

export function NotificationsPage({ onBack }) {
  return <Panel mode="primary" className="inner-panel"><PageHeader title="Оповещения" onBack={onBack} />
    <main className="panel-content"><Typography.Body className="page-lead">Важные изменения по вашим работам</Typography.Body>
      <Section title="Новые"><div className="list-card">{notificationItems.map((item) => <ListRow key={item.title} title={item.title} description={item.text} meta={item.time} icon={Icon24MessageOutline} tone={item.tone} />)}</div></Section>
    </main>
  </Panel>;
}
