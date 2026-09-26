import { useEffect, useRef, useState } from 'react';

import { Avatar, CellAction, CellList, CellSimple, Flex, Panel, Typography } from '@maxhub/max-ui';
import { Button, IconButton } from '../components/ui/LegacyButton';
import { Icon12CancelCircleFillRed, Icon20AddCircleOutline, Icon20ChevronRight, Icon20SmileAddOutline, Icon24AddCircle, Icon24Attach, Icon24DeleteOutline, Icon24PenOutline, Icon28BuildingOutline, Icon28MessageArrowRightOutline } from '@vkontakte/icons';

import { PageHeader } from '../components/layout/PageHeader';
import { ImagePreview } from '../components/ui/ImagePreview';
import { Modal } from '../components/ui/Modal';
import { CouncilWorkPage } from './CouncilWorkPage';
import './HomePage.css';

const HOUSE_CHAT_LINK = 'https://max.ru/join/priemka-house-chat';
const HOUSE_CHAT_STORAGE_KEY = 'priemka-house-chat-link';
const CHAT_MANAGER_ROLES = new Set(['council-member', 'chairman', 'admin']);

const ACTIVE_WORKS = [
  { id: '1221312', title: 'Освещение у входа', status: 'Новая', review: 'Ожидает проверки', date: '12 сентября 12:00', description: 'Не работает освещение у входа в подъезд. Нужна проверка и замена лампы.', canObserve: true, photos: ['https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg', 'https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg'] },
  { id: '1221313', title: 'Доводчик входной двери', status: 'В работе', review: null, date: '11 сентября 16:30', description: 'Дверь закрывается не до конца. Заявка передана управляющей компании.', canObserve: true, photos: ['https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg', 'https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg'] },
];

const COUNCIL_INSPECTIONS = [
  { id: '1221312', title: 'Освещение у входа', status: 'Назначена', statusTone: 'assigned', date: '12 сентября 12:00', description: 'Не работает освещение у входа в подъезд. Нужна проверка и замена лампы.', canObserve: false, photos: ['https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg', 'https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg'] },
  { id: '1221313', title: 'Доводчик входной двери', status: 'Повторная', statusTone: 'repeat', date: '11 сентября 16:30', description: 'Дверь закрывалась не до конца. Исполнитель устранил замечание.', canObserve: false, photos: ['https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg', 'https://i.pinimg.com/736x/3a/89/ea/3a89ea9676fb304b1f91fb83914e5c67.jpg'] },
];

const SERVICES_BY_ROLE = {
  resident: [
    { id: 'report-observation', page: 'report-problem', title: 'Сообщить о проблеме', icon: Icon28MessageArrowRightOutline, accentColor: '#F59E0B' },
  ],
};

