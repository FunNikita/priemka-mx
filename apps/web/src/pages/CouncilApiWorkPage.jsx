import { Panel, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon24AddCircle, Icon24ChevronDown } from '@vkontakte/icons';

import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/LegacyButton';
import { ImagePreview } from '../components/ui/ImagePreview';
import { councilJson, councilRequest, uploadCouncilPhoto } from './councilApi';
import './HomePage.css';
import './CouncilApiWorkPage.css';

const answerLabels = { PENDING: 'Не проверено', PASS: 'Соответствует', FAIL: 'Не соответствует', UNABLE_TO_CHECK: 'Невозможно проверить' };
const reviewLabels = { RESOLVED: 'Устранено', NOT_RESOLVED: 'Не устранено' };

function initialAnswer(item) {
  return { result: item.answer.result, comment: item.answer.comment ?? '', photos: item.answer.media.map((photo) => ({ id: photo.id, url: photo.url })) };
}

function PhotoField({ photos, onChange, disabled = false }) {
  const inputRef = useRef(null);
  const urlsRef = useRef([]);
  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const addFiles = (files) => {
    const added = Array.from(files).slice(0, 10 - photos.length).map((file) => {
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      return { file, url };
    });
    if (added.length) onChange([...photos, ...added]);
  };
  return <div className="council-api__photos">
    <Typography.Label>Фотографии</Typography.Label>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled} hidden onChange={(event) => { addFiles(event.target.files ?? []); event.target.value = ''; }} />
    <div className="council-api__photo-row">
      {!disabled && photos.length < 10 ? <button type="button" className="report-problem-photo-add" aria-label="Добавить фотографии" onClick={() => inputRef.current?.click()}><Icon24AddCircle /></button> : null}
      {photos.map((photo, index) => <div className="council-api__photo" key={photo.id ?? photo.url}><ImagePreview src={photo.url} title={`Фото ${index + 1}`} />{!disabled ? <button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => onChange(photos.filter((value) => value !== photo))}>×</button> : null}</div>)}
    </div>
  </div>;
}

function ResultSelect({ value, onChange, options, disabled = false }) {
  const [open, setOpen] = useState(false);
  const tone = value === 'PASS' || value === 'RESOLVED' ? 'pass' : value === 'FAIL' || value === 'NOT_RESOLVED' ? 'fail' : 'pending';
  return <div className="admin-select council-api__select">
    <button type="button" className={`admin-select__trigger council-work__select--${tone}`} aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}><span>{options[value]}</span><Icon24ChevronDown width={20} height={20} /></button>
    {open ? <div className="admin-select__menu" role="listbox">{Object.entries(options).map(([result, label]) => <button key={result} type="button" className="admin-select__option" onClick={() => { onChange(result); setOpen(false); }}>{label}</button>)}</div> : null}
  </div>;
}

function MediaLine({ label, text, photos = [] }) {
  if (!text && !photos.length) return null;
  return <div className="council-api__media-line">
    {photos.length ? <div className="active-work-details__comment-photo-list">{photos.map((photo, index) => <ImagePreview key={photo.id} src={photo.url} title={`${label}: фото ${index + 1}`} />)}</div> : null}
    <div className="council-work__repeat-stage"><Typography.Label>{label}</Typography.Label><Typography.Body>{text}</Typography.Body></div>
  </div>;
}

