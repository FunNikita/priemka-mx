import { Button, Typography } from '@maxhub/max-ui';

// Паттерн ошибки загрузки из App.tsx прошлого frontend.
export function ErrorState({ message = 'Не удалось загрузить данные. Попробуйте снова чуть позже.', onRetry }) {
  return <div className="error-state"><Typography.Body>{message}</Typography.Body><Button size="small" mode="secondary" appearance="neutral" onClick={onRetry}>Повторить</Button></div>;
}
