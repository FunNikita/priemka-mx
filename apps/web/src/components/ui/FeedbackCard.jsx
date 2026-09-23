import { Avatar, Typography } from '@maxhub/max-ui';

import { StatusBadge } from './StatusBadge';

// Паттерн карточки обратной связи из src/pages/CafeteriaFeedbackPage.tsx прошлого проекта.
export function FeedbackCard({ photoUrl, name = 'Имя пользователя', meta = 'Второстепенная информация', message = 'Текст карточки с поддержкой нескольких строк и длинных слов.', status = 'Статус' }) {
  return <article className="feedback-card">
    <div className="feedback-card__header">
      <div className="feedback-card__person">
        <Avatar.Container size={40} className="feedback-card__avatar"><Avatar.Image src={photoUrl} alt={name} fallback="ИП" /></Avatar.Container>
        <div className="feedback-card__identity"><Typography.Body className="feedback-card__name">{name}</Typography.Body><Typography.Label className="feedback-card__meta">{meta}</Typography.Label></div>
      </div>
      <StatusBadge tone="blue">{status}</StatusBadge>
    </div>
    <Typography.Body className="feedback-card__message">{message}</Typography.Body>
  </article>;
}
