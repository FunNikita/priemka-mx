import { Panel, Typography } from '@maxhub/max-ui';
import { Button } from '../components/ui/LegacyButton';
import { Icon24AddCircle, Icon24Dismiss } from '@vkontakte/icons';
import { useRef, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { AppSelect } from '../components/ui/AppSelect';
import './ReportProblemPage.css';

const PROBLEM_TYPES = ['Освещение', 'Двери и домофон', 'Лифт', 'Уборка', 'Территория дома', 'Другое'];
const PROBLEM_TYPE_OPTIONS = PROBLEM_TYPES.map((label) => ({ value: label, label }));
const APPROVED_ADDRESSES = ['Санкт-Петербург, ул. Примерная, д. 12', 'Санкт-Петербург, ул. Садовая, д. 8'];
const APPROVED_ADDRESS_OPTIONS = APPROVED_ADDRESSES.map((label) => ({ value: label, label }));

export function ReportProblemPage({ onBack }) {
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isSent, setSent] = useState(false);
  const [address, setAddress] = useState(APPROVED_ADDRESSES[0]);
  const fileInputRef = useRef(null);
  const canSubmit = Boolean(title.trim() && description.trim());
  const addPhotos = (event) => {
    const nextPhotos = Array.from(event.target.files ?? []).map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, url: URL.createObjectURL(file) }));
    setPhotos((items) => [...items, ...nextPhotos].slice(0, 6));
    event.target.value = '';
  };

  if (isSent) return <Panel mode="primary" className="inner-panel report-problem-panel">
    <PageHeader title="Сообщить о проблеме" onBack={onBack} />
    <main className="panel-content report-problem-content"><section className="report-problem-card report-problem-success"><span className="report-problem-success__icon">✓</span><Typography.Title>Проблема отправлена</Typography.Title><Typography.Body>Мы передали обращение управляющей компании. Статус появится в разделе «События дома».</Typography.Body><Button mode="primary" appearance="themed" onClick={onBack}>Вернуться на главную</Button></section></main>
  </Panel>;

  return <Panel mode="primary" className="inner-panel report-problem-panel">
    <PageHeader title="Сообщить о проблеме" onBack={onBack} />
    <main className="panel-content report-problem-content">
      <section className="report-problem-card">
        <div className="report-problem-field"><Typography.Label>Адрес дома</Typography.Label><AppSelect value={address} options={APPROVED_ADDRESS_OPTIONS} ariaLabel="Адрес дома" onChange={setAddress} /></div>
        <div className="report-problem-field"><Typography.Label>Категория</Typography.Label><AppSelect value={type} options={PROBLEM_TYPE_OPTIONS} placeholder="Выберите категорию" ariaLabel="Категория проблемы" onChange={setType} /></div>
        <label className="report-problem-field"><Typography.Label>Название проблемы</Typography.Label><input value={title} maxLength={80} placeholder="Например, не работает свет у входа" onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="report-problem-description-photos"><label className="report-problem-field report-problem-field--description"><Typography.Label>Описание</Typography.Label><textarea value={description} maxLength={500} rows="3" placeholder="Расскажите подробнее, где и когда возникла проблема" onChange={(event) => setDescription(event.target.value)} /></label>
          <div className="report-problem-photos"><Typography.Title variant="small-strong">Фотографии</Typography.Title><input ref={fileInputRef} className="report-problem-photos__input" type="file" accept="image/*" multiple onChange={addPhotos} />
            <div className="report-problem-photos__list">{photos.map((photo, index) => <div key={photo.id} className="report-problem-photo"><img src={photo.url} alt={`Фото проблемы ${index + 1}`} /><button type="button" aria-label={`Удалить фото ${index + 1}`} onClick={() => setPhotos((items) => items.filter((item) => item.id !== photo.id))}><Icon24Dismiss width={16} height={16} /></button></div>)}{photos.length < 6 ? <button type="button" className="report-problem-photo-add" onClick={() => fileInputRef.current?.click()} aria-label="Добавить фотографию"><Icon24AddCircle /></button> : null}</div>
          </div>
        </div>
        <Button mode="primary" appearance="themed" size="medium" stretched disabled={!canSubmit} onClick={() => setSent(true)}>Отправить проблему</Button>
      </section>
    </main>
  </Panel>;
}
