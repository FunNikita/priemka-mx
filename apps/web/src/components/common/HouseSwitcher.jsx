import { useEffect, useState } from 'react';
import { Avatar, CellAction, Flex, Typography } from '@maxhub/max-ui';
import { Icon20AddCircleOutline, Icon20ChevronRight, Icon24DeleteOutline, Icon28BuildingOutline } from '@vkontakte/icons';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/LegacyButton';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { LoadingSpinner } from './LoadingSpinner';
import { jsonRequest, queryPath, request } from '../../pages/residentApi';
import { groupHouses } from './houseGroups';

export function HouseSwitcher({ houseId, houses = [], onHouseChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
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
    try {
      await request(`/api/houses/${house.id}/join-requests${method === 'DELETE' ? '/me' : ''}`, method === 'POST' ? jsonRequest('POST', {}) : { method: 'DELETE' });
      setLoading(true); setRevision((value) => value + 1);
    } catch (failure) { setError(failure.message); }
  };
  const select = async (house) => {
    try { await onHouseChange(house.id); setOpen(false); setQuery(''); setPage(1); }
    catch (failure) { setError(failure.message); }
  };
  return <>
    <CellAction before={<Avatar.Container size={40}><Avatar.Icon><Icon28BuildingOutline /></Avatar.Icon></Avatar.Container>} className="home-location-action" height="normal" mode="custom" style={{ '--MaxUi-CellAction_color': 'var(--text-secondary)' }} onClick={() => { setLoading(true); setOpen(true); }}>
      <Flex align="center" gap={5} className="home-location-address-group"><Typography.Body>{current?.address ?? 'Выберите дом'}</Typography.Body><Icon20ChevronRight className="home-location-chevron" /></Flex>
    </CellAction>
    {open ? <Modal className="home-access-modal" title="Доступ к работам дома" onClose={() => { setOpen(false); setQuery(''); setPage(1); }}><div className="home-access-dialog">
      <input className="home-access-dialog__input" value={query} placeholder="Город, улица, дом" maxLength={200} onChange={(event) => { setLoading(true); setQuery(event.target.value); setPage(1); }} />
      {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRevision((value) => value + 1); }} /> : result.items.length ? <div className="home-access-dialog__suggestions">{groupHouses(result.items).map(([title, items]) => <section key={title} className="house-picker-group"><Typography.Title variant="small-strong">{title}</Typography.Title>{items.map((house) => <div key={house.id} className="home-access-request"><div><Typography.Body>{house.address}</Typography.Body><Typography.Label>{house.access.status === 'PENDING' ? 'Заявка отправлена' : house.access.status === 'REJECTED' ? 'Заявка отклонена' : house.access.status === 'ACTIVE' ? 'Доступ открыт' : 'Нет доступа'}</Typography.Label></div>{house.actions.open ? <Button size="small" onClick={() => void select(house)}>Открыть</Button> : house.actions.requestAccess ? <button type="button" className="house-picker-action" aria-label={`Запросить доступ к дому ${house.address}`} onClick={() => void mutate(house, 'POST')}><Icon20AddCircleOutline /></button> : house.actions.cancelRequest ? <button type="button" className="house-picker-action" aria-label={`Отменить заявку на дом ${house.address}`} onClick={() => void mutate(house, 'DELETE')}><Icon24DeleteOutline width={20} height={20} /></button> : null}</div>)}</section>)}{result.total > 20 ? <div className="house-picker-pagination"><Button size="small" disabled={page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }}>Назад</Button><Typography.Label>{page}</Typography.Label><Button size="small" disabled={page * 20 >= result.total} onClick={() => { setLoading(true); setPage((value) => value + 1); }}>Далее</Button></div> : null}</div> : <EmptyState message="Дома не найдены" detail="Попробуйте изменить запрос" />}
    </div></Modal> : null}
  </>;
}
