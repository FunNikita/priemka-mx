import { PanelBack } from '../components/layout/PanelBack';
import { Avatar, Panel, Typography } from '@maxhub/max-ui';
import { Icon12CancelCircleFillRed, Icon24AddCircle, Icon24ChevronDown, Icon24ChevronUpSmall, Icon24PenOutline } from '@vkontakte/icons';
import { useRef, useState } from 'react';

import { Button } from '../components/ui/LegacyButton';
import { PhotoGroup } from '../components/ui/PhotoGroup';
import { Modal } from '../components/ui/Modal';
import { CouncilApiWorkPage } from './CouncilApiWorkPage';
import { formatDate } from './residentApi';
import './ReportProblemPage.css';
import './HomePage.css';

const CHECKLIST_RESULTS = [
  { value: 'PASS', label: 'Соответствует', tone: 'pass' },
  { value: 'FAIL', label: 'Не соответствует', tone: 'fail' },
  { value: 'PENDING', label: 'Не проверено', tone: 'pending' },
];
const REINSPECTION_RESULTS = [
  { value: 'RESOLVED', label: 'Устранено', tone: 'pass' },
  { value: 'NOT_RESOLVED', label: 'Не устранено', tone: 'fail' },
];

export function CouncilWorkPage(props) {
  return props.inspection.apiKind ? <CouncilApiWorkPage {...props} /> : <DemoCouncilWorkPage {...props} />;
}

