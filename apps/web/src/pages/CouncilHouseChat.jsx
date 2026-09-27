import { Avatar, CellList, CellSimple, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useState } from 'react';
import { Icon20SmileAddOutline, Icon28MessageArrowRightOutline } from '@vkontakte/icons';
import { Button } from '../components/ui/LegacyButton';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { councilJson, councilRequest } from './councilApi';

export function CouncilHouseChat({ houseId }) {
  const [chat, setChat] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(houseId));
  const load = useCallback(async () => {
    if (!houseId) return;
    setLoading(true);
    try {
      const result = await councilRequest(`/api/houses/${houseId}/works?limit=1`);
      setChat(result.house.chat);
      setCanManage(result.actions.manageChat);
      setError('');
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [houseId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  if (!houseId) return null;
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await councilRequest(`/api/houses/${houseId}/chat`, councilJson('PUT', { joinUrl: draft.trim() }));
      setEditing(false);
      await load();
    } catch (failure) { setError(failure.message); if (failure.status === 409) await load(); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    setError('');
    try { await councilRequest(`/api/houses/${houseId}/chat`, { method: 'DELETE' }); await load(); }
    catch (failure) { setError(failure.message); if (failure.status === 409) await load(); }
    finally { setBusy(false); }
  };
  return <section className="home-house-chat">
    {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : chat?.joinUrl ? <CellList className="home-house-chat__list" header={<Typography.Headline className="home-section-title">У вашего дома есть чат</Typography.Headline>} mode="island"><CellSimple before={<Avatar.Container size={40}><Avatar.Icon><Icon28MessageArrowRightOutline /></Avatar.Icon></Avatar.Container>} title={chat.title || 'Домовой чат'} /><div className="home-house-chat__action"><Button mode="primary" appearance="themed" size="medium" stretched iconBefore={<Icon20SmileAddOutline />} onClick={() => window.open(chat.joinUrl, '_blank', 'noopener,noreferrer')}>Перейти в чат</Button>{canManage ? <div className="home-house-chat__manage"><Button mode="secondary" appearance="neutral" onClick={() => { setDraft(chat.joinUrl); setEditing(true); }}>Изменить ссылку</Button><Button mode="secondary" appearance="neutral" disabled={busy} onClick={() => void remove()}>Удалить ссылку</Button></div> : null}</div></CellList> : <div className="house-events-toolbar__report home-house-chat__create"><div className="home-house-chat__create-summary"><span className="house-events-toolbar__report-icon"><Icon28MessageArrowRightOutline /></span><span className="house-events-toolbar__report-copy"><b>У вашего дома ещё нет чата</b><small>Групповой чат жителей в MAX</small></span></div>{canManage ? <Button mode="primary" appearance="themed" size="medium" stretched onClick={() => { setDraft(''); setEditing(true); }}>Добавить чат</Button> : null}</div>}
    {canManage && editing ? <Modal className="home-access-modal home-chat-setup-modal" title="Создать чат дома" titleVariant="medium" onClose={() => setEditing(false)} actions={<><Button mode="secondary" appearance="neutral" size="medium" stretched onClick={() => setEditing(false)}>Отмена</Button><Button mode="primary" appearance="themed" size="medium" stretched disabled={busy || !/^https:\/\/(?:[\w-]+\.)?max\.ru\//i.test(draft.trim())} onClick={() => void save()}>Сохранить</Button></>}><div className="home-chat-setup"><Typography.Body className="home-chat-setup__intro">Сначала создайте групповой чат в MAX, затем скопируйте ссылку-приглашение.</Typography.Body><ol className="home-chat-setup__steps"><li>В MAX нажмите кнопку создания и выберите «Создать групповой чат».</li><li>Добавьте название и фотографию дома, затем создайте чат.</li><li>Откройте название чата и выберите «Ссылка на чат».</li><li>Скопируйте ссылку и вставьте её ниже.</li></ol><label className="home-chat-setup__field"><Typography.Label>Ссылка на чат</Typography.Label><input className="home-access-dialog__input" type="url" inputMode="url" value={draft} placeholder="https://max.ru/join/..." onChange={(event) => setDraft(event.target.value)} /></label></div></Modal> : null}
  </section>;
}
