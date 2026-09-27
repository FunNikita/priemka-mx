import { Avatar, Panel, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/LegacyButton';
import { Modal } from '../components/ui/Modal';
import { CouncilHouseChat } from './CouncilHouseChat';
import { formatDate, request, workStatuses } from './residentApi';
import { assignInspection, confirmChairmanDocument, createChairmanWork, decideJoinRequest, generateRefusal, loadChairmanHome, loadInspectionForm, loadWorkForm } from './chairmanApi';

const categoryLabels = { COMMON_AREAS: 'Общие помещения', LIGHTING: 'Освещение', ROOF: 'Кровля', OUTDOOR: 'Придомовая территория' };

export function ChairmanHome({ houseId, houses, onHouseChange }) {
  const [data, setData] = useState({ requests: [], works: [] });
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [workForm, setWorkForm] = useState(null);
  const [draft, setDraft] = useState({ executorUserId: '', title: '', description: '', category: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!houseId) { setData({ requests: [], works: [] }); setLoading(false); return; }
    setLoading(true);
    try { setData(await loadChairmanHome(houseId)); setError(''); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [houseId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  const decide = async (membershipId, decision) => {
    setBusy(true); setError('');
    try { await decideJoinRequest(houseId, membershipId, decision); await reload(); }
    catch (failure) { setError(failure.message); if (failure.status === 409) await reload(); }
    finally { setBusy(false); }
  };
  const openCreate = async () => {
    setError('');
    try { setWorkForm(await loadWorkForm(houseId)); setCreating(true); }
    catch (failure) { setError(failure.message); }
  };
  const create = async () => {
    setBusy(true); setError('');
    try {
      await createChairmanWork(houseId, { executorUserId: Number(draft.executorUserId), title: draft.title.trim(), description: draft.description.trim(), category: draft.category });
      setCreating(false); setDraft({ executorUserId: '', title: '', description: '', category: '' }); await reload();
    } catch (failure) { setError(failure.message); if (failure.status === 409) await reload(); }
    finally { setBusy(false); }
  };
  if (selectedWorkId) return <ChairmanWorkDetail key={selectedWorkId} houseId={houseId} workId={selectedWorkId} onBack={() => { setSelectedWorkId(null); void reload(); }} />;
  return <Panel mode="primary" className="home-panel"><PageHeader title="Главная" /><main className="panel-content"><div className="home-sections">
    <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
    {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
    <CouncilHouseChat houseId={houseId} />
    <section className="home-active-works"><Typography.Headline className="home-section-title">Заявки жителей</Typography.Headline><div className="home-active-works__list">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : data.requests.map((item) => <article className="home-active-work" key={item.id}><div className="chairman-request"><Avatar.Container size={40}><Avatar.Image src={item.user.photoUrl} alt="" fallback={(item.user.firstName?.[0] ?? 'Ж') + (item.user.lastName?.[0] ?? '')} /></Avatar.Container><div><Typography.Body>{[item.user.firstName, item.user.lastName].filter(Boolean).join(' ')}</Typography.Body><Typography.Label>Ожидает решения</Typography.Label></div></div><div className="chairman-actions"><Button disabled={busy} onClick={() => void decide(item.id, 'APPROVE')}>Одобрить</Button><Button mode="secondary" disabled={busy} onClick={() => void decide(item.id, 'REJECT')}>Отклонить</Button></div></article>)}{!loading && !error && !data.requests.length ? <EmptyState message="Ожидающих заявок нет." /> : null}</div></section>
    <section className="home-active-works"><Typography.Headline className="home-section-title">Работы дома</Typography.Headline><Button mode="secondary" appearance="themed" onClick={() => void openCreate()}>Создать работу</Button><div className="home-active-works__list">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : data.works.map((work) => <button className="home-active-work" key={work.id} onClick={() => setSelectedWorkId(work.id)}><div className="home-active-work__head"><Typography.Title variant="small-strong">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div><Typography.Label>{workStatuses[work.status]} · {formatDate(work.date)}</Typography.Label><Typography.Body>{work.description}</Typography.Body></button>)}{!loading && !error && !data.works.length ? <EmptyState message="Работ пока нет." /> : null}</div></section>
  </div></main>{creating ? <Modal className="home-access-modal" title="Создать работу" onClose={() => setCreating(false)} actions={<><Button mode="secondary" onClick={() => setCreating(false)}>Отмена</Button><Button disabled={busy || !draft.executorUserId || !draft.title.trim() || !draft.description.trim() || !draft.category} onClick={() => void create()}>Создать</Button></>}><div className="chairman-form"><label>Название<input maxLength={255} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>Описание<textarea maxLength={10000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>Категория<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}><option value="">Выберите категорию</option>{[...new Set(workForm?.templates.map((item) => item.category) ?? [])].map((category) => <option key={category} value={category}>{categoryLabels[category] ?? category}</option>)}</select></label><label>Исполнитель<select value={draft.executorUserId} onChange={(event) => setDraft((current) => ({ ...current, executorUserId: event.target.value }))}><option value="">Выберите исполнителя</option>{workForm?.executors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.executorCompanyName ? ` · ${item.executorCompanyName}` : ''}</option>)}</select></label>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}</Panel>;
}

function ChairmanWorkDetail({ houseId, workId, onBack }) {
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [draft, setDraft] = useState({ checklistTemplateId: '', assigneeUserId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => { setLoading(true); try { setWork(await request(`/api/works/${workId}`)); setError(''); } catch (failure) { setError(failure.message); } finally { setLoading(false); } }, [workId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  const openAssign = async () => { try { setForm(await loadInspectionForm(houseId, work.category)); } catch (failure) { setError(failure.message); } };
  const run = async (operation) => { setBusy(true); setError(''); try { await operation(); setForm(null); await reload(); } catch (failure) { setError(failure.message); if (failure.status === 409) await reload(); } finally { setBusy(false); } };
  return <Panel mode="primary" className="home-panel active-work-details-panel"><PageHeader title="Работа" onBack={onBack} /><main className="panel-content active-work-details-content">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : work ? <section className="active-work-details__card"><Typography.Title variant="small-strong">{work.title}</Typography.Title><Typography.Label>{workStatuses[work.status]} · ID {work.id}</Typography.Label><Typography.Body>{work.description}</Typography.Body><Typography.Label>{work.house.address}</Typography.Label>{work.sourceObservation ? <Typography.Label>Наблюдение жителя №{work.sourceObservation.id}: {work.sourceObservation.title}</Typography.Label> : null}{work.actions.assignInspector ? <Button disabled={busy} onClick={() => void openAssign()}>Назначить проверку</Button> : null}{work.actions.generateReasonedRefusal ? <Button disabled={busy} onClick={() => void run(() => generateRefusal(workId))}>Оформить мотивированный отказ</Button> : null}{work.documents.map((document) => <div className="council-api__document" key={document.id}><a href={document.fileUrl} target="_blank" rel="noreferrer">{document.title}</a>{work.actions.confirmAcceptance && document.actions.confirm ? <Button disabled={busy} onClick={() => void run(() => confirmChairmanDocument(document.id))}>Подтвердить акт</Button> : null}</div>)}</section> : null}</main>{form ? <Modal className="home-access-modal" title="Назначить проверку" onClose={() => setForm(null)} actions={<><Button mode="secondary" onClick={() => setForm(null)}>Отмена</Button><Button disabled={busy || !draft.checklistTemplateId || !draft.assigneeUserId} onClick={() => void run(() => assignInspection(workId, Number(draft.checklistTemplateId), Number(draft.assigneeUserId)))}>Назначить</Button></>}><div className="chairman-form"><label>Чек-лист<select value={draft.checklistTemplateId} onChange={(event) => setDraft((current) => ({ ...current, checklistTemplateId: event.target.value }))}><option value="">Выберите чек-лист</option>{form.templates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Проверяющий<select value={draft.assigneeUserId} onChange={(event) => setDraft((current) => ({ ...current, assigneeUserId: event.target.value }))}><option value="">Выберите проверяющего</option>{form.members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}</Panel>;
}
