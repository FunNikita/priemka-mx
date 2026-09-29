import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Panel, Typography } from '@maxhub/max-ui';
import { Icon24Attach } from '@vkontakte/icons';
import { PageHeader } from '../components/layout/PageHeader';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Button, IconButton } from '../components/ui/LegacyButton';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { allPages, formatDate, historyEvents, jsonRequest, request, uploadPhoto, workStatuses } from './residentApi';
import { DocumentRow } from '../components/ui/DocumentRow';
import { sortHistoryNewestFirst } from './sortHistory';

export function ResidentWorkDetails({ workId, onBack }) {
  const [work, setWork] = useState(null);
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remarkText, setRemarkText] = useState('');
  const [files, setFiles] = useState([]);
  const fileRef = useRef(null);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [detail, discussion, events] = await Promise.all([request(`/api/works/${workId}`), allPages(`/api/works/${workId}/comments`), allPages(`/api/works/${workId}/activity`)]);
      setWork(detail); setComments(discussion.items); setActivity(events.items);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [workId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  const changeWatch = async () => {
    setBusy(true); setActionError('');
    try {
      await request(`/api/works/${workId}/watch`, { method: work.actions.watch ? 'POST' : 'DELETE' });
      await reload();
    } catch (failure) { setActionError(failure.message); if (failure.status === 409) await reload(); }
    finally { setBusy(false); }
  };
  const sendComment = async () => {
    if (!remarkText.trim() && !files.length) return;
    setBusy(true); setActionError('');
    try {
      const mediaIds = [];
      for (const file of files) mediaIds.push((await uploadPhoto(file)).id);
      await request(`/api/works/${workId}/comments`, jsonRequest('POST', { text: remarkText.trim(), mediaIds }));
      setRemarkText(''); setFiles([]); await reload();
    } catch (failure) { setActionError(failure.message); if (failure.status === 409) await reload(); }
    finally { setBusy(false); }
  };
  return <Panel mode="primary" className="home-panel active-work-details-panel"><PageHeader title="Работа" onBack={onBack} /><main className="panel-content active-work-details-content">
    {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : work ? <>
      <header className="active-work-details__head"><div className="active-work-details__title-row"><div className="active-work-details__title-status"><Typography.Title variant="small-strong" className="active-work-details__main-title">Ремонтные работы</Typography.Title><div className="active-work-details__status-list"><span className="active-work-details__status">{workStatuses[work.status]}</span>{work.isWatching ? <span className="active-work-details__status active-work-details__status--observed">Вы наблюдаете</span> : null}</div></div><Typography.Label>ID {work.id}</Typography.Label></div></header>
      <section className="active-work-details__card"><Typography.Title variant="small-strong" className="active-work-details__section-title">История изменений</Typography.Title>{activity.length ? <ol className="active-work-details__history">{sortHistoryNewestFirst(activity).map((item, index) => <li className={index === 0 ? 'active-work-details__history-current' : undefined} key={item.id}><i /><time>{formatDate(item.createdAt)}</time><span>{historyEvents[item.event] ?? item.event} · {item.actorName ?? 'Система'}{item.actorRole ? ` (${item.actorRole})` : ''}</span></li>)}</ol> : work.history.length ? <ol className="active-work-details__history">{sortHistoryNewestFirst(work.history).map((item, index) => <li className={index === 0 ? 'active-work-details__history-current' : undefined} key={item.id}><i /><time>{formatDate(item.createdAt)}</time><span>{historyEvents[item.event] ?? 'Обновление работы'}{item.details ? `: ${item.details === 'NOT_RESOLVED' ? 'Не устранено' : item.details === 'RESOLVED' ? 'Устранено' : item.details}` : ''}</span></li>)}</ol> : <Typography.Body>История изменений пока пуста.</Typography.Body>}
        <Typography.Title variant="small-strong" className="active-work-details__section-title">Основная информация</Typography.Title>{work.sourceObservation ? <div className="active-work-details__field"><Typography.Label>Наблюдение жителя</Typography.Label><Typography.Body>№{work.sourceObservation.id}: {work.sourceObservation.title}</Typography.Body></div> : null}<div className="active-work-details__field"><Typography.Label>Название работы</Typography.Label><Typography.Body>{work.title}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Описание работы</Typography.Label><Typography.Body>{work.description}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>{work.house.address}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Объект дома</Typography.Label><Typography.Body>{work.houseObject?.title ?? 'Не указан'}</Typography.Body></div><div className="active-work-details__field"><Typography.Label>Исполнитель</Typography.Label><Typography.Body>{work.executor ? `${work.executor.companyName} · ${work.executor.representativeName ?? ''}` : 'Не указан'}</Typography.Body></div><div className="active-work-details__photos-section"><Typography.Title variant="small-strong" className="active-work-details__section-title">Фотографии</Typography.Title>{work.media.length ? <PhotoGroup className="active-work-details__photo-list" photos={work.media} title={work.title} /> : <Typography.Body>Фотографий пока нет.</Typography.Body>}</div>
        <Typography.Title variant="small-strong" className="active-work-details__section-title">Документы</Typography.Title>{work.documents.length ? work.documents.map((doc) => <DocumentRow key={doc.id} document={doc} />) : <Typography.Body>Документов пока нет.</Typography.Body>}</section>
      {work.representative ? <section className="active-work-details__card active-work-details__related-card"><Typography.Title variant="small-strong">Связанные люди с работой</Typography.Title><div className="active-work-details__person-info"><Avatar.Container size={40}><Avatar.Icon>{work.representative.name.slice(0, 1)}</Avatar.Icon></Avatar.Container><div><Typography.Title variant="small-strong">{work.representative.name}</Typography.Title><Typography.Label className="active-work-details__person-role">Представитель исполнителя</Typography.Label></div></div><div className="active-work-details__person-actions">{work.representative.maxUrl ? <Button mode="secondary" appearance="themed" size="medium" stretched onClick={() => window.open(work.representative.maxUrl, '_blank', 'noopener,noreferrer')}>Написать</Button> : null}{work.representative.phone ? <a href={`tel:${work.representative.phone}`}>Позвонить</a> : null}</div></section> : null}
      <section className="active-work-details__card active-work-details__remarks"><Typography.Title variant="small-strong" className="active-work-details__section-title">Комментарии</Typography.Title>{work.actions.comment ? <><div className="active-work-details__remark"><textarea aria-label="Текст комментария" placeholder="Введите комментарий" value={remarkText} maxLength={10000} onChange={(event) => setRemarkText(event.target.value)} /><input ref={fileRef} className="active-work-details__file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { setFiles((items) => [...items, ...event.target.files].slice(0, 20)); event.target.value = ''; }} />{files.length ? <Typography.Label>Выбрано фото: {files.length}</Typography.Label> : null}</div><div className="active-work-details__comment-actions"><Button className="active-work-details__add-remark" mode="secondary" appearance="themed" size="medium" stretched disabled={busy || (!remarkText.trim() && !files.length)} onClick={() => void sendComment()}>Добавить комментарий</Button><IconButton className="active-work-details__attach-icon-button" mode="secondary" appearance="themed" size="small" aria-label="Прикрепить фото" onClick={() => fileRef.current?.click()}><Icon24Attach /></IconButton></div></> : null}
        {comments.length ? <div className="active-work-details__comments">{comments.map((item) => <article key={item.id} className="active-work-details__remark-comment"><header><span><b>{`${item.author.firstName} ${item.author.lastName}`.trim()}</b><small>{formatDate(item.createdAt)}</small></span></header>{item.text ? <Typography.Body>{item.text}</Typography.Body> : null}{item.media.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={item.media} title="Фото комментария" /> : null}</article>)}</div> : <EmptyState message="Комментариев пока нет." />}
      </section>{actionError ? <Typography.Body role="alert">{actionError}</Typography.Body> : null}<div className="active-work-details__footer-actions">{work.actions.watch || work.actions.unwatch ? <Button className="active-work-details__stop-observing" mode="secondary" appearance={work.actions.unwatch ? 'negative' : 'themed'} size="medium" stretched disabled={busy} onClick={() => void changeWatch()}>{work.actions.watch ? 'Стать наблюдателем' : 'Перестать наблюдать'}</Button> : null}</div>
    </> : null}
  </main></Panel>;
}
