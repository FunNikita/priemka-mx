import { Button, Typography } from '@maxhub/max-ui';

// Паттерн пустого состояния гостевых пропусков и других списков MaXline.
export function EmptyState({ message = 'Пока нет ни одного гостевого пропуска.', actionLabel, onAction }) {
  return <div className="empty-state"><Typography.Body>{message}</Typography.Body>{actionLabel ? <Button size="small" mode="secondary" appearance="neutral" onClick={onAction}>{actionLabel}</Button> : null}</div>;
}
