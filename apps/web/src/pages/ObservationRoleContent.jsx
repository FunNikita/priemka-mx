import { useEffect, useRef, useState } from 'react';
import { Typography } from '@maxhub/max-ui';
import { Icon12CancelCircleFillRed, Icon24AddCircle, Icon24Attach, Icon24PenOutline } from '@vkontakte/icons';
import { Button, IconButton } from '../components/ui/LegacyButton';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmActionModal } from '../components/ui/ConfirmActionModal';
import { DocumentRow } from '../components/ui/DocumentRow';
import { formatDate, jsonRequest, observationStatusLabel, request, uploadPhoto } from './residentApi';
import { sortHistoryNewestFirst } from './sortHistory';
import { hapticError, hapticSuccess } from '../utils/maxFeedback';

const checklistCategoryLabels = { COMMON_AREAS: 'Общие помещения', LIGHTING: 'Освещение', ROOF: 'Кровля', OUTDOOR: 'Придомовая территория' };

function CommentAvatar({ name, photoUrl }) {
  const initials = (name?.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('') || '?').toUpperCase();
  return <span className="observation-comment-avatar" aria-hidden="true">{photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}</span>;
}

export function ObservationRoleContent({ detail, onReload, children, renderDocumentAction, councilOverview = false, showComments = true }) {
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [editingPhotos, setEditingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmUnwatch, setConfirmUnwatch] = useState(false);
  const fileRef = useRef(null);
  const previewsRef = useRef([]);
  useEffect(() => { previewsRef.current = previews; }, [previews]);
  useEffect(() => () => previewsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);
  const mutate = async (operation) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); hapticSuccess(); await onReload(); }
    catch (failure) { hapticError(); setError(failure.message); }
    finally { setBusy(false); }
  };
  const addFiles = (event) => {
    const chosen = Array.from(event.target.files ?? []);
    setPhotoError(chosen.length > 5 - files.length ? 'Можно прикрепить не более 5 фотографий.' : '');
    const selected = chosen.slice(0, Math.max(0, 5 - files.length));
    setFiles((current) => [...current, ...selected]);
    setPreviews((current) => [...current, ...selected.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    event.target.value = '';
  };
  const removeFile = (index) => {
    const preview = previews[index];
    if (preview) URL.revokeObjectURL(preview.url);
    setFiles((current) => current.filter((_, position) => position !== index));
    setPreviews((current) => current.filter((_, position) => position !== index));
  };
  const sendComment = () => mutate(async () => {
    const mediaIds = [];
    for (const file of files) mediaIds.push((await uploadPhoto(file)).id);
    await request(`/api/observations/${detail.id}/comments`, jsonRequest('POST', { text: draft.trim(), mediaIds }));
    previews.forEach((item) => URL.revokeObjectURL(item.url));
    setDraft(''); setFiles([]); setPreviews([]);
  });
  const executor = detail.workflow?.executor ?? detail.linkedWork?.executor;
  const checklistCategory = detail.workflow?.category;
  return <>
    <header className="active-work-details__head"><div className="active-work-details__title-row"><div className="active-work-details__title-status"><Typography.Title variant="small-strong" className="active-work-details__main-title">{detail.title}</Typography.Title><div className="active-work-details__status-list"><span className="active-work-details__status">{observationStatusLabel(detail)}</span>{detail.isWatching && detail.watchReason !== 'AUTHOR' ? <span className="active-work-details__status active-work-details__status--observed">Вы наблюдаете</span> : null}</div></div><Typography.Label>ID {detail.id}</Typography.Label></div></header>
    <section className="active-work-details__card"><Typography.Title variant="small-strong" className="active-work-details__section-title">История изменений</Typography.Title>{detail.history?.length ? <ol className="active-work-details__history">{sortHistoryNewestFirst(detail.history).map((item, index) => <li className={index === 0 ? 'active-work-details__history-current' : undefined} key={item.id}><i /><time>{formatDate(item.createdAt)}</time><span>{item.title}</span></li>)}</ol> : <EmptyState message="История пока пуста." />}
      <Typography.Title variant="small-strong" className="active-work-details__section-title">Основная информация</Typography.Title>
      <div className="active-work-details__field"><Typography.Label>Название наблюдения</Typography.Label><Typography.Body>{detail.title}</Typography.Body></div>
      <div className="active-work-details__field"><Typography.Label>Описание наблюдения</Typography.Label><Typography.Body className="observation-details__multiline">{councilOverview ? String(detail.description ?? '').replace(/\n{3,}/g, '\n\n') : detail.description}</Typography.Body></div>
      <div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>{detail.house?.address ?? 'Адрес не указан'}</Typography.Body></div>
      <div className="active-work-details__field"><Typography.Label>Категория обращения</Typography.Label><Typography.Body>{detail.category ?? 'Не указана'}</Typography.Body></div>
      {!councilOverview && checklistCategory && checklistCategory !== detail.category ? <div className="active-work-details__field"><Typography.Label>Категория чек-листа</Typography.Label><Typography.Body>{checklistCategoryLabels[checklistCategory] ?? checklistCategory}</Typography.Body></div> : null}
      <div className="active-work-details__field"><Typography.Label>Исполнитель</Typography.Label><Typography.Body>{executor?.companyName ?? 'Не указан'}</Typography.Body></div>
      {detail.media?.length || detail.linkedWork?.media?.length ? <div className="active-work-details__photos-section"><Typography.Title variant="small-strong" className="active-work-details__section-title">Фотографии</Typography.Title><PhotoGroup className="active-work-details__photo-list" photos={detail.media?.length ? detail.media : detail.linkedWork.media} title={detail.title} /></div> : null}
      {detail.workflow?.documents?.length ? <><Typography.Title variant="small-strong" className="active-work-details__section-title">Документы</Typography.Title>{detail.workflow.documents.map((document) => <DocumentRow key={document.id} document={document} action={renderDocumentAction && document.actions.confirm ? null : renderDocumentAction?.(document)} />)}</> : null}
    </section>
    {detail.workflow?.documents?.some((document) => document.actions.confirm) && renderDocumentAction ? <section className="active-work-details__card observation-details__document-actions">{detail.workflow.documents.filter((document) => document.actions.confirm).map((document) => <div key={document.id}>{renderDocumentAction(document)}</div>)}</section> : null}
    {children}
    {showComments ? <section className="active-work-details__card active-work-details__remarks"><Typography.Title variant="small-strong" className="active-work-details__section-title">Комментарии</Typography.Title>{detail.actions?.comment ? <><div className="active-work-details__remark"><textarea aria-label="Текст комментария" value={draft} maxLength={10000} onChange={(event) => setDraft(event.target.value)} placeholder="Введите комментарий" /><input ref={fileRef} className="active-work-details__file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} />{previews.length ? <div className="report-problem-photos"><Typography.Label>Фотографии</Typography.Label><div className="report-problem-photos__list report-problem-photos__list--with-actions"><div className="report-problem-photo-actions"><button type="button" className="report-problem-photo-action" aria-label="Добавить фотографии к комментарию" disabled={busy || files.length >= 5} onClick={() => fileRef.current?.click()}><Icon24AddCircle /></button><button type="button" className="report-problem-photo-action" aria-label="Редактировать фотографии комментария" aria-pressed={editingPhotos} onClick={() => setEditingPhotos((value) => !value)}><Icon24PenOutline /></button></div><div className="report-problem-photo-list">{previews.map((preview, index) => <div className="report-problem-photo" key={`${preview.file.name}-${index}`}><img src={preview.url} alt={preview.file.name} />{editingPhotos ? <button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => removeFile(index)}><Icon12CancelCircleFillRed width={20} height={20} /></button> : null}</div>)}</div></div></div> : null}</div>{photoError ? <Typography.Body role="alert">{photoError}</Typography.Body> : null}<div className="active-work-details__comment-actions"><Button className="active-work-details__add-remark" mode="secondary" appearance="themed" size="medium" stretched disabled={busy || (!draft.trim() && !files.length)} onClick={() => void sendComment()}>Добавить комментарий</Button><IconButton className="active-work-details__attach-icon-button" mode="secondary" appearance="themed" size="small" aria-label="Добавить фотографии к комментарию" disabled={busy || files.length >= 5} onClick={() => fileRef.current?.click()}><Icon24Attach /></IconButton></div></> : null}{detail.comments?.length ? <div className="active-work-details__comments">{detail.comments.map((item) => <article key={item.id} className="active-work-details__remark-comment"><header><CommentAvatar name={item.author.displayName} photoUrl={item.author.photoUrl} /><span><b>{item.author.type === 'EXECUTOR' ? `Исполнитель · ${item.author.displayName}` : item.author.displayName}</b><small>{formatDate(item.createdAt)}</small></span></header>{item.text ? <Typography.Body className="observation-details__multiline">{item.text}</Typography.Body> : null}{item.media?.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={item.media} title="Фото комментария" /> : null}</article>)}</div> : null}</section> : null}
    {detail.actions?.watch || detail.actions?.unwatch ? <div className="active-work-details__footer-actions"><Button className="active-work-details__stop-observing" mode="secondary" appearance={detail.actions.unwatch ? 'negative' : 'themed'} size="medium" stretched disabled={busy} onClick={() => detail.actions.unwatch ? setConfirmUnwatch(true) : void mutate(() => request(`/api/observations/${detail.id}/watch`, { method: 'POST' }))}>{detail.actions.watch ? 'Стать наблюдателем' : 'Перестать наблюдать'}</Button></div> : null}
    {confirmUnwatch ? <ConfirmActionModal title="Перестать наблюдать?" message={`Перестать наблюдать за обращением «${detail.title}»?`} busy={busy} onCancel={() => setConfirmUnwatch(false)} onConfirm={() => { setConfirmUnwatch(false); void mutate(() => request(`/api/observations/${detail.id}/watch`, { method: 'DELETE' })); }} /> : null}
    {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
  </>;
}
