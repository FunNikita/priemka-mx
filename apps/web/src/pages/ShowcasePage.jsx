import { CellHeader, Container, Counter, Flex, Grid, Input, Panel, Switch, Typography } from '@maxhub/max-ui';
import { Button } from '../components/ui/LegacyButton';
import { Icon24MenuOutline, Icon24MessageOutline, Icon28BookSpreadOutline, Icon28WriteOutline } from '@vkontakte/icons';
import { useState } from 'react';

import { PageHeader } from '../components/layout/PageHeader';
import { SearchInput } from '../components/ui/SearchInput';
import { ListRow } from '../components/ui/ListRow';
import { Modal } from '../components/ui/Modal';
import { DishImagePreview } from '../components/dishes/DishImagePreview';
import { FeedbackCard } from '../components/ui/FeedbackCard';
import { CafeteriaCalendar } from '../components/cafeteria/CafeteriaCalendar';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { AppSelect } from '../components/ui/AppSelect';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { IdeaVoteButtons } from '../components/ui/IdeaVoteButtons';
import { RequestCard } from '../components/ui/RequestCard';
import { CharacterTextarea } from '../components/ui/CharacterTextarea';
import { UserIdentityCard } from '../components/ui/UserIdentityCard';
import { AttachmentButton } from '../components/ui/AttachmentButton';
import { SortableDishList } from '../components/ui/SortableDishList';
import { OperationStatusCards } from '../components/ui/OperationStatusCards';
import { Section } from '../components/ui/Section';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ServiceCard } from '../components/ui/ServiceCard';
import { StatCard } from '../components/ui/StatCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useSystemColorScheme } from '../utils/useSystemColorScheme';

