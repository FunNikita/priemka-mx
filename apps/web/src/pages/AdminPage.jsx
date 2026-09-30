import { Avatar, CellHeader, Input, Panel, Typography } from '@maxhub/max-ui';
import { Button, IconButton } from '../components/ui/LegacyButton';
import { Icon16CopyOutline, Icon16Done, Icon20Cancel, Icon24ChevronDown, Icon24ChevronUpSmall, Icon24Filter, Icon24PenOutline } from '@vkontakte/icons';
import { useCallback, useEffect, useState } from 'react';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchInput } from '../components/ui/SearchInput';
import { allPages, queryPath, request } from './residentApi';
import { saveAdminMembership } from './adminApi';
import { PreviewAccessPage } from './PreviewAccessPage';
import { Modal } from '../components/ui/Modal';
import { hapticError, hapticSuccess } from '../utils/maxFeedback';

const ROLES = [
  { value: 'RESIDENT', label: 'Житель', tone: 'resident' },
  { value: 'COUNCIL_MEMBER', label: 'Член совета', tone: 'council' },
  { value: 'CHAIRMAN', label: 'Председатель', tone: 'chairman' },
  { value: 'EXECUTOR', label: 'Исполнитель', tone: 'resident' },
];
const STATUSES = [{ value: 'PENDING', label: 'Ожидает' }, { value: 'ACTIVE', label: 'Активен' }, { value: 'REJECTED', label: 'Отклонён' }];
const ALL_ROLES = { value: 'all', label: 'Все роли' };
const roleByValue = (value) => ROLES.find((item) => item.value === value) ?? ALL_ROLES;
const fullName = (user) => [user.firstName, user.lastName].filter(Boolean).join(' ') || `Пользователь ${user.maxUserId}`;
const userInitial = (user) => fullName(user).split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'П';

