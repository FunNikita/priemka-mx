import { Avatar, Panel, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { PhotoStrip } from '../components/common/PhotoStrip';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/LegacyButton';
import { Modal } from '../components/ui/Modal';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { DocumentRow } from '../components/ui/DocumentRow';
import { CouncilHouseChat } from './CouncilHouseChat';
import { allPages, formatDate, historyEvents, jsonRequest, request, roleLabels, workStatuses } from './residentApi';
import { assignInspection, assignObservationExecutor, confirmChairmanDocument, createChairmanObservation, decideJoinRequest, generateRefusal, loadChairmanHome, loadInspectionForm, loadWorkForm } from './chairmanApi';
import { hapticError, hapticSuccess } from '../utils/maxFeedback';
import { ObservationRoleContent } from './ObservationRoleContent';
import { ConfirmActionModal } from '../components/ui/ConfirmActionModal';
import { sortHistoryNewestFirst } from './sortHistory';

const categoryLabels = { COMMON_AREAS: 'Общие помещения', LIGHTING: 'Освещение', ROOF: 'Кровля', OUTDOOR: 'Придомовая территория' };
const observationCategories = ['Освещение', 'Двери и домофон', 'Лифт', 'Уборка', 'Территория дома', 'Другое'];

export function ChairmanHome({ houseId, houses, onHouseChange, focusJoinRequestId, onBack }) {
  const [data, setData] = useState({ requests: [], works: [] });
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [workForm, setWorkForm] = useState(null);
  const [draft, setDraft] = useState({ executorUserId: '', title: '', description: '', category: '', workflowCategory: '' });
  const [confirmation, setConfirmation] = useState(null);
  const [createdObservationId, setCreatedObservationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!houseId) { setData({ requests: [], works: [] }); setLoading(false); return; }
    setLoading(true);
    try {
      const nextData = await loadChairmanHome(houseId);
      setData({ ...nextData, requests: focusJoinRequestId ? [...nextData.requests].sort((a, b) => (b.id === focusJoinRequestId) - (a.id === focusJoinRequestId)) : nextData.requests });
      setError('');
    }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [houseId, focusJoinRequestId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  useEffect(() => { if (focusJoinRequestId && data.requests.length) document.getElementById(`join-request-${focusJoinRequestId}`)?.scrollIntoView?.({ block: 'center' }); }, [data.requests, focusJoinRequestId]);
  const decide = async (membershipId, decision) => {
    setConfirmation(null);
    setBusy(true); setError('');
    try { await decideJoinRequest(houseId, membershipId, decision); hapticSuccess(); await reload(); }
    catch (failure) { hapticError(); setError(failure.message); if (failure.status === 409) await reload(); }
    finally { setBusy(false); }
  };
  const openCreate = async () => {
    setError('');
    try { setCreatedObservationId(null); setWorkForm(await loadWorkForm(houseId)); setCreating(true); }
    catch (failure) { setError(failure.message); }
  };
  const create = async () => {
    setBusy(true); setError('');
    try {
      const input = { executorUserId: Number(draft.executorUserId), title: draft.title.trim(), description: draft.description.trim(), category: draft.category, workflowCategory: draft.workflowCategory };
      if (createdObservationId) await assignObservationExecutor(createdObservationId, { executorUserId: input.executorUserId, category: input.workflowCategory });
      else await createChairmanObservation(houseId, input, setCreatedObservationId);
      hapticSuccess();
      setConfirmation(null); setCreating(false); setCreatedObservationId(null); setDraft({ executorUserId: '', title: '', description: '', category: '', workflowCategory: '' }); await reload();
    } catch (failure) { hapticError(); setConfirmation(null); await reload(); setError(failure.message); }
    finally { setBusy(false); }
  };
  const confirmCreate = () => {
    const executor = workForm?.executors.find((item) => String(item.id) === draft.executorUserId);
    setConfirmation({ title: 'Создать обращение и назначить исполнителя?', message: `Создать обращение «${draft.title.trim()}» и назначить ${executor?.executorCompanyName ?? executor?.name ?? 'выбранного исполнителя'}?`, run: create });
  };
  if (selectedWorkId) return <ChairmanWorkDetail key={selectedWorkId} houseId={houseId} observationId={selectedWorkId} onBack={() => { setSelectedWorkId(null); void reload(); }} />;
  return <Panel mode="primary" className="home-panel"><PageHeader title="Главная" onBack={onBack} /><main className="panel-content"><div className="home-sections">
    <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
    {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
    {focusJoinRequestId && !loading && !data.requests.some((item) => item.id === focusJoinRequestId) ? <ErrorState message="Заявка уже обработана или недоступна." /> : null}
    <CouncilHouseChat houseId={houseId} house={houses?.find((item) => item.id === houseId)} />
    {!loading && data.requests.length ? <section className="home-active-works"><Typography.Headline className="home-section-title">Заявки жителей</Typography.Headline><div className="home-active-works__list">{data.requests.map((item) => <article className="home-active-work" id={`join-request-${item.id}`} key={item.id}><div className="chairman-request"><Avatar.Container size={40}><Avatar.Image src={item.user.photoUrl} alt="" fallback={(item.user.firstName?.[0] ?? 'Ж') + (item.user.lastName?.[0] ?? '')} /></Avatar.Container><div><Typography.Body>{[item.user.firstName, item.user.lastName].filter(Boolean).join(' ')}</Typography.Body><Typography.Label>Ожидает решения · подана {formatDate(item.requestedAt)}</Typography.Label></div></div><div className="chairman-actions"><Button disabled={busy} onClick={() => setConfirmation({ title: 'Одобрить заявку?', message: `Одобрить заявку ${[item.user.firstName, item.user.lastName].filter(Boolean).join(' ')} на доступ к дому?`, run: () => decide(item.id, 'APPROVE') })}>Одобрить</Button><Button mode="secondary" disabled={busy} onClick={() => setConfirmation({ title: 'Отклонить заявку?', message: `Отклонить заявку ${[item.user.firstName, item.user.lastName].filter(Boolean).join(' ')} на доступ к дому?`, run: () => decide(item.id, 'REJECT') })}>Отклонить</Button></div></article>)}</div></section> : null}
    <section className="home-active-works chairman-works"><Typography.Headline className="home-section-title">Работы дома</Typography.Headline><Button mode="secondary" appearance="themed" stretched onClick={() => void openCreate()}>Создать обращение</Button><div className="home-active-works__list">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : data.works.map((work) => { const photos = work.media?.length ? work.media : work.sourceObservation?.media ?? []; const status = workStatuses[work.status] ?? work.status; return <button className="home-active-work chairman-work-card" key={work.id} onClick={(event) => { if (!event.target.closest('.chairman-work-card__photos')) setSelectedWorkId(work.id); }}><div className="home-active-work__head"><Typography.Title variant="small-strong">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div><div className="chairman-work-card__status">{status}</div>{photos.length ? <PhotoGroup photos={photos} title={work.title} className="chairman-work-card__photos" /> : null}<Typography.Label className="chairman-work-card__date">{formatDate(work.date ?? work.createdAt)}</Typography.Label><Typography.Body>{work.description}</Typography.Body></button>; })}{!loading && !error && !data.works.length ? <EmptyState message="Работ пока нет." /> : null}</div></section>
  </div></main>{creating ? <Modal className="home-access-modal" title="Создать обращение" onClose={() => setCreating(false)} actions={<><Button mode="secondary" onClick={() => setCreating(false)}>Отмена</Button><Button disabled={busy || !draft.executorUserId || !draft.title.trim() || !draft.description.trim() || !draft.category || !draft.workflowCategory} onClick={confirmCreate}>Создать</Button></>}><div className="chairman-form"><label>Название<input maxLength={255} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>Описание<textarea maxLength={10000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>Категория обращения<select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}><option value="">Выберите категорию</option>{observationCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Категория чек-листа<select value={draft.workflowCategory} onChange={(event) => setDraft((current) => ({ ...current, workflowCategory: event.target.value }))}><option value="">Выберите категорию чек-листа</option>{[...new Set(workForm?.templates.map((item) => item.category) ?? [])].map((category) => <option key={category} value={category}>{categoryLabels[category] ?? category}</option>)}</select></label><Typography.Label>Категория чек-листа нужна для проверки и не меняет категорию обращения.</Typography.Label><label>Исполнитель<select value={draft.executorUserId} onChange={(event) => setDraft((current) => ({ ...current, executorUserId: event.target.value }))}><option value="">Выберите исполнителя</option>{workForm?.executors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.executorCompanyName ? ` · ${item.executorCompanyName}` : ''}</option>)}</select></label>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}{confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void confirmation.run()} /> : null}</Panel>;
}

