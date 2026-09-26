import { Flex, Spinner, Typography } from '@maxhub/max-ui';

// Перенесённая структура LoadingSpinner из прошлого frontend.
export function LoadingSpinner({ label = 'Загрузка' }) {
  return <Flex align="center" justify="center" gap={10} className="loading-spinner"><Spinner size={20} /><Typography.Body>{label}</Typography.Body></Flex>;
}