export function CouncilApiWorkPage({ inspection: task, onBack, onUpdated }) {
  const [detail, setDetail] = useState(null);
  const [work, setWork] = useState(null);
  const [answers, setAnswers] = useState({});
  const [dirty, setDirty] = useState([]);
  const [review, setReview] = useState({ result: '', comment: '', photos: [] });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isRepeat = task.kind === 'reinspection';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextDetail, nextWork, issues] = await Promise.all([
        councilRequest(isRepeat ? `/api/reinspections/${task.id}` : `/api/inspection-assignments/${task.id}`),
        councilRequest(`/api/works/${task.work.id}`),
        isRepeat ? councilRequest(`/api/works/${task.work.id}/issues`) : Promise.resolve(null),
      ]);
      setDetail(nextDetail);
      setWork(nextWork);
      if (!isRepeat) {
        setAnswers(Object.fromEntries(nextDetail.checklist.map((item) => [item.id, initialAnswer(item)])));
        setDirty([]);
      } else {
        const saved = issues?.items.find((issue) => issue.id === nextDetail.issue.id)?.reinspections.find((item) => item.id === task.id);
        setReview({ result: nextDetail.result ?? '', comment: saved?.comment ?? '', photos: [] });
      }
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [isRepeat, task.id, task.work.id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const updateAnswer = (id, patch) => {
    setAnswers((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    setDirty((current) => current.includes(id) ? current : [...current, id]);
  };
  const saveAnswer = async (item) => {
    const answer = answers[item.id];
    if (answer.result === 'FAIL' && (!answer.comment.trim() || !answer.photos.length)) { setError('Для несоответствия нужны замечание и фотография.'); return; }
    if (answer.result === 'UNABLE_TO_CHECK' && !answer.comment.trim()) { setError('Укажите причину, по которой пункт невозможно проверить.'); return; }
    setBusy(true);
    setError('');
    try {
      const photos = await Promise.all(answer.photos.map(async (photo) => photo.file ? { ...photo, id: (await uploadCouncilPhoto(photo.file)).id, file: undefined } : photo));
      await councilRequest(`/api/inspection-assignments/${task.id}/answers/${item.id}`, councilJson('PUT', { result: answer.result, comment: answer.result === 'FAIL' || answer.result === 'UNABLE_TO_CHECK' ? answer.comment.trim() : null, mediaIds: answer.result === 'FAIL' ? photos.map((photo) => photo.id) : [] }));
      setAnswers((current) => ({ ...current, [item.id]: { ...answer, photos } }));
      setDirty((current) => current.filter((id) => id !== item.id));
      setDetail((current) => ({ ...current, status: current.status === 'ASSIGNED' ? 'IN_PROGRESS' : current.status }));
      onUpdated?.();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    setBusy(true);
    setError('');
    try {
      if (isRepeat) {
        const mediaIds = await Promise.all(review.photos.map(async (photo) => photo.id ?? (await uploadCouncilPhoto(photo.file)).id));
        await councilRequest(`/api/reinspections/${task.id}/complete`, councilJson('POST', { result: review.result, comment: review.result === 'NOT_RESOLVED' ? review.comment.trim() : null, mediaIds }));
      } else await councilRequest(`/api/inspection-assignments/${task.id}/complete`, councilJson('POST', {}));
      await load();
      onUpdated?.();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const confirmAct = async (documentId) => {
    setBusy(true);
    setError('');
    try {
      await councilRequest(`/api/documents/${documentId}/confirm`, councilJson('POST', {}));
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const hasAllAnswers = !isRepeat && detail?.checklist.length > 0 && detail.checklist.every((item) => ['PASS', 'FAIL'].includes(answers[item.id]?.result) && (answers[item.id]?.result !== 'FAIL' || (answers[item.id].comment.trim() && answers[item.id].photos.length)));
  const canComplete = isRepeat ? Boolean(review.result && (review.result === 'RESOLVED' || review.comment.trim())) : hasAllAnswers && !dirty.length;

  return <Panel mode="primary" className="home-panel active-work-details-panel council-work-panel">
    <PageHeader title="Работа" onBack={onBack} />
    <main className="panel-content active-work-details-content">
      {loading && !detail ? <Typography.Body>Загрузка проверки…</Typography.Body> : null}
      {error ? <div className="council-api__error" role="alert">{error}</div> : null}
      {!detail && !loading ? <Button mode="secondary" onClick={() => void load()}>Повторить</Button> : null}
      {detail ? <>
        <header className="active-work-details__head"><div className="active-work-details__title-row"><Typography.Title variant="small-strong" className="council-work__title">{work?.title ?? task.work.title}</Typography.Title><Typography.Label>ID {task.work.id}</Typography.Label></div></header>
        {work ? <section className="active-work-details__card">
          <Typography.Title variant="small-strong" className="council-work__section-title">История изменений</Typography.Title>
          <ol className="active-work-details__history">{work.history.map((event, index) => <li key={event.id} className={index === work.history.length - 1 ? 'active-work-details__history-current' : undefined}><i /><time>{new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(event.createdAt))}</time><span>{event.details || event.event}</span></li>)}</ol>
          <Typography.Title variant="small-strong" className="council-work__section-title">Основная информация</Typography.Title>
          <div className="active-work-details__field"><Typography.Label>Название работы</Typography.Label><Typography.Body>{work.title}</Typography.Body></div>
          <div className="active-work-details__field"><Typography.Label>Описание работы</Typography.Label><Typography.Body>{work.description}</Typography.Body></div>
          <div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>{work.house.address}</Typography.Body></div>
          {work.houseObject ? <div className="active-work-details__field"><Typography.Label>Объект дома</Typography.Label><Typography.Body>{work.houseObject.title}</Typography.Body></div> : null}
          {work.media.length ? <div className="active-work-details__photos-section"><Typography.Title variant="small-strong" className="council-work__section-title">Фотографии</Typography.Title><div className="active-work-details__photo-list">{work.media.map((photo, index) => <ImagePreview key={photo.id} src={photo.url} title={`Фото работы ${index + 1}`} />)}</div></div> : null}
          {work.documents.length ? <div className="council-api__documents"><Typography.Title variant="small-strong" className="council-work__section-title">Документы</Typography.Title>{work.documents.map((document) => <div className="council-api__document" key={document.id}><a href={document.fileUrl} target="_blank" rel="noreferrer">{document.title}</a>{document.actions.confirm ? <Button mode="primary" appearance="themed" size="medium" disabled={busy} onClick={() => void confirmAct(document.id)}>Подтвердить акт</Button> : null}</div>)}</div> : null}
        </section> : null}
        {isRepeat ? <section className="active-work-details__card council-work__repeat-review">
          <Typography.Title variant="small-strong" className="council-work__section-title">Повторная проверка</Typography.Title>
          <div className="council-work__repeat-item-body council-api__review">
            <MediaLine label="Замечание" text={detail.issue.description} photos={detail.issue.before} />
            <MediaLine label="Ответ исполнителя" text={detail.remediation.comment} photos={detail.remediation.after} />
            <div className="council-work__repeat-result-row"><Typography.Label>Ваш результат</Typography.Label>{detail.actions.complete ? <ResultSelect value={review.result} onChange={(result) => setReview((current) => ({ ...current, result, photos: result === 'NOT_RESOLVED' ? current.photos : [] }))} options={{ '': 'Выберите результат', ...reviewLabels }} disabled={busy} /> : <Typography.Body>{reviewLabels[detail.result] ?? 'Не проверено'}</Typography.Body>}</div>
            {detail.actions.complete && review.result === 'NOT_RESOLVED' ? <><label className="council-api__comment"><Typography.Label>Новое замечание</Typography.Label><textarea value={review.comment} disabled={busy} placeholder="Опишите, что осталось неустранённым" onChange={(event) => setReview((current) => ({ ...current, comment: event.target.value }))} /></label><PhotoField photos={review.photos} disabled={busy} onChange={(photos) => setReview((current) => ({ ...current, photos }))} /></> : null}
            {!detail.actions.complete && detail.result === 'NOT_RESOLVED' && review.comment ? <div className="active-work-details__field"><Typography.Label>Новое замечание</Typography.Label><Typography.Body>{review.comment}</Typography.Body></div> : null}
          </div>
          {detail.actions.complete ? <Button mode="primary" appearance="themed" size="medium" stretched disabled={!canComplete || busy} onClick={() => void complete()}>Завершить повторную проверку</Button> : null}
        </section> : <section className="active-work-details__card council-work__checklist-card">
          <Typography.Title variant="small-strong" className="council-work__section-title">Чек-лист проверки</Typography.Title>
          <ul className="council-work__checklist">{detail.checklist.map((item) => { const answer = answers[item.id]; return <li key={item.id} className="council-work__checklist-row"><div className="council-work__checklist-main"><span className="council-work__checklist-label">{item.title}</span><ResultSelect value={answer.result} onChange={(result) => updateAnswer(item.id, { result, photos: result === 'FAIL' ? answer.photos : [] })} options={answerLabels} disabled={!detail.actions.save || busy} /></div>{answer.result === 'FAIL' || answer.result === 'UNABLE_TO_CHECK' ? <div className="council-work__checklist-details"><label className="council-api__comment"><Typography.Label>Замечание</Typography.Label><textarea value={answer.comment} disabled={!detail.actions.save || busy} placeholder="Опишите замечание" onChange={(event) => updateAnswer(item.id, { comment: event.target.value })} /></label>{answer.result === 'FAIL' ? <PhotoField photos={answer.photos} disabled={!detail.actions.save || busy} onChange={(photos) => updateAnswer(item.id, { photos })} /> : null}</div> : null}{detail.actions.save && dirty.includes(item.id) ? <Button mode="secondary" appearance="themed" size="medium" disabled={busy} onClick={() => void saveAnswer(item)}>Сохранить пункт</Button> : null}</li>; })}</ul>
          {detail.actions.complete ? <Button mode="primary" appearance="themed" size="medium" stretched disabled={!canComplete || busy} onClick={() => void complete()}>Завершить проверку</Button> : null}
        </section>}
        {work?.representative ? <section className="active-work-details__card active-work-details__related-card"><Typography.Title variant="small-strong" className="council-work__section-title">Связанные люди с работой</Typography.Title><div className="active-work-details__field"><Typography.Label>Представитель исполнителя</Typography.Label><Typography.Body>{work.representative.name}</Typography.Body></div><div className="active-work-details__person-actions">{work.representative.maxUrl ? <Button mode="secondary" appearance="themed" size="medium" onClick={() => window.open(work.representative.maxUrl, '_blank', 'noopener,noreferrer')}>Написать</Button> : null}{work.representative.phone ? <Button mode="primary" appearance="themed" size="medium" onClick={() => { window.location.href = `tel:${work.representative.phone}`; }}>Позвонить</Button> : null}</div></section> : null}
      </> : null}
    </main>
  </Panel>;
}