export function AdminPage({ onMembershipChanged }) {
  const [users, setUsers] = useState([]);
  const [houses, setHouses] = useState([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [filterDraft, setFilterDraft] = useState('all');
  const [roleDraft, setRoleDraft] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [newHouse, setNewHouse] = useState('');
  const [showHouse, setShowHouse] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const reload = useCallback(async (signal) => {
    setLoading(true); setError('');
    try {
      const result = await request(queryPath('/api/admin/users', { q: query.trim(), page, limit: 20 }), { signal });
      if (!signal?.aborted) { setUsers(result.items); setTotal(result.total); setSelectedUser((current) => current ? result.items.find((user) => user.id === current.id) ?? null : null); }
    } catch (failure) { if (!signal?.aborted) setError(failure.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [query, page]);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void reload(controller.signal), 250); return () => { window.clearTimeout(timer); controller.abort(); }; }, [reload]);
  const reloadHouses = useCallback(async () => { try { const result = await allPages('/api/houses'); setHouses(result.items); } catch (failure) { setError(failure.message); } }, []);
  useEffect(() => { void Promise.resolve().then(reloadHouses); }, [reloadHouses]);
  const visibleUsers = users.filter((user) => filter === 'all' || user.memberships.some((membership) => membership.role === filter));
  const copy = async (id) => { try { await navigator.clipboard?.writeText(id); } finally { setCopiedId(id); window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1000); } };
  const openRole = (user, membership) => {
    setSaveError('');
    const nextHouse = membership ?? houses.find((house) => !user.memberships.some((item) => item.houseId === house.id));
    setRoleDraft({ user, isNew: !membership, houseId: String(nextHouse?.houseId ?? nextHouse?.id ?? ''), role: membership?.role ?? 'RESIDENT', status: membership?.status ?? 'ACTIVE', executorCompanyName: membership?.executorCompanyName ?? '' });
  };
  const saveRole = async () => {
    if (!roleDraft?.houseId || !roleDraft.role || !roleDraft.status || (roleDraft.role === 'EXECUTOR' && !roleDraft.executorCompanyName.trim())) return;
    setSaving(true); setSaveError('');
    try {
      await saveAdminMembership(roleDraft);
      hapticSuccess();
      setRoleDraft(null); await reload(); await onMembershipChanged?.();
    } catch (failure) { hapticError(); setSaveError(failure.message); if (failure.status === 409) { await reload(); await onMembershipChanged?.(); } }
    finally { setSaving(false); }
  };
  const deleteRole = async () => {
    if (!roleDraft || roleDraft.isNew || saving) return;
    setSaving(true); setSaveError('');
    try { await request(`/api/admin/houses/${roleDraft.houseId}/members/${roleDraft.user.id}`, { method: 'DELETE' }); hapticSuccess(); setDeletePending(false); setRoleDraft(null); await reload(); await onMembershipChanged?.(); }
    catch (failure) { hapticError(); setSaveError(failure.message); if (failure.status === 409) await reload(); }
    finally { setSaving(false); }
  };
  if (showPreview) return <PreviewAccessPage onBack={() => setShowPreview(false)} />;
  return <Panel mode="primary" className="admin-panel"><main className="panel-content admin-content"><div className="admin-layout"><div className="admin-toolbar"><div className="admin-toolbar__search-row"><SearchInput placeholder="Поиск" value={query} onChange={(event) => { setQuery(typeof event === 'string' ? event : event.target.value); setPage(1); }} /><button type="button" className={`admin-toolbar__filter${filter !== 'all' ? ' admin-toolbar__filter--active' : ''}`} aria-label="Фильтр по роли" onClick={() => { setFilterDraft(filter); setFilterOpen(true); }}><Icon24Filter width={20} height={20} /></button></div><div className="chairman-actions"><Button mode="secondary" onClick={() => setShowPreview(true)}>Доступ к тесту</Button><Button mode="secondary" onClick={() => setShowHouse(true)}>Добавить дом</Button></div></div>
    {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => { void reload(); void reloadHouses(); }} /> : null}
    <div className="admin-users-list">{!loading && !error && visibleUsers.length ? visibleUsers.map((user) => <article key={user.id} className="admin-user-card"><div className="admin-user-card__header"><div className="admin-user-card__author"><Avatar.Container size={32} className="admin-user-card__avatar"><Avatar.Image src={user.photoUrl} alt={fullName(user)} fallback={userInitial(user)} /></Avatar.Container><div className="admin-user-card__author-text"><Typography.Body className="admin-user-card__title">{fullName(user)}</Typography.Body><div className="admin-user-card__meta-row"><Typography.Label className="admin-user-card__meta">ID: {user.maxUserId}</Typography.Label><button type="button" className="admin-user-card__copy" aria-label={`Скопировать ID пользователя ${user.maxUserId}`} onClick={() => void copy(user.maxUserId)}>{copiedId === user.maxUserId ? <Icon16Done width={16} height={16} /> : <Icon16CopyOutline width={16} height={16} />}</button></div></div></div><button type="button" className="admin-role-pill" onClick={() => user.memberships.length ? setSelectedUser(user) : openRole(user, null)}>{user.memberships.length ? 'Дома и роли' : 'Назначить дом'}</button></div></article>) : !loading && !error ? <EmptyState message="Пользователи не найдены." /> : null}</div>
    {total > 20 ? <div className="admin-pagination"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Назад</Button><Typography.Label>{page} / {Math.ceil(total / 20)}</Typography.Label><Button disabled={page * 20 >= total} onClick={() => setPage((value) => value + 1)}>Далее</Button></div> : null}
  </div></main>
    {roleDraft ? <RoleDialog draft={roleDraft} setDraft={setRoleDraft} houses={houses} saving={saving} error={saveError} onClose={() => setRoleDraft(null)} onSave={() => void saveRole()} onDelete={() => setDeletePending(true)} /> : null}
    {deletePending ? <Modal className="home-access-modal" title="Удалить членство?" onClose={() => setDeletePending(false)} actions={<><Button mode="secondary" onClick={() => setDeletePending(false)}>Отмена</Button><Button disabled={saving} appearance="negative" onClick={() => void deleteRole()}>Удалить</Button></>}><Typography.Body>Пользователь потеряет доступ к выбранному дому.</Typography.Body>{saveError ? <Typography.Body role="alert">{saveError}</Typography.Body> : null}</Modal> : null}
    {showHouse ? <AdminDialog title="Добавить дом" onClose={() => setShowHouse(false)} actions={<><Button mode="secondary" onClick={() => setShowHouse(false)}>Отмена</Button><Button disabled={saving || !newHouse.trim()} onClick={() => { setSaving(true); setSaveError(''); void request('/api/admin/houses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: newHouse.trim() }) }).then(() => { hapticSuccess(); setShowHouse(false); setNewHouse(''); return reloadHouses(); }).catch((failure) => { hapticError(); setSaveError(failure.message); }).finally(() => setSaving(false)); }}>Создать</Button></>}><div className="admin-form"><label className="admin-form__field">Адрес<input value={newHouse} maxLength={255} onChange={(event) => setNewHouse(event.target.value)} /></label>{saveError ? <Typography.Body role="alert">{saveError}</Typography.Body> : null}</div></AdminDialog> : null}
    {selectedUser && !roleDraft ? <MembershipsDialog user={selectedUser} canAdd={houses.some((house) => !selectedUser.memberships.some((item) => item.houseId === house.id))} onClose={() => setSelectedUser(null)} onEdit={(membership) => openRole(selectedUser, membership)} onAdd={() => openRole(selectedUser, null)} /> : null}
    {isFilterOpen ? <AdminDialog title="Фильтр" onClose={() => setFilterOpen(false)} actions={<><Button appearance="neutral" mode="secondary" size="medium" stretched disabled={filterDraft === 'all'} onClick={() => setFilterDraft('all')}>Сбросить</Button><Button appearance="themed" mode="primary" size="medium" stretched onClick={() => { setFilter(filterDraft); setFilterOpen(false); }}>Применить</Button></>}><div className="admin-form"><div className="admin-form__field"><CellHeader titleStyle="caps">Роль</CellHeader><AdminSelect value={filterDraft} options={[ALL_ROLES, ...ROLES]} onChange={setFilterDraft} ariaLabel="Выбор фильтра пользователей" /></div></div></AdminDialog> : null}
  </Panel>;
}

export function MembershipsDialog({ user, canAdd = true, onClose, onEdit, onAdd }) {
  return <AdminDialog title="Дома и роли" onClose={onClose} actions={<Button appearance="themed" mode="primary" size="medium" stretched disabled={!canAdd} onClick={onAdd}>Добавить дом</Button>}><div className="admin-memberships">{user.memberships.map((membership) => <div key={membership.id} className="admin-memberships__row"><div><Typography.Body>{membership.houseAddress}</Typography.Body><Typography.Label>{roleByValue(membership.role).label} · {STATUSES.find((item) => item.value === membership.status)?.label}{membership.role === 'EXECUTOR' && membership.executorCompanyName ? ` · ${membership.executorCompanyName}` : ''}</Typography.Label></div><IconButton mode="secondary" appearance="neutral" aria-label={`Изменить роль в доме ${membership.houseAddress}`} onClick={() => onEdit(membership)}><Icon24PenOutline width={20} height={20} /></IconButton></div>)}</div></AdminDialog>;
}

function AdminDialog({ title, onClose, children, actions }) {
  return <div className="admin-overlay" role="presentation" onMouseDown={onClose}><section className="admin-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="admin-dialog__header"><IconButton className="admin-dialog__close" aria-label="Закрыть" mode="link" appearance="neutral" onClick={onClose}><Icon20Cancel width={20} height={20} /></IconButton><Typography.Headline className="admin-dialog__title">{title}</Typography.Headline></div>{children}<div className="admin-dialog__actions">{actions}</div></section></div>;
}
function AdminSelect({ value, onChange, options, ariaLabel }) {
  const [isOpen, setOpen] = useState(false);
  const selected = options.find((item) => String(item.value) === String(value)) ?? options[0];
  return <div className="admin-select"><button type="button" className={`admin-select__trigger${isOpen ? ' admin-select__trigger--open' : ''}`} aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setOpen((open) => !open)}><span>{selected?.label ?? 'Выберите'}</span><span className="admin-select__icon">{isOpen ? <Icon24ChevronUpSmall width={20} height={20} /> : <Icon24ChevronDown width={20} height={20} />}</span></button>{isOpen ? <div className="admin-select__menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => <button key={option.value} type="button" className={`admin-select__option${String(option.value) === String(value) ? ' admin-select__option--selected' : ''}`} onClick={() => { onChange(String(option.value)); setOpen(false); }}>{option.label}</button>)}</div> : null}</div>;
}
function RoleDialog({ draft, setDraft, houses, saving, error, onClose, onSave, onDelete }) {
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const membership = draft.user.memberships.find((item) => String(item.houseId) === draft.houseId);
  const availableHouses = draft.isNew ? houses.filter((house) => !draft.user.memberships.some((item) => item.houseId === house.id)) : houses.filter((house) => String(house.id) === draft.houseId);
  const inputProps = { className: 'admin-form__input', innerClassNames: { body: 'admin-form__input-body', input: 'admin-form__input-element', clearButton: 'admin-form__input-clear' } };
  return <AdminDialog title="Членство пользователя" onClose={onClose} actions={<>{!draft.isNew ? <Button appearance="negative" mode="secondary" size="medium" stretched disabled={saving} onClick={onDelete}>Удалить членство</Button> : null}<Button appearance="neutral" mode="secondary" size="medium" stretched onClick={onClose}>Отмена</Button><Button appearance="themed" mode="primary" size="medium" stretched disabled={saving || !draft.houseId || (draft.role === 'EXECUTOR' && !draft.executorCompanyName.trim())} onClick={onSave}>{saving ? 'Сохранение…' : 'Сохранить'}</Button></>}><div className="admin-role-modal__user"><Avatar.Container size={48}><Avatar.Image src={draft.user.photoUrl} alt={fullName(draft.user)} fallback={userInitial(draft.user)} /></Avatar.Container><div className="admin-role-modal__user-text"><Typography.Body className="admin-role-modal__name">{fullName(draft.user)}</Typography.Body><Typography.Label className="admin-role-modal__meta">ID: {draft.user.maxUserId}</Typography.Label></div></div><div className="admin-form"><div className="admin-form__field"><CellHeader titleStyle="caps">Дом</CellHeader>{draft.isNew ? <AdminSelect value={draft.houseId} options={availableHouses.map((house) => ({ value: String(house.id), label: house.address }))} onChange={(value) => update('houseId', value)} ariaLabel="Выбор дома" /> : <Typography.Body>{membership?.houseAddress}</Typography.Body>}</div><div className="admin-form__field"><CellHeader titleStyle="caps">Роль</CellHeader><AdminSelect value={draft.role} options={ROLES} onChange={(value) => update('role', value)} ariaLabel="Выбор роли пользователя" /></div><div className="admin-form__field"><CellHeader titleStyle="caps">Статус</CellHeader><AdminSelect value={draft.status} options={STATUSES} onChange={(value) => update('status', value)} ariaLabel="Выбор статуса членства" /></div>{draft.role === 'EXECUTOR' || membership?.executorCompanyName ? <label className="admin-form__field"><CellHeader titleStyle="caps">Компания исполнителя</CellHeader><Input {...inputProps} placeholder="Название компании" maxLength={255} value={draft.executorCompanyName} onChange={(event) => update('executorCompanyName', typeof event === 'string' ? event : event.target.value)} /></label> : null}{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></AdminDialog>;
}
