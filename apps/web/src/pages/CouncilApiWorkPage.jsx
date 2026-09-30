import { PanelBack } from '../components/layout/PanelBack';
import { Panel, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon12CancelCircleFillRed, Icon24AddCircle, Icon24ChevronDown, Icon24PenOutline } from '@vkontakte/icons';

import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { Button } from '../components/ui/LegacyButton';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { PhotoGallery } from '../components/common/PhotoStrip';
import { sortHistoryNewestFirst } from './sortHistory';
import { Modal } from '../components/ui/Modal';
import { DocumentRow } from '../components/ui/DocumentRow';
import { councilJson, councilRequest, uploadCouncilPhoto } from './councilApi';
import { allPages, formatDate, historyEvents, roleLabels, workStatuses } from './residentApi';
import { hapticError, hapticSuccess } from '../utils/maxFeedback';
import './HomePage.css';
import './ReportProblemPage.css';
import './CouncilApiWorkPage.css';

const answerLabels = { PENDING: 'Не проверено', PASS: 'Соответствует', FAIL: 'Не соответствует' };
function CommentAvatar({ name, photoUrl }) {
  const initials = (name?.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('') || '?').toUpperCase();
  return <span className="observation-comment-avatar" aria-hidden="true">{photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}</span>;
}
const councilChecklistLabels = [
  'Работа выполнена в полном объёме',
  'Результат соответствует описанию работы',
  'Видимых дефектов и повреждений нет',
  'Место проведения работ убрано и безопасно',
];
const reviewLabels = { RESOLVED: 'Устранено', NOT_RESOLVED: 'Не устранено' };
const categoryLabels = { COMMON_AREAS: 'Общие помещения', LIGHTING: 'Освещение', ROOF: 'Кровля', OUTDOOR: 'Придомовая территория' };

function hasRequiredEvidence(item, answer) {
  return answer.result !== 'FAIL' || !item.rules.evidenceRequiredOnFail ||
    (item.rules.commentAllowed && Boolean(answer.comment.trim())) ||
    (item.rules.photosAllowed && answer.photos.length > 0);
}

function initialAnswer(item) {
  return { result: item.answer.result, comment: item.answer.comment ?? '', photos: item.answer.media.map((photo) => ({ id: photo.id, url: photo.url })) };
}

export function PhotoField({ photos, onChange, disabled = false, maxPhotos = 5 }) {
  const photoLimit = Math.min(5, maxPhotos);
  const inputRef = useRef(null);
  const urlsRef = useRef([]);
  const [isEditingPhotos, setEditingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [previewIndex, setPreviewIndex] = useState(null);
  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const addFiles = (files) => {
    setPhotoError(files.length > photoLimit - photos.length ? `Можно прикрепить не более ${photoLimit} фотографий.` : '');
    const added = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024).slice(0, Math.max(0, photoLimit - photos.length)).map((file) => {
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      return { file, url };
    });
    if (added.length) onChange([...photos, ...added]);
  };
  return <div className="council-api__photos">
    {photos.length ? <span className="TypographyLabel_variant_large__6vr">Фотографии</span> : null}
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || photos.length >= photoLimit} hidden onChange={(event) => { addFiles(event.target.files ?? []); event.target.value = ''; }} />
    <div className={`report-problem-photos__list${photos.length ? ' report-problem-photos__list--with-actions' : ''}`}>
      {!photos.length && !disabled ? <button type="button" className="report-problem-photo-add" disabled={photos.length >= photoLimit} aria-label="Добавить фото" onClick={() => inputRef.current?.click()}><Icon24AddCircle /></button> : null}
      {photos.length && !disabled ? <div className="report-problem-photo-actions"><button type="button" className="report-problem-photo-action" disabled={photos.length >= photoLimit} aria-label="Добавить фотографию" onClick={() => inputRef.current?.click()}><Icon24AddCircle /></button><button type="button" className={`report-problem-photo-action${isEditingPhotos ? ' report-problem-photo-action--active' : ''}`} aria-label="Редактировать фотографии" aria-pressed={isEditingPhotos} onClick={() => setEditingPhotos((value) => !value)}><Icon24PenOutline /></button></div> : null}
      <div className="report-problem-photo-list">{photos.map((photo, index) => <div className="report-problem-photo" key={photo.id ?? photo.url}><img src={photo.url} alt={`Фото замечания ${index + 1}`} onClick={() => setPreviewIndex(index)} />{!disabled && isEditingPhotos ? <button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => onChange(photos.filter((value) => value !== photo))}><Icon12CancelCircleFillRed width={20} height={20} /></button> : null}</div>)}</div>
    </div>
    {photoError ? <Typography.Body role="alert">{photoError}</Typography.Body> : null}
    {previewIndex !== null ? <PhotoGallery photos={photos} title="Фото замечания" initialIndex={previewIndex} onClose={() => setPreviewIndex(null)} /> : null}
  </div>;
}

