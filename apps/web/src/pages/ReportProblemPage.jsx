import { Panel, Typography } from '@maxhub/max-ui';
import { Button } from '../components/ui/LegacyButton';
import { Icon20Check, Icon20ReplayOutline, Icon24AddCircle, Icon24Dismiss, Icon24PenOutline } from '@vkontakte/icons';
import { useEffect, useRef, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { AppSelect } from '../components/ui/AppSelect';
import { jsonRequest, request, uploadPhoto } from './residentApi';
import './ReportProblemPage.css';

const PROBLEM_TYPES = ['Освещение', 'Двери и домофон', 'Лифт', 'Уборка', 'Территория дома', 'Другое'];
const PROBLEM_TYPE_OPTIONS = PROBLEM_TYPES.map((label) => ({ value: label, label }));
export function ReportProblemPage({ onBack, houseId, houses = [], onAccessChanged }) {
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [queueTick, setQueueTick] = useState(0);
  const [isEditingPhotos, setEditingPhotos] = useState(false);
  const [isSent, setSent] = useState(false);
  const [address, setAddress] = useState(String(houseId ?? ''));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  const processingRef = useRef(false);
  const photosRef = useRef([]);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => { photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)); }, []);
  useEffect(() => {
    if (processingRef.current) return;
    const next = photos.find((photo) => photo.status === 'queued');
    if (!next) return;
    processingRef.current = true;
    Promise.resolve().then(() => { setPhotos((items) => items.map((photo) => photo.id === next.id ? { ...photo, status: 'uploading' } : photo)); return uploadPhoto(next.file); }).then((result) => setPhotos((items) => items.map((photo) => photo.id === next.id ? { ...photo, status: 'uploaded', mediaId: result.id } : photo)))
      .catch((failure) => setPhotos((items) => items.map((photo) => photo.id === next.id ? { ...photo, status: 'error', error: failure.message } : photo)))
      .finally(() => { processingRef.current = false; setQueueTick((value) => value + 1); });
  }, [photos, queueTick]);
  const addressOptions = houses.filter((house) => house.status === 'ACTIVE' && house.permissions?.createObservation).map((house) => ({ value: String(house.id), label: house.address }));
  const hasActiveHouse = houses.some((house) => String(house.id) === String(houseId) && house.status === 'ACTIVE' && house.permissions?.createObservation);
  const canSubmit = Boolean(hasActiveHouse && address && type && title.trim() && description.trim() && !sending && photos.every((photo) => photo.status === 'uploaded'));
  const addPhotos = (event) => {
    setError('');
    const files = Array.from(event.target.files ?? []);
    const valid = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024);
    if (valid.length !== files.length) setError('Допустимы JPEG, PNG, WebP до 10 МБ.');
    const available = Math.max(0, 20 - photosRef.current.length);
    if (valid.length > available) setError('Можно прикрепить не более 20 фотографий.');
    const next = valid.slice(0, available).map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, url: URL.createObjectURL(file), file, status: 'queued', mediaId: null }));
    setPhotos((items) => [...items, ...next]);
    event.target.value = '';
  };
  const removePhoto = (id) => {
    const photo = photosRef.current.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhotos((items) => items.filter((item) => item.id !== id));
  };
  const submit = async () => {
    if (!canSubmit) return;
    setSending(true); setError('');
    try {
      const mediaIds = photos.map((photo) => photo.mediaId);
      await request(`/api/houses/${address}/observations`, jsonRequest('POST', { category: type, title: title.trim(), description: description.trim(), mediaIds }));
      setSent(true);
    } catch (failure) { setError(failure.message); if (failure.status === 409) { try { await onAccessChanged?.(); } catch { /* Keep the original conflict message. */ } } }
    finally { setSending(false); }
  };

  if (!hasActiveHouse) return <Panel mode="primary" className="inner-panel report-problem-panel"><PageHeader title="Сообщить о проблеме" onBack={onBack} /><main className="panel-content report-problem-content"><Typography.Body>Сначала выберите дом.</Typography.Body></main></Panel>;
  if (isSent) return <Panel mode="primary" className="inner-panel report-problem-panel">
    <PageHeader title="Сообщить о проблеме" onBack={onBack} />
    <main className="panel-content report-problem-content"><section className="report-problem-card report-problem-success"><span className="report-problem-success__icon"><Icon20Check /></span><Typography.Title>Наблюдение отправлено</Typography.Title><Typography.Body>Наблюдение сохранено и появится в разделе «События дома».</Typography.Body><Button mode="primary" appearance="themed" onClick={onBack}>Вернуться на главную</Button></section></main>
  </Panel>;

  return <Panel mode="primary" className="inner-panel report-problem-panel">
    <PageHeader title="Сообщить о проблеме" onBack={onBack} />
    <main className="panel-content report-problem-content">
      <section className="report-problem-card">
        <div className="report-problem-field"><Typography.Label>Адрес дома</Typography.Label><AppSelect value={address} options={addressOptions} ariaLabel="Адрес дома" onChange={setAddress} /></div>
        <div className="report-problem-field"><Typography.Label>Категория</Typography.Label><AppSelect value={type} options={PROBLEM_TYPE_OPTIONS} placeholder="Выберите категорию" ariaLabel="Категория проблемы" onChange={setType} /></div>
        <label className="report-problem-field"><Typography.Label>Название проблемы</Typography.Label><input value={title} maxLength={80} placeholder="Например, не работает свет у входа" onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="report-problem-description-photos"><label className="report-problem-field report-problem-field--description"><Typography.Label>Описание</Typography.Label><textarea value={description} maxLength={500} rows="3" placeholder="Расскажите подробнее, где и когда возникла проблема" onChange={(event) => setDescription(event.target.value)} /></label>
          <div className="report-problem-photos"><Typography.Title variant="small-strong">Фотографии</Typography.Title><input ref={fileInputRef} className="report-problem-photos__input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} />
            <div className={`report-problem-photos__list${photos.length ? ' report-problem-photos__list--with-actions' : ''}`}>{photos.length ? <div className="report-problem-photo-actions"><button type="button" className="report-problem-photo-action" onClick={() => fileInputRef.current?.click()} disabled={photos.length >= 20} aria-label="Добавить фотографию"><Icon24AddCircle /></button><button type="button" className={`report-problem-photo-action${isEditingPhotos ? ' report-problem-photo-action--active' : ''}`} onClick={() => setEditingPhotos((value) => !value)} aria-label="Редактировать фотографии" aria-pressed={isEditingPhotos}><Icon24PenOutline /></button></div> : null}{photos.map((photo, index) => <div key={photo.id} className="report-problem-photo">{photo.status === 'uploaded' ? <img src={photo.url} alt={`Фото проблемы ${index + 1}`} /> : photo.status === 'error' ? <button type="button" className="report-problem-photo__retry" aria-label={`Повторить загрузку фото ${index + 1}`} onClick={() => setPhotos((items) => items.map((item) => item.id === photo.id ? { ...item, status: 'queued' } : item))}><Icon20ReplayOutline /></button> : <LoadingSpinner />}{isEditingPhotos ? <button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => removePhoto(photo.id)}><Icon24Dismiss width={16} height={16} /></button> : null}</div>)}{!photos.length ? <button type="button" className="report-problem-photo-add" onClick={() => fileInputRef.current?.click()} disabled={photos.length >= 20} aria-label="Добавить фотографию"><Icon24AddCircle /></button> : null}</div>
          </div>
        </div>
        {error ? <Typography.Body role="alert">{error}</Typography.Body> : null}
        <Button mode="primary" appearance="themed" size="medium" stretched disabled={!canSubmit} onClick={() => void submit()}>{sending ? 'Отправка…' : 'Отправить проблему'}</Button>
      </section>
    </main>
  </Panel>;
}
