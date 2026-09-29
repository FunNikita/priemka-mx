import { useState } from 'react';
import { Panel, Typography } from '@maxhub/max-ui';
import { PageHeader } from '../components/layout/PageHeader';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { PhotoGallery } from '../components/common/PhotoStrip';
import { photoPreviewUrl } from '../components/common/photoPreviewUrl';
import { Button } from '../components/ui/LegacyButton';
import { CouncilHouseChat } from './CouncilHouseChat';
import { ResidentHome } from './ResidentHome';
import { ResidentWorkDetails } from './ResidentWorkDetails';
import { previewText } from './residentApi';
import { ChairmanHome } from './ChairmanHome';
import { ExecutorHome } from './ExecutorHome';
import { InspectionsPage } from './InspectionsPage';
import './HomePage.css';

export function HomePage(props) {
  return props.role === 'council-member' ? <CouncilMemberHome {...props} /> : props.role === 'chairman' ? <ChairmanHome {...props} /> : props.role === 'executor' ? <ExecutorHome {...props} /> : <ResidentHome {...props} />;
}

function CouncilMemberHome({ houseId, houses, onHouseChange, onOpenInspection }) {

  return <Panel mode="primary" className="home-panel">
    <PageHeader title="Главная" />
    <main className="panel-content">
      <div className="home-sections council-home-sections">
        <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
        {houseId ? <CouncilHouseChat key={houseId} houseId={houseId} house={houses?.find((item) => item.id === houseId)} /> : null}
        <section className="home-active-works"><InspectionsPage houseId={houseId} embedded assignedOnly hideSearch showTitle title="Назначенные проверки" showHistory onOpenInspection={onOpenInspection} /></section>
      </div>
    </main>
  </Panel>;
}

function ActiveWorkCard({ work, isObserved, participationLabel = 'Вы наблюдаете', participationTone = 'observed', onOpen, onObserve }) {
  const [galleryIndex, setGalleryIndex] = useState(null);
  return <article className="home-active-work" onClick={(event) => { if (!event.target.closest('.home-active-work__photos, .image-modal-backdrop')) onOpen(); }}>
    <div className="home-active-work__head"><Typography.Title variant="small-strong" className="work-card-title">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div>
    <div className="home-active-work__statuses"><span className={work.statusTone ? `home-active-work__status--${work.statusTone}` : work.status === 'Принята' ? 'home-active-work__status--success' : undefined}>{work.status}</span>{work.review ? <span>{work.review}</span> : null}{isObserved ? <span className={`home-active-work__status--${participationTone}`}>{participationLabel}</span> : null}</div>
    {work.photos?.length ? <div className="home-active-work__photos">{work.photos.map((photo, index) => <button key={`${photo}-${index}`} type="button" className="media-preview__button" aria-label={`Открыть фото ${index + 1}`} onClick={(event) => { event.stopPropagation(); setGalleryIndex(index); }}><img className="media-preview__image" src={photoPreviewUrl(photo)} alt={`${work.title}: фото ${index + 1}`} /></button>)}{galleryIndex !== null ? <PhotoGallery photos={work.photos} title={work.title} initialIndex={galleryIndex} onClose={() => setGalleryIndex(null)} /> : null}</div> : null}
    {work.date ? <Typography.Label className="home-active-work__date">{work.date}</Typography.Label> : null}
    {work.description ? <Typography.Body variant="medium" className="home-active-work__description">{previewText(work.description)}</Typography.Body> : null}
    {work.canObserve && !isObserved ? <Button className="home-active-work__observe" mode="secondary" appearance="neutral" size="medium" stretched onClick={(event) => { event.stopPropagation(); onObserve?.(); }}>Стать наблюдателем</Button> : null}
  </article>;
}
