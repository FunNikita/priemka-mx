import { useEffect, useState } from 'react';
import { Panel, Typography } from '@maxhub/max-ui';
import { PageHeader } from '../components/layout/PageHeader';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { ImagePreview } from '../components/ui/ImagePreview';
import { Button } from '../components/ui/LegacyButton';
import { CouncilWorkPage } from './CouncilWorkPage';
import { CouncilHouseChat } from './CouncilHouseChat';
import { useCouncilTasks } from './useCouncilTasks';
import { ResidentHome } from './ResidentHome';
import { ResidentWorkDetails } from './ResidentWorkDetails';
import { allPages, workStatuses } from './residentApi';
import { ChairmanHome } from './ChairmanHome';
import './HomePage.css';

export function HomePage(props) {
  return props.role === 'council-member' ? <CouncilMemberHome {...props} /> : props.role === 'chairman' ? <ChairmanHome {...props} /> : <ResidentHome {...props} />;
}

function CouncilMemberHome({ houseId, houses, onHouseChange }) {
  const [selectedWork, setSelectedWork] = useState(null);
  const [selectedHouseWorkId, setSelectedHouseWorkId] = useState(null);
  const [works, setWorks] = useState([]);
  const [worksLoading, setWorksLoading] = useState(true);
  const [houseError, setHouseError] = useState('');
  const { tasks, loading, error, reload } = useCouncilTasks(houseId);
  const visibleTasks = tasks.filter((task) => task.status !== 'COMPLETED');
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) { setWorks([]); setWorksLoading(true); setHouseError(''); } });
    if (houseId) allPages(`/api/houses/${houseId}/works`).then((result) => { if (active) setWorks(result.items); }).catch((failure) => { if (active) setHouseError(failure.message); }).finally(() => { if (active) setWorksLoading(false); });
    else Promise.resolve().then(() => { if (active) setWorksLoading(false); });
    return () => { active = false; };
  }, [houseId]);

  if (selectedWork) return <CouncilWorkPage inspection={{ ...selectedWork, apiKind: true }} onUpdated={reload} onBack={() => { setSelectedWork(null); void reload(); }} />;
  if (selectedHouseWorkId) return <ResidentWorkDetails workId={selectedHouseWorkId} onBack={() => setSelectedHouseWorkId(null)} />;

  return <Panel mode="primary" className="home-panel">
    <PageHeader title="Главная" />
    <main className="panel-content">
      <div className="home-sections">
        <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
        {houseError ? <Typography.Body role="alert">{houseError}</Typography.Body> : null}
        {houseId ? <CouncilHouseChat key={houseId} houseId={houseId} /> : null}
        <section className="home-active-works">
          <Typography.Headline className="home-section-title">Назначенные проверки</Typography.Headline>
          <div className="home-active-works__list">{loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : visibleTasks.length ? visibleTasks.map((task) => <ActiveWorkCard key={`${task.kind}-${task.id}`} work={{ id: task.work.id, title: task.work.title, status: task.kind === 'reinspection' ? 'Повторная' : task.status === 'IN_PROGRESS' ? 'В процессе' : 'Назначена', statusTone: task.kind === 'reinspection' ? 'repeat' : 'assigned', photos: [] }} isObserved participationLabel="Вы проверяете" participationTone="checking" onOpen={() => setSelectedWork(task)} />) : <EmptyState message="Назначенных проверок пока нет." />}</div>
        </section>
        <section className="home-active-works"><Typography.Headline className="home-section-title">Работы дома</Typography.Headline><div className="home-active-works__list">{worksLoading ? <LoadingSpinner /> : houseError ? <ErrorState message={houseError} onRetry={() => { setWorksLoading(true); allPages(`/api/houses/${houseId}/works`).then((result) => { setWorks(result.items); setHouseError(''); }).catch((failure) => setHouseError(failure.message)).finally(() => setWorksLoading(false)); }} /> : works.map((work) => <button key={work.id} className="home-active-work" onClick={() => setSelectedHouseWorkId(work.id)}><div className="home-active-work__head"><Typography.Title variant="small-strong">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div><Typography.Label>{workStatuses[work.status]}</Typography.Label><Typography.Body>{work.description}</Typography.Body></button>)}{!worksLoading && !houseError && !works.length ? <EmptyState message="Работ пока нет." /> : null}</div></section>
      </div>
    </main>
  </Panel>;
}

function ActiveWorkCard({ work, isObserved, participationLabel = 'Вы наблюдаете', participationTone = 'observed', onOpen, onObserve }) {
  return <article className="home-active-work" onClick={(event) => { if (!event.target.closest('.media-preview__button')) onOpen(); }}>
    <div className="home-active-work__head"><Typography.Title variant="small-strong" className="work-card-title">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div>
    <div className="home-active-work__statuses"><span className={work.statusTone ? `home-active-work__status--${work.statusTone}` : undefined}>{work.status}</span>{work.review ? <span>{work.review}</span> : null}{isObserved ? <span className={`home-active-work__status--${participationTone}`}>{participationLabel}</span> : null}</div>
    {work.photos?.length ? <div className="home-active-work__photos">{work.photos.map((photo, index) => <ImagePreview key={`${photo}-${index}`} title={`${work.title}: фото ${index + 1}`} src={photo} />)}</div> : null}
    {work.date ? <Typography.Label className="home-active-work__date">{work.date}</Typography.Label> : null}
    {work.description ? <Typography.Body variant="medium" className="home-active-work__description">{work.description}</Typography.Body> : null}
    {work.canObserve && !isObserved ? <Button className="home-active-work__observe" mode="secondary" appearance="neutral" size="medium" stretched onClick={(event) => { event.stopPropagation(); onObserve?.(); }}>Стать наблюдателем</Button> : null}
  </article>;
}