function DemoCouncilWorkPage({ inspection, onBack }) {
  const work = { ...inspection, status: inspection.statusLabel ?? inspection.status, date: inspection.date ?? inspection.displayDate };
  const inspectionType = work.inspectionType ?? (work.status === 'Повторная' || work.statusLabel === 'Повторная' ? 'repeat' : work.status === 'Завершена' || work.statusLabel === 'Завершена' ? 'completed' : 'assigned');
  const isCompleted = inspectionType === 'completed';
  const isRepeat = inspectionType === 'repeat';
  const [photos] = useState(() => work.photos ?? []);
  const previousRemarks = work.previousRemarks ?? [];
  const [checklist, setChecklist] = useState(() => [
    { label: 'Работа выполнена в полном объёме', result: isCompleted ? 'PASS' : 'PENDING', comment: '', photos: [] },
    { label: 'Результат соответствует описанию работы', result: isCompleted ? 'PASS' : 'PENDING', comment: '', photos: [] },
    { label: 'Видимых дефектов и повреждений нет', result: isCompleted ? 'PASS' : 'PENDING', comment: '', photos: [] },
    { label: 'Место проведения работ убрано и безопасно', result: isCompleted ? 'PASS' : 'PENDING', comment: '', photos: [] },
  ]);
  const [decision, setDecision] = useState(isCompleted ? 'approved' : null);
  const [remarks, setRemarks] = useState([]);
  const [decisionAt, setDecisionAt] = useState(isCompleted ? formatDate('2026-09-20T14:30:00') : '');
  const [pendingDecision, setPendingDecision] = useState(null);
  const [openChecklistIndex, setOpenChecklistIndex] = useState(null);
  const [repeatOutcome, setRepeatOutcome] = useState(null);
  const isChecklistComplete = checklist.every((item) => ['PASS', 'FAIL'].includes(item.result));
  const hasInvalidFail = checklist.some((item) => item.result === 'FAIL' && (!item.comment.trim() || !item.photos.length));
  const hasFail = checklist.some((item) => item.result === 'FAIL');
  const updateChecklistItem = (index, patch) => setChecklist((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const confirmDecision = () => {
    const now = new Date();
    if (pendingDecision === 'remarks') {
      setRemarks(checklist.filter((item) => item.result === 'FAIL').map((item, index) => ({ id: `${now.getTime()}-${index}`, date: formatDate(now), title: item.label, text: item.comment.trim(), photos: item.photos })));
      setDecision('remarks');
    }
    if (pendingDecision === 'approved') setDecision('approved');
    setDecisionAt(formatDate(now));
    setPendingDecision(null);
  };
  return <Panel mode="primary" className="home-panel active-work-details-panel council-work-panel">
    <PanelBack onBack={onBack} />
    <main className="panel-content active-work-details-content">
      <header className="active-work-details__head"><div className="active-work-details__title-row"><div className="active-work-details__title-status"><Typography.Title variant="small-strong" className="council-work__title">Ремонтные работы</Typography.Title><div className="active-work-details__status-list"><span className={`active-work-details__status active-work-details__status--${work.statusTone ?? inspectionType}`}>{repeatOutcome ? 'Повторная проверка завершена' : work.status}</span>{repeatOutcome ? <span className="active-work-details__status">{repeatOutcome === 'RESOLVED' ? 'Устранено' : 'Не устранено'}</span> : work.review ? <span className="active-work-details__status">{work.review}</span> : null}{!isCompleted && !repeatOutcome ? <span className="active-work-details__status active-work-details__status--checking">Вы проверяете</span> : null}</div></div><Typography.Label>ID {work.id}</Typography.Label></div></header>
      <section className="active-work-details__card">
        <Typography.Title variant="small-strong" className="council-work__section-title">История изменений</Typography.Title>
        <ol className="active-work-details__history">{decision ? <li className={`active-work-details__history-current${decision === 'approved' ? ' council-work__history-result--approved' : ''}`}><i /><time>{decisionAt}</time><span>{decision === 'approved' ? 'Проверка завершена: замечаний нет' : 'Смена статуса: найдены замечания'}</span></li> : null}<li className={!decision ? 'active-work-details__history-current' : undefined}><i /><time>{formatDate('2026-12-12T12:00:00')}</time><span>Смена статуса: Проверено</span></li><li><i /><time>{formatDate('2026-12-12T12:00:00')}</time><span>Смена статуса: Ждёт исправлений</span></li><li><i /><time>{formatDate('2026-12-12T12:00:00')}</time><span>Дата получения акта</span></li></ol>
        <Typography.Title variant="small-strong" className="council-work__section-title">Основная информация</Typography.Title>
        <div className="active-work-details__field"><Typography.Label>Название работы</Typography.Label><Typography.Body>{work.title}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Описание работы</Typography.Label><Typography.Body>{work.description}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>Санкт-Петербург, ул. Примерная, д. 12</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Объект дома</Typography.Label><Typography.Body>Лифт</Typography.Body></div>
        <div className="active-work-details__photos-section"><Typography.Title variant="small-strong" className="council-work__section-title">Фотографии</Typography.Title>{photos.length ? <PhotoGroup className="active-work-details__photo-list" photos={photos} title={work.title} /> : null}</div>
      </section>
      {!isRepeat ? <section className="active-work-details__card council-work__checklist-card">
        <Typography.Title variant="small-strong" className="council-work__section-title">Чек-лист проверки</Typography.Title>
        <ul className="council-work__checklist">{checklist.map((item, index) => <ChecklistItem key={item.label} item={item} index={index} disabled={Boolean(decision)} isOpen={openChecklistIndex === index} onToggle={() => setOpenChecklistIndex((value) => value === index ? null : index)} onChange={(patch) => updateChecklistItem(index, patch)} />)}</ul>
        {remarks.length ? <div className="council-work__remarks-summary"><Typography.Title variant="small-strong" className="council-work__section-title">Замечания ({remarks.length})</Typography.Title>{remarks.map((remark) => <Typography.Body key={remark.id}>{remark.title}: {remark.text}</Typography.Body>)}</div> : null}
        {remarks.length ? <div className="active-work-details__comments council-work__remarks-list"><Typography.Title variant="small-strong" className="council-work__section-title">Замечание</Typography.Title>{remarks.map((remark) => <article key={remark.id} className="active-work-details__remark-comment"><header><Avatar.Container size={32}><Avatar.Image src="https://sun9-67.userapi.com/s/v1/ig2/CY_xDesKnMtl0OiJynK0oc7QnxQVJUgeciJSi_MpZUiE3EHSCNltr76jugXaygGd2Xh0M8-61v7Jwfl1kO87YWVe.jpg?quality=95&crop=0,0,1440,1440&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080,1280x1280,1440x1440&ava=1&u=SpmuDKJYdLKKRYYDgjLVQdEn6QnBonR3kSYxCSkCnm4&cs=200x200" alt="Иван Петров" fallback="ИП" /></Avatar.Container><span><b>Иван Петров</b><small>{remark.date}</small></span></header>{remark.text ? <Typography.Body>{remark.text}</Typography.Body> : null}{remark.photos.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={remark.photos} title={"Фото замечания"} /> : null}</article>)}</div> : null}
        {!remarks.length && !decision ? <div className="council-work__decision-actions"><Button mode="primary" appearance="negative" size="medium" stretched disabled={!isChecklistComplete || hasInvalidFail || !hasFail} onClick={() => setPendingDecision('remarks')}>Завершить с замечаниями</Button><Button mode="primary" appearance="themed" size="medium" stretched style={isChecklistComplete && !hasInvalidFail ? { backgroundColor: '#22c55e', color: '#fff' } : undefined} disabled={!isChecklistComplete || hasInvalidFail || hasFail} onClick={() => setPendingDecision('approved')}>Замечаний нет</Button></div> : null}
      </section> : null}
      {isRepeat ? <RepeatReview key={work.id} previousRemarks={previousRemarks} onComplete={setRepeatOutcome} /> : null}
      <section className="active-work-details__card active-work-details__related-card"><Typography.Title variant="small-strong" className="council-work__section-title">Связанные люди с работой</Typography.Title><div className="active-work-details__person-info"><Avatar.Container size={40}><Avatar.Image src="https://sun9-67.userapi.com/s/v1/ig2/CY_xDesKnMtl0OiJynK0oc7QnxQVJUgeciJSi_MpZUiE3EHSCNltr76jugXaygGd2Xh0M8-61v7Jwfl1kO87YWVe.jpg?quality=95&crop=0,0,1440,1440&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080,1280x1280,1440x1440&ava=1&u=SpmuDKJYdLKKRYYDgjLVQdEn6QnBonR3kSYxCSkCnm4&cs=200x200" alt="Иван Петров" fallback="ИП" /></Avatar.Container><div><Typography.Title variant="small-strong">Иван Петров</Typography.Title><Typography.Label className="active-work-details__person-role">Исполнитель</Typography.Label></div></div><div className="active-work-details__person-actions"><Button mode="secondary" appearance="themed" size="medium" stretched>Написать</Button><Button mode="primary" appearance="themed" size="medium" stretched>Позвонить</Button></div></section>
    </main>
    {pendingDecision ? <Modal title={pendingDecision === 'remarks' ? 'Добавить замечание?' : 'Завершить проверку?'} onClose={() => setPendingDecision(null)} actions={<><Button mode="secondary" appearance="neutral" size="medium" stretched onClick={() => setPendingDecision(null)}>Отмена</Button><Button mode="primary" appearance="themed" size="medium" stretched onClick={confirmDecision}>{pendingDecision === 'remarks' ? 'Добавить замечание' : 'Завершить проверку'}</Button></>}><Typography.Body className="modal__copy">{pendingDecision === 'remarks' ? 'После отправки замечание нельзя будет изменить, а чек-лист будет заблокирован.' : 'После завершения результат проверки нельзя будет изменить, а чек-лист будет заблокирован.'}</Typography.Body></Modal> : null}
  </Panel>;
}

function ChecklistItem({ item, disabled, isOpen, onToggle, onChange, options = CHECKLIST_RESULTS, issueResult = 'FAIL' }) {
  const selected = options.find((option) => option.value === item.result) ?? { label: 'Выберите результат', tone: 'pending' };
  const inputRef = useRef(null);
  const [isEditingPhotos, setEditingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const addPhotos = (files) => {
    setPhotoError(files.length > 5 - item.photos.length ? 'Можно прикрепить не более 5 фотографий.' : '');
    onChange({ photos: [...item.photos, ...Array.from(files).slice(0, Math.max(0, 5 - item.photos.length)).map((file) => URL.createObjectURL(file))] });
  };
  return <li className={`council-work__checklist-row council-work__checklist-row--${selected.tone}`}><div className="council-work__checklist-main"><span className="council-work__checklist-label">{item.label}</span><div className="admin-select"><button type="button" className={`admin-select__trigger council-work__select--${selected.tone}${isOpen ? ' admin-select__trigger--open' : ''}`} disabled={disabled} aria-haspopup="listbox" aria-expanded={isOpen} onClick={onToggle}><span>{selected.label}</span><span className="admin-select__icon">{isOpen ? <Icon24ChevronUpSmall width={20} height={20} /> : <Icon24ChevronDown width={20} height={20} />}</span></button>{isOpen && !disabled ? <div className="admin-select__menu" role="listbox" aria-label={`Результат: ${item.label}`}>{options.map((option) => <button key={option.value} type="button" className={`admin-select__option${option.value === item.result ? ' admin-select__option--selected' : ''}`} onClick={() => { onChange({ result: option.value }); onToggle(); }}>{option.label}</button>)}</div> : null}</div></div>{item.result === issueResult ? <div className="council-work__checklist-details"><Typography.Label>Замечание</Typography.Label><textarea value={item.comment} disabled={disabled} placeholder="Опишите замечание" onChange={(event) => onChange({ comment: event.target.value })} /><Typography.Label>Фотографии</Typography.Label><input ref={inputRef} className="active-work-details__file-input" type="file" accept="image/*" multiple onChange={(event) => { addPhotos(event.target.files ?? []); event.target.value = ''; }} /><div className="report-problem-photos__list report-problem-photos__list--with-actions">{item.photos.length ? <div className="report-problem-photo-actions"><button type="button" className="report-problem-photo-action" disabled={disabled || item.photos.length >= 5} aria-label="Добавить фото" onClick={() => inputRef.current?.click()}><Icon24AddCircle /></button><button type="button" className={`report-problem-photo-action${isEditingPhotos ? ' report-problem-photo-action--active' : ''}`} aria-label="Редактировать фотографии" aria-pressed={isEditingPhotos} onClick={() => setEditingPhotos((value) => !value)}><Icon24PenOutline /></button></div> : <button type="button" className="report-problem-photo-add" disabled={disabled} aria-label="Добавить фото" onClick={() => inputRef.current?.click()}><Icon24AddCircle /></button>}{item.photos.length ? <div className="report-problem-photo-list">{item.photos.map((photo) => <div className="report-problem-photo" key={photo}><img src={photo} alt="Фото замечания" />{isEditingPhotos && !disabled ? <button type="button" aria-label="Удалить фото" onClick={() => onChange({ photos: item.photos.filter((value) => value !== photo) })}><Icon12CancelCircleFillRed width={20} height={20} /></button> : null}</div>)}</div> : null}</div>{photoError ? <Typography.Body role="alert">{photoError}</Typography.Body> : null}</div> : null}</li>;
}

function RepeatReview({ previousRemarks, onComplete }) {
  const [checklist, setChecklist] = useState(() => previousRemarks.map((remark) => ({ id: remark.id, result: null, comment: '', photos: [] })));
  const [openChecklistIndex, setOpenChecklistIndex] = useState(null);
  const [completed, setCompleted] = useState(false);
  const result = checklist.some((item) => item.result === 'NOT_RESOLVED') ? 'NOT_RESOLVED' : 'RESOLVED';
  const isItemComplete = (item) => item.result === 'RESOLVED' || (item.result === 'NOT_RESOLVED' && item.comment.trim() && item.photos.length);
  const completedCount = checklist.filter(isItemComplete).length;
  const canComplete = checklist.length > 0 && completedCount === checklist.length;
  const updateChecklistItem = (index, patch) => setChecklist((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const finishReview = () => {
    if (!canComplete || completed) return;
    setCompleted(true);
    onComplete(result);
  };

  if (completed) return <section className="active-work-details__card council-work__repeat-summary" aria-live="polite">
    <Typography.Title variant="small-strong" className="council-work__section-title">Результат повторной проверки</Typography.Title>
    <div className="active-work-details__field"><Typography.Label>Итог</Typography.Label><Typography.Body>{result === 'RESOLVED' ? 'Устранено' : 'Не устранено'}</Typography.Body></div>
    {checklist.map((item, index) => {
      const remark = previousRemarks[index];
      return <div key={item.id ?? index} className="council-work__repeat-summary-item">
        <Typography.Title variant="small-strong" className="council-work__section-title">{remark.title ?? remark.comment.split('.')[0]}</Typography.Title>
        <div className="active-work-details__field"><Typography.Label>Предыдущее замечание</Typography.Label><Typography.Body>{remark.comment}</Typography.Body></div>
        {remark.photos?.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={remark.photos} title={"Фото замечания"} /> : null}
        {remark.correction ? <div className="active-work-details__field"><Typography.Label>Ответ исполнителя</Typography.Label><Typography.Body>{remark.correction}</Typography.Body></div> : null}
        {remark.correctionPhotos?.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={remark.correctionPhotos} title={"Фото исправления"} /> : null}
        <div className="active-work-details__field"><Typography.Label>Ваш результат</Typography.Label><Typography.Body>{item.result === 'RESOLVED' ? 'Устранено' : 'Не устранено'}</Typography.Body></div>
        {item.result === 'NOT_RESOLVED' ? <><div className="active-work-details__field"><Typography.Label>Новое замечание</Typography.Label><Typography.Body>{item.comment.trim()}</Typography.Body></div><PhotoGroup className="active-work-details__comment-photo-list" photos={item.photos} title={"Фото нового замечания"} /></> : null}
      </div>;
    })}
  </section>;

  return <section className="active-work-details__card council-work__repeat-review">
    <div className="council-work__repeat-header"><Typography.Title variant="small-strong" className="council-work__section-title">Повторная проверка</Typography.Title><Typography.Label aria-live="polite">Проверено {completedCount} из {checklist.length}</Typography.Label></div>
    <div className="council-work__repeat-progress" role="progressbar" aria-label="Проверенные замечания" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={checklist.length}><span style={{ width: `${checklist.length ? completedCount / checklist.length * 100 : 0}%` }} /></div>
    {checklist.length ? <ul className="council-work__repeat-list">{checklist.map((item, index) => <RepeatRemarkItem key={item.id ?? index} remark={previousRemarks[index]} item={item} index={index} disabled={false} isOpen={openChecklistIndex === index} onToggle={() => setOpenChecklistIndex((value) => value === index ? null : index)} onChange={(patch) => updateChecklistItem(index, patch)} />)}</ul> : <Typography.Body>Замечаний для повторной проверки нет.</Typography.Body>}
    <Button mode="primary" appearance="themed" size="medium" stretched disabled={!canComplete} onClick={finishReview}>Завершить повторную проверку</Button>
  </section>;
}

function RepeatRemarkItem({ remark, item, index, disabled, isOpen, onToggle, onChange }) {
  const inputRef = useRef(null);
  const [isEditingPhotos, setEditingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [isSelectOpen, setSelectOpen] = useState(false);
  const selected = REINSPECTION_RESULTS.find((option) => option.value === item.result);
  const addPhotos = (files) => {
    setPhotoError(files.length > 5 - item.photos.length ? 'Можно прикрепить не более 5 фотографий.' : '');
    onChange({ photos: [...item.photos, ...Array.from(files).slice(0, Math.max(0, 5 - item.photos.length)).map((file) => URL.createObjectURL(file))] });
  };

  return <li className="council-work__repeat-item">
    <button type="button" className="council-work__repeat-item-toggle" aria-expanded={isOpen} aria-controls={`repeat-remark-${index}`} onClick={onToggle}>
      <span className="council-work__repeat-item-title">{remark.title ?? remark.comment.split('.')[0]}</span>
      <span className="council-work__repeat-item-status">{selected?.label ?? 'Не проверено'}</span>
      {isOpen ? <Icon24ChevronUpSmall width={18} height={18} /> : <Icon24ChevronDown width={18} height={18} />}
    </button>
    {isOpen ? <div id={`repeat-remark-${index}`} className="council-work__repeat-item-body">
      <div className="council-work__repeat-item-context"><div className="council-work__repeat-history-row">{remark.photos?.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={remark.photos} title={"Фото замечания"} /> : null}<div className="council-work__repeat-stage"><Typography.Label>Замечание</Typography.Label><Typography.Body className="council-work__repeat-description">{remark.comment}</Typography.Body></div></div>
      {remark.correction || remark.correctionPhotos?.length ? <div className="council-work__repeat-history-row">{remark.correctionPhotos?.length ? <PhotoGroup className="active-work-details__comment-photo-list" photos={remark.correctionPhotos} title={"Фото исправления"} /> : null}<div className="council-work__repeat-stage"><Typography.Label>Ответ исполнителя</Typography.Label>{remark.correction ? <Typography.Body className="council-work__repeat-description">{remark.correction}</Typography.Body> : null}</div></div> : null}</div>
      <div className={`council-work__repeat-result-row${disabled ? ' council-work__repeat-result-row--completed' : ''}`}><Typography.Label>Ваш результат</Typography.Label><div className="admin-select council-work__repeat-result-select"><button type="button" className={`admin-select__trigger council-work__repeat-trigger--${selected?.tone ?? 'pending'}`} disabled={disabled} aria-haspopup="listbox" aria-expanded={isSelectOpen} aria-label={`Ваш результат: ${selected?.label ?? 'не выбран'}`} onClick={() => setSelectOpen((value) => !value)}><span>{selected?.label ?? 'Выберите результат'}</span><span className="admin-select__icon">{isSelectOpen ? <Icon24ChevronUpSmall width={20} height={20} /> : <Icon24ChevronDown width={20} height={20} />}</span></button>{isSelectOpen && !disabled ? <div className="admin-select__menu" role="listbox" aria-label={`Результат замечания ${index + 1}`}>{REINSPECTION_RESULTS.map((option) => <button key={option.value} type="button" className={`admin-select__option${item.result === option.value ? ' admin-select__option--selected' : ''}`} onClick={() => { onChange({ result: option.value }); setSelectOpen(false); }}>{option.label}</button>)}</div> : null}</div></div>
      {item.result === 'NOT_RESOLVED' ? <div className="council-work__checklist-details"><Typography.Label>Новое замечание</Typography.Label><textarea value={item.comment} disabled={disabled} placeholder="Опишите, что осталось неустранённым" onChange={(event) => onChange({ comment: event.target.value })} /><Typography.Label>Фотографии</Typography.Label><input ref={inputRef} className="active-work-details__file-input" type="file" accept="image/*" multiple disabled={disabled} onChange={(event) => { addPhotos(event.target.files ?? []); event.target.value = ''; }} /><div className="report-problem-photos__list report-problem-photos__list--with-actions">{item.photos.length ? <div className="report-problem-photo-actions"><button type="button" className="report-problem-photo-action" disabled={disabled || item.photos.length >= 5} aria-label="Добавить фото" onClick={() => inputRef.current?.click()}><Icon24AddCircle /></button><button type="button" className={`report-problem-photo-action${isEditingPhotos ? ' report-problem-photo-action--active' : ''}`} disabled={disabled} aria-label="Редактировать фотографии" aria-pressed={isEditingPhotos} onClick={() => setEditingPhotos((value) => !value)}><Icon24PenOutline /></button></div> : !disabled ? <button type="button" className="report-problem-photo-add" aria-label="Добавить фото" onClick={() => inputRef.current?.click()}><Icon24AddCircle /></button> : null}{item.photos.length ? <div className="report-problem-photo-list">{item.photos.map((photo, photoIndex) => <div className="report-problem-photo" key={photo}><img src={photo} alt={`Фото нового замечания ${photoIndex + 1}`} />{isEditingPhotos && !disabled ? <button type="button" aria-label={`Удалить фото ${photoIndex + 1}`} onClick={() => { onChange({ photos: item.photos.filter((value) => value !== photo) }); URL.revokeObjectURL(photo); }}><Icon12CancelCircleFillRed width={20} height={20} /></button> : null}</div>)}</div> : null}</div>{photoError ? <Typography.Body role="alert">{photoError}</Typography.Body> : null}</div> : null}
    </div> : null}
  </li>;
}
