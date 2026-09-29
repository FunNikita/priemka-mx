import { Typography } from '@maxhub/max-ui';
import { Modal } from './Modal';
import { Button } from './LegacyButton';

export function ConfirmActionModal({ title, message, busy = false, onCancel, onConfirm }) {
  return <Modal title={title} onClose={onCancel} actions={<><Button mode="secondary" disabled={busy} onClick={onCancel}>Отмена</Button><Button disabled={busy} onClick={onConfirm}>Подтвердить</Button></>}><Typography.Body>{message}</Typography.Body></Modal>;
}
