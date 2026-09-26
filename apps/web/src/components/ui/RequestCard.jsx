import { Typography } from '@maxhub/max-ui';
import { Icon24DoneOutline } from '@vkontakte/icons';

import { StatusBadge } from './StatusBadge';

// Карточка заявки на справку из CertificatesPanel.
export function RequestCard({ title = 'Справка об обучении', created = 'сегодня в 21:46', destination = 'По месту требования', status = 'Готова' }) {
  return <article className="request-card"><div className="request-card__head"><Typography.Body className="request-card__title">{title}</Typography.Body><StatusBadge tone="green"><Icon24DoneOutline width={16} height={16} /> {status}</StatusBadge></div><Typography.Label><b>Создана:</b> {created}</Typography.Label><Typography.Label><b>Куда:</b> {destination}</Typography.Label></article>;
}
