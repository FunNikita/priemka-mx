import { Typography } from '@maxhub/max-ui';
import { useState } from 'react';
import { Icon20SmileAddOutline, Icon24PenOutline, Icon28MessageArrowRightOutline } from '@vkontakte/icons';
import { Button } from '../components/ui/LegacyButton';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { ConfirmActionModal } from '../components/ui/ConfirmActionModal';
import { councilJson, councilRequest } from './councilApi';
import { hapticError, hapticSuccess } from '../utils/maxFeedback';

export function CouncilHouseChat({ houseId, house }) {
  const [chatOverride, setChatOverride] = useState(null);
  const chat = chatOverride?.houseId === houseId ? chatOverride.chat : house?.chat ?? null;
  const canManage = Boolean(house?.permissions?.manageHouseChat);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  if (!houseId) return null;
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const updatedChat = await councilRequest(`/api/houses/${houseId}/chat`, councilJson('PUT', { joinUrl: draft.trim() }));
      hapticSuccess();
      setChatOverride({ houseId, chat: updatedChat });
      setEditing(false);
    } catch (failure) { hapticError(); setError(failure.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    setError('');
    try { await councilRequest(`/api/houses/${houseId}/chat`, { method: 'DELETE' }); hapticSuccess(); setChatOverride({ houseId, chat: null }); setEditing(false); setConfirmRemoval(false); }
    catch (failure) { hapticError(); setError(failure.message); }
    finally { setBusy(false); }
  };
  const openEditor = () => { setDraft(chat?.joinUrl ?? ''); setEditing(true); };
  return <section className="home-house-chat">
    {error ? <ErrorState message={error} onRetry={() => setError('')} /> : chat?.joinUrl ? <div className="home-house-chat__card"><div className="home-house-chat__header"><button type="button" className="home-house-chat__link" onClick={() => window.open(chat.joinUrl, '_blank', 'noopener,noreferrer')}><span className="house-events-toolbar__report-icon"><Icon28MessageArrowRightOutline /></span><span className="house-events-toolbar__report-copy"><b>{chat.title || 'Домовой чат'}</b><small>Групповой чат жителей в MAX</small></span></button></div><div className="home-house-chat__actions"><Button mode="primary" appearance="themed" size="medium" stretched iconBefore={<Icon20SmileAddOutline />} onClick={() => window.open(chat.joinUrl, '_blank', 'noopener,noreferrer')}>Перейти в чат</Button>{canManage ? <button type="button" className="home-house-chat__edit" aria-label="Редактировать чат" onClick={openEditor}><Icon24PenOutline width={20} height={20} /></button> : null}</div></div> : <div className="house-events-toolbar__report home-house-chat__create"><div className="home-house-chat__create-summary"><span className="house-events-toolbar__report-icon"><Icon28MessageArrowRightOutline /></span><span className="house-events-toolbar__report-copy"><b>У вашего дома ещё нет чата</b><small>Групповой чат жителей в MAX</small></span></div>{canManage ? <Button mode="primary" appearance="themed" size="medium" stretched onClick={openEditor}>Добавить чат</Button> : null}</div>}
    {canManage && editing ? <Modal className="home-access-modal home-chat-setup-modal" title={chat?.joinUrl ? 'Редактировать чат дома' : 'Создать чат дома'} titleVariant="medium" onClose={() => setEditing(false)} actions={<div className="home-chat-setup__actions"><div className="home-chat-setup__actions-row"><Button mode="secondary" appearance="neutral" size="medium" stretched onClick={() => setEditing(false)}>Отмена</Button><Button mode="primary" appearance="themed" size="medium" stretched disabled={busy || !/^https:\/\/(?:[\w-]+\.)?max\.ru\//i.test(draft.trim())} onClick={() => void save()}>Сохранить</Button></div>{chat?.joinUrl ? <Button className="home-chat-setup__delete" mode="secondary" appearance="neutral" disabled={busy} onClick={() => setConfirmRemoval(true)}>Удалить</Button> : null}</div>}><div className="home-chat-setup"><Typography.Body className="home-chat-setup__intro">Инструкцию по созданию чата под своё устройство можно найти <a href="https://help.max.ru/help/chats/sozdanie_i_nastroika_grupp/kak_sozdat_gruppu" target="_blank" rel="noreferrer">здесь</a>.</Typography.Body><label className="home-chat-setup__field"><Typography.Label>Ссылка на чат</Typography.Label><input className="home-access-dialog__input" type="url" inputMode="url" value={draft} placeholder="https://max.ru/join/..." onChange={(event) => setDraft(event.target.value)} /></label></div></Modal> : null}
    {confirmRemoval ? <ConfirmActionModal title="Удалить чат дома?" message={`Удалить ссылку на чат дома «${house?.address ?? 'выбранного дома'}»?`} busy={busy} onCancel={() => setConfirmRemoval(false)} onConfirm={() => void remove()} /> : null}
  </section>;
}
