import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, Typography } from '@maxhub/max-ui';
import { PageHeader } from '../components/layout/PageHeader';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/LegacyButton';
import { PhotoStrip } from '../components/common/PhotoStrip';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { allPages, formatDate, historyEvents, jsonRequest, request, roleLabels, uploadPhoto, workStatuses } from './residentApi';
import { hapticError, hapticSuccess } from '../utils/maxFeedback';
import { ObservationRoleContent } from './ObservationRoleContent';
import { ConfirmActionModal } from '../components/ui/ConfirmActionModal';
import { DocumentRow } from '../components/ui/DocumentRow';
import { sortHistoryNewestFirst } from './sortHistory';

export function ExecutorHome({ houseId, houses, onHouseChange }) {
  const [works, setWorks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async (signal) => {
    if (!houseId) { setWorks([]); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await allPages(`/api/houses/${houseId}/observations`, { tab: 'active' }, { signal });
      if (!signal?.aborted) { setWorks(result.items); setError(''); }
    }
    catch (failure) { if (!signal?.aborted) setError(failure.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [houseId]);
  useEffect(() => { const controller = new AbortController(); void Promise.resolve().then(() => reload(controller.signal)); return () => controller.abort(); }, [reload]);
  if (selected) return <ExecutorWorkDetail observationId={selected} onBack={() => { setSelected(null); void reload(); }} />;
  return <Panel mode="primary" className="home-panel"><PageHeader title="Мои работы" /><main className="panel-content"><div className="home-sections"><HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} /><section className="home-active-works"><Typography.Headline className="home-section-title">Назначенные работы</Typography.Headline><div className="home-active-works__list">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : works.length ? works.map((work) => { const photos = work.media?.length ? work.media : work.sourceObservation?.media ?? []; return <article className="home-active-work chairman-work-card" key={work.id} onClick={(event) => { if (!event.target.closest('.chairman-work-card__photos')) setSelected(work.id); }}><div className="home-active-work__head"><Typography.Title variant="small-strong">{work.title}</Typography.Title><Typography.Label>№{work.id}</Typography.Label></div><div className="chairman-work-card__status">{workStatuses[work.status] ?? work.status}</div>{photos.length ? <PhotoGroup photos={photos} title={work.title} className="chairman-work-card__photos" /> : null}<Typography.Label className="chairman-work-card__date">{formatDate(work.date ?? work.createdAt)}</Typography.Label><Typography.Body>{work.description}</Typography.Body></article>; }) : <EmptyState message="Назначенных работ пока нет." />}</div></section></div></main></Panel>;
}

function RemediationForm({ draft, busy, onChange, onSubmit }) {
  const fileRef = useRef(null);
  return <div className="active-work-details__remark">
    <Typography.Label>Как устранено замечание</Typography.Label>
    <textarea aria-label="Как устранено замечание" value={draft.comment} maxLength={10000} disabled={busy} placeholder="Опишите, как устранено замечание" onChange={(event) => onChange({ ...draft, comment: event.target.value })} />
    <input ref={fileRef} className="active-work-details__file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => { onChange({ ...draft, files: Array.from(event.target.files).slice(0, 20) }); event.target.value = ''; }} />
    <Button mode="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>Прикрепить фото</Button>
    {draft.files.length ? <Typography.Label>Выбрано фото: {draft.files.length}</Typography.Label> : null}
    <Button disabled={busy || !draft.comment.trim() || !draft.files.length} onClick={onSubmit}>Отправить устранение</Button>
  </div>;
}

export function ExecutorWorkDetail({ workId, observationId, onBack }) {
  return observationId ? <ObservationExecutorDetail observationId={observationId} onBack={onBack} /> : <LegacyExecutorWorkDetail workId={workId} onBack={onBack} />;
}

function LegacyExecutorWorkDetail({ workId, observationId, onBack }) {
  const [work, setWork] = useState(null);
  const [issues, setIssues] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (observationId) {
        const detail = await request(`/api/observations/${observationId}`);
        const workflowIssues = detail.workflow?.issues ?? [];
        setWork({ ...detail, executor: detail.workflow?.executor ?? detail.linkedWork?.executor, media: detail.media?.length ? detail.media : detail.linkedWork?.media ?? [], documents: detail.workflow?.documents ?? [], actions: { ...detail.actions, reportRemediation: workflowIssues.some((issue) => issue.actions.submitRemediation) } });
        setIssues(workflowIssues.map((issue) => ({ ...issue, evidence: { photos: issue.photos }, remediations: issue.remediation ? [{ id: `${issue.id}-remediation`, comment: issue.remediation.comment, after: issue.remediation.photos }] : [], before: issue.photos })));
        setActivity(detail.history ?? []);
      } else {
        const [detail, problems, events] = await Promise.all([request(`/api/works/${workId}`), allPages(`/api/works/${workId}/issues`), allPages(`/api/works/${workId}/activity`)]);
        setWork(detail); setIssues(problems.items); setActivity(events.items);
      }
      setError('');
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [workId, observationId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  const mutate = async (operation) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); hapticSuccess(); await reload(); }
    catch (failure) { hapticError(); setError(failure.message); if (failure.status === 409) await reload(); }
    finally { setBusy(false); setConfirmation(null); }
  };
  const ask = (title, message, operation) => setConfirmation({ title, message, operation });
  const remediation = (issue) => mutate(async () => {
    const draft = drafts[issue.id];
    const mediaIds = [];
    for (const file of draft.files) mediaIds.push((await uploadPhoto(file)).id);
    await request(`/api/issues/${issue.id}/remediations`, jsonRequest('POST', { comment: draft.comment.trim(), mediaIds }));
    setDrafts((current) => ({ ...current, [issue.id]: { comment: '', files: [] } }));
  });
  return <Panel mode="primary" className="home-panel active-work-details-panel"><PageHeader title="Работа" onBack={onBack} /><main className="panel-content active-work-details-content">{loading ? <LoadingSpinner /> : error && !work ? <ErrorState message={error} onRetry={() => void reload()} /> : work ? <>
    <div className="active-work-details__topbar"><div className="active-work-details__title-status"><Typography.Title variant="small-strong">{work.title}</Typography.Title><span className="active-work-details__status">{workStatuses[work.status] ?? work.status}</span>{work.actions.reportRemediation ? <span className="active-work-details__status active-work-details__status--checking">Вы проверяете</span> : null}</div><Typography.Label>ID {work.id}</Typography.Label></div>
    <section className="active-work-details__card active-work-details__overview">{activity.length ? <div><Typography.Title variant="small-strong">История изменений</Typography.Title><ol className="active-work-details__history">{sortHistoryNewestFirst(activity).map((item, index) => <li className={index === 0 ? 'active-work-details__history-current' : ''} key={item.id}><i /><time>{formatDate(item.createdAt)}</time><span>{observationId ? item.title : `${historyEvents[item.event] ?? item.event} · ${item.actorName ?? 'Система'}${item.actorRole ? ` (${roleLabels[item.actorRole] ?? item.actorRole})` : ''}`}</span></li>)}</ol></div> : null}<div className="active-work-details__main-info"><Typography.Title variant="small-strong">Основная информация</Typography.Title><div className="active-work-details__field"><Typography.Label>Название наблюдения</Typography.Label><Typography.Body>{work.title}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Описание наблюдения</Typography.Label><Typography.Body>{work.description}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>{work.house.address}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Категория</Typography.Label><Typography.Body>{work.category ?? 'Не указана'}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Исполнитель</Typography.Label><Typography.Body>{work.executor?.companyName ?? 'Не указана'}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Исходное обращение</Typography.Label><Typography.Body>{observationId ? `${work.title}: ${work.description}` : work.sourceObservation ? `${work.sourceObservation.title}: ${work.sourceObservation.description}` : 'Эти данные не передаются для работы'}</Typography.Body></div>{work.media?.length || work.sourceObservation?.media?.length ? <div className="active-work-details__photos-section"><Typography.Title variant="small-strong">Фотографии</Typography.Title><PhotoGroup photos={work.media?.length ? work.media : work.sourceObservation.media} title={work.title} className="active-work-details__comment-photo-list" /></div> : null}</div>{work.actions.submitForInspection ? <Button disabled={busy} onClick={() => ask('Передать на проверку?', `Передать работу «${work.title}» на проверку?`, () => mutate(() => request(`/api/works/${workId}/submit-for-inspection`, jsonRequest('POST', {}))))}>Передать на проверку</Button> : null}</section>
    <section className="active-work-details__card"><Typography.Title variant="small-strong">Замечания</Typography.Title>{issues.length ? issues.map((issue) => { const draft = drafts[issue.id] ?? { comment: '', files: [] }; return <article key={issue.id} className="active-work-details__field"><Typography.Title variant="small-strong">{issue.checklistItem?.title ?? issue.title}</Typography.Title><Typography.Label>{issue.status === 'OPEN' ? 'Открыто' : issue.status === 'REMEDIATION_SUBMITTED' ? 'Устранение на проверке' : 'Устранено'}</Typography.Label><Typography.Body>{issue.description}</Typography.Body><Typography.Label>Исходное замечание: {issue.evidence?.comment || 'Фото'}</Typography.Label><PhotoStrip photos={issue.evidence?.photos?.length ? issue.evidence.photos : issue.before} title={issue.title} />{issue.remediations.map((item) => <div key={item.id}><Typography.Label>{item.createdAt ? `Устранение от ${formatDate(item.createdAt)}` : 'Устранение'}</Typography.Label><Typography.Body>{item.comment}</Typography.Body><PhotoStrip photos={item.after} title="Фото устранения" /></div>)}{issue.reinspections.map((item) => <Typography.Label key={item.id}>Повторная проверка: {item.status === 'COMPLETED' ? item.result === 'RESOLVED' ? 'Устранено' : 'Не устранено' : 'Ожидается'}{item.comment ? ` · ${item.comment}` : ''}</Typography.Label>)}{issue.actions.submitRemediation ? <RemediationForm draft={draft} busy={busy} onChange={(next) => setDrafts((current) => ({ ...current, [issue.id]: next }))} onSubmit={() => ask('Отправить устранение?', `Отправить устранение замечания «${issue.title}» по работе «${work.title}»?`, () => remediation(issue))} /> : null}</article>; }) : <EmptyState message="Замечаний нет." />}</section>
    <section className="active-work-details__card"><Typography.Title variant="small-strong">Документы и приёмка</Typography.Title>{work.documents.map((document) => <DocumentRow key={document.id} document={document} action={work.actions.confirmAcceptance && document.actions.confirm ? <Button disabled={busy} onClick={() => ask('Подтвердить акт?', `Подтвердить акт «${document.title}» по работе «${work.title}»?`, () => mutate(() => request(`/api/documents/${document.id}/confirm`, jsonRequest('POST', {}))))}>Подтвердить акт</Button> : null} />)}{!observationId && work.actions.generateAcceptanceAct ? <Button disabled={busy} onClick={() => ask('Сформировать акт?', `Сформировать акт приёмки по работе «${work.title}»?`, () => mutate(() => request(`/api/works/${workId}/documents`, jsonRequest('POST', { type: 'ACCEPTANCE_ACT' }))))}>Сформировать акт приёмки</Button> : null}{observationId ? <Typography.Body>Акт приёмки появится автоматически после завершения проверки и устранения замечаний</Typography.Body> : null}</section>
    <span className="active-work-details__executor-company">Компания: {work.executor?.companyName ?? 'Не указана'}</span>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
  </> : null}</main>{confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void confirmation.operation()} /> : null}</Panel>;
}

