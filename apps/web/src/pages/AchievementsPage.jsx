import { Panel, Typography } from '@maxhub/max-ui';
import { Icon28MessageArrowRightOutline } from '@vkontakte/icons';
import { PageHeader } from '../components/layout/PageHeader';
import { Section } from '../components/ui/Section';
import { StatCard } from '../components/ui/StatCard';

const achievements = [{ title: 'Точный старт', text: 'Проведите первую приёмку без замечаний', progress: 100, state: 'Получено' }, { title: 'Неделя в ритме', text: 'Завершите 5 работ за 7 дней', progress: 60, state: '3 из 5' }, { title: 'Эксперт по документам', text: 'Проверьте 20 комплектов документов', progress: 35, state: '7 из 20' }];

export function AchievementsPage({ onBack }) {
  return <Panel mode="primary" className="inner-panel"><PageHeader title="Достижения" onBack={onBack} />
    <main className="panel-content"><div className="achievement-hero"><Icon28MessageArrowRightOutline width={32} height={32} /><div><Typography.Headline variant="large-strong">Уровень 4</Typography.Headline><Typography.Label>До следующего уровня: 120 баллов</Typography.Label></div></div>
      <div className="stats-grid"><StatCard value="380" label="баллов" tone="purple" /><StatCard value="6" label="значков" tone="green" /></div>
      <Section title="Ваш путь"><div className="achievement-list">{achievements.map((item) => <article className="achievement-card" key={item.title}><span className="achievement-card__icon"><Icon28MessageArrowRightOutline width={24} height={24} /></span><div className="achievement-card__copy"><Typography.Body>{item.title}</Typography.Body><Typography.Label>{item.text}</Typography.Label><div className="progress"><i style={{ width: `${item.progress}%` }} /></div></div><span className="achievement-card__state">{item.state}</span></article>)}</div></Section>
    </main>
  </Panel>;
}
