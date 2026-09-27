import { Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/ui/LegacyButton';
import { Modal } from '../components/ui/Modal';
import { councilJson, councilRequest } from './councilApi';

export function CouncilHouseChat({ houseId }) {
  const [chat, setChat] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!houseId) return;
    try {
      const result = await councilRequest(`/api/houses/${houseId}/works?limit=1`);
      setChat(result.house.chat);
      setCanManage(result.actions.manageChat);
      setError('');
    } catch (failure) { setError(failure.message); }
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
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    setError('');
    try { await councilRequest(`/api/houses/${houseId}/chat`, { method: 'DELETE' }); await load(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <section className="home-house-chat">
    {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
    <Typography.Headline className="home-section-title">Чат дома</Typography.Headline>
    {chat?.joinUrl ? <div className="home-house-chat__action"><Button mode="primary" appearance="themed" size="medium" stretched onClick={() => window.open(chat.joinUrl, '_blank', 'noopener,noreferrer')}>Перейти в чат</Button></div> : <Typography.Body>Ссылка на чат пока не добавлена.</Typography.Body>}
    {canManage ? <div className="home-house-chat__action"><Button mode="secondary" appearance="neutral" size="medium" onClick={() => { setDraft(chat?.joinUrl ?? ''); setEditing(true); }}>{chat?.joinUrl ? 'Изменить ссылку' : 'Добавить чат'}</Button>{chat?.joinUrl ? <Button mode="secondary" appearance="neutral" size="medium" disabled={busy} onClick={() => void remove()}>Удалить ссылку</Button> : null}</div> : null}
    {editing ? <Modal title="Ссылка на чат дома" onClose={() => setEditing(false)} actions={<><Button mode="secondary" appearance="neutral" onClick={() => setEditing(false)}>Отмена</Button><Button mode="primary" appearance="themed" disabled={busy || !/^https:\/\/(?:[\w-]+\.)?max\.ru\//i.test(draft.trim())} onClick={() => void save()}>Сохранить</Button></>}><label className="home-chat-setup__field"><Typography.Label>Ссылка-приглашение MAX</Typography.Label><input className="home-access-dialog__input" type="url" value={draft} placeholder="https://max.ru/join/..." onChange={(event) => setDraft(event.target.value)} /></label></Modal> : null}
  </section>;
}