function ObservationExecutorDetail({ observationId, onBack }) {
  const [detail, setDetail] = useState(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextDetail = await request(`/api/observations/${observationId}`);
      const nextIssues = nextDetail.workflow?.workId ? await allPages(`/api/works/${nextDetail.workflow.workId}/issues`) : { items: [] };
      setDetail(nextDetail); setIssues(nextIssues.items); setError('');
    }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [observationId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  const run = async (operation) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); hapticSuccess(); setConfirmation(null); await reload(); }
    catch (failure) { hapticError(); setError(failure.message); setConfirmation(null); if (failure.status === 409) await reload(); }
    finally { setBusy(false); }
  };
  const ask = (title, message, operation) => setConfirmation({ title, message, operation });
  const submitRemediation = (issue) => {
    const draft = drafts[issue.id];
    ask('Отправить устранение?', `Отправить устранение замечания «${issue.title}» по обращению «${detail.title}»?`, async () => {
      const mediaIds = [];
      for (const file of draft.files) mediaIds.push((await uploadPhoto(file)).id);
      await request(`/api/issues/${issue.id}/remediations`, jsonRequest('POST', { comment: draft.comment.trim(), mediaIds }));
      setDrafts((current) => ({ ...current, [issue.id]: { comment: '', files: [] } }));
    });
  };
  return <Panel mode="primary" className="home-panel active-work-details-panel observation-details-panel"><PageHeader title="Наблюдение" onBack={onBack} /><main className="panel-content active-work-details-content">{loading && !detail ? <LoadingSpinner /> : error && !detail ? <ErrorState message={error} onRetry={() => void reload()} /> : detail ? <ObservationRoleContent detail={detail} onReload={reload} councilOverview renderDocumentAction={(document) => document.actions.confirm ? <Button disabled={busy} onClick={() => ask('Подтвердить акт?', `Подтвердить акт «${document.title}» по обращению «${detail.title}»?`, () => request(`/api/documents/${document.id}/confirm`, jsonRequest('POST', {})))}>Подтвердить акт</Button> : null}>
    {detail.actions.submitForInspection ? <section className="active-work-details__card"><Button disabled={busy} onClick={() => ask('Передать на проверку?', `Передать обращение «${detail.title}» на проверку?`, () => request(`/api/works/${detail.workflow.workId}/submit-for-inspection`, jsonRequest('POST', {})))}>Передать на проверку</Button></section> : null}
    <section className="active-work-details__card"><Typography.Title variant="small-strong">Замечания</Typography.Title>{issues.length ? issues.map((issue) => { const draft = drafts[issue.id] ?? { comment: '', files: [] }; return <article key={issue.id} className="active-work-details__field"><Typography.Title variant="small-strong">{issue.checklistItem?.title ?? issue.title}</Typography.Title><Typography.Label>{issue.status === 'OPEN' ? 'Открыто' : issue.status === 'REMEDIATION_SUBMITTED' ? 'Устранение на проверке' : 'Устранено'}</Typography.Label>{issue.evidence?.comment ? <div><Typography.Label>Замечание члена совета</Typography.Label><Typography.Body className="observation-details__multiline">{issue.evidence.comment}</Typography.Body></div> : null}{issue.evidence?.photos?.length ? <PhotoGroup photos={issue.evidence.photos} title="Фото замечания члена совета" className="active-work-details__comment-photo-list" /> : null}{issue.remediations?.map((item) => <div key={item.id}><Typography.Label>Как устранено замечание · {formatDate(item.createdAt)}</Typography.Label><Typography.Body className="observation-details__multiline">{item.comment}</Typography.Body>{item.after?.length ? <PhotoGroup photos={item.after} title="Фото устранения" className="active-work-details__comment-photo-list" /> : null}</div>)}{issue.reinspections?.map((item) => <Typography.Label key={item.id}>Повторная проверка: {item.status === 'COMPLETED' ? item.result === 'RESOLVED' ? 'Устранено' : 'Не устранено' : 'Ожидается'}{item.comment ? ` · ${item.comment}` : ''}</Typography.Label>)}{issue.actions?.submitRemediation ? <RemediationForm draft={draft} busy={busy} onChange={(next) => setDrafts((current) => ({ ...current, [issue.id]: next }))} onSubmit={() => submitRemediation(issue)} /> : null}</article>; }) : <EmptyState message="Замечаний нет." />}</section>
    <section className="active-work-details__card"><Typography.Title variant="small-strong">Документы и приёмка</Typography.Title><Typography.Body>Акт приёмки появится автоматически после завершения проверки и устранения замечаний.</Typography.Body></section>
    <span className="active-work-details__executor-company">Компания: {detail.workflow?.executor?.companyName ?? detail.linkedWork?.executor?.companyName ?? 'Не указана'}</span>{error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
  </ObservationRoleContent> : null}</main>{confirmation ? <ConfirmActionModal title={confirmation.title} message={confirmation.message} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void run(confirmation.operation)} /> : null}</Panel>;
}
