import { Typography } from '@maxhub/max-ui';
import { Button } from './LegacyButton';
import { Icon24Dismiss } from '@vkontakte/icons';

export function Modal({ title, titleVariant = 'medium-strong', children, onClose, actions, className = '' }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}>
    <section className={`modal ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <div className="modal__head">
        <Typography.Headline variant={titleVariant}>{title}</Typography.Headline>
        <button type="button" className="modal__close" aria-label="Закрыть" onClick={onClose}><Icon24Dismiss width={24} height={24} /></button>
      </div>
      <div className="modal__body">{children}</div>
      {actions ? <div className="modal__actions">{actions}</div> : <div className="modal__actions"><Button mode="secondary" appearance="neutral" stretched onClick={onClose}>Готово</Button></div>}
    </section>
  </div>;
}