export function HomePage({ onOpen, role = 'resident' }) {
  const [maxGridColumns, setMaxGridColumns] = useState(getHomeGridColumns);
  const [isAccessDialogOpen, setAccessDialogOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [isAddressSuggestionsOpen, setAddressSuggestionsOpen] = useState(false);
  const [hasAccessRequest, setHasAccessRequest] = useState(false);
  const [observedWorkIds, setObservedWorkIds] = useState(['1221312']);
  const [selectedActiveWork, setSelectedActiveWork] = useState(null);
  const [activeWorks, setActiveWorks] = useState(ACTIVE_WORKS);

  useEffect(() => {
    const handleResize = () => setMaxGridColumns(getHomeGridColumns());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (role === 'council-member') return <CouncilMemberHome onOpen={onOpen} />;

  const services = SERVICES_BY_ROLE[role] ?? SERVICES_BY_ROLE.resident;
  const gridColumns = Math.min(services.length, role === 'resident' ? 2 : maxGridColumns);

  if (selectedActiveWork) return <ActiveWorkDetails work={selectedActiveWork} viewerRole={role} isObserved={observedWorkIds.includes(selectedActiveWork.id)} onBack={() => setSelectedActiveWork(null)} onStopObserving={() => setObservedWorkIds((ids) => ids.filter((id) => id !== selectedActiveWork.id))} onReportResolved={() => { const updated = { ...selectedActiveWork, status: 'Ожидает проверки', review: 'Житель сообщил об исправлении' }; setActiveWorks((items) => items.map((item) => item.id === updated.id ? updated : item)); setSelectedActiveWork(updated); }} />;

  return <Panel mode="primary" className="home-panel">
    <PageHeader title="Главная" />
    <main className="panel-content">
      <div className="home-sections">
        <CellAction before={<Avatar.Container size={40}><Avatar.Icon><Icon28BuildingOutline /></Avatar.Icon></Avatar.Container>} className="home-location-action" height="normal" mode="custom" style={{ '--MaxUi-CellAction_color': 'var(--text-secondary)' }} onClick={() => setAccessDialogOpen(true)}>
          <Flex align="center" className="home-location-row"><Flex align="center" gap={5} className="home-location-address-group"><Typography.Body><span>Санкт-Петербург,</span>{' '}<br className="home-location-mobile-break" /><span className="home-location-street">ул. Примерная, д. 12</span></Typography.Body><Icon20ChevronRight className="home-location-chevron" /></Flex></Flex>
        </CellAction>
        <HouseChatSection canManage={CHAT_MANAGER_ROLES.has(role)} />
        <section className="home-active-works">
          <Typography.Headline className="home-section-title">Активные работы дома</Typography.Headline>
          <div className="home-active-works__list">{activeWorks.map((work) => <ActiveWorkCard key={work.id} work={work} isObserved={observedWorkIds.includes(work.id)} onOpen={() => setSelectedActiveWork(work)} onObserve={() => setObservedWorkIds((ids) => [...ids, work.id])} />)}</div>
        </section>
      </div>
    </main>
    {isAccessDialogOpen ? <Modal className="home-access-modal" title="Доступ к работам дома" titleVariant="medium" onClose={() => setAccessDialogOpen(false)} actions={!hasAccessRequest ? <Button mode="primary" appearance="themed" size="medium" stretched disabled={!selectedAddress} onClick={() => setHasAccessRequest(true)}>Запросить доступ</Button> : null}>
      <div className="home-access-dialog">
        <Typography.Body variant="medium" className="home-access-dialog__copy">В Приёмке можно следить за проверкой выполненных работ и видеть результат. Укажите адрес, чтобы отправить запрос на доступ.</Typography.Body>
        {hasAccessRequest ? <div className="home-access-dialog__requests"><Typography.Headline variant="small-strong" className="home-access-dialog__requests-title">Ваши запросы</Typography.Headline><div className="home-access-request"><div><span className="home-access-request__status">Председатель получил уведомление</span><Typography.Body variant="medium" className="home-access-request__address">{selectedAddress}</Typography.Body></div><button type="button" aria-label="Удалить запрос" onClick={() => { setHasAccessRequest(false); setSelectedAddress(''); setAddressQuery(''); }}><Icon24DeleteOutline /></button></div><Button mode="secondary" appearance="themed" size="medium" stretched iconBefore={<Icon20AddCircleOutline />} onClick={() => { setHasAccessRequest(false); setSelectedAddress(''); setAddressQuery(''); }}>Запросить ещё</Button></div> : <div className="home-access-dialog__form"><input className="home-access-dialog__input" value={addressQuery} placeholder="Город, улица, дом" onFocus={() => setAddressSuggestionsOpen(true)} onChange={(event) => { setAddressQuery(event.target.value); setSelectedAddress(''); setAddressSuggestionsOpen(true); }} />{isAddressSuggestionsOpen ? <div className="home-access-dialog__suggestions">{getAddressSuggestions(addressQuery).map((suggestion) => <button key={suggestion.label} type="button" onClick={() => { if (suggestion.isFinal) { setAddressQuery(suggestion.label); setSelectedAddress(suggestion.label); setAddressSuggestionsOpen(false); } else { setAddressQuery(`${suggestion.label}, `); setAddressSuggestionsOpen(true); } }}>{suggestion.label}</button>)}</div> : null}</div>}
      </div>
    </Modal> : null}
  </Panel>;
}

function HouseChatSection({ canManage = false }) {
  const [chatLink, setChatLink] = useState(() => canManage ? window.localStorage.getItem(HOUSE_CHAT_STORAGE_KEY) ?? '' : HOUSE_CHAT_LINK);
  const [draftLink, setDraftLink] = useState('');
  const [isSetupOpen, setSetupOpen] = useState(false);
  const effectiveChatLink = canManage ? chatLink : HOUSE_CHAT_LINK;
  const isValidLink = isMaxChatLink(draftLink);
  const openSetup = () => { setDraftLink(chatLink); setSetupOpen(true); };
  const closeSetup = () => { setDraftLink(''); setSetupOpen(false); };
  const saveLink = () => {
    const normalizedLink = draftLink.trim();
    if (!isMaxChatLink(normalizedLink)) return;
    window.localStorage.setItem(HOUSE_CHAT_STORAGE_KEY, normalizedLink);
    setChatLink(normalizedLink);
    closeSetup();
  };

  return <section className="home-house-chat">
    {effectiveChatLink ? <CellList className="home-house-chat__list" header={<Typography.Headline className="home-section-title">У вашего дома есть чат</Typography.Headline>} mode="island">
        <CellSimple before={<Avatar.Container size={40}><Avatar.Image src="https://sun9-67.userapi.com/s/v1/ig2/CY_xDesKnMtl0OiJynK0oc7QnxQVJUgeciJSi_MpZUiE3EHSCNltr76jugXaygGd2Xh0M8-61v7Jwfl1kO87YWVe.jpg?quality=95&crop=0,0,1440,1440&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080,1280x1280,1440x1440&ava=1&u=SpmuDKJYdLKKRYYDgjLVQdEn6QnBonR3kSYxCSkCnm4&cs=200x200" alt="Аватар чата" fallback="Ч" /></Avatar.Container>} title="Соседи на связи" subtitle="23 участника" />
        <div className="home-house-chat__action"><Button mode="primary" appearance="themed" size="medium" stretched iconBefore={<Icon20SmileAddOutline />} onClick={() => window.open(effectiveChatLink, '_blank', 'noopener,noreferrer')}>Перейти в чат</Button></div>
      </CellList> : <>
      <div className="house-events-toolbar__report home-house-chat__create"><div className="home-house-chat__create-summary"><span className="house-events-toolbar__report-icon"><Icon28MessageArrowRightOutline /></span><span className="house-events-toolbar__report-copy"><b>У вашего дома ещё нет чата</b><small>Групповой чат жителей в MAX</small></span></div><Button mode="primary" appearance="themed" size="medium" stretched onClick={openSetup}>Добавить чат</Button></div>
    </>}
    {canManage && isSetupOpen ? <Modal className="home-access-modal home-chat-setup-modal" title="Создать чат дома" titleVariant="medium" onClose={closeSetup} actions={<><Button mode="secondary" appearance="neutral" size="medium" stretched onClick={closeSetup}>Отмена</Button><Button mode="primary" appearance="themed" size="medium" stretched disabled={!isValidLink} onClick={saveLink}>Сохранить</Button></>}>
      <div className="home-chat-setup">
        <Typography.Body className="home-chat-setup__intro">Сначала создайте групповой чат в MAX, затем скопируйте ссылку-приглашение.</Typography.Body>
        <ol className="home-chat-setup__steps">
          <li>В MAX нажмите кнопку создания и выберите «Создать групповой чат».</li>
          <li>Добавьте название и фотографию дома, затем создайте чат.</li>
          <li>Откройте название чата и выберите «Ссылка на чат».</li>
          <li>Скопируйте ссылку и вставьте её ниже.</li>
        </ol>
        <label className="home-chat-setup__field"><Typography.Label>Ссылка на чат</Typography.Label><input className="home-access-dialog__input" type="url" inputMode="url" placeholder="https://max.ru/join/..." value={draftLink} onChange={(event) => setDraftLink(event.target.value)} /></label>
        {draftLink && !isValidLink ? <Typography.Label className="home-chat-setup__error">Вставьте корректную ссылку на max.ru</Typography.Label> : null}
      </div>
    </Modal> : null}
  </section>;
}

function CouncilMemberHome() {
  const [selectedWork, setSelectedWork] = useState(null);

  if (selectedWork) return <CouncilWorkPage inspection={selectedWork} onBack={() => setSelectedWork(null)} />;

  return <Panel mode="primary" className="home-panel">
    <PageHeader title="Главная" />
    <main className="panel-content">
      <div className="home-sections">
        <CellAction before={<Avatar.Container size={40}><Avatar.Icon><Icon28BuildingOutline /></Avatar.Icon></Avatar.Container>} className="home-location-action" height="normal" mode="custom" style={{ '--MaxUi-CellAction_color': 'var(--text-secondary)' }}>
          <Flex align="center" className="home-location-row"><Flex align="center" gap={5} className="home-location-address-group"><Typography.Body><span>Санкт-Петербург,</span>{' '}<br className="home-location-mobile-break" /><span className="home-location-street">ул. Примерная, д. 12</span></Typography.Body><Icon20ChevronRight className="home-location-chevron" /></Flex></Flex>
        </CellAction>
        <HouseChatSection canManage />
        <section className="home-active-works">
          <Typography.Headline className="home-section-title">Активные работы дома</Typography.Headline>
          <div className="home-active-works__list">{COUNCIL_INSPECTIONS.map((work) => <ActiveWorkCard key={work.id} work={work} isObserved participationLabel="Вы проверяете" participationTone="checking" onOpen={() => setSelectedWork(work)} />)}</div>
        </section>
      </div>
    </main>
  </Panel>;
}

function ActiveWorkCard({ work, isObserved, participationLabel = 'Вы наблюдаете', participationTone = 'observed', onOpen, onObserve }) {
  return <article className="home-active-work" onClick={(event) => { if (!event.target.closest('.media-preview__button')) onOpen(); }}>
    <div className="home-active-work__head"><Typography.Title variant="small-strong" className="work-card-title">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div>
    <div className="home-active-work__statuses"><span className={work.statusTone ? `home-active-work__status--${work.statusTone}` : undefined}>{work.status}</span>{work.review ? <span>{work.review}</span> : null}{isObserved ? <span className={`home-active-work__status--${participationTone}`}>{participationLabel}</span> : null}</div>
    <div className="home-active-work__photos">{work.photos.map((photo, index) => <ImagePreview key={`${photo}-${index}`} title={`${work.title}: фото ${index + 1}`} src={photo} />)}</div>
    <Typography.Label className="home-active-work__date">{work.date}</Typography.Label>
    <Typography.Body variant="medium" className="home-active-work__description">{work.description}</Typography.Body>
    {work.canObserve && !isObserved ? <Button className="home-active-work__observe" mode="secondary" appearance="neutral" size="medium" stretched onClick={(event) => { event.stopPropagation(); onObserve?.(); }}>Стать наблюдателем</Button> : null}
  </article>;
}

export function ActiveWorkDetails({ work, viewerRole = 'resident', isObserved, onBack, onStopObserving, onReportResolved }) {
  const [photos] = useState(() => work.photos ?? []);
  const [remarkText, setRemarkText] = useState('');
  const [remarkPhotos, setRemarkPhotos] = useState([]);
  const [isEditingRemarks, setEditingRemarks] = useState(false);
  const [remarkActivity, setRemarkActivity] = useState([]);
  const [isResolutionConfirmOpen, setResolutionConfirmOpen] = useState(false);
  const [isResolutionReported, setResolutionReported] = useState(false);
  const remarkPhotoInputRef = useRef(null);
  return <Panel mode="primary" className="home-panel active-work-details-panel">
    <PageHeader title="Работа" onBack={onBack} />
    <main className="panel-content active-work-details-content">
      <header className="active-work-details__head"><div className="active-work-details__title-row"><div className="active-work-details__title-status"><Typography.Title variant="small-strong" className="active-work-details__main-title">Ремонтные работы</Typography.Title><div className="active-work-details__status-list"><span className="active-work-details__status">{work.status}</span>{work.review ? <span className="active-work-details__status">{work.review}</span> : null}{isObserved ? <span className="active-work-details__status active-work-details__status--observed">Вы наблюдаете</span> : null}</div></div><Typography.Label>ID {work.id}</Typography.Label></div></header>
      <section className="active-work-details__card">
        <Typography.Title variant="small-strong" className="active-work-details__section-title">История изменений</Typography.Title>
        <ol className="active-work-details__history"><li><i /><time>12.12 12:00</time><span>Дата получения акта</span></li><li><i /><time>12.12 12:00</time><span>Смена статуса: Ждёт исправлений</span></li><li className="active-work-details__history-current"><i /><time>12.12 12:00</time><span>Смена статуса: Проверено</span></li></ol>
        <Typography.Title variant="small-strong" className="active-work-details__section-title">Основная информация</Typography.Title>
        <div className="active-work-details__field"><Typography.Label>Название работы</Typography.Label><Typography.Body>{work.title}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Описание работы</Typography.Label><Typography.Body>{work.description}</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Адрес дома</Typography.Label><Typography.Body>Санкт-Петербург, ул. Примерная, д. 12</Typography.Body></div>
        <div className="active-work-details__field"><Typography.Label>Объект дома</Typography.Label><Typography.Body>Лифт</Typography.Body></div>
        <div className="active-work-details__photos-section"><Typography.Title variant="small-strong" className="active-work-details__section-title">Фотографии</Typography.Title>{photos.length ? <div className="active-work-details__photo-list">{photos.map((photo, index) => <ImagePreview key={`${photo}-${index}`} title={`${work.title}: фото ${index + 1}`} src={photo} />)}</div> : null}</div>
      </section>
      <section className="active-work-details__card active-work-details__related-card"><Typography.Title variant="small-strong">Связанные люди с работой</Typography.Title><div className="active-work-details__person-info"><Avatar.Container size={40}><Avatar.Image src="https://sun9-67.userapi.com/s/v1/ig2/CY_xDesKnMtl0OiJynK0oc7QnxQVJUgeciJSi_MpZUiE3EHSCNltr76jugXaygGd2Xh0M8-61v7Jwfl1kO87YWVe.jpg?quality=95&crop=0,0,1440,1440&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080,1280x1280,1440x1440&ava=1&u=SpmuDKJYdLKKRYYDgjLVQdEn6QnBonR3kSYxCSkCnm4&cs=200x200" alt="Иван Петров" fallback="ИП" /></Avatar.Container><div><Typography.Title variant="small-strong">Иван Петров</Typography.Title><Typography.Label className="active-work-details__person-role">Исполнитель</Typography.Label></div></div><div className="active-work-details__person-actions"><Button mode="secondary" appearance="themed" size="medium" stretched>Написать</Button><Button mode="primary" appearance="themed" size="medium" stretched>Позвонить</Button></div></section>
      <section className="active-work-details__card active-work-details__remarks">
        <Typography.Title variant="small-strong" className="active-work-details__section-title">Комментарии</Typography.Title>
        <div className="active-work-details__remark">
          <textarea aria-label="Текст комментария" placeholder="Введите комментарий" value={remarkText} maxLength={252} onChange={(event) => setRemarkText(event.target.value)} />
          <input ref={remarkPhotoInputRef} className="active-work-details__file-input" type="file" accept="image/*" multiple onChange={(event) => { const nextPhotos = Array.from(event.target.files ?? []).map((file) => URL.createObjectURL(file)); setRemarkPhotos((items) => [...items, ...nextPhotos].slice(0, 6)); event.target.value = ''; }} />
          {remarkPhotos.length ? <div className="active-work-details__photos-section">
            <Typography.Title variant="small-strong" className="active-work-details__section-title">Фотографии</Typography.Title>
            <div className="active-work-details__photos">
              {remarkPhotos.length ? <div className="active-work-details__photo-actions"><button type="button" aria-label="Добавить фотографии к комментарию" onClick={() => remarkPhotoInputRef.current?.click()}><Icon24AddCircle /></button><button type="button" aria-label="Редактировать фотографии комментария" aria-pressed={isEditingRemarks} onClick={() => setEditingRemarks((value) => !value)}><Icon24PenOutline /></button></div> : null}
              <div className="active-work-details__photo-list">{remarkPhotos.map((photo) => <div key={photo} className="active-work-details__photo"><img src={photo} alt="Фото комментария" />{isEditingRemarks ? <button type="button" className="active-work-details__photo-remove" aria-label="Удалить фото комментария" onClick={() => setRemarkPhotos((items) => items.filter((item) => item !== photo))}><Icon12CancelCircleFillRed width={20} height={20} /></button> : null}</div>)}</div>
            </div>
          </div> : null}
        </div>
        <div className="active-work-details__comment-actions"><Button className="active-work-details__add-remark" mode="secondary" appearance="themed" size="medium" stretched iconBefore={<Icon20AddCircleOutline />} onClick={() => { if (!remarkText.trim() && !remarkPhotos.length) return; const id = Date.now(); const now = new Date(); setRemarkActivity((items) => [...items, { id, text: remarkText.trim(), photos: remarkPhotos, date: formatCommentDate(now), author: 'Иван Петров' }]); setRemarkText(''); setRemarkPhotos([]); setEditingRemarks(false); }}>Добавить комментарий</Button><IconButton className="active-work-details__attach-icon-button" mode="secondary" appearance="themed" size="small" aria-label="Прикрепить фото к комментарию" onClick={() => remarkPhotoInputRef.current?.click()}><Icon24Attach /></IconButton></div>
        {remarkActivity.length ? <div className="active-work-details__comments"><Typography.Title variant="small-strong">Комментарии</Typography.Title>{remarkActivity.map((item) => <article key={item.id} className="active-work-details__remark-comment"><header><Avatar.Container size={32}><Avatar.Image src="https://sun9-67.userapi.com/s/v1/ig2/CY_xDesKnMtl0OiJynK0oc7QnxQVJUgeciJSi_MpZUiE3EHSCNltr76jugXaygGd2Xh0M8-61v7Jwfl1kO87YWVe.jpg?quality=95&crop=0,0,1440,1440&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720,1080x1080,1280x1280,1440x1440&ava=1&u=SpmuDKJYdLKKRYYDgjLVQdEn6QnBonR3kSYxCSkCnm4&cs=200x200" alt="Иван Петров" fallback="ИП" /></Avatar.Container><span><b>{item.author}</b><small>{item.date}</small></span></header>{item.text ? <Typography.Body>{item.text}</Typography.Body> : null}{item.photos.length ? <div className="active-work-details__comment-photo-list">{item.photos.map((photo) => <ImagePreview key={photo} title="Фото комментария" src={photo} />)}</div> : null}</article>)}</div> : null}
      </section>
      <div className="active-work-details__footer-actions">
        {viewerRole !== 'resident' ? (!isResolutionReported ? <Button mode="primary" appearance="themed" size="medium" stretched onClick={() => setResolutionConfirmOpen(true)}>Сообщить об исправлении</Button> : <Typography.Body className="active-work-details__resolution-notice">Сообщение об исправлении отправлено. Работа ожидает проверки.</Typography.Body>) : null}
        {isObserved ? <Button className="active-work-details__stop-observing" mode="secondary" appearance="negative" size="medium" stretched onClick={onStopObserving}>Перестать наблюдать</Button> : null}
      </div>
    </main>
    {isResolutionConfirmOpen ? <Modal title="Сообщить об исправлении" onClose={() => setResolutionConfirmOpen(false)} actions={<><Button mode="secondary" appearance="neutral" stretched onClick={() => setResolutionConfirmOpen(false)}>Отмена</Button><Button mode="primary" appearance="themed" stretched onClick={() => { setResolutionReported(true); setResolutionConfirmOpen(false); onReportResolved?.(); }}>Отправить</Button></>}><Typography.Body className="modal__copy">Мы передадим управляющей компании сообщение, что проблема устранена. Работа останется в списке до проверки.</Typography.Body></Modal> : null}
  </Panel>;
}

function ServiceCard({ service, isWide, onOpen, onHouseChatOpen }) {
  const Icon = service.icon;
  const openService = () => service.id === 'house-chat' ? onHouseChatOpen() : onOpen(service.page);
  return <div className={`home-service-card${isWide ? ' home-service-card--wide' : ''}`} role="button" tabIndex={0} onClick={openService} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openService(); } }}>
    <div className="home-service-icon-shell" style={{ '--service-rgb': hexToRgb(service.accentColor) }}><IconButton aria-label={service.title} className="home-service-icon-button" mode="link" appearance="contrast-static" style={{ color: service.accentColor }}><Icon width={28} height={28} /></IconButton></div>
    <Typography.Body className="home-service-title">{service.title}</Typography.Body>
  </div>;
}

