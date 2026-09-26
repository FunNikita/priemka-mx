import { Typography } from '@maxhub/max-ui';

export function OperationStatusCards() {
  return <div className="operation-statuses"><div className="operation-status operation-status--success"><b>✓</b><Typography.Body>Готово</Typography.Body></div><div className="operation-status operation-status--progress"><b>◌</b><Typography.Body>В процессе</Typography.Body></div><div className="operation-status operation-status--error"><b>×</b><Typography.Body>Не отправлено</Typography.Body></div></div>;
}
