import { Typography } from '@maxhub/max-ui';
import { Button } from './LegacyButton';

export function ErrorState({ message = 'Не удалось загрузить данные.', onRetry }) {
  return <div className="panel-state panel-state--error" role="alert"><Typography.Body className="panel-state__text">{message}</Typography.Body><div className="panel-state__actions"><Button size="small" mode="secondary" appearance="neutral" onClick={onRetry}>Повторить</Button></div></div>;
}
