import { PanelBack } from '../components/layout/PanelBack';
import { hapticError, hapticSuccess } from '../utils/maxFeedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, Typography } from '@maxhub/max-ui';
import { Icon12CancelCircleFillRed, Icon24AddCircle, Icon24Attach, Icon24PenOutline } from '@vkontakte/icons';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Button, IconButton } from '../components/ui/LegacyButton';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { formatDate, jsonRequest, observationStatusLabel, request, uploadPhoto } from './residentApi';
import { assignObservationExecutor, loadWorkForm } from './chairmanApi';
import { DocumentRow } from '../components/ui/DocumentRow';
import { sortHistoryNewestFirst } from './sortHistory';
import './ReportProblemPage.css';

function normalizeParagraphs(value) {
  return String(value ?? '').replace(/\n{3,}/g, '\n\n');
}

function CommentAvatar({ name, photoUrl }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const initials = (name?.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('') || '?').toUpperCase();
  const showPhoto = Boolean(photoUrl && photoUrl !== failedUrl);

  return <span className="observation-comment-avatar" aria-hidden="true">
    {showPhoto ? <img src={photoUrl} alt="" onError={() => setFailedUrl(photoUrl)} /> : <span>{initials}</span>}
  </span>;
}


export function ObservationDetail({ observationId, onBack }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [isEditingPhotos, setEditingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef(null);
  const [form, setForm] = useState(null);
  const [workDraft, setWorkDraft] = useState({ title: '', description: '', category: '', executorUserId: '' });
  const reload = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      setDetail(await request(`/api/observations/${observationId}`)); setError('');
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [observationId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  const mutate = async (operation, refreshSilently = false) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); hapticSuccess(); await reload(!refreshSilently); }
    catch (failure) { hapticError(); setError(failure.message); if (failure.status === 409) await reload(!refreshSilently); }
    finally { setBusy(false); }
  };
  const openCreate = async () => {
    setBusy(true);
    try { setForm(await loadWorkForm(detail.house.id)); setWorkDraft({ title: detail.title, description: detail.description, category: detail.category, executorUserId: '' }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const create = () => mutate(async () => {
    await assignObservationExecutor(observationId, { executorUserId: Number(workDraft.executorUserId), ...(workDraft.category !== detail.category ? { category: workDraft.category } : {}) });
    setForm(null);
  });
  const comment = () => mutate(async () => {
    const mediaIds = [];
    for (const file of files) mediaIds.push((await uploadPhoto(file)).id);
    await request(`/api/observations/${observationId}/comments`, jsonRequest('POST', { text: draft.trim(), mediaIds }));
    setDraft(''); setFiles([]); setFilePreviews([]);
  }, true);
  const addFiles = (event) => {
    const chosen = Array.from(event.target.files);
    setPhotoError(chosen.length > 5 - files.length ? 'Можно прикрепить не более 5 фотографий.' : '');
    const selected = chosen.slice(0, Math.max(0, 5 - files.length));
    setFiles((items) => [...items, ...selected]);
    setFilePreviews((items) => [...items, ...selected.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    event.target.value = '';
  };
  const removeFile = (index) => {
    const preview = filePreviews[index];
    if (preview) URL.revokeObjectURL(preview.url);
    setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setFilePreviews((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };
  const executor = detail?.workflow?.executor ?? detail?.linkedWork?.executor;
  const history = detail?.history ?? [];
  const comments = detail?.comments ?? [];
  return <Panel mode="primary" className="home-panel active-work-details-panel observation-details-panel"><PanelBack onBack={onBack} /><main className="panel-content active-work-details-content">
    {loading ? <LoadingSpinner /> : error && !detail ? <ErrorState message={error} onRetry={() => void reload()} /> : detail ? <>
      <header className="active-work-details__head"><div className="active-work-details__title-row"><div className="active-work-details__title-status"><Typography.Title variant="small-strong" className="active-work-details__main-title">{detail.title}</Typography.Title><div className="active-work-details__status-list"><span className="active-work-details__status">{observationStatusLabel(detail)}</span>{detail.isWatching && detail.watchReason !== 'AUTHOR' ? <span className="active-work-details__status active-work-details__status--observed">Вы наблюдаете</span> : null}</div></div><Typography.Label>ID {detail.id}</Typography.Label></div></header>
      <section className="active-work-details__card"><Typography.Title variant="small-strong" className="active-work-details__section-title">История изменений</Typography.Title>{history.length ? <ol className="active-work-details__history">{sortHistoryNewestFirst(history).map((item) => <li key={item.id}><i /><time>{formatDate(item.createdAt)}</time><span>{item.title}</span></li>)}</ol> : <EmptyState message="История пока пуста." />}
        <Typography.Title variant="small-strong" className="active-work-details__section-title">Основная информация</Typography.Title>
        <div className="active-work-details__field"><Typography.Label>Название наблюдения</Typography.Label><Typography.Body>{detail.title}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Описание наблюдения</Typography.Label><Typography.Body className="observation-details__multiline">{normalizeParagraphs(detail.description)}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>{detail.house.address}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Категория</Typography.Label><Typography.Body>{detail.category}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Исполнитель</Typography.Label><Typography.Body>{executor?.companyName ?? 'Не указан'}</Typography.Body></div>
        {detail.media.length ? <div className="active-work-details__photos-section"><Typography.Title variant="small-strong" className="active-work-details__section-title">Фотографии</Typography.Title><PhotoGroup className="active-work-details__photo-list" photos={detail.media} title={detail.title} /></div> : null}
        {detail.workflow?.documents?.length ? <><Typography.Title variant="small-strong" className="active-work-details__section-title">Документы</Typography.Title>{detail.workflow.documents.map((doc) => <DocumentRow key={doc.id} document={doc} />)}</> : null}
      </section>
      {detail.linkedWork ? null : detail.actions.createWork ? <Button disabled={busy} onClick={() => void openCreate()}>Создать работу</Button> : null}
      <section className="active-work-details__card active-work-details__remarks"><Typography.Title variant="small-strong" className="active-work-details__section-title">Комментарии</Typography.Title>{detail.actions.comment ? <><div className="active-work-details__remark"><textarea aria-label="Текст комментария" value={draft} maxLength={10000} onChange={(event) => setDraft(event.target.value)} placeholder="Введите комментарий" /><input ref={fileRef} className="active-work-details__file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} />{filePreviews.length ? <div className="report-problem-photos"><Typography.Label>Фотографии</Typography.Label><div className="report-problem-photos__list report-problem-photos__list--with-actions">{filePreviews.length ? <div className="report-problem-photo-actions"><button type="button" className="report-problem-photo-action" aria-label="Добавить фотографии к комментарию" disabled={busy || files.length >= 5} onClick={() => fileRef.current?.click()}><Icon24AddCircle /></button><button type="button" className="report-problem-photo-action" aria-label="Редактировать фотографии комментария" aria-pressed={isEditingPhotos} onClick={() => setEditingPhotos((value) => !value)}><Icon24PenOutline /></button></div> : null}<div className="report-problem-photo-list">{filePreviews.map((preview, index) => <div className="report-problem-photo" key={`${preview.file.name}-${index}`}><img src={preview.url} alt={preview.file.name} /><button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => removeFile(index)}><Icon12CancelCircleFillRed width={20} height={20} /></button></div>)}</div></div></div> : null}</div>{photoError ? <Typography.Body role="alert">{photoError}</Typography.Body> : null}<div className="active-work-details__comment-actions"><Button className="active-work-details__add-remark" mode="secondary" appearance="themed" size="medium" stretched disabled={busy || (!draft.trim() && !files.length)} onClick={() => void comment()}>Добавить комментарий</Button><IconButton className="active-work-details__attach-icon-button" mode="secondary" appearance="themed" size="small" aria-label="Добавить фотографии к комментарию" disabled={busy || files.length >= 5} onClick={() => fileRef.current?.click()}><Icon24Attach /></IconButton></div></> : null}{comments.length ? <div className="active-work-details__comments">{comments.map((item) => <article key={item.id} className="active-work-details__remark-comment"><header><CommentAvatar name={item.author.displayName} photoUrl={item.author.photoUrl} /><span><b>{item.author.type === 'EXECUTOR' ? `Исполнитель · ${item.author.displayName}` : item.author.displayName}</b><small>{formatDate(item.createdAt)}</small></span></header>{item.text ? <Typography.Body className="observation-details__multiline">{normalizeParagraphs(item.text)}</Typography.Body> : null}{item.media.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={item.media} title="Фото комментария" /> : null}</article>)}</div> : null}</section>
      {detail.actions.watch || detail.actions.unwatch ? <div className="active-work-details__footer-actions"><Button className="active-work-details__stop-observing" mode="secondary" appearance={detail.actions.unwatch ? 'negative' : 'themed'} size="medium" stretched disabled={busy} onClick={() => void mutate(() => request(`/api/observations/${observationId}/watch`, { method: detail.actions.watch ? 'POST' : 'DELETE' }))}>{detail.actions.watch ? 'Стать наблюдателем' : 'Перестать наблюдать'}</Button></div> : null}
      {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
    </> : null}
  </main>{form ? <Modal className="home-access-modal" title="Создать работу" onClose={() => setForm(null)} actions={<><Button mode="secondary" onClick={() => setForm(null)}>Отмена</Button><Button disabled={busy || !workDraft.title.trim() || !workDraft.description.trim() || !workDraft.category || !workDraft.executorUserId} onClick={create}>Создать</Button></>}><div className="chairman-form"><label>Название<input value={workDraft.title} maxLength={255} onChange={(event) => setWorkDraft((value) => ({ ...value, title: event.target.value }))} /></label><label>Описание<textarea value={workDraft.description} maxLength={10000} onChange={(event) => setWorkDraft((value) => ({ ...value, description: event.target.value }))} /></label><label>Категория<select value={workDraft.category} onChange={(event) => setWorkDraft((value) => ({ ...value, category: event.target.value }))}><option value="">Выберите категорию</option>{[...new Set(form.templates.map((item) => item.category))].map((category) => <option key={category} value={category}>{category}</option>)}</select></label><Typography.Label>Название и описание берутся из обращения.</Typography.Label><label>Исполнитель<select value={workDraft.executorUserId} onChange={(event) => setWorkDraft((value) => ({ ...value, executorUserId: event.target.value }))}><option value="">Выберите исполнителя</option>{form.executors.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div></Modal> : null}</Panel>;
}
