import { Typography } from '@maxhub/max-ui';

export function StatCard({ value, label, tone = 'blue' }) {
  return <article className={`stat-card stat-card--${tone}`}>
    <Typography.Headline variant="large-strong" className="stat-card__value">{value}</Typography.Headline>
    <Typography.Label className="stat-card__label">{label}</Typography.Label>
  </article>;
}