export function ShowcasePage({ onBack }) {
  const [segment, setSegment] = useState('active');
  const [isModalOpen, setModalOpen] = useState(false);
  const [isCalendarOpen, setCalendarOpen] = useState(false);
  const [isEnabled, setEnabled] = useState(true);
  const [search, setSearch] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');
  const [selectValue, setSelectValue] = useState('');
  const [selectedDate, setSelectedDate] = useState('Не выбрана');
  const [previewScheme, setPreviewScheme] = useState('system');
  const [isNestedOpen, setNestedOpen] = useState(false);
  const [isChoiceOpen, setChoiceOpen] = useState(false);
  const [isDishSelected, setDishSelected] = useState(true);
  const [serviceColor, setServiceColor] = useState('#2D7CFF');
  const [serviceIcon, setServiceIcon] = useState(true);
  const [serviceDisabled, setServiceDisabled] = useState(false);
  const [statValue, setStatValue] = useState('12');
  const [statTone, setStatTone] = useState('blue');
  const [badgeTone, setBadgeTone] = useState('blue');
  const [feedbackAvatar, setFeedbackAvatar] = useState(true);
  const [identityAvatar, setIdentityAvatar] = useState(true);
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [buttonIcon, setButtonIcon] = useState(true);
  const [attachmentDisabled, setAttachmentDisabled] = useState(false);
  const [mediaImage, setMediaImage] = useState(true);
  const [calendarMin, setCalendarMin] = useState('2026-09-10');
  const [calendarMax, setCalendarMax] = useState('2026-10-10');
  const systemScheme = useSystemColorScheme();
  const resolvedPreviewScheme = previewScheme === 'system' ? systemScheme : previewScheme;
  return <Panel mode="primary" className="showcase-panel"><PageHeader title="Витрина компонентов" onBack={onBack} />
    <main className="panel-content">
      <div className="showcase-intro"><Typography.Headline variant="large-strong">Компоненты</Typography.Headline><Typography.Body>Откройте нужный блок: его параметры, доступные значения и текущее состояние находятся рядом с примером.</Typography.Body></div>
      <Section title="Тема компонента" component="ThemePreview">
        <SegmentedControl label="Тема предпросмотра" value={previewScheme} onChange={setPreviewScheme} items={[{ id: 'system', label: 'Устройство' }, { id: 'light', label: 'Светлая' }, { id: 'dark', label: 'Тёмная' }]} />
        <Typography.Label className="showcase-caption">Сейчас: {resolvedPreviewScheme === 'dark' ? 'тёмная тема' : 'светлая тема'}</Typography.Label>
      </Section>
      <div className="theme-preview" data-color-scheme={resolvedPreviewScheme}>
        <Section title="Заголовок панели" component="PageHeader">
          <div className="header-preview"><PageHeader title="Заголовок экрана" onBack={() => {}} rightContent={<span className="header-preview__action">Готово</span>} /></div>
        </Section>
        <Section title="Типографика" component="Typography">
          <div className="type-sample"><Typography.Headline variant="large-strong" className="type-sample__display">Заголовок крупный</Typography.Headline><Typography.Headline variant="small-strong" className="type-sample__heading">Заголовок раздела</Typography.Headline><Typography.Body className="type-sample__body">Основной текст для описаний, карточек и абзацев.</Typography.Body><Typography.Label className="type-sample__label">Подпись и вспомогательная информация</Typography.Label></div>
        </Section>
        <Section title="Карточки сервисов" component="ServiceCard" sandbox={<div className="sandbox-grid"><label>Цвет <input type="color" value={serviceColor} onChange={(event) => setServiceColor(event.target.value)} /></label><label>Иконка <Switch checked={serviceIcon} onChange={() => setServiceIcon((value) => !value)} /></label><label>Неактивна <Switch checked={serviceDisabled} onChange={() => setServiceDisabled((value) => !value)} /></label></div>}><div className="service-grid"><ServiceCard title="Работы" subtitle="Подпись" icon={serviceIcon ? Icon28WriteOutline : null} color={serviceColor} disabled={serviceDisabled} /><ServiceCard title="Оповещения" subtitle="Подпись" icon={Icon24MessageOutline} color="#F59E0B" badge="2" /></div></Section>
        <Section title="Статистика" component="StatCard" sandbox={<div className="sandbox-grid"><label>Значение <input value={statValue} onChange={(event) => setStatValue(event.target.value)} /></label><label>Цвет <select value={statTone} onChange={(event) => setStatTone(event.target.value)}><option value="blue">blue</option><option value="green">green</option><option value="orange">orange</option></select></label></div>}><div className="stats-grid"><StatCard value={statValue} label="всего" tone={statTone} /><StatCard value="9" label="готово" tone="green" /><StatCard value="3" label="в работе" tone="orange" /></div></Section>
        <Section title="Статусы" component="StatusBadge" sandbox={<div className="sandbox-grid"><label>Цвет <select value={badgeTone} onChange={(event) => setBadgeTone(event.target.value)}><option value="blue">blue</option><option value="orange">orange</option><option value="green">green</option><option value="red">red</option><option value="purple">purple</option></select></label></div>}><div className="badge-row"><StatusBadge tone={badgeTone}>Текущий</StatusBadge><StatusBadge tone="orange">В работе</StatusBadge><StatusBadge tone="green">Принято</StatusBadge><StatusBadge tone="red">Возврат</StatusBadge><StatusBadge tone="purple">Запланирована</StatusBadge></div></Section>
        <Section title="Контейнеры и счётчики" component="Container · Flex · Grid · Counter">
          <Container fullWidth className="showcase-container"><Flex align="center" justify="space-between"><Typography.Body>Container + Flex</Typography.Body><Counter value={12} appearance="themed" /></Flex></Container>
          <Grid cols={2} gapX={10} gapY={10} className="showcase-grid"><div>Grid · 1</div><div>Grid · 2</div></Grid>
        </Section>
        <Section title="Переключатель" component="SegmentedControl"><SegmentedControl label="Демонстрация сегментов" value={segment} onChange={setSegment} items={[{ id: 'active', label: 'Активные' }, { id: 'done', label: 'Готовые' }, { id: 'all', label: 'Все' }]} /><Typography.Label className="showcase-caption">Выбрано: {segment === 'active' ? 'Активные' : segment === 'done' ? 'Готовые' : 'Все'}</Typography.Label></Section>
        <Section title="Строки списков" component="ListRow"><div className="list-card"><ListRow title="Название строки" description="Описание и второстепенный текст" icon={Icon28BookSpreadOutline} tone="purple" trailing={<StatusBadge tone="purple">Статус</StatusBadge>} /><ListRow title="Кликабельная строка" description="Подпись элемента" icon={Icon24MenuOutline} tone="blue" meta="›" /></div></Section>
        <Section title="Заявка и статусы" component="RequestCard"><RequestCard /></Section>
        <Section title="Пустое состояние" component="EmptyState"><EmptyState actionLabel="Создать пропуск" onAction={() => setModalOpen(true)} /></Section>
        <Section title="Ошибка загрузки" component="ErrorState"><ErrorState onRetry={() => setModalOpen(true)} /></Section>
        <Section title="Оценка идеи" component="IdeaVoteButtons"><IdeaVoteButtons /></Section>
        <Section title="Карточки с медиа" component="DishImagePreview" sandbox={<div className="sandbox-grid"><label>Изображение <Switch checked={mediaImage} onChange={() => setMediaImage((value) => !value)} /></label></div>}>
          <div className="media-cards">
            <article className="media-card"><DishImagePreview title="Пример изображения" src={mediaImage ? 'https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr8rMdXdnSfLwsGicr3terCG0sAcrv5ePnmc4tB2YzeTn0' : undefined} placeholder="П" /><div className="media-card__copy"><Typography.Body>Карточка с фото</Typography.Body><Typography.Label>{mediaImage ? 'Нажмите на изображение' : 'Изображение выключено в песочнице'}</Typography.Label></div></article>
            <article className="media-card"><DishImagePreview title="Карточка без изображения" placeholder="П" /><div className="media-card__copy"><Typography.Body>Карточка без фото</Typography.Body><Typography.Label>Использует аккуратную заглушку</Typography.Label></div></article>
            <article className="media-card media-card--text-only"><div className="media-card__copy"><Typography.Body>Карточка без медиа</Typography.Body><Typography.Label>Текст занимает всю доступную ширину</Typography.Label></div></article>
          </div>
        </Section>
        <Section title="Карточка обратной связи" component="FeedbackCard" sandbox={<div className="sandbox-grid"><label>Аватар <Switch checked={feedbackAvatar} onChange={() => setFeedbackAvatar((value) => !value)} /></label></div>}><FeedbackCard photoUrl={feedbackAvatar ? 'https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr8rMdXdnSfLwsGicr3terCG0sAcrv5ePnmc4tB2YzeTn0' : undefined} /></Section>
        <Section title="Карточка пользователя" component="UserIdentityCard" sandbox={<div className="sandbox-grid"><label>Аватар <Switch checked={identityAvatar} onChange={() => setIdentityAvatar((value) => !value)} /></label></div>}><UserIdentityCard photoUrl={identityAvatar ? 'https://i.oneme.ru/i?r=BTGBPUwtwgYUeoFhO7rESmr8rMdXdnSfLwsGicr3terCG0sAcrv5ePnmc4tB2YzeTn0' : undefined} /></Section>
        <Section title="Поля формы" component="SearchInput · Input · CharacterTextarea · AppSelect">
          <div className="form-demo">
            <div className="field-sample"><CellHeader titleStyle="caps">Поиск</CellHeader><SearchInput placeholder="Поиск по работам" value={search} onChange={(value) => setSearch(typeof value === 'string' ? value : value.target?.value ?? '')} /></div>
            <div className="field-sample"><CellHeader titleStyle="caps">Текстовое поле</CellHeader><Input placeholder="Обычное текстовое поле" value={inputValue} onChange={(value) => setInputValue(typeof value === 'string' ? value : value.target?.value ?? '')} /></div>
            <div className="field-sample"><CellHeader titleStyle="caps">Многострочное поле · CharacterTextarea</CellHeader><CharacterTextarea value={textareaValue} onChange={setTextareaValue} maxLength={500} placeholder="Текст комментария" /></div>
            <div className="field-sample"><CellHeader titleStyle="caps">Выпадающий список</CellHeader><AppSelect ariaLabel="Тип справки" placeholder="Выберите тип справки" value={selectValue} onChange={setSelectValue} options={[{ value: 'study', label: 'Справка об обучении' }, { value: 'military', label: 'Справка для военкомата' }]} />{selectValue ? <Typography.Label className="field-sample__value">Текущий выбор: {selectValue === 'study' ? 'Справка об обучении' : 'Справка для военкомата'}</Typography.Label> : null}</div>
            <label className="showcase-switch"><span className="showcase-switch__copy"><Typography.Body className="showcase-switch__title">Переключатель</Typography.Body><Typography.Label className="showcase-switch__description">Описание настройки</Typography.Label></span><Switch checked={isEnabled} onChange={() => setEnabled(!isEnabled)} /></label>
          </div>
        </Section>
        <Section title="Кнопки и действия" component="Button" sandbox={<div className="sandbox-grid"><label>Иконка <Switch checked={buttonIcon} onChange={() => setButtonIcon((value) => !value)} /></label><label>Неактивна <Switch checked={buttonDisabled} onChange={() => setButtonDisabled((value) => !value)} /></label></div>}><div className="form-demo"><div className="button-row"><Button mode="secondary" appearance="neutral" disabled={buttonDisabled} iconBefore={buttonIcon ? <Icon24MenuOutline /> : undefined}>Вторичная</Button><Button mode="primary" appearance="themed" disabled={buttonDisabled} iconBefore={buttonIcon ? <Icon24MenuOutline /> : undefined}>Основная</Button></div><div className="button-row"><Button mode="link" appearance="neutral" disabled={buttonDisabled}>Ссылка</Button><Button mode="primary" appearance="negative" disabled={buttonDisabled}>Удалить</Button></div><Button mode="primary" appearance="themed" stretched disabled={buttonDisabled} onClick={() => setModalOpen(true)} iconBefore={buttonIcon ? <Icon24MenuOutline /> : undefined}>Открыть модальное окно</Button></div></Section>
        <Section title="Вложения" component="AttachmentButton" sandbox={<div className="sandbox-grid"><label>Неактивна <Switch checked={attachmentDisabled} onChange={() => setAttachmentDisabled((value) => !value)} /></label></div>}><AttachmentButton disabled={attachmentDisabled} accept="image/*,.pdf" /></Section>
        <Section title="Редактор меню" component="SortableDishList"><Typography.Label className="showcase-caption">Перетаскивайте карточки за область с точками, меняйте стоп-лист и удаляйте.</Typography.Label><SortableDishList /></Section>
        <Section title="Выбор блюда" component="ChoicePicker"><button type="button" className="choice-card choice-card--inline" aria-pressed={isDishSelected} onClick={() => setDishSelected((value) => !value)}><span className="choice-card__check">{isDishSelected ? '✓' : ''}</span><span className="dish-placeholder">П</span><div><Typography.Body>Паста с овощами</Typography.Body><Typography.Label>190 ₽</Typography.Label></div></button><Button mode="primary" appearance="themed" stretched onClick={() => setChoiceOpen(true)}>Открыть выбор блюд</Button></Section>
        <Section title="Результат операции" component="OperationResult"><div className="result-status"><span className="result-status__icon">✓</span><Typography.Headline variant="small-strong">Отправлено</Typography.Headline><Typography.Body>Отправлено 1 из 1 сообщения</Typography.Body><div><Button mode="secondary" appearance="neutral">На главную</Button><Button mode="secondary" appearance="negative">Создать ещё</Button></div></div></Section>
        <Section title="Состояния операции" component="OperationStatusCards"><OperationStatusCards /></Section>
        <Section title="Вложенные модалки" component="Modal"><Button mode="secondary" appearance="neutral" stretched onClick={() => setModalOpen(true)}>Открыть модалку с действием</Button></Section>
        <Section title="Состояние загрузки" component="LoadingSpinner"><div className="state-sample"><LoadingSpinner /></div></Section>
        <Section title="Дата и календарь" component="CafeteriaCalendar" sandbox={<div className="sandbox-grid"><label>Мин. дата <input type="date" value={calendarMin} max={calendarMax} onChange={(event) => setCalendarMin(event.target.value)} /></label><label>Макс. дата <input type="date" value={calendarMax} min={calendarMin} onChange={(event) => setCalendarMax(event.target.value)} /></label></div>}><Button mode="secondary" appearance="neutral" stretched onClick={() => setCalendarOpen(true)}>Выбрать дату</Button><Typography.Label className="showcase-caption">Выбрано: {selectedDate}</Typography.Label></Section>
      </div>
    </main>
    {isModalOpen ? <Modal title="Пример модального окна" onClose={() => { setModalOpen(false); setNestedOpen(false); }} actions={<Button mode="primary" appearance="themed" stretched onClick={() => setNestedOpen(true)}>Открыть вторую модалку</Button>}><Typography.Body className="modal__copy">Подтверждение, форма или просмотр вложения.</Typography.Body></Modal> : null}
    {isNestedOpen ? <Modal title="Вторая модалка" onClose={() => setNestedOpen(false)}><Typography.Body className="modal__copy">Вложенный диалог поверх первого.</Typography.Body></Modal> : null}
    {isChoiceOpen ? <Modal title="Добавить блюда" onClose={() => setChoiceOpen(false)} actions={<Button mode="primary" appearance="themed" stretched onClick={() => setChoiceOpen(false)}>Добавить</Button>}><button type="button" className="choice-card" aria-pressed={isDishSelected} onClick={() => setDishSelected((value) => !value)}><span className="choice-card__check">{isDishSelected ? '✓' : ''}</span><span className="dish-placeholder">П</span><div><Typography.Body>Паста с овощами</Typography.Body><Typography.Label>190 ₽</Typography.Label></div></button></Modal> : null}
    {isCalendarOpen ? <CafeteriaCalendar minDate={calendarMin} maxDate={calendarMax} onClose={() => setCalendarOpen(false)} onSelect={(value) => { setSelectedDate(value); setCalendarOpen(false); }} /> : null}
  </Panel>;
}
