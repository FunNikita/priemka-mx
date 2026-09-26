import { Typography } from '@maxhub/max-ui';

export function ServiceCard({ title, subtitle, icon: Icon, color, onClick, wide = false, badge, disabled = false }) {
  return (
    <button type="button" className={`service-card${wide ? ' service-card--wide' : ''}`} onClick={onClick} disabled={disabled}>
      {Icon ? <span className="service-card__icon" style={{ '--service-color': color }}>
        <Icon aria-hidden="true" width={28} height={28} />
      </span> : null}
      <span className="service-card__copy">
        <Typography.Body className="service-card__title">{title}</Typography.Body>
        {subtitle ? <Typography.Label className="service-card__subtitle">{subtitle}</Typography.Label> : null}
      </span>
      {badge ? <span className="service-card__badge">{badge}</span> : null}
    </button>
  );
}