export function ChairmanWorkDetail({ houseId, workId, observationId, onBack }) {
  return observationId ? <ObservationChairmanDetail houseId={houseId} observationId={observationId} onBack={onBack} /> : <LegacyChairmanWorkDetail houseId={houseId} workId={workId} onBack={onBack} />;
}

function LegacyChairmanWorkDetail({ houseId, workId, observationId, onBack }) {
  const [work, setWork] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [draft, setDraft] = useState({ checklistTemplateId: '', assigneeUserId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', description: '', category: '', executorUserId: '' });
  const [confirmation, setConfirmation] = useState(null);
  const reload = useCallback(async () => { setLoading(true); try {
    if (observationId) {
      const detail = await request(`/api/observations/${observationId}`);
      setWork({ ...detail, executor: detail.workflow?.executor ?? detail.linkedWork?.executor, documents: detail.workflow?.documents ?? [] });
      setActivity(detail.history ?? []);
    } else {
      const [detail, events] = await Promise.all([request(`/api/works/${workId}`), allPages(`/api/works/${workId}/activity`)]);
      setWork(detail); setActivity(events.items);
    }
    setError('');
  } catch (failure) { setError(failure.message); } finally { setLoading(false); } }, [workId, observationId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  const openAssign = async () => { try { setForm(await loadInspectionForm(houseId, work.workflow?.category ?? work.category)); } catch (failure) { setError(failure.message); } };
  const openEdit = async () => { try { const options = await loadWorkForm(houseId); setEditForm(options); setEditDraft({ title: work.title, description: work.description, category: work.workflow?.category ?? work.category, executorUserId: String(work.executor?.userId ?? '') }); } catch (failure) { setError(failure.message); } };
  const run = async (operation) => { setBusy(true); setError(''); try { await operation(); hapticSuccess(); setForm(null); await reload(); } catch (failure) { hapticError(); setError(failure.message); if (failure.status === 409) await reload(); } finally { setBusy(false); setConfirmation(null); } };
  const ask = (title, message, operation) => setConfirmation({ title, message, operation });
  return <Panel mode="primary" className="home-panel active-work-details-panel"><PageHeader title="Работа" onBack={onBack} /><main className="panel-content active-work-details-content">{loading ? <LoadingSpinner /> : error && !work ? <ErrorState message={error} onRetry={() => void reload()} /> : work ? <><section className="active-work-details__card"><Typography.Title variant="small-strong">{work.title}</Typography.Title><Typography.Label>{workStatuses[work.status]} · ID {work.id}</Typography.Label><Typography.Body>{work.description}</Typography.Body><Typography.Label>{work.house.address}</Typography.Label><Typography.Label>Исполнитель: {work.executor?.companyName ?? 'Не указан'}</Typography.Label><div className="active-work-details__field"><Typography.Label>Исходное обращение №{observationId ?? work.sourceObservation?.id ?? '—'}</Typography.Label><Typography.Body>{observationId ? `${work.title}: ${work.description}` : work.sourceObservation ? `${work.sourceObservation.title}: ${work.sourceObservation.description}` : 'Эти данные не передаются для работы'}</Typography.Body><PhotoStrip photos={observationId ? work.media : work.sourceObservation?.media ?? []} title={work.title} /></div>{(observationId ? work.actions.assignExecutor : work.actions.edit) ? <Button disabled={busy} mode="secondary" onClick={() => void openEdit()}>Редактировать работу</Button> : null}{work.actions.assignInspector ? <Button disabled={busy} onClick={() => void openAssign()}>Назначить проверку</Button> : null}{work.actions.generateReasonedRefusal ? <Button disabled={busy} onClick={() => ask('Оформить мотивированный отказ?', `Оформить отказ по работе «${work.title}»?`, () => run(() => generateRefusal(workId)))}>Оформить мотивированный отказ</Button> : null}{work.documents.map((document) => <DocumentRow key={document.id} document={document} action={document.actions.confirm ? <Button disabled={busy} onClick={() => ask('Подтвердить акт?', `Подтвердить акт «${document.title}» по работе «${work.title}»?`, () => run(() => confirmChairmanDocument(document.id)))}>Подтвердить акт</Button> : null} />)}{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</section><section className="active-work-details__card"><Typography.Title variant="small-strong">История</Typography.Title>{activity.length ? <ol className="active-work-details__history">{sortHistoryNewestFirst(activity).map((item, index) => <li className={index === 0 ? 'active-work-details__history-current' : undefined} key={item.id}><i /><time>{formatDate(item.createdAt)}</time><span>{observationId ? item.title : `${historyEvents[item.event] ?? item.event} · ${item.actorName ?? 'Система'}${item.actorRole ? ` (${roleLabels[item.actorRole] ?? item.actorRole})` : ''}`}</span></li>)}</ol> : <EmptyState message="История пока пуста." />}</section></> : null}</main>{editForm ? <Modal className="home-access-modal" title="Редактировать работу" onClose={() => setEditForm(null)} actions={<><Button mode="secondary" onClick={() => setEditForm(null)}>Отмена</Button><Button disabled={busy || !editDraft.title.trim() || !editDraft.description.trim() || !editDraft.category || !editDraft.executorUserId} onClick={() => ask('Сохранить изменения?', `Сохранить изменения работы «${work.title}»?`, () => run(async () => { if (observationId) await assignObservationExecutor(observationId, { executorUserId: Number(editDraft.executorUserId), category: editDraft.category }); else await request(`/api/works/${workId}`, jsonRequest('PATCH', { ...editDraft, title: editDraft.title.trim(), description: editDraft.description.trim(), executorUserId: Number(editDraft.executorUserId) })); setEditForm(null); }))}>Сохранить</Button></>}><div className="chairman-form"><label>Название<input value={editDraft.title} readOnly={Boolean(observationId)} maxLength={255} onChange={(event) => setEditDraft((value) => ({ ...value, title: event.target.value }))} /></label><label>Описание<textarea value={editDraft.description} readOnly={Boolean(observationId)} maxLength={10000} onChange={(event) => setEditDraft((value) => ({ ...value, description: event.target.value }))} /></label><label>Категория<select value={editDraft.category} onChange={(event) => setEditDraft((value) => ({ ...value, category: event.target.value }))}>{[...new Set(editForm.templates.map((item) => item.category))].map((category) => <option key={category} value={category}>{categoryLabels[category] ?? category}</option>)}</select></label><label>Исполнитель<select value={editDraft.executorUserId} onChange={(event) => setEditDraft((value) => ({ ...value, executorUserId: event.target.value }))}>{editForm.executors.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.executorCompanyName}</option>)}</select></label></div></Modal> : null}{form ? <Modal className="home-access-modal" title="Назначить проверку" onClose={() => setForm(null)} actions={<><Button mode="secondary" onClick={() => setForm(null)}>Отмена</Button><Button disabled={busy || !draft.checklistTemplateId || !draft.assigneeUserId} onClick={() => ask('Назначить проверку?', `Назначить проверку работы «${work.title}»?`, () => run(() => assignInspection(workId, Number(draft.checklistTemplateId), Number(draft.assigneeUserId))))}>Назначить</Button></>}><div className="chairman-form"><label>Чек-лист<select value={draft.checklistTemplateId} onChange={(event) => setDraft((current) => ({ ...current, checklistTemplateId: event.target.value }))}><option value="">Выберите чек-лист</option>{form.templates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Проверяющий<select value={draft.assigneeUserId} onChange={(event) => setDraft((current) => ({ ...current, assigneeUserId: event.target.value }))}><option value="">Выберите проверяющего</option>{form.members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}{confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void confirmation.operation()} /> : null}</Panel>;
}

function ObservationChairmanDetail({ houseId, observationId, onBack }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assignmentForm, setAssignmentForm] = useState(null);
  const [assignmentDraft, setAssignmentDraft] = useState({ executorUserId: '', category: '' });
  const [inspectionForm, setInspectionForm] = useState(null);
  const [inspectionDraft, setInspectionDraft] = useState({ checklistTemplateId: '', assigneeUserId: '' });
  const [confirmation, setConfirmation] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setDetail(await request(`/api/observations/${observationId}`)); setError(''); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [observationId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  const run = async (operation) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); hapticSuccess(); setConfirmation(null); setAssignmentForm(null); setInspectionForm(null); await reload(); }
    catch (failure) { hapticError(); setConfirmation(null); setError(failure.message); if (failure.status === 409) await reload(); }
    finally { setBusy(false); }
  };
  const ask = (title, message, operation) => setConfirmation({ title, message, operation });
  const openAssignment = async () => {
    setError('');
    try {
      setAssignmentForm(await loadWorkForm(houseId));
      setAssignmentDraft({ executorUserId: String(detail.workflow?.executor?.userId ?? ''), category: detail.workflow?.category ?? '' });
    } catch (failure) { setError(failure.message); }
  };
  const confirmAssignment = () => {
    const executor = assignmentForm.executors.find((item) => String(item.id) === assignmentDraft.executorUserId);
    const company = executor?.executorCompanyName ?? executor?.name ?? 'выбранного исполнителя';
    ask(detail.workflow?.executor ? 'Сменить исполнителя?' : 'Назначить исполнителя?', `${detail.workflow?.executor ? 'Назначить нового исполнителя' : 'Назначить исполнителя'} «${company}» по обращению «${detail.title}»?`, () => assignObservationExecutor(observationId, { executorUserId: Number(assignmentDraft.executorUserId), category: assignmentDraft.category }));
  };
  const openInspection = async () => {
    setError('');
    try { setInspectionForm(await loadInspectionForm(houseId, detail.workflow?.category)); }
    catch (failure) { setError(failure.message); }
  };
  const confirmInspection = () => {
    const person = inspectionForm.members.find((item) => String(item.id) === inspectionDraft.assigneeUserId);
    ask('Назначить проверку?', `Назначить ${person?.name ?? 'выбранного проверяющего'} на проверку обращения «${detail.title}»?`, () => assignInspection(detail.workflow.workId, Number(inspectionDraft.checklistTemplateId), Number(inspectionDraft.assigneeUserId)));
  };
  return <Panel mode="primary" className="home-panel active-work-details-panel observation-details-panel"><PageHeader title="Наблюдение" onBack={onBack} /><main className="panel-content active-work-details-content">{loading && !detail ? <LoadingSpinner /> : error && !detail ? <ErrorState message={error} onRetry={() => void reload()} /> : detail ? <ObservationRoleContent detail={detail} onReload={reload} renderDocumentAction={(document) => document.actions.confirm ? <Button disabled={busy} onClick={() => ask('Подтвердить акт?', `Подтвердить акт «${document.title}» по обращению «${detail.title}»?`, () => confirmChairmanDocument(document.id))}>Подтвердить акт</Button> : null}>
    <section className="active-work-details__card"><Typography.Title variant="small-strong">Действия председателя</Typography.Title>{detail.actions.assignExecutor ? <Button disabled={busy} mode="secondary" onClick={() => void openAssignment()}>{detail.workflow?.executor ? 'Сменить исполнителя' : 'Назначить исполнителя'}</Button> : null}{detail.actions.assignInspector ? <Button disabled={busy} onClick={() => void openInspection()}>Назначить проверку</Button> : null}{detail.actions.generateReasonedRefusal ? <Button disabled={busy} onClick={() => ask('Оформить мотивированный отказ?', `Оформить мотивированный отказ по обращению «${detail.title}»?`, () => generateRefusal(detail.workflow.workId))}>Оформить мотивированный отказ</Button> : null}<Typography.Body>Название и описание обращения здесь не изменяются.</Typography.Body></section>
    <section className="active-work-details__card"><Typography.Title variant="small-strong">Замечания</Typography.Title>{detail.workflow?.issues?.length ? detail.workflow.issues.map((issue) => <article className="active-work-details__field" key={issue.id}><Typography.Title variant="small-strong">{issue.title}</Typography.Title><Typography.Label>{issue.status === 'OPEN' ? 'Открыто' : issue.status === 'REMEDIATION_SUBMITTED' ? 'Устранение на проверке' : 'Устранено'}</Typography.Label><Typography.Body>{issue.description}</Typography.Body><PhotoStrip photos={issue.photos ?? []} title={issue.title} />{issue.remediation ? <><Typography.Label>Устранение</Typography.Label><Typography.Body>{issue.remediation.comment}</Typography.Body><PhotoStrip photos={issue.remediation.photos ?? []} title="Фото устранения" /></> : null}</article>) : <EmptyState message="Замечаний нет." />}</section>
    {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
  </ObservationRoleContent> : null}</main>
    {assignmentForm ? <Modal className="home-access-modal" title={detail?.workflow?.executor ? 'Сменить исполнителя' : 'Назначить исполнителя'} onClose={() => setAssignmentForm(null)} actions={<><Button mode="secondary" disabled={busy} onClick={() => setAssignmentForm(null)}>Отмена</Button><Button disabled={busy || !assignmentDraft.executorUserId || !assignmentDraft.category} onClick={confirmAssignment}>Продолжить</Button></>}><div className="chairman-form"><Typography.Body>Обращение: {detail?.title}</Typography.Body><Typography.Label>Категория обращения: {detail?.category}</Typography.Label><label>Категория чек-листа<select value={assignmentDraft.category} onChange={(event) => setAssignmentDraft((current) => ({ ...current, category: event.target.value }))}><option value="">Выберите категорию чек-листа</option>{[...new Set(assignmentForm.templates.map((item) => item.category))].map((category) => <option key={category} value={category}>{categoryLabels[category] ?? category}</option>)}</select></label><label>Исполнитель<select value={assignmentDraft.executorUserId} onChange={(event) => setAssignmentDraft((current) => ({ ...current, executorUserId: event.target.value }))}><option value="">Выберите исполнителя</option>{assignmentForm.executors.map((person) => <option key={person.id} value={person.id}>{person.name}{person.executorCompanyName ? ` · ${person.executorCompanyName}` : ''}</option>)}</select></label>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}
    {inspectionForm ? <Modal className="home-access-modal" title="Назначить проверку" onClose={() => setInspectionForm(null)} actions={<><Button mode="secondary" disabled={busy} onClick={() => setInspectionForm(null)}>Отмена</Button><Button disabled={busy || !inspectionDraft.checklistTemplateId || !inspectionDraft.assigneeUserId} onClick={confirmInspection}>Продолжить</Button></>}><div className="chairman-form"><label>Чек-лист<select value={inspectionDraft.checklistTemplateId} onChange={(event) => setInspectionDraft((current) => ({ ...current, checklistTemplateId: event.target.value }))}><option value="">Выберите чек-лист</option>{inspectionForm.templates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Проверяющий<select value={inspectionDraft.assigneeUserId} onChange={(event) => setInspectionDraft((current) => ({ ...current, assigneeUserId: event.target.value }))}><option value="">Выберите проверяющего</option>{inspectionForm.members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}
    {confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void run(confirmation.operation)} /> : null}
  </Panel>;
}
