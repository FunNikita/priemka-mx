import { useEffect, useState } from 'react';

import { BottomTabBar } from './components/layout/BottomTabBar';
import { AchievementsPage } from './pages/AchievementsPage';
import { AdminPage } from './pages/AdminPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { InspectionsPage } from './pages/InspectionsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ReportProblemPage } from './pages/ReportProblemPage';
import { ShowcasePage } from './pages/ShowcasePage';
import { WorksPage } from './pages/WorksPage';
import { useSystemColorScheme } from './utils/useSystemColorScheme';
import { apiFetch } from './api';
import { getMaxInitData } from './maxAuth';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorState } from './components/ui/ErrorState';
import { activeMembership, houseRole, selectedHouseId } from './houseContext';

const pages = { works: WorksPage, 'report-problem': ReportProblemPage, notifications: NotificationsPage, history: HistoryPage, achievements: AchievementsPage, showcase: ShowcasePage };

export default function App() {
  const [tab, setTab] = useState('home');
  const [page, setPage] = useState(null);
  const [me, setMe] = useState(null);
  const [houseId, setHouseId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authPending, setAuthPending] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authRevision, setAuthRevision] = useState(0);
  const systemScheme = useSystemColorScheme();
  const InnerPage = page ? pages[page] : null;
  const closePage = () => setPage(null);
  const refreshMe = async (retainPage = false) => {
    const response = await apiFetch('/api/me');
    if (!response.ok) throw new Error('Не удалось обновить доступ к дому. Повторите попытку.');
    const nextMe = await response.json();
    setMe(nextMe);
    setIsAdmin(Boolean(nextMe.user?.isAdmin));
    setHouseId((current) => selectedHouseId(nextMe, current));
    if (!nextMe.user?.isAdmin && tab === 'admin') setTab('home');
    if (tab === 'inspections' && houseRole(nextMe, selectedHouseId(nextMe, houseId)) !== 'COUNCIL_MEMBER') setTab('home');
    if (!retainPage && !activeMembership(nextMe, houseId)) setPage(null);
    return nextMe;
  };
  const selectHouse = async (id, preservePage = false) => {
    const nextMe = await refreshMe(preservePage);
    if (!activeMembership(nextMe, id)) throw new Error('Активного доступа к этому дому нет.');
    setHouseId(id);
    if (!preservePage) { setTab('home'); setPage(null); }
  };
  const membership = activeMembership(me, houseId);
  const role = houseRole(me, houseId);
  const currentRole = role === 'COUNCIL_MEMBER' ? 'council-member' : role?.toLowerCase() ?? 'resident';
  const openPage = (nextPage) => { if (nextPage !== 'report-problem' || membership?.permissions?.createObservation) setPage(nextPage); };
  useEffect(() => {
    document.documentElement.dataset.colorScheme = systemScheme;
  }, [systemScheme]);
  useEffect(() => {
    let active = true;
    getMaxInitData().then((initData) => {
      if (!initData) throw new Error('Не удалось получить данные входа MAX. Откройте мини-приложение в MAX или настройте локальный DEV-доступ.');
      return apiFetch('/api/me', { headers: { 'X-Max-Init-Data': initData } });
    }).then(async (response) => {
      if (!response.ok) throw new Error('Не удалось подтвердить доступ через MAX. Откройте мини-приложение заново.');
      const me = await response.json();
      if (active) {
        setMe(me);
        setIsAdmin(Boolean(me.user?.isAdmin));
        setHouseId(selectedHouseId(me, me.lastHouseId));
      }
    }).catch((failure) => { if (active) setAuthError(failure.message); }).finally(() => { if (active) setAuthPending(false); });
    return () => { active = false; };
  }, [authRevision]);
  if (authPending) return <div className="app-root app-root--boot"><div className="app-center"><LoadingSpinner /></div></div>;
  if (authError) return <div className="app-root app-root--boot"><div className="app-center"><ErrorState message={authError} onRetry={() => { setAuthPending(true); setAuthError(''); setAuthRevision((value) => value + 1); }} /></div></div>;
  return <div className="app-root">
    <div className={`app-scroll${page ? ' app-scroll--without-tabbar' : ''}`}>
      {page && InnerPage ? page === 'works' ? <WorksPage key={houseId} onBack={closePage} onOpenReport={() => openPage('report-problem')} houseId={houseId} canCreateObservation={membership?.permissions?.createObservation} canViewObservations={membership?.permissions?.viewObservations} houses={me.houses} onHouseChange={(id) => selectHouse(id, true)} /> : <InnerPage onBack={closePage} houseId={houseId} houses={me.houses} onAccessChanged={refreshMe} /> : tab === 'home' ? <HomePage key={houseId} onOpen={openPage} role={currentRole} houseId={houseId} onHouseChange={selectHouse} houses={me.houses} /> : tab === 'inspections' ? <InspectionsPage houseId={houseId} /> : tab === 'works' ? <WorksPage key={houseId} onBack={() => setTab('home')} onOpenReport={() => openPage('report-problem')} houseId={houseId} canCreateObservation={membership?.permissions?.createObservation} canViewObservations={membership?.permissions?.viewObservations} houses={me.houses} onHouseChange={(id) => selectHouse(id, true)} /> : <AdminPage onMembershipChanged={refreshMe} />}
    </div>
    {!page ? <BottomTabBar activeTab={tab} onChange={setTab} role={currentRole} isAdmin={isAdmin} /> : null}
  </div>;
}