function ResultSelect({ value, onChange, options, disabled = false }) {
  const [open, setOpen] = useState(false);
  const tone = value === 'PASS' || value === 'RESOLVED' ? 'pass' : value === 'FAIL' || value === 'NOT_RESOLVED' ? 'fail' : 'pending';
  return <div className="admin-select council-api__select">
    <button type="button" className={`admin-select__trigger council-work__select--${tone}`} aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}><span>{options[value] ?? answerLabels[value]}</span><Icon24ChevronDown width={20} height={20} /></button>
    {open ? <div className="admin-select__menu" role="listbox">{Object.entries(options).map(([result, label]) => <button key={result} type="button" className="admin-select__option" onClick={() => { onChange(result); setOpen(false); }}>{label}</button>)}</div> : null}
  </div>;
}

function MediaLine({ label, text, photos = [] }) {
  if (!text && !photos.length) return null;
  return <div className="council-api__media-line">
    <Typography.Label className="council-api__field-label">{label}</Typography.Label>
    <div className="council-api__media-content">
      {text ? <Typography.Body className={label === 'Ответ исполнителя' ? 'council-api__executor-message' : undefined}>{text}</Typography.Body> : null}
      {photos.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={photos} title={label} /> : null}
    </div>
  </div>;
}

export function CouncilApiWorkPage({ inspection: task, onBack, onUpdated }) {
  const [detail, setDetail] = useState(null);
  const [work, setWork] = useState(null);
  const [activity, setActivity] = useState([]);
  const [answers, setAnswers] = useState({});
  const [review, setReview] = useState({ result: '', comment: '', photos: [] });
  const [repeatReviews, setRepeatReviews] = useState({});
  const [completedRepeatIds, setCompletedRepeatIds] = useState([]);
  const [reinspectionDetails, setReinspectionDetails] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDecision, setPendingDecision] = useState(null);
  const [decision, setDecision] = useState(null);
  const isRepeat = task.kind === 'reinspection';
  const observationId = task.observation?.id;
  const workStatus = workStatuses[work?.status ?? task.work.status] ?? work?.status ?? task.work.status;
  const isFinalized = task.status === 'COMPLETED' || detail?.status === 'COMPLETED' || Boolean(detail?.dates?.completedAt || detail?.completedAt);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextDetail, nextContext, events] = await Promise.all([
        isRepeat && observationId ? Promise.resolve(null) : councilRequest(isRepeat ? `/api/reinspections/${task.id}` : `/api/inspection-assignments/${task.id}`),
        councilRequest(observationId ? `/api/observations/${observationId}` : `/api/works/${task.work.id}`),
        observationId ? Promise.resolve(null) : allPages(`/api/works/${task.work.id}/activity`),
      ]);
      const nextWork = observationId
        ? isRepeat
          ? { ...nextContext, sourceObservation: nextContext, media: nextContext.media ?? [], category: nextContext.workflow?.category ?? nextContext.category, houseObject: null, executor: nextContext.workflow?.executor, documents: nextContext.workflow?.documents ?? [], comments: nextContext.comments ?? [] }
          : { ...nextDetail.work, status: nextContext.status ?? nextDetail.work.status, documents: nextContext.workflow?.documents ?? [], comments: nextContext.comments ?? [] }
        : nextContext;
      if (isRepeat && observationId) {
        const failedChecks = (nextContext.workflow?.issues ?? []).flatMap((issue) => {
          const latest = (issue.reinspections ?? []).filter((item) => item.status === 'COMPLETED' && item.result === 'NOT_RESOLVED').reduce((current, item) => !current || item.id > current.id ? item : current, null);
          return latest ? [latest] : [];
        });
        const details = await Promise.all(failedChecks.map(async ({ id }) => [id, await councilRequest(`/api/reinspections/${id}`)]));
        setReinspectionDetails(Object.fromEntries(details));
      }
      setDetail(nextDetail ?? nextContext);
      setWork(nextWork);
      setActivity(observationId ? nextContext.history ?? [] : events.items);
      if (!isRepeat) {
        setAnswers(Object.fromEntries(nextDetail.checklist.map((item) => [item.id, initialAnswer(item)])));
      } else if (nextDetail) {
        setReview({ result: nextDetail.result ?? '', comment: nextDetail.comment ?? '', photos: nextDetail.media ?? [] });
      } else {
        setRepeatReviews(Object.fromEntries((nextContext.workflow?.issues ?? []).flatMap((issue) => (issue.reinspections ?? []).filter((item) => nextContext.myTasks?.reinspectionIds?.includes(item.id)).map((item) => [item.id, { result: item.result ?? '', comment: '', photos: [] }]))));
        setCompletedRepeatIds([]);
      }
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [isRepeat, task.id, task.work.id, observationId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const updateAnswer = (id, patch) => {
    setAnswers((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };
  const saveAnswer = async (item, { reload = true } = {}) => {
    const answer = answers[item.id];
    if (!item.rules.allowedResults.includes(answer.result)) { setError('Выберите результат проверки.'); return; }
    if (!hasRequiredEvidence(item, answer)) { setError('Для несоответствия добавьте комментарий или фото.'); return; }
    setBusy(true);
    setError('');
    try {
      const photos = await Promise.all(answer.photos.map(async (photo) => photo.file ? { ...photo, id: (await uploadCouncilPhoto(photo.file)).id, file: undefined } : photo));
      await councilRequest(`/api/inspection-assignments/${task.id}/answers/${item.id}`, councilJson('PUT', { result: answer.result, comment: answer.result === 'FAIL' ? answer.comment.trim() : null, mediaIds: answer.result === 'FAIL' ? photos.map((photo) => photo.id) : [] }));
      if (reload) {
        await load();
        onUpdated?.();
      }
    } catch (failure) { setError(failure.message); if (failure.status === 409) await load(); if (!reload) throw failure; }
    finally { setBusy(false); }
  };
  const complete = async () => {
    setBusy(true);
    setError('');
    try {
      if (isRepeat && observationId) {
        for (const { reinspection } of pendingRepeatIssues) {
          const answer = repeatReviews[reinspection.id];
          const mediaIds = answer.result === 'NOT_RESOLVED' ? await Promise.all(answer.photos.map(async (photo) => photo.id ?? (await uploadCouncilPhoto(photo.file)).id)) : [];
          await councilRequest(`/api/reinspections/${reinspection.id}/complete`, councilJson('POST', { result: answer.result, comment: answer.result === 'NOT_RESOLVED' ? answer.comment.trim() : null, mediaIds }));
          setCompletedRepeatIds((ids) => [...ids, reinspection.id]);
        }
      } else if (isRepeat) {
        const mediaIds = await Promise.all(review.photos.map(async (photo) => photo.id ?? (await uploadCouncilPhoto(photo.file)).id));
        await councilRequest(`/api/reinspections/${task.id}/complete`, councilJson('POST', { result: review.result, comment: review.result === 'NOT_RESOLVED' ? review.comment.trim() : null, mediaIds }));
      } else {
        for (const item of detail.checklist) await saveAnswer(item, { reload: false });
        await councilRequest(`/api/inspection-assignments/${task.id}/complete`, councilJson('POST', {}));
      }
      hapticSuccess();
      await load();
      onUpdated?.();
      return true;
    } catch (failure) { hapticError(); setError(failure.message); if (failure.status === 409 && !(isRepeat && observationId)) await load(); }
    finally { setBusy(false); }
    return false;
  };
  const confirmDecision = async () => {
    const nextDecision = pendingDecision;
    setPendingDecision(null);
    const completed = await complete();
    if (completed) setDecision(nextDecision);
  };
  const confirmAct = async (documentId) => {
    setBusy(true);
    setError('');
    try {
      await councilRequest(`/api/documents/${documentId}/confirm`, councilJson('POST', {}));
      hapticSuccess();
      await load();
    } catch (failure) { hapticError(); setError(failure.message); if (failure.status === 409) await load(); }
    finally { setBusy(false); }
  };

  const hasAllAnswers = !isRepeat && detail?.checklist.length > 0 && detail.checklist.every((item) => ['PASS', 'FAIL'].includes(answers[item.id]?.result) && hasRequiredEvidence(item, answers[item.id]));
  const hasFailAnswer = Object.values(answers).some((answer) => answer.result === 'FAIL');
  const repeatIssues = isRepeat && observationId ? (work?.workflow?.issues ?? []).map((issue) => ({
    issue,
    reinspection: (issue.reinspections ?? []).find((item) => item.status !== 'COMPLETED' && work.myTasks?.reinspectionIds?.includes(item.id)) ?? (issue.reinspections ?? []).reduce((latest, item) => !latest || item.id > latest.id ? item : latest, null),
  })) : [];
  const pendingRepeatIssues = repeatIssues.filter(({ reinspection }) => reinspection && work.myTasks?.reinspectionIds?.includes(reinspection.id) && reinspection.status !== 'COMPLETED' && !completedRepeatIds.includes(reinspection.id));
  const repeatReady = pendingRepeatIssues.length > 0 && pendingRepeatIssues.every(({ reinspection }) => { const answer = repeatReviews[reinspection.id]; return answer?.result === 'RESOLVED' || (answer?.result === 'NOT_RESOLVED' && answer.comment.trim()); });
  const repeatHasRemarks = pendingRepeatIssues.some(({ reinspection }) => repeatReviews[reinspection.id]?.result === 'NOT_RESOLVED');
  const canComplete = isRepeat ? observationId ? repeatReady : Boolean(review.result && (review.result === 'RESOLVED' || review.comment.trim())) : Boolean(hasAllAnswers);

  return <Panel mode="primary" className="home-panel active-work-details-panel council-work-panel">
    <PanelBack onBack={onBack} />
    <main className="panel-content active-work-details-content">
      {loading && !detail ? <LoadingSpinner /> : null}
      {error && !detail ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {error && detail ? <div className="council-api__error" role="alert">{error}</div> : null}
      {detail ? <>
        <header className="active-work-details__head"><div className="active-work-details__title-row"><div className="active-work-details__title-status"><Typography.Title variant="small-strong" className="council-work__title">{work?.title ?? task.work.title}</Typography.Title><div className="active-work-details__status-list"><span className="active-work-details__status">{workStatus}</span>{!isRepeat && task.status !== 'COMPLETED' ? <span className="active-work-details__status active-work-details__status--checking">Вы проверяете</span> : null}</div></div><Typography.Label>ID {task.observation?.id ?? task.work.id}</Typography.Label></div></header>
        {work ? <section className="active-work-details__card">
          <Typography.Title variant="small-strong" className="council-work__section-title">История изменений</Typography.Title>
          <ol className="active-work-details__history">{activity.length ? sortHistoryNewestFirst(activity).map((event, index) => <li className={index === 0 ? 'active-work-details__history-current' : undefined} key={event.id}><i /><time>{formatDate(event.createdAt)}</time><span>{task.observation ? event.title : `${historyEvents[event.event] ?? event.event} · ${event.actorName ?? 'Система'}${event.actorRole ? ` (${roleLabels[event.actorRole] ?? event.actorRole})` : ''}`}</span></li>) : sortHistoryNewestFirst(work.history).map((event, index) => <li className={index === 0 ? 'active-work-details__history-current' : undefined} key={event.id}><i /><time>{formatDate(event.createdAt)}</time><span>{event.details || event.event}</span></li>)}</ol>
          <Typography.Title variant="small-strong" className="council-work__section-title">Основная информация</Typography.Title>
          <div className="active-work-details__field"><Typography.Label>{work.sourceObservation ? 'Название наблюдения' : 'Название работы'}</Typography.Label><Typography.Body>{work.sourceObservation?.title ?? work.title}</Typography.Body></div>
          <div className="active-work-details__field"><Typography.Label>{work.sourceObservation ? 'Описание наблюдения' : 'Описание работы'}</Typography.Label><Typography.Body>{work.sourceObservation?.description ?? work.description}</Typography.Body></div>
          <div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>{work.house.address}</Typography.Body></div>
          <div className="active-work-details__field"><Typography.Label>Объект дома</Typography.Label><Typography.Body>{work.houseObject?.title ?? 'Объект дома в данных обращения не передаётся'}</Typography.Body></div>
          {work.category ? <div className="active-work-details__field"><Typography.Label>Категория</Typography.Label><Typography.Body>{categoryLabels[work.category] ?? work.category}</Typography.Body></div> : null}
          <div className="active-work-details__field"><Typography.Label>Исполнитель</Typography.Label><Typography.Body>{work.executor?.companyName ?? 'Исполнитель не назначен'}</Typography.Body></div>
          {work.sourceObservation?.media?.length || work.media.length ? <div className="active-work-details__photos-section"><Typography.Title variant="small-strong" className="council-work__section-title">Фотографии</Typography.Title><PhotoGroup className="active-work-details__photo-list" photos={work.sourceObservation?.media?.length ? work.sourceObservation.media : work.media} title="Фотографии" /></div> : null}
          <div className="council-api__documents"><Typography.Title variant="small-strong" className="council-work__section-title">Документы</Typography.Title>{work.documents.length ? work.documents.map((document) => <DocumentRow key={document.id} document={document} action={document.actions.confirm ? <Button mode="primary" appearance="themed" size="medium" disabled={busy} onClick={() => void confirmAct(document.id)}>Подтвердить акт</Button> : null} />) : <Typography.Body>Документы пока не сформированы</Typography.Body>}</div>
        </section> : null}
        {isRepeat && observationId ? <section className="active-work-details__card council-work__repeat-review">
          <Typography.Title variant="small-strong" className="council-work__section-title">Повторная проверка</Typography.Title>
          {repeatIssues.map(({ issue, reinspection }, index) => {
            const answer = repeatReviews[reinspection?.id] ?? { result: '', comment: '', photos: [] };
            const completed = !reinspection || reinspection.status === 'COMPLETED' || completedRepeatIds.includes(reinspection.id);
            const canReview = !completed && work.myTasks?.reinspectionIds?.includes(reinspection.id);
            const update = (patch) => setRepeatReviews((current) => ({ ...current, [reinspection.id]: { ...current[reinspection.id], ...patch } }));
            const latestFailed = (issue.reinspections ?? []).filter((item) => item.status === 'COMPLETED' && item.result === 'NOT_RESOLVED').reduce((current, item) => !current || item.id > current.id ? item : current, null);
            const latestRemark = latestFailed && reinspectionDetails[latestFailed.id];
            return <details className="council-api__repeat-card" key={issue.id} defaultOpen={index === 0}>
              <summary><Typography.Title variant="small-strong" className="council-work__section-title">{issue.title}</Typography.Title><Icon24ChevronDown className="council-api__repeat-chevron" width={20} height={20} /></summary>
              <div className="council-work__repeat-item-body council-api__review">
                <MediaLine label="Замечание" text={issue.description} photos={issue.photos ?? []} />
                <MediaLine label="Ответ исполнителя" text={issue.remediation?.comment} photos={issue.remediation?.photos ?? []} />
                {latestRemark ? <MediaLine label="Замечание" text={latestRemark.comment} photos={latestRemark.media ?? []} /> : null}
                {reinspection ? <div className="council-work__repeat-result-row"><Typography.Label className="council-api__field-label">Ваш результат</Typography.Label>{canReview ? <ResultSelect value={answer.result} onChange={(result) => update({ result, photos: result === 'NOT_RESOLVED' ? answer.photos : [] })} options={{ '': 'Выберите вариант', ...reviewLabels }} disabled={busy} /> : <Typography.Body className={reinspection.result === 'RESOLVED' ? 'council-api__result--resolved' : reinspection.result === 'NOT_RESOLVED' ? 'council-api__result--unresolved' : undefined}>{reviewLabels[reinspection.result ?? answer.result] ?? 'Ожидает проверки'}</Typography.Body>}</div> : null}
                {canReview && answer.result === 'NOT_RESOLVED' ? <><label className="council-api__comment"><Typography.Label className="council-api__field-label">Новое замечание</Typography.Label><textarea value={answer.comment} disabled={busy} placeholder="Опишите, что осталось неустранённым" onChange={(event) => update({ comment: event.target.value })} /></label><PhotoField photos={answer.photos} disabled={busy} onChange={(photos) => update({ photos })} /></> : null}
              </div>
            </details>;
          })}
          {pendingRepeatIssues.length ? <div className="council-work__decision-actions"><Button mode="primary" appearance="negative" size="medium" stretched disabled={!repeatReady || !repeatHasRemarks || busy} onClick={() => setPendingDecision('remarks')}>Завершить с замечаниями</Button><Button mode="primary" appearance="themed" size="medium" stretched disabled={!repeatReady || repeatHasRemarks || busy} onClick={() => setPendingDecision('approved')}>Замечаний нет</Button></div> : null}
        </section> : isRepeat ? <section className="active-work-details__card council-work__repeat-review">
          <Typography.Title variant="small-strong" className="council-work__section-title">Повторная проверка</Typography.Title>
          <div className="council-work__repeat-item-body council-api__review">
            <Typography.Title variant="small-strong" className="council-work__section-title">{detail.issue.title}</Typography.Title>
            <MediaLine label="Замечание" text={detail.issue.description} photos={detail.issue.before} />
            <MediaLine label="Ответ исполнителя" text={detail.remediation.comment} photos={detail.remediation.after} />
            <div className="council-work__repeat-result-row"><Typography.Label className="council-api__field-label">Ваш результат</Typography.Label>{detail.actions.complete ? <ResultSelect value={review.result} onChange={(result) => setReview((current) => ({ ...current, result, photos: result === 'NOT_RESOLVED' ? current.photos : [] }))} options={{ '': 'Выберите вариант', ...reviewLabels }} disabled={busy} /> : <Typography.Body>{reviewLabels[detail.result] ?? 'Не проверено'}</Typography.Body>}</div>
            {detail.actions.complete && review.result === 'NOT_RESOLVED' ? <><label className="council-api__comment"><Typography.Label className="council-api__field-label">Новое замечание</Typography.Label><textarea value={review.comment} disabled={busy} placeholder="Опишите, что осталось неустранённым" onChange={(event) => setReview((current) => ({ ...current, comment: event.target.value }))} /></label><PhotoField photos={review.photos} disabled={busy} onChange={(photos) => setReview((current) => ({ ...current, photos }))} /></> : null}
            {!detail.actions.complete && detail.result === 'NOT_RESOLVED' && (review.comment || review.photos.length) ? <div className="active-work-details__field"><Typography.Label className="council-api__field-label">Новое замечание</Typography.Label><Typography.Body>{review.comment}</Typography.Body>{review.photos.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={review.photos} title="Фото повторной проверки" /> : null}</div> : null}
          </div>
          {detail.actions.complete ? <Button mode="primary" appearance="themed" size="medium" stretched disabled={!canComplete || busy} onClick={() => void complete()}>Завершить повторную проверку</Button> : null}
        </section> : <section className="active-work-details__card council-work__checklist-card council-api__checklist-card">
          <Typography.Title variant="small-strong" className="council-work__section-title">Чек-лист проверки</Typography.Title>
          <ul className="council-work__checklist">{detail.checklist.map((item, index) => {
            const answer = answers[item.id];
            const options = Object.fromEntries(item.rules.allowedResults.map((result) => [result, answerLabels[result]]));
            const rowTone = answer.result === 'FAIL' ? 'fail' : answer.result === 'PASS' ? 'pass' : 'pending';
            return <li key={item.id} className={`council-work__checklist-row council-work__checklist-row--${rowTone}`}>
              <div className="council-work__checklist-main"><span className="council-work__checklist-label">{councilChecklistLabels[index] ?? item.title}</span><ResultSelect value={answer.result} onChange={(result) => updateAnswer(item.id, { result, photos: result === 'FAIL' ? answer.photos : [] })} options={options} disabled={!detail.actions.save || busy || Boolean(decision) || isFinalized} /></div>
              {answer.result === 'FAIL' ? <div className="council-work__checklist-details">
                {item.rules.commentAllowed ? <><span className="TypographyLabel_variant_large__6vr">Замечание</span><textarea className="council-api__checklist-textarea" value={answer.comment} maxLength={item.rules.maxCommentLength} disabled={!detail.actions.save || busy || Boolean(decision) || isFinalized} placeholder="Опишите замечание" onChange={(event) => updateAnswer(item.id, { comment: event.target.value })} /></> : null}
                {item.rules.photosAllowed ? <PhotoField photos={answer.photos} maxPhotos={item.rules.maxPhotos} disabled={!detail.actions.save || busy || Boolean(decision) || isFinalized} onChange={(photos) => updateAnswer(item.id, { photos })} /> : null}
              </div> : null}
            </li>;
          })}</ul>
          <div className="council-work__decision-actions"><Button mode="primary" appearance="negative" size="medium" stretched disabled={!(detail.actions.save || detail.actions.complete) || isFinalized || Boolean(decision) || !canComplete || !hasFailAnswer || busy} onClick={() => setPendingDecision('remarks')}>Завершить с замечаниями</Button><Button mode="primary" appearance="themed" size="medium" stretched disabled={!(detail.actions.save || detail.actions.complete) || isFinalized || Boolean(decision) || !canComplete || hasFailAnswer || busy} onClick={() => setPendingDecision('approved')}>Замечаний нет</Button></div>
        </section>}
        {(detail.comments ?? work?.sourceObservation?.comments ?? work?.comments)?.length ? <section className="active-work-details__card active-work-details__remarks"><Typography.Title variant="small-strong" className="council-work__section-title">Комментарии</Typography.Title><div className="active-work-details__comments">{(detail.comments ?? work.sourceObservation?.comments ?? work.comments).map((comment) => <article key={comment.id} className="active-work-details__remark-comment"><header><CommentAvatar name={comment.author?.displayName ?? comment.author?.name ?? comment.authorName} photoUrl={comment.author?.photoUrl ?? comment.author?.avatarUrl} /><span><b>{comment.author?.type === 'EXECUTOR' ? `Исполнитель · ${comment.author.displayName}` : comment.author?.displayName ?? comment.author?.name ?? comment.authorName ?? 'Автор комментария'}</b><small>{comment.createdAt ? formatDate(comment.createdAt) : ''}</small></span></header>{comment.text ?? comment.comment ? <Typography.Body variant="large-strong" className="observation-details__multiline">{comment.text ?? comment.comment}</Typography.Body> : null}{comment.media?.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={comment.media} title="Фото комментария" /> : null}</article>)}</div></section> : null}
      </> : null}
    </main>
    {pendingDecision ? <Modal title={pendingDecision === 'remarks' ? 'Завершить с замечаниями?' : 'Завершить проверку без замечаний?'} onClose={() => setPendingDecision(null)} actions={<><Button mode="secondary" appearance="neutral" size="medium" stretched onClick={() => setPendingDecision(null)}>Отмена</Button><Button mode="primary" appearance="themed" size="medium" stretched disabled={busy} onClick={() => void confirmDecision()}>Подтвердить</Button></>}><Typography.Body className="modal__copy">{isRepeat ? 'Результаты всех замечаний будут отправлены последовательно. Завершённые повторные проверки нельзя изменить.' : 'После подтверждения чек-лист будет сохранён и редактирование станет недоступно.'}</Typography.Body></Modal> : null}
  </Panel>;
}
