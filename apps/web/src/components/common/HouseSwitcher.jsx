import { useEffect, useState } from 'react';
import { Avatar, CellAction, Flex, Typography } from '@maxhub/max-ui';
import { Icon20AddCircleOutline, Icon20ChevronRight, Icon24DeleteOutline, Icon28BuildingOutline } from '@vkontakte/icons';
import { Modal } from '../ui/Modal';
import { ConfirmActionModal } from '../ui/ConfirmActionModal';
import { Button } from '../ui/LegacyButton';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { LoadingSpinner } from './LoadingSpinner';
import { jsonRequest, queryPath, request } from '../../pages/residentApi';
import { groupHouses } from './houseGroups';
import { hapticError, hapticSuccess } from '../../utils/maxFeedback';

export function HouseSwitcher({ houseId, houses = [], onHouseChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [mutating, setMutating] = useState(false);
  const [selectedHouseId, setSelectedHouseId] = useState(houseId);
  const [selecting, setSelecting] = useState(false);
  const [pendingCancelHouse, setPendingCancelHouse] = useState(null);
  const current = houses.find((house) => house.id === houseId);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = window.setTimeout(() => {
      request(queryPath('/api/houses', { q: query.trim(), page, limit: 20 }))
        .then((value) => { if (active) { setResult(value); setError(''); } })
        .catch((failure) => { if (active) setError(failure.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, query, page, revision]);
  const mutate = async (house, method) => {
    if (mutating) return;
    setMutating(true); setError('');
    try {
      await request(`/api/houses/${house.id}/join-requests${method === 'DELETE' ? '/me' : ''}`, method === 'POST' ? jsonRequest('POST', {}) : { method: 'DELETE' });
      hapticSuccess();
      setLoading(true); setRevision((value) => value + 1);
    } catch (failure) { hapticError(); setError(failure.message); if (failure.status === 409) { setLoading(true); setRevision((value) => value + 1); } }
    finally { setMutating(false); }
  };
  const close = () => { setOpen(false); setQuery(''); setPage(1); };
  const finishSelection = async () => {
    if (selecting) return;
    if (selectedHouseId === houseId) { close(); return; }
    setSelecting(true); setError('');
    try { await onHouseChange(selectedHouseId); hapticSuccess(); close(); }
    catch (failure) { hapticError(); setError(failure.message); }
    finally { setSelecting(false); }
  };
  return <>
    <CellAction before={<Avatar.Container size={40}><Avatar.Icon><Icon28BuildingOutline className="home-location-building-icon" /></Avatar.Icon></Avatar.Container>} className="home-location-action" height="normal" mode="custom" style={{ '--MaxUi-CellAction_color': 'var(--text-secondary)' }} onClick={() => { setSelectedHouseId(houseId); setLoading(true); setOpen(true); }}>
      <Flex align="center" gap={5} className="home-location-address-group"><Typography.Body>{current?.address ?? 'Выберите дом'}</Typography.Body><Icon20ChevronRight className="home-location-chevron" /></Flex>
    </CellAction>
    {open ? <Modal className="home-access-modal house-picker-modal" title="Доступ к работам дома" onClose={close} actions={<Button mode="secondary" appearance="neutral" stretched disabled={selecting} onClick={() => void finishSelection()}>{selecting ? 'Сохраняем…' : 'Готово'}</Button>}><div className="home-access-dialog">
      <input className="home-access-dialog__input" value={query} placeholder="Город, улица, дом" maxLength={200} onChange={(event) => { setLoading(true); setQuery(event.target.value); setPage(1); }} />
      {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRevision((value) => value + 1); }} /> : result.items.length ? <div className="house-picker-cards">{groupHouses(result.items).map(([title, items]) => <section key={title} className="house-picker-group"><Typography.Title variant="small-strong">{title}</Typography.Title>{items.map((house) => <HouseCard key={house.id} house={house} selected={house.id === selectedHouseId} mutating={mutating || selecting} onSelect={() => setSelectedHouseId(house.id)} onRequest={() => void mutate(house, 'POST')} onCancel={() => setPendingCancelHouse(house)} />)}</section>)}{result.total > 20 ? <div className="house-picker-pagination"><Button size="small" disabled={page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }}>Назад</Button><Typography.Label>{page}</Typography.Label><Button size="small" disabled={page * 20 >= result.total} onClick={() => { setLoading(true); setPage((value) => value + 1); }}>Далее</Button></div> : null}</div> : <EmptyState message="Дома не найдены" detail="Попробуйте изменить запрос" />}
    </div></Modal> : null}
    {pendingCancelHouse ? <ConfirmActionModal title="Отменить заявку?" message={`Отменить заявку на доступ к дому «${pendingCancelHouse.address}»?`} busy={mutating} onCancel={() => setPendingCancelHouse(null)} onConfirm={() => { const house = pendingCancelHouse; setPendingCancelHouse(null); void mutate(house, 'DELETE'); }} /> : null}
  </>;
}

function HouseCard({ house, selected, mutating, onSelect, onRequest, onCancel }) {
  const status = house.access.status === 'PENDING' ? 'Заявка отправлена' : house.access.status === 'REJECTED' ? 'Заявка отклонена' : house.access.status === 'ACTIVE' ? 'Доступ открыт' : 'Нет доступа';
  const content = <span className="house-picker-card__copy"><Typography.Body>{house.address}</Typography.Body>{status === 'Нет доступа' ? null : <Typography.Label>{status}</Typography.Label>}</span>;

  if (house.actions.open && !selected) return <button type="button" className="house-picker-card house-picker-card--selectable" disabled={mutating} aria-label={`Выбрать дом ${house.address}`} onClick={onSelect}>{content}</button>;

  return <div className={`house-picker-card${selected ? ' house-picker-card--selected' : ''}${status === 'Нет доступа' ? ' house-picker-card--single-line' : ''}`}>
    {content}
    {selected ? <span className="house-picker-card__selected">Выбран</span> : house.actions.requestAccess ? <button type="button" className="house-picker-card__action house-picker-card__action--add" disabled={mutating} aria-label={`Запросить доступ к дому ${house.address}`} onClick={onRequest}><Icon20AddCircleOutline width={22} height={22} /></button> : house.actions.cancelRequest ? <button type="button" className="house-picker-card__action house-picker-card__action--cancel" disabled={mutating} aria-label={`Отменить заявку на дом ${house.address}`} onClick={onCancel}><Icon24DeleteOutline width={22} height={22} /></button> : null}
  </div>;
}
