import { Avatar, Panel, Typography } from '@maxhub/max-ui';
import { Icon12CancelCircleFillRed, Icon24AddCircle, Icon24CheckBoxOff, Icon24CheckBoxOn, Icon24PenOutline } from '@vkontakte/icons';
import { useRef, useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/LegacyButton';
import { ImagePreview } from '../components/ui/ImagePreview';
import { Modal } from '../components/ui/Modal';
import './HomePage.css';

export function CouncilWorkPage({ inspection, onBack }) {
  const work = { ...inspection, status: inspection.statusLabel ?? inspection.status, date: inspection.date ?? inspection.displayDate };
  const inspectionType = work.inspectionType ?? (work.status === 'Повторная' || work.statusLabel === 'Повторная' ? 'repeat' : work.status === 'Завершена' || work.statusLabel === 'Завершена' ? 'completed' : 'assigned');
  const isCompleted = inspectionType === 'completed';
  const isRepeat = inspectionType === 'repeat';
  const [photos] = useState(() => work.photos ?? []);
  const [remarkText, setRemarkText] = useState('');
  const [isEditingRemarks, setEditingRemarks] = useState(false);
  const [checklist, setChecklist] = useState(() => (isRepeat ? [
    { label: 'Ранее найденное замечание устранено', done: isCompleted },
    { label: 'Исправление соответствует требованиям', done: isCompleted },
    { label: 'Новых дефектов и повреждений нет', done: isCompleted },
    { label: 'Место проведения работ убрано и безопасно', done: isCompleted },
  ] : [
    { label: 'Работа выполнена в полном объёме', done: isCompleted },
    { label: 'Результат соответствует описанию работы', done: isCompleted },
    { label: 'Видимых дефектов и повреждений нет', done: isCompleted },
    { label: 'Место проведения работ убрано и безопасно', done: isCompleted },
  ]));
  const [inspectionPhotos, setInspectionPhotos] = useState([]);
  const [decision, setDecision] = useState(isCompleted ? 'approved' : null);
  const [remarks, setRemarks] = useState([]);
  const [decisionAt, setDecisionAt] = useState(isCompleted ? '20.09 14:30' : '');
  const [pendingDecision, setPendingDecision] = useState(null);
  const inspectionPhotoInputRef = useRef(null);
  const isChecklistComplete = checklist.every((item) => item.done);
  const confirmDecision = () => {
    const now = new Date();
    if (pendingDecision === 'remarks') {
      setRemarks([{ id: now.getTime(), date: formatRemarkDate(now), text: remarkText.trim(), photos: [...inspectionPhotos] }]);
      setRemarkText('');
      setInspectionPhotos([]);
      setEditingRemarks(false);
      setDecision('remarks');
    }
    if (pendingDecision === 'approved') setDecision('approved');
    setDecisionAt(formatHistoryTime(now));
    setPendingDecision(null);
  };
  return <Panel mode="primary" className="home-panel active-work-details-panel council-work-panel">
    <PageHeader title="Работа" onBack={onBack} />
    <main className="panel-content active-work-details-content">
      <header className="active-work-details__head"><div className="active-work-details__title-row"><div className="active-work-details__title-status"><Typography.Title variant="small-strong" className="council-work__title">Ремонтные работы</Typography.Title><div className="active-work-details__status-list"><span className={`active-work-details__status active-work-details__status--${work.statusTone ?? inspectionType}`}>{work.status}</span>{work.review ? <span className="active-work-details__status">{work.review}</span> : null}{!isCompleted ? <span className="active-work-details__status active-work-details__status--checking">Вы проверяете</span> : null}</div></div><Typography.Label>ID {work.id}</Typography.Label></div></header>
      {isRepeat ? <section className="active-work-details__card council-work__repeat-card">
        <Typography.Title variant="small-strong" className="council-work__section-title">Повторная проверка</Typography.Title>
        <div className="council-work__repeat-stage"><Typography.Label>Предыдущее замечание</Typography.Label><Typography.Body>Дверь закрывалась не до конца. Необходимо отрегулировать доводчик и проверить плавность закрывания.</Typography.Body>{photos[0] ? <div className="active-work-details__comment-photo-list"><ImagePreview title="Фото до исправления" src={photos[0]} /></div> : null}</div>
        <div className="council-work__repeat-divider" />
        <div className="council-work__repeat-stage"><Typography.Label>Исполнитель сообщил об исправлении</Typography.Label><Typography.Body>Доводчик отрегулирован, дверь закрывается полностью. Добавлены фотографии после выполнения работ.</Typography.Body>{photos[1] ? <div className="active-work-details__comment-photo-list"><ImagePreview title="Фото после исправления" src={photos[1]} /></div> : null}</div>
      </section> : null}
      <section className="active-work-details__card">
        <Typography.Title variant="small-strong" className="council-work__section-title">История изменений</Typography.Title>
        <ol className="active-work-details__history"><li><i /><time>12.12 12:00</time><span>Дата получения акта</span></li><li><i /><time>12.12 12:00</time><span>Смена статуса: Ждёт исправлений</span></li><li className={!decision ? 'active-work-details__history-current' : undefined}><i /><time>12.12 12:00</time><span>Смена статуса: Проверено</span></li>{decision ? <li className={`active-work-details__history-current${decision === 'approved' ? ' council-work__history-result--approved' : ''}`}><i /><time>{decisionAt}</time><span>{decision === 'approved' ? 'Проверка завершена: замечаний нет' : 'Смена статуса: найдены замечания'}</span></li> : null}</ol>
        <Typography.Title variant="small-strong" className="council-work__section-title">Основная информация</Typography.Title>
        <div className="active-work-details__field"><Typography.Label>Название работы</Typography.Label><Typography.Body>{work.title}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Описание работы</Typography.Label><Typography.Body>{work.description}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>Санкт-Петербург, ул. Примерная, д. 12</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Объект дома</Typography.Label><Typography.Body>Лифт</Typography.Body></div>
        <div className="active-work-details__photos-section"><Typography.Title variant="small-strong" className="council-work__section-title">Фотографии</Typography.Title>{photos.length ? <div className="active-work-details__photo-list">{photos.map((photo, index) => <ImagePreview key={`${photo}-${index}`} title={`${work.title}: фото ${index + 1}`} src={photo} />)}</div> : null}</div>
      </section>
      <section className="active-work-details__card council-work__checklist-card">
        <Typography.Title variant="small-strong" className="council-work__section-title">Чек-лист проверки</Typography.Title>
        <ul className="council-work__checklist">{checklist.map((item, index) => <li key={item.label}><label className={item.done ? 'council-work__checklist-item--done' : ''}><input type="checkbox" checked={item.done} disabled={Boolean(decision)} onChange={() => setChecklist((items) => items.map((value, itemIndex) => itemIndex === index ? { ...value, done: !value.done } : value))} /><span className="council-work__checkbox" aria-hidden="true">{item.done ? <Icon24CheckBoxOn /> : <Icon24CheckBoxOff />}</span><span>{item.label}</span></label></li>)}</ul>
        {!remarks.length && decision !== 'approved' ? <div className="council-work__remark-editor">
          <Typography.Title variant="small-strong" className="council-work__section-title">Замечания</Typography.Title>
          <div className="active-work-details__remark"><textarea aria-label="Комментарий к проверке" placeholder="Введите комментарий" value={remarkText} maxLength={252} onChange={(event) => setRemarkText(event.target.value)} /></div>
          <input ref={inspectionPhotoInputRef} className="active-work-details__file-input" type="file" accept="image/*" multiple onChange={(event) => { const nextPhotos = Array.from(event.target.files ?? []).map((file) => URL.createObjectURL(file)); setInspectionPhotos((items) => [...items, ...nextPhotos].slice(0, 10)); event.target.value = ''; }} />
          <Typography.Title variant="small-strong" className="council-work__section-title">Фотографии</Typography.Title>
          <div className="active-work-details__photos council-work__remark-photos">
            {inspectionPhotos.length ? <><div className="active-work-details__photo-actions"><button type="button" aria-label="Добавить фотографии" onClick={() => inspectionPhotoInputRef.current?.click()}><Icon24AddCircle /></button><button type="button" aria-label="Редактировать фотографии" aria-pressed={isEditingRemarks} onClick={() => setEditingRemarks((value) => !value)}><Icon24PenOutline /></button></div><div className="active-work-details__photo-list">{inspectionPhotos.map((photo, index) => <div key={photo} className="active-work-details__photo"><img src={photo} alt={`Фото проверки ${index + 1}`} />{isEditingRemarks ? <button type="button" className="active-work-details__photo-remove" aria-label="Удалить фото проверки" onClick={() => setInspectionPhotos((items) => items.filter((item) => item !== photo))}><Icon12CancelCircleFillRed width={20} height={20} /></button> : null}</div>)}</div></> : <button type="button" className="active-work-details__photo-empty" aria-label="Добавить фотографии" onClick={() => inspectionPhotoInputRef.current?.click()}><Icon24AddCircle /></button>}
          </div>
        </div> : null}
        {remarks.length ? <div className="active-work-details__comments council-work__remarks-list"><Typography.Title variant="small-strong" className="council-work__section-title">Замечание</Typography.Title>{remarks.map((remark) => <article key={remark.id} className="active-work-details__remark-comment"><header><Avatar.Container size={32}><Avatar.Image src="https://sun9-67.userapi.com/s/v1/ig2/CY_xDesKnMtl0OiJynK0oc7QnxQVJUgeciJSi_MpZUiE3EHSCNltr76jugXaygGd2Xh0M8-61v7Jwfl1kO87YWVe.jpg?quality=95&crop=0,0,1440,1440&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080,1280x1280,1440x1440&ava=1&u=SpmuDKJYdLKKRYYDgjLVQdEn6QnBonR3kSYxCSkCnm4&cs=200x200" alt="Иван Петров" fallback="ИП" /></Avatar.Container><span><b>Иван Петров</b><small>{remark.date}</small></span></header>{remark.text ? <Typography.Body>{remark.text}</Typography.Body> : null}{remark.photos.length ? <div className="active-work-details__comment-photo-list">{remark.photos.map((photo, photoIndex) => <ImagePreview key={`${photo}-${photoIndex}`} title={`Фото замечания ${photoIndex + 1}`} src={photo} />)}</div> : null}</article>)}</div> : null}
        {!remarks.length && !decision ? <div className="council-work__decision-actions"><Button mode="primary" appearance="negative" size="medium" stretched disabled={!remarkText.trim() && !inspectionPhotos.length} onClick={() => setPendingDecision('remarks')}>Добавить замечание</Button><Button mode="primary" appearance="themed" size="medium" stretched style={isChecklistComplete ? { backgroundColor: '#22c55e', color: '#fff' } : undefined} disabled={!isChecklistComplete} onClick={() => setPendingDecision('approved')}>Замечаний нет</Button></div> : null}
      </section>
      <section className="active-work-details__card active-work-details__related-card"><Typography.Title variant="small-strong" className="council-work__section-title">Связанные люди с работой</Typography.Title><div className="active-work-details__person-info"><Avatar.Container size={40}><Avatar.Image src="https://sun9-67.userapi.com/s/v1/ig2/CY_xDesKnMtl0OiJynK0oc7QnxQVJUgeciJSi_MpZUiE3EHSCNltr76jugXaygGd2Xh0M8-61v7Jwfl1kO87YWVe.jpg?quality=95&crop=0,0,1440,1440&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080,1280x1280,1440x1440&ava=1&u=SpmuDKJYdLKKRYYDgjLVQdEn6QnBonR3kSYxCSkCnm4&cs=200x200" alt="Иван Петров" fallback="ИП" /></Avatar.Container><div><Typography.Title variant="small-strong">Иван Петров</Typography.Title><Typography.Label className="active-work-details__person-role">Исполнитель</Typography.Label></div></div><div className="active-work-details__person-actions"><Button mode="secondary" appearance="themed" size="medium" stretched>Написать</Button><Button mode="primary" appearance="themed" size="medium" stretched>Позвонить</Button></div></section>
    </main>
    {pendingDecision ? <Modal title={pendingDecision === 'remarks' ? 'Добавить замечание?' : 'Завершить проверку?'} onClose={() => setPendingDecision(null)} actions={<><Button mode="secondary" appearance="neutral" size="medium" stretched onClick={() => setPendingDecision(null)}>Отмена</Button><Button mode="primary" appearance="themed" size="medium" stretched onClick={confirmDecision}>{pendingDecision === 'remarks' ? 'Добавить замечание' : 'Завершить проверку'}</Button></>}><Typography.Body className="modal__copy">{pendingDecision === 'remarks' ? 'После отправки замечание нельзя будет изменить, а чек-лист будет заблокирован.' : 'После завершения результат проверки нельзя будет изменить, а чек-лист будет заблокирован.'}</Typography.Body></Modal> : null}
  </Panel>;
}

function formatHistoryTime(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date).replace(',', '');
}

function formatRemarkDate(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date).replace(',', ' в');
}
