import { useState } from 'react';
import { Avatar, CellSimple, Panel, Typography } from '@maxhub/max-ui';
import { PageHeader } from '../components/layout/PageHeader';
import { AppSelect } from '../components/ui/AppSelect';
import { Button } from '../components/ui/LegacyButton';
import { roleLabels } from './residentApi';
import './RolePage.css';

const roleOptions = ['RESIDENT', 'COUNCIL_MEMBER', 'CHAIRMAN', 'EXECUTOR'].map((value) => ({ value, label: roleLabels[value] }));

export function RolePage({ user, maxProfile, houses = [], onSave, busy, error, errorHouseId }) {
  const firstName = user?.first_name || maxProfile?.firstName;
  const lastName = user?.last_name || maxProfile?.lastName;
  const photoUrl = user?.photo_url || maxProfile?.photoUrl;
  const name = [firstName, lastName].filter(Boolean).join(' ') || user?.name || 'Пользователь MAX';
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('') || 'М';
  const [drafts, setDrafts] = useState({});
  const saveHouseRole = async (house, draft) => {
    if (await onSave(house.id, draft.role, draft.company)) {
      setDrafts((current) => ({ ...current, [house.id]: draft }));
    }
  };

  return <Panel mode="primary" className="role-panel"><PageHeader title="Роль" /><main className="panel-content role-page">
    <section className="role-page__card">
      <CellSimple className="role-page__profile" height="normal" before={<Avatar.Container size={48}><Avatar.Image src={photoUrl} alt="" fallback={initials} /></Avatar.Container>} title={name} />
      {houses.length ? <div className="role-page__houses">{houses.map((house) => {
        const draft = drafts[house.id] ?? { role: house.role, company: house.executorCompanyName ?? '' };
        const canChange = house.status === 'ACTIVE';
        return <section className="role-page__house" key={house.id}>
          <CellSimple className="role-page__house-info" height="compact" title={house.address} subtitle={roleLabels[house.role] ?? house.role} />
          <div className="report-problem-field role-page__field"><Typography.Label>Выбрать роль</Typography.Label><AppSelect value={draft.role} options={roleOptions} ariaLabel={`Выбрать роль для дома ${house.address}`} disabled={!canChange} onChange={(role) => setDrafts((current) => ({ ...current, [house.id]: { ...draft, role } }))} /></div>
          {draft.role === 'EXECUTOR' ? <label className="role-page__field"><Typography.Label>Компания</Typography.Label><input value={draft.company} maxLength={255} disabled={!canChange} onChange={(event) => setDrafts((current) => ({ ...current, [house.id]: { ...draft, company: event.target.value } }))} /></label> : null}
          {canChange && (draft.role !== house.role || (draft.role === 'EXECUTOR' && draft.company !== (house.executorCompanyName ?? ''))) ? <Button disabled={busy || (draft.role === 'EXECUTOR' && !draft.company.trim())} onClick={() => void saveHouseRole(house, draft)}>Сохранить роль</Button> : null}
          {error && errorHouseId === house.id ? <Typography.Body role="alert">{error}</Typography.Body> : null}
        </section>;
      })}</div> : <Typography.Body>У пользователя пока нет домов.</Typography.Body>}
    </section>
  </main></Panel>;
}
