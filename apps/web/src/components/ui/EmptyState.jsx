import { Typography } from '@maxhub/max-ui';
import { Button } from './LegacyButton';

export function EmptyState({ message = 'Данных пока нет.', detail, actionLabel, onAction }) {
  return <div className="panel-state panel-state--empty"><Typography.Body className="panel-state__text">{message}</Typography.Body>{detail ? <Typography.Label>{detail}</Typography.Label> : null}{actionLabel ? <Button size="small" mode="secondary" appearance="neutral" onClick={onAction}>{actionLabel}</Button> : null}</div>;
}
