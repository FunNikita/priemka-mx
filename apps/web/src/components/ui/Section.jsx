import { Typography } from '@maxhub/max-ui';
import { useState } from 'react';

const PARAMS = {
  PageHeader: 'title — текст в центре; onBack — обработчик возврата; rightContent — действие справа.',
  Typography: 'variant задаёт размер и насыщенность: large-strong, small-strong, body или label; children — текст.',
  ServiceCard: 'title и subtitle — тексты; icon — компонент иконки; color — цвет акцента; badge — счётчик; onClick — переход.',
  StatCard: 'value — главное число; label — подпись; tone — blue, green или orange.',
  StatusBadge: 'tone принимает blue, orange, green, red или purple; children — текст статуса.',
  Container: 'fullWidth растягивает контейнер; Flex управляет align и justify; Grid принимает cols, gapX и gapY; Counter — value.',
  SegmentedControl: 'items — { id, label }; value — активный id; onChange(id) — выбранный сегмент; label — доступное имя.',
  ListRow: 'title и description — тексты; icon и tone задают пиктограмму; trailing или meta — правая часть.',
  RequestCard: 'title, status, createdAt и destination описывают заявку; status определяет бейдж.',
  EmptyState: 'title и description — текст пустого состояния; actionLabel и onAction показывают действие.',
  ErrorState: 'message — текст ошибки; onRetry — повторная попытка; retryLabel — подпись кнопки.',
  IdeaVoteButtons: 'value — текущая оценка; onVote(value) получает выбор; disabled блокирует кнопки.',
  DishImagePreview: 'src — URL изображения; placeholder — буква заглушки; title — описание для доступности.',
  FeedbackCard: 'photoUrl — фото; author, date и message — данные отзыва; rating — оценка.',
  UserIdentityCard: 'photoUrl — аватар; name, role и facts — данные пользователя; action — правая кнопка.',
  SearchInput: 'value и onChange управляют поиском; placeholder — подсказка. Input и CharacterTextarea используют те же value/onChange.',
  Button: 'mode — primary, secondary или link; appearance — themed, neutral или negative; stretched растягивает кнопку; disabled блокирует.',
  AppSelect: 'value — выбранный ключ; options — варианты { value, label }; placeholder — текст до выбора; onChange(value) — новое значение.',
  CharacterTextarea: 'value — текст; maxLength — лимит символов; placeholder — подсказка; onChange(value) — изменение текста.',
  CafeteriaCalendar: 'minDate и maxDate ограничивают доступные даты; onSelect(value) возвращает выбранную дату; onClose закрывает окно.',
  Modal: 'title — заголовок; onClose — закрытие по кнопке или фону; actions — нижняя зона действий; children — содержимое.',
  SortableDishList: 'items — карточки блюд; порядок меняется перетаскиванием; stopList — состояние переключателя; onEdit и onDelete — действия.',
  OperationStatusCards: 'status определяет цвет и пиктограмму: success, progress или error; title — подпись состояния.',
  AttachmentButton: 'accept задаёт типы файлов; onChange(file) получает файл; disabled блокирует добавление.',
  ChoicePicker: 'items — доступные позиции; selectedIds — выбранные ключи; multiple включает множественный выбор; onChange — новый выбор.',
  OperationResult: 'status задаёт смысл и цвет результата; title и message — тексты; primaryAction и secondaryAction — кнопки.',
  LoadingSpinner: 'size задаёт размер; appearance — цвет индикатора; label — доступное описание загрузки.',
  ThemePreview: 'scheme принимает system, light или dark. Смена здесь применяется сразу ко всем примерам ниже.',
};

export function Section({ title, component, action, sandbox, children, className = '' }) {
  const name = component?.split(' · ')[0];
  const params = PARAMS[name];
  const [scale, setScale] = useState(100);
  const [isDimmed, setDimmed] = useState(false);
  const baseSandbox = component ? <div className="sandbox-grid"><label>Масштаб <input type="range" min="85" max="115" value={scale} onChange={(event) => setScale(event.target.value)} /></label><label>Приглушить <input type="checkbox" checked={isDimmed} onChange={(event) => setDimmed(event.target.checked)} /></label></div> : null;
  return (
    <section className={`section ${className}`}>
      {(title || action) ? <div className="section__head">
        {title ? <div className="section__title-wrap"><Typography.Headline variant="small-strong" className="section__title">{component ? `${component} — ${title}` : title}</Typography.Headline></div> : <span />}
        {action}
      </div> : null}
      {component ? <details className="section__params"><summary>Параметры</summary><p><code>{component}</code>{params ? ` — ${params}` : ' — переиспользуемый компонент. Доступные действия и состояния можно проверить в примере ниже.'}</p></details> : null}
      {component ? <details className="section__sandbox"><summary>Песочница</summary><div className="section__sandbox-content">{sandbox}{sandbox ? <div className="section__sandbox-divider" /> : null}{baseSandbox}</div></details> : null}
      <div className="section__preview" style={{ '--section-scale': scale / 100, '--section-opacity': isDimmed ? .48 : 1 }}>{children}</div>
    </section>
  );
}
