import { useCallback, useEffect, useState } from 'react';
import { Panel, Typography } from '@maxhub/max-ui';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/LegacyButton';
import { HouseSwitcher } from '../components/common/HouseSwitcher';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { ImagePreview } from '../components/ui/ImagePreview';
import { allPages, formatDate, workStatuses } from './residentApi';
import { ResidentWorkDetails } from './ResidentWorkDetails';
import { CouncilHouseChat } from './CouncilHouseChat';

export function ResidentHome({ onOpen, houseId, onHouseChange, houses }) {
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const membership = houses?.find((item) => item.id === houseId);

  const reload = useCallback(async () => {
    if (!houseId) { setWorks([]); return; }
    setLoading(true); setError('');
    try {
      const data = await allPages(`/api/houses/${houseId}/works`);
      setWorks(data.items);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, [houseId]);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  if (selectedWorkId) return <ResidentWorkDetails workId={selectedWorkId} onBack={() => { setSelectedWorkId(null); void reload(); }} />;

  return <Panel mode="primary" className="home-panel">
    <PageHeader title="Главная" />
    <main className="panel-content"><div className="home-sections">
      <HouseSwitcher houseId={houseId} houses={houses} onHouseChange={onHouseChange} />
      {!houseId ? <EmptyState message="Сначала выберите дом" /> : <>{membership?.permissions?.viewHouseChat ? <CouncilHouseChat houseId={houseId} /> : null}<section className="home-active-works"><Typography.Headline className="home-section-title">Активные работы дома</Typography.Headline><div className="home-active-works__list">
        {loading ? <LoadingSpinner /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : works.filter((work) => work.status !== 'ACCEPTED').length ? works.filter((work) => work.status !== 'ACCEPTED').map((work) => <article key={work.id} className="home-active-work" onClick={(event) => { if (!event.target.closest('.media-preview__button')) setSelectedWorkId(work.id); }}><div className="home-active-work__head"><Typography.Title variant="small-strong" className="work-card-title">{work.title}</Typography.Title><Typography.Label>ID {work.id}</Typography.Label></div><div className="home-active-work__statuses"><span>{workStatuses[work.status]}</span>{work.isWatching ? <span className="home-active-work__status--observed">Вы наблюдаете</span> : null}</div>{work.media.length ? <div className="home-active-work__photos">{work.media.map((photo) => <ImagePreview key={photo.id} title={work.title} src={photo.url} />)}</div> : null}<Typography.Label className="home-active-work__date">{formatDate(work.date)}</Typography.Label><Typography.Body variant="medium" className="home-active-work__description">{work.description}</Typography.Body></article>) : <EmptyState message="Активных работ пока нет." />}
      </div></section></>}
      {houseId && membership?.permissions?.createObservation ? <Button mode="secondary" appearance="themed" size="medium" stretched onClick={() => onOpen('report-problem')}>Сообщить о проблеме</Button> : null}
    </div></main>
  </Panel>;
}
