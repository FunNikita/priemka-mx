import { Avatar, CellHeader, Input, Panel, Typography } from '@maxhub/max-ui';
import { Button, IconButton } from '../components/ui/LegacyButton';
import { Icon16CopyOutline, Icon16Done, Icon20Cancel, Icon20UserAddOutline, Icon24ChevronDown, Icon24ChevronUpSmall, Icon24Filter } from '@vkontakte/icons';
import { useMemo, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { SearchInput } from '../components/ui/SearchInput';

const ROLES = [
  { value: 'council-member', label: 'Член совета', tone: 'council' },
  { value: 'resident', label: 'Житель', tone: 'resident' },
  { value: 'chairman', label: 'Председатель', tone: 'chairman' },
  { value: 'admin', label: 'Администратор', tone: 'admin' },
];
const INITIAL_USERS = [
  { id: 1, firstName: 'Человек', lastName: 'Человеков', maxUserId: '214748', role: 'admin', photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80' },
  { id: 2, firstName: 'Анна', lastName: 'Воронова', maxUserId: '214749', role: 'resident' },
  { id: 3, firstName: 'Илья', lastName: 'Сергеев', maxUserId: '214750', role: 'council-member' },
  { id: 4, firstName: 'Мария', lastName: 'Лебедева', maxUserId: '214751', role: 'chairman' },
];
const ALL_ROLES = { value: 'all', label: 'Все роли' };
const roleByValue = (value) => ROLES.find((item) => item.value === value) ?? ROLES[0];
const fullName = (user) => [user.firstName, user.lastName].filter(Boolean).join(' ') || `Пользователь ${user.maxUserId}`;
const userInitial = (user) => fullName(user).split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'П';

export function AdminPage({ onCurrentUserRoleChange }) {
  const [users, setUsers] = useState(INITIAL_USERS);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [filterDraft, setFilterDraft] = useState('all');
  const [roleDraft, setRoleDraft] = useState(null);
  const [createDraft, setCreateDraft] = useState(null);
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const visibleUsers = useMemo(() => users.filter((user) => `${fullName(user)} ${user.maxUserId}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || user.role === filter)), [users, query, filter]);
  const copy = async (id) => { try { await navigator.clipboard?.writeText(id); } finally { setCopiedId(id); window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1000); } };
  const openFilter = () => { setFilterDraft(filter); setFilterOpen(true); };
  const saveRole = () => {
    setUsers((items) => items.map((user) => user.id === roleDraft.user.id ? { ...user, role: roleDraft.role } : user));
    if (roleDraft.user.id === 1) onCurrentUserRoleChange?.(roleDraft.role);
    setRoleDraft(null);
  };
  const addUser = () => { if (!createDraft.firstName.trim() || !createDraft.maxUserId.trim()) return; setUsers((items) => [{ id: Date.now(), firstName: createDraft.firstName.trim(), lastName: createDraft.lastName.trim(), maxUserId: createDraft.maxUserId.trim(), role: createDraft.role }, ...items]); setCreateDraft(null); };

  return <Panel mode="primary" className="admin-panel"><PageHeader title="Админка" />
    <main className="panel-content admin-content"><div className="admin-layout"><div className="admin-toolbar"><div className="admin-toolbar__search-row"><SearchInput placeholder="Поиск" value={query} onChange={(event) => setQuery(typeof event === 'string' ? event : event.target.value)} /><button type="button" className={`admin-toolbar__filter${filter !== 'all' ? ' admin-toolbar__filter--active' : ''}`} aria-label="Фильтр по роли" onClick={openFilter}><Icon24Filter width={20} height={20} /></button><button type="button" className="admin-toolbar__add" aria-label="Добавить пользователя" onClick={() => setCreateDraft({ maxUserId: '', firstName: '', lastName: '', role: 'resident' })}><Icon20UserAddOutline width={20} height={20} /></button></div></div>
      <div className="admin-users-list">{visibleUsers.length ? visibleUsers.map((user) => { const role = roleByValue(user.role); return <article key={user.id} className="admin-user-card"><div className="admin-user-card__header"><div className="admin-user-card__author"><Avatar.Container size={32} className="admin-user-card__avatar"><Avatar.Image src={user.photoUrl} alt={fullName(user)} fallback={userInitial(user)} /></Avatar.Container><div className="admin-user-card__author-text"><Typography.Body className="admin-user-card__title">{fullName(user)}</Typography.Body><div className="admin-user-card__meta-row"><Typography.Label className="admin-user-card__meta">ID: {user.maxUserId}</Typography.Label><button type="button" className="admin-user-card__copy" aria-label={`Скопировать ID пользователя ${user.maxUserId}`} onClick={() => void copy(user.maxUserId)}>{copiedId === user.maxUserId ? <Icon16Done width={16} height={16} /> : <Icon16CopyOutline width={16} height={16} />}</button></div></div></div><button type="button" className={`admin-role-pill admin-role-pill--${role.tone}`} onClick={() => setRoleDraft({ user, role: user.role })}>{role.label}</button></div></article>; }) : <div className="admin-empty"><Typography.Body>Пользователи не найдены.</Typography.Body></div>}</div>
    </div></main>
    {roleDraft ? <RoleDialog title="Роль пользователя" user={roleDraft.user} value={roleDraft.role} onChange={(role) => setRoleDraft((draft) => ({ ...draft, role }))} onClose={() => setRoleDraft(null)} onSave={saveRole} /> : null}
    {isFilterOpen ? <FilterDialog value={filterDraft} onChange={setFilterDraft} onClose={() => setFilterOpen(false)} onReset={() => setFilterDraft('all')} onApply={() => { setFilter(filterDraft); setFilterOpen(false); }} /> : null}
    {createDraft ? <CreateDialog draft={createDraft} setDraft={setCreateDraft} onClose={() => setCreateDraft(null)} onSave={addUser} /> : null}
  </Panel>;
}

function AdminDialog({ title, onClose, children, actions, className = '' }) {
  return <div className="admin-overlay" role="presentation" onMouseDown={onClose}><section className={`admin-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="admin-dialog__header"><IconButton className="admin-dialog__close" aria-label="Закрыть" mode="link" appearance="neutral" onClick={onClose}><Icon20Cancel width={20} height={20} /></IconButton><Typography.Headline className="admin-dialog__title">{title}</Typography.Headline></div>{children}<div className="admin-dialog__actions">{actions}</div></section></div>;
}

function RoleSelect({ value, onChange, includeAll = false, ariaLabel }) {
  const [isOpen, setOpen] = useState(false);
  const options = includeAll ? [ALL_ROLES, ...ROLES] : ROLES;
  const selected = options.find((option) => option.value === value) ?? options[0];
  return <div className="admin-select"><button type="button" className={`admin-select__trigger${isOpen ? ' admin-select__trigger--open' : ''}`} aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setOpen((open) => !open)}><span>{selected.label}</span><span className="admin-select__icon">{isOpen ? <Icon24ChevronUpSmall width={20} height={20} /> : <Icon24ChevronDown width={20} height={20} />}</span></button>{isOpen ? <div className="admin-select__menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => <button key={option.value} type="button" className={`admin-select__option${option.value === value ? ' admin-select__option--selected' : ''}`} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div> : null}</div>;
}

function RoleDialog({ title, user, value, onChange, onClose, onSave }) {
  return <AdminDialog title={title} onClose={onClose} actions={<><Button appearance="neutral" mode="secondary" size="medium" stretched onClick={onClose}>Отмена</Button><Button appearance="themed" mode="primary" size="medium" stretched onClick={onSave}>Сохранить</Button></>}><div className="admin-role-modal__user"><Avatar.Container size={48}><Avatar.Image src={user.photoUrl} alt={fullName(user)} fallback={userInitial(user)} /></Avatar.Container><div className="admin-role-modal__user-text"><Typography.Body className="admin-role-modal__name">{fullName(user)}</Typography.Body><Typography.Label className="admin-role-modal__meta">ID: {user.maxUserId}</Typography.Label></div></div><div className="admin-form"><div className="admin-form__field"><CellHeader titleStyle="caps">Роль</CellHeader><RoleSelect value={value} onChange={onChange} ariaLabel="Выбор роли пользователя" /></div></div></AdminDialog>;
}

function FilterDialog({ value, onChange, onClose, onReset, onApply }) {
  return <AdminDialog title="Фильтр" onClose={onClose} actions={<><Button appearance="neutral" mode="secondary" size="medium" stretched disabled={value === 'all'} onClick={onReset}>Сбросить</Button><Button appearance="themed" mode="primary" size="medium" stretched onClick={onApply}>Применить</Button></>}><div className="admin-form"><div className="admin-form__field"><CellHeader titleStyle="caps">Роль</CellHeader><RoleSelect value={value} onChange={onChange} includeAll ariaLabel="Выбор фильтра пользователей" /></div></div></AdminDialog>;
}

function CreateDialog({ draft, setDraft, onClose, onSave }) {
  const update = (key) => (event) => setDraft((value) => ({ ...value, [key]: typeof event === 'string' ? event : event.target.value }));
  const valid = Boolean(draft.firstName.trim() && draft.maxUserId.trim());
  const inputProps = { className: 'admin-form__input', innerClassNames: { body: 'admin-form__input-body', input: 'admin-form__input-element', clearButton: 'admin-form__input-clear' } };
  return <AdminDialog className="admin-dialog--create" title="Добавить пользователя" onClose={onClose} actions={<><Button appearance="neutral" mode="secondary" size="medium" stretched onClick={onClose}>Отмена</Button><Button className="admin-form__save" appearance="themed" mode="primary" size="medium" stretched disabled={!valid} onClick={onSave}>Добавить</Button></>}><div className="admin-form"><label className="admin-form__field"><CellHeader className="admin-form__header" titleStyle="caps" innerClassNames={{ content: 'admin-form__header-content' }}>ID MAX пользователя <span className="admin-form__required">*</span></CellHeader><Input {...inputProps} placeholder="Введите ID MAX" type="number" inputMode="numeric" value={draft.maxUserId} onChange={update('maxUserId')} /></label><label className="admin-form__field"><CellHeader className="admin-form__header" titleStyle="caps" innerClassNames={{ content: 'admin-form__header-content' }}>Имя <span className="admin-form__required">*</span></CellHeader><Input {...inputProps} placeholder="Введите имя" value={draft.firstName} onChange={update('firstName')} /></label><label className="admin-form__field"><CellHeader className="admin-form__header" titleStyle="caps" innerClassNames={{ content: 'admin-form__header-content' }}>Фамилия</CellHeader><Input {...inputProps} placeholder="Введите фамилию" value={draft.lastName} onChange={update('lastName')} /></label><div className="admin-form__field"><CellHeader className="admin-form__header" titleStyle="caps" innerClassNames={{ content: 'admin-form__header-content' }}>Роль</CellHeader><RoleSelect value={draft.role} onChange={(role) => setDraft((value) => ({ ...value, role }))} ariaLabel="Выбор роли нового пользователя" /></div></div></AdminDialog>;
}
