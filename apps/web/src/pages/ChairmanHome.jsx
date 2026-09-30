import { PanelBack } from '../components/layout/PanelBack';
import { Avatar, Panel, Typography } from '@maxhub/max-ui';
import { Icon12CancelCircleFillRed, Icon24AddCircle, Icon24ChevronDown, Icon24PenOutline } from '@vkontakte/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { PhotoStrip } from '../components/common/PhotoStrip';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/LegacyButton';
import { Modal } from '../components/ui/Modal';
import { AppSelect } from '../components/ui/AppSelect';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { PhotoGallery } from '../components/common/PhotoStrip';
import { photoPreviewUrl } from '../components/common/photoPreviewUrl';
import { DocumentRow } from '../components/ui/DocumentRow';
import { CouncilHouseChat } from './CouncilHouseChat';
import { allPages, formatDate, historyEvents, jsonRequest, request, roleLabels, uploadPhoto, workStatuses } from './residentApi';
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
  const [photoGallery, setPhotoGallery] = useState(null);
  const [creating, setCreating] = useState(false);
  const [workForm, setWorkForm] = useState(null);
  const [draft, setDraft] = useState({ executorUserId: '', title: '', description: '', category: '', workflowCategory: '' });
  const [confirmation, setConfirmation] = useState(null);
  const [createdObservationId, setCreatedObservationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createPhotos, setCreatePhotos] = useState([]);
  const [photoQueueTick, setPhotoQueueTick] = useState(0);
  const [editingCreatePhotos, setEditingCreatePhotos] = useState(false);
  const createPhotoInput = useRef(null);
  const createPhotosRef = useRef([]);
  const processingCreatePhoto = useRef(false);
  useEffect(() => { createPhotosRef.current = createPhotos; }, [createPhotos]);
  useEffect(() => () => createPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);
  useEffect(() => {
    if (processingCreatePhoto.current) return;
    const next = createPhotos.find((photo) => photo.status === 'queued');
    if (!next) return;
    processingCreatePhoto.current = true;
    void Promise.resolve().then(() => {
      setCreatePhotos((items) => items.map((photo) => photo.id === next.id ? { ...photo, status: 'uploading' } : photo));
      return uploadPhoto(next.file);
    }).then((result) => setCreatePhotos((items) => items.map((photo) => photo.id === next.id ? { ...photo, status: 'uploaded', mediaId: result.id } : photo)))
      .catch((failure) => setCreatePhotos((items) => items.map((photo) => photo.id === next.id ? { ...photo, status: 'error', error: failure.message } : photo)))
      .finally(() => { processingCreatePhoto.current = false; setPhotoQueueTick((value) => value + 1); });
  }, [createPhotos, photoQueueTick]);
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
    try { setCreatedObservationId(null); setCreatePhotos([]); setEditingCreatePhotos(false); setWorkForm(await loadWorkForm(houseId)); setCreating(true); }
    catch (failure) { setError(failure.message); }
  };
  const create = async () => {
    setBusy(true); setError('');
    try {
      const input = { executorUserId: Number(draft.executorUserId), title: draft.title.trim(), description: draft.description.trim(), category: draft.category, workflowCategory: draft.workflowCategory, mediaIds: createPhotos.map((photo) => photo.mediaId) };
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
  const addCreatePhotos = (event) => {
    setError('');
    const files = Array.from(event.target.files ?? []);
    const valid = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024);
    if (valid.length !== files.length) setError('Допустимы JPEG, PNG, WebP до 10 МБ.');
    const available = Math.max(0, 5 - createPhotosRef.current.length);
    if (valid.length > available) setError('Можно прикрепить не более 5 фотографий.');
    const additions = valid.slice(0, available).map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, url: URL.createObjectURL(file), file, status: 'queued', mediaId: null }));
    setCreatePhotos((items) => [...items, ...additions]);
    event.target.value = '';
  };
  const removeCreatePhoto = (id) => {
    const photo = createPhotosRef.current.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    setCreatePhotos((items) => items.filter((item) => item.id !== id));
  };
  if (selectedWorkId) return <ChairmanWorkDetail key={selectedWorkId} houseId={houseId} observationId={selectedWorkId} onBack={() => { setSelectedWorkId(null); void reload(); }} />;
  if (creating) return <Panel mode="primary" className="inner-panel report-problem-panel"><PanelBack onBack={() => setCreating(false)} /><main className="panel-content report-problem-content"><section className="report-problem-card">
    <label className="report-problem-field"><Typography.Label>Название</Typography.Label><input maxLength={255} placeholder="Например, не работает свет у входа" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
    <label className="report-problem-field"><Typography.Label>Описание</Typography.Label><textarea maxLength={10000} rows="3" placeholder="Расскажите подробнее, где и когда возникла проблема" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
    <div className="report-problem-field"><Typography.Label>Категория обращения</Typography.Label><AppSelect value={draft.category} options={observationCategories.map((label) => ({ value: label, label }))} placeholder="Выберите категорию" ariaLabel="Категория обращения" onChange={(category) => setDraft((current) => ({ ...current, category }))} /></div>
    <div className="report-problem-field"><Typography.Label>Категория чек-листа</Typography.Label><AppSelect value={draft.workflowCategory} options={[...new Set(workForm?.templates.map((item) => item.category) ?? [])].map((value) => ({ value, label: categoryLabels[value] ?? value }))} placeholder="Выберите категорию чек-листа" ariaLabel="Категория чек-листа" onChange={(workflowCategory) => setDraft((current) => ({ ...current, workflowCategory }))} /></div>
    <div className="report-problem-field"><Typography.Label>Исполнитель</Typography.Label><AppSelect value={draft.executorUserId} options={(workForm?.executors ?? []).map((item) => ({ value: String(item.id), label: `${item.name}${item.executorCompanyName ? ` · ${item.executorCompanyName}` : ''}` }))} placeholder="Выберите исполнителя" ariaLabel="Исполнитель" onChange={(executorUserId) => setDraft((current) => ({ ...current, executorUserId }))} /></div>
    <div className="report-problem-photos"><Typography.Title variant="small-strong">Фотографии</Typography.Title><input ref={createPhotoInput} className="report-problem-photos__input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addCreatePhotos} /><div className={`report-problem-photos__list${createPhotos.length ? ' report-problem-photos__list--with-actions' : ''}`}>{createPhotos.length ? <div className="report-problem-photo-actions"><button type="button" className="report-problem-photo-action" onClick={() => createPhotoInput.current?.click()} disabled={createPhotos.length >= 5} aria-label="Добавить фотографии"><Icon24AddCircle /></button><button type="button" className={`report-problem-photo-action${editingCreatePhotos ? ' report-problem-photo-action--active' : ''}`} onClick={() => setEditingCreatePhotos((value) => !value)} aria-label="Редактировать фотографии" aria-pressed={editingCreatePhotos}><Icon24PenOutline /></button></div> : null}{createPhotos.map((photo, index) => <div key={photo.id} className="report-problem-photo">{photo.status === 'uploaded' ? <img src={photoPreviewUrl(photo)} alt={`Фото обращения ${index + 1}`} /> : photo.status === 'error' ? <Typography.Label role="alert">Ошибка</Typography.Label> : <LoadingSpinner />}{editingCreatePhotos ? <button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => removeCreatePhoto(photo.id)}><Icon12CancelCircleFillRed width={20} height={20} /></button> : null}</div>)}{!createPhotos.length ? <button type="button" className="report-problem-photo-add" onClick={() => createPhotoInput.current?.click()} aria-label="Добавить фотографии"><Icon24AddCircle /></button> : null}</div></div>
    {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}<Button mode="primary" appearance="themed" size="medium" stretched disabled={busy || createPhotos.some((photo) => photo.status !== 'uploaded') || !draft.executorUserId || !draft.title.trim() || !draft.description.trim() || !draft.category || !draft.workflowCategory} onClick={confirmCreate}>Создать обращение</Button></section></main>{confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void confirmation.run()} /> : null}</Panel>;
  return <Panel mode="primary" className="home-panel">{onBack ? <PanelBack onBack={onBack} /> : null}<main className="panel-content"><div className="home-sections">
    <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
    {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
    {focusJoinRequestId && !loading && !data.requests.some((item) => item.id === focusJoinRequestId) ? <ErrorState message="Заявка уже обработана или недоступна." /> : null}
    <CouncilHouseChat houseId={houseId} house={houses?.find((item) => item.id === houseId)} />
    {!loading && data.requests.length ? <section className="home-active-works"><Typography.Headline className="home-section-title">Заявки жителей</Typography.Headline><div className="home-active-works__list">{data.requests.map((item) => <article className="home-active-work" id={`join-request-${item.id}`} key={item.id}><div className="chairman-request"><Avatar.Container size={40}><Avatar.Image src={item.user.photoUrl} alt="" fallback={(item.user.firstName?.[0] ?? 'Ж') + (item.user.lastName?.[0] ?? '')} /></Avatar.Container><div><Typography.Body>{[item.user.firstName, item.user.lastName].filter(Boolean).join(' ')}</Typography.Body><Typography.Label>Ожидает решения · подана {formatDate(item.requestedAt)}</Typography.Label></div></div><div className="chairman-actions"><Button disabled={busy} onClick={() => setConfirmation({ title: 'Одобрить заявку?', message: `Одобрить заявку ${[item.user.firstName, item.user.lastName].filter(Boolean).join(' ')} на доступ к дому?`, run: () => decide(item.id, 'APPROVE') })}>Одобрить</Button><Button mode="secondary" disabled={busy} onClick={() => setConfirmation({ title: 'Отклонить заявку?', message: `Отклонить заявку ${[item.user.firstName, item.user.lastName].filter(Boolean).join(' ')} на доступ к дому?`, run: () => decide(item.id, 'REJECT') })}>Отклонить</Button></div></article>)}</div></section> : null}
    <section className="home-active-works chairman-works"><Typography.Headline className="home-section-title">Работы дома</Typography.Headline><div className="chairman-create-block"><Button mode="secondary" appearance="themed" size="medium" stretched onClick={() => void openCreate()}>Создать обращение</Button></div><div className="home-active-works__list">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : data.works.map((work) => { const photos = work.media?.length ? work.media : work.sourceObservation?.media ?? []; const status = workStatuses[work.status] ?? work.status; return <article className="home-active-work chairman-work-card" role="button" tabIndex={0} key={work.id} onClick={(event) => { if (!event.target.closest('button, .image-modal-backdrop')) setSelectedWorkId(work.id); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedWorkId(work.id); } }}><div className="home-active-work__head"><Typography.Title variant="small-strong" className="work-card-title">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div><div className="home-active-work__statuses"><span className={work.status === 'ACCEPTED' ? 'home-active-work__status--success' : undefined}>{status}</span></div>{photos.length ? <div className={`home-active-work__photos${photos.length > 2 ? ' home-active-work__photos--scrollable' : ''}`}>{photos.map((photo, index) => <button key={photo.id} type="button" className="media-preview__button" aria-label={`Открыть фото ${index + 1}`} onClick={(event) => { event.stopPropagation(); setPhotoGallery({ photos, title: work.title, index }); }}><img className="media-preview__image" src={photoPreviewUrl(photo)} alt={`${work.title}: фото ${index + 1}`} /></button>)}</div> : null}<Typography.Label className="home-active-work__date">{formatDate(work.date ?? work.createdAt)}</Typography.Label><Typography.Body variant="medium" className="home-active-work__description">{work.description}</Typography.Body></article>; })}{!loading && !error && !data.works.length ? <EmptyState message="Работ пока нет." /> : null}{photoGallery ? <PhotoGallery photos={photoGallery.photos} title={photoGallery.title} initialIndex={photoGallery.index} onClose={() => setPhotoGallery(null)} /> : null}</div></section>
  </div></main>{confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void confirmation.run()} /> : null}</Panel>;
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
  return <Panel mode="primary" className="home-panel active-work-details-panel"><PanelBack onBack={onBack} /><main className="panel-content active-work-details-content">{loading ? <LoadingSpinner /> : error && !work ? <ErrorState message={error} onRetry={() => void reload()} /> : work ? <><section className="active-work-details__card"><Typography.Title variant="small-strong">{work.title}</Typography.Title><Typography.Label>{workStatuses[work.status]} · ID {work.id}</Typography.Label><Typography.Body>{work.description}</Typography.Body><Typography.Label>{work.house.address}</Typography.Label><Typography.Label>Исполнитель: {work.executor?.companyName ?? 'Не указан'}</Typography.Label><div className="active-work-details__field"><Typography.Label>Исходное обращение №{observationId ?? work.sourceObservation?.id ?? '—'}</Typography.Label><Typography.Body>{observationId ? `${work.title}: ${work.description}` : work.sourceObservation ? `${work.sourceObservation.title}: ${work.sourceObservation.description}` : 'Эти данные не передаются для работы'}</Typography.Body>{(observationId ? work.media : work.sourceObservation?.media)?.length ? <PhotoStrip photos={observationId ? work.media : work.sourceObservation.media} title={work.title} /> : null}</div>{(observationId ? work.actions.assignExecutor : work.actions.edit) ? <Button disabled={busy} mode="secondary" onClick={() => void openEdit()}>Редактировать работу</Button> : null}{work.actions.assignInspector ? <Button disabled={busy} onClick={() => void openAssign()}>Назначить проверку</Button> : null}{work.actions.generateReasonedRefusal ? <Button disabled={busy} onClick={() => ask('Оформить мотивированный отказ?', `Оформить отказ по работе «${work.title}»?`, () => run(() => generateRefusal(workId)))}>Оформить мотивированный отказ</Button> : null}{work.documents.map((document) => <DocumentRow key={document.id} document={document} action={document.actions.confirm ? <Button disabled={busy} onClick={() => ask('Подтвердить акт?', `Подтвердить акт «${document.title}» по работе «${work.title}»?`, () => run(() => confirmChairmanDocument(document.id)))}>Подтвердить акт</Button> : null} />)}{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</section><section className="active-work-details__card"><Typography.Title variant="small-strong">История</Typography.Title>{activity.length ? <ol className="active-work-details__history">{sortHistoryNewestFirst(activity).map((item, index) => <li className={index === 0 ? 'active-work-details__history-current' : undefined} key={item.id}><i /><time>{formatDate(item.createdAt)}</time><span>{observationId ? item.title : `${historyEvents[item.event] ?? item.event} · ${item.actorName ?? 'Система'}${item.actorRole ? ` (${roleLabels[item.actorRole] ?? item.actorRole})` : ''}`}</span></li>)}</ol> : <EmptyState message="История пока пуста." />}</section></> : null}</main>{editForm ? <Modal className="home-access-modal" title="Редактировать работу" onClose={() => setEditForm(null)} actions={<><Button mode="secondary" onClick={() => setEditForm(null)}>Отмена</Button><Button disabled={busy || !editDraft.title.trim() || !editDraft.description.trim() || !editDraft.category || !editDraft.executorUserId} onClick={() => ask('Сохранить изменения?', `Сохранить изменения работы «${work.title}»?`, () => run(async () => { if (observationId) await assignObservationExecutor(observationId, { executorUserId: Number(editDraft.executorUserId), category: editDraft.category }); else await request(`/api/works/${workId}`, jsonRequest('PATCH', { ...editDraft, title: editDraft.title.trim(), description: editDraft.description.trim(), executorUserId: Number(editDraft.executorUserId) })); setEditForm(null); }))}>Сохранить</Button></>}><div className="chairman-form"><label>Название<input value={editDraft.title} readOnly={Boolean(observationId)} maxLength={255} onChange={(event) => setEditDraft((value) => ({ ...value, title: event.target.value }))} /></label><label>Описание<textarea value={editDraft.description} readOnly={Boolean(observationId)} maxLength={10000} onChange={(event) => setEditDraft((value) => ({ ...value, description: event.target.value }))} /></label><label>Категория<select value={editDraft.category} onChange={(event) => setEditDraft((value) => ({ ...value, category: event.target.value }))}>{[...new Set(editForm.templates.map((item) => item.category))].map((category) => <option key={category} value={category}>{categoryLabels[category] ?? category}</option>)}</select></label><label>Исполнитель<select value={editDraft.executorUserId} onChange={(event) => setEditDraft((value) => ({ ...value, executorUserId: event.target.value }))}>{editForm.executors.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.executorCompanyName}</option>)}</select></label></div></Modal> : null}{form ? <Modal className="home-access-modal" title="Назначить проверку" onClose={() => setForm(null)} actions={<><Button mode="secondary" onClick={() => setForm(null)}>Отмена</Button><Button disabled={busy || !draft.checklistTemplateId || !draft.assigneeUserId} onClick={() => ask('Назначить проверку?', `Назначить проверку работы «${work.title}»?`, () => run(() => assignInspection(workId, Number(draft.checklistTemplateId), Number(draft.assigneeUserId))))}>Назначить</Button></>}><div className="chairman-form"><label>Чек-лист<select value={draft.checklistTemplateId} onChange={(event) => setDraft((current) => ({ ...current, checklistTemplateId: event.target.value }))}><option value="">Выберите чек-лист</option>{form.templates.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Проверяющий<select value={draft.assigneeUserId} onChange={(event) => setDraft((current) => ({ ...current, assigneeUserId: event.target.value }))}><option value="">Выберите проверяющего</option>{form.members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}{confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void confirmation.operation()} /> : null}</Panel>;
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
  return <Panel mode="primary" className="home-panel active-work-details-panel observation-details-panel chairman-observation-panel"><PanelBack onBack={onBack} /><main className="panel-content active-work-details-content">{loading && !detail ? <LoadingSpinner /> : error && !detail ? <ErrorState message={error} onRetry={() => void reload()} /> : detail ? <ObservationRoleContent detail={detail} onReload={reload} renderDocumentAction={(document) => document.actions.confirm ? <Button className="chairman-observation-panel__confirm-act" stretched disabled={busy} onClick={() => ask('Подтвердить акт?', `Подтвердить акт «${document.title}» по обращению «${detail.title}»?`, () => confirmChairmanDocument(document.id))}>Подтвердить акт</Button> : null}>
    {detail.actions.assignExecutor || detail.actions.assignInspector || detail.actions.generateReasonedRefusal ? <div className="chairman-observation-actions">{detail.actions.assignExecutor ? <Button className="chairman-change-executor" disabled={busy} mode="secondary" onClick={() => void openAssignment()}>{detail.workflow?.executor ? 'Сменить исполнителя' : 'Назначить исполнителя'}</Button> : null}{detail.actions.assignInspector ? <Button disabled={busy} onClick={() => void openInspection()}>Назначить проверку</Button> : null}{detail.actions.generateReasonedRefusal ? <Button disabled={busy} onClick={() => ask('Оформить мотивированный отказ?', `Оформить мотивированный отказ по обращению «${detail.title}»?`, () => generateRefusal(detail.workflow.workId))}>Оформить мотивированный отказ</Button> : null}</div> : null}
    {detail.workflow?.issues?.length ? <section className="active-work-details__card council-work__checklist-card chairman-observation-issues"><Typography.Title variant="small-strong" className="council-work__section-title">Замечания</Typography.Title><ul className="council-work__checklist">{detail.workflow.issues.map((issue, index) => <li key={issue.id} className="council-work__checklist-row executor-issue-row"><details className="council-api__repeat-card executor-issue-accordion" open={index === 0}><summary><Typography.Title variant="small-strong" className="council-work__checklist-label council-work__section-title">{issue.checklistItem?.title ?? issue.title}</Typography.Title>{issue.status !== 'OPEN' && issue.status !== 'RESOLVED' && issue.status !== 'REMEDIATION_SUBMITTED' ? <span className="executor-issue-accordion__status">{issue.status}</span> : null}<Icon24ChevronDown className="council-api__repeat-chevron" width={20} height={20} /></summary><div className="council-work__repeat-item-body council-api__review council-work__checklist-details">{issue.checklistItem?.description ? <Typography.Body>{issue.checklistItem.description}</Typography.Body> : null}{issue.evidence?.comment ? <span className="council-work__checklist-label observation-details__multiline">{issue.evidence.comment}</span> : issue.description ? <span className="council-work__checklist-label observation-details__multiline">{issue.description}</span> : null}{issue.evidence?.photos?.length ? <PhotoGroup photos={issue.evidence.photos} title="Фото замечания" className="active-work-details__comment-photo-list" /> : issue.photos?.length ? <PhotoGroup photos={issue.photos} title="Фото замечания" className="active-work-details__comment-photo-list" /> : null}{issue.remediations?.map((item) => <div key={item.id} className="observation-issue__response"><div className="observation-issue__response-head"><Typography.Title variant="small-strong" className="active-work-details__section-title">Ответ исполнителя</Typography.Title></div><span className="council-work__checklist-label observation-details__multiline">{item.comment}</span>{item.after?.length ? <PhotoGroup photos={item.after} title="Фото устранения" className="active-work-details__comment-photo-list" /> : null}</div>)}</div></details></li>)}</ul></section> : null}
    {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
  </ObservationRoleContent> : null}</main>
    {assignmentForm ? <Modal className="home-access-modal chairman-assignment-modal" title={detail?.workflow?.executor ? 'Сменить исполнителя' : 'Назначить исполнителя'} onClose={() => setAssignmentForm(null)} actions={<><Button mode="secondary" disabled={busy} onClick={() => setAssignmentForm(null)}>Отмена</Button><Button disabled={busy || !assignmentDraft.executorUserId || !assignmentDraft.category} onClick={confirmAssignment}>Продолжить</Button></>}><div className="chairman-form chairman-assignment-form"><label><span>Название обращения</span><input value={detail?.title ?? ''} disabled readOnly /></label><label><span>Описание обращения</span><textarea value={detail?.description ?? ''} disabled readOnly rows="3" /></label><label><span>Категория обращения</span><input value={detail?.category ?? ''} disabled readOnly /></label><div className="report-problem-field"><Typography.Label>Категория чек-листа</Typography.Label><AppSelect value={assignmentDraft.category} options={[...new Set(assignmentForm.templates.map((item) => item.category))].map((value) => ({ value, label: categoryLabels[value] ?? value }))} placeholder="Выберите категорию чек-листа" ariaLabel="Категория чек-листа" onChange={(category) => setAssignmentDraft((current) => ({ ...current, category }))} /></div><div className="report-problem-field"><Typography.Label>Исполнитель</Typography.Label><AppSelect value={assignmentDraft.executorUserId} options={assignmentForm.executors.map((person) => ({ value: String(person.id), label: `${person.name}${person.executorCompanyName ? ` · ${person.executorCompanyName}` : ''}` }))} placeholder="Выберите исполнителя" ariaLabel="Исполнитель" onChange={(executorUserId) => setAssignmentDraft((current) => ({ ...current, executorUserId }))} /></div>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}
    {inspectionForm ? <Modal className="home-access-modal chairman-assignment-modal" title="Назначить проверку" onClose={() => setInspectionForm(null)} actions={<><Button mode="secondary" disabled={busy} onClick={() => setInspectionForm(null)}>Отмена</Button><Button disabled={busy || !inspectionDraft.checklistTemplateId || !inspectionDraft.assigneeUserId} onClick={confirmInspection}>Продолжить</Button></>}><div className="chairman-form chairman-assignment-form"><div className="report-problem-field"><Typography.Label>Чек-лист</Typography.Label><AppSelect value={inspectionDraft.checklistTemplateId} options={inspectionForm.templates.map((item) => ({ value: String(item.id), label: item.title }))} placeholder="Выберите чек-лист" ariaLabel="Чек-лист" onChange={(checklistTemplateId) => setInspectionDraft((current) => ({ ...current, checklistTemplateId }))} /></div><div className="report-problem-field"><Typography.Label>Проверяющий</Typography.Label><AppSelect value={inspectionDraft.assigneeUserId} options={inspectionForm.members.map((item) => ({ value: String(item.id), label: item.name }))} placeholder="Выберите проверяющего" ariaLabel="Проверяющий" onChange={(assigneeUserId) => setInspectionDraft((current) => ({ ...current, assigneeUserId }))} /></div>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}</div></Modal> : null}
    {confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void run(confirmation.operation)} /> : null}
  </Panel>;
}