function HomeWorkAction({ service, onOpen }) {
  const Icon = service.icon;
  const subtitle = service.id === 'house-events' ? 'Все обращения и текущие работы' : 'Новое обращение в управляющую компанию';
  return <button type="button" className="home-work-action" onClick={() => onOpen(service.page)}><span className="home-work-action__icon" style={{ '--service-rgb': hexToRgb(service.accentColor), color: service.accentColor }}><Icon width={22} height={22} /></span><span className="home-work-action__copy"><Typography.Body>{service.title}</Typography.Body><Typography.Label>{subtitle}</Typography.Label></span><Icon20ChevronRight className="home-work-action__chevron" /></button>;
}


function getHomeGridColumns() { if (window.innerWidth >= 920) return 4; if (window.innerWidth >= 640) return 3; return 2; }
function splitServicesIntoRows(items, columns) { const rows = []; for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns)); return rows; }
function hexToRgb(hex) { const value = hex.replace('#', ''); return `${Number.parseInt(value.slice(0, 2), 16)} ${Number.parseInt(value.slice(2, 4), 16)} ${Number.parseInt(value.slice(4, 6), 16)}`; }
function isMaxChatLink(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && (url.hostname === 'max.ru' || url.hostname.endsWith('.max.ru'));
  } catch {
    return false;
  }
}

function formatCommentDate(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date).replace(',', ' в');
}

function getAddressSuggestions(query) {
  const value = query.toLowerCase();
  if (!value || (!value.includes('санкт') && !value.includes('моск'))) return [{ label: 'Санкт-Петербург' }, { label: 'Москва' }];
  if (!value.includes('ул.')) return [{ label: 'Санкт-Петербург, ул. Примерная' }, { label: 'Санкт-Петербург, ул. Садовая' }];
  if (!value.includes('д.')) return [{ label: 'Санкт-Петербург, ул. Примерная, д. 12', isFinal: true }, { label: 'Санкт-Петербург, ул. Примерная, д. 14', isFinal: true }];
  return [{ label: 'Санкт-Петербург, ул. Примерная, д. 12', isFinal: true }, { label: 'Санкт-Петербург, ул. Примерная, д. 14', isFinal: true }];
}
