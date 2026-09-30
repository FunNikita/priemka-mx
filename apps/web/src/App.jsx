import { PanelBack } from './components/layout/PanelBack';
import { useEffect, useRef, useState } from 'react';

import { BottomTabBar } from './components/layout/BottomTabBar';
import { AchievementsPage } from './pages/AchievementsPage';
import { AdminPage } from './pages/AdminPage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ReportProblemPage } from './pages/ReportProblemPage';
import { ShowcasePage } from './pages/ShowcasePage';
import { WorksPage } from './pages/WorksPage';
import { useSystemColorScheme } from './utils/useSystemColorScheme';
import { apiFetch } from './api';
import { getMaxInitData, profileFromMaxInitData } from './maxAuth';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { ErrorState } from './components/ui/ErrorState';
import { activeMembership, houseRole, selectedHouseId } from './houseContext';
import { ResidentWorkDetails } from './pages/ResidentWorkDetails';
import { ObservationDetail } from './pages/ObservationDetail';
import { ExecutorWorkDetail } from './pages/ExecutorHome';
import { ChairmanWorkDetail } from './pages/ChairmanHome';
import { CouncilWorkPage } from './pages/CouncilWorkPage';
import { Panel } from '@maxhub/max-ui';
import { request, jsonRequest } from './pages/residentApi';
import { allPages } from './pages/residentApi';
import { ChairmanHome } from './pages/ChairmanHome';
import { RolePage } from './pages/RolePage';
import { hapticError, hapticSelection, hapticSuccess } from './utils/maxFeedback';

const pages = { works: WorksPage, 'report-problem': ReportProblemPage, notifications: NotificationsPage, history: HistoryPage, achievements: AchievementsPage, showcase: ShowcasePage };
function readSession(key, fallback = null) { try { const value = sessionStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function handleSelectionClick(event) {
  if (!(event.target instanceof Element)) return;
  const option = event.target.closest('[role="radio"], [role="option"], .admin-select__option');
  if (!option || option.disabled || option.getAttribute('aria-disabled') === 'true') return;
  if (option.getAttribute('aria-checked') !== 'true' && option.getAttribute('aria-selected') !== 'true') {
    hapticSelection();
  }
}
function handleSelectionHaptic(event) {
  if (event.target.matches('select, input[type="checkbox"], input[type="radio"]')) hapticSelection();
}

export default function App() {
  const scrollRef = useRef(null);
  const [tab, setTab] = useState(() => readSession('max-active-tab', 'home'));
  const [page, setPage] = useState(() => readSession('max-active-page'));
  const [me, setMe] = useState(null);
  const [maxProfile, setMaxProfile] = useState(null);
  const [houseId, setHouseId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authPending, setAuthPending] = useState(true);
  const [authError, setAuthError] = useState('');
  const [previewDenied, setPreviewDenied] = useState(null);
  const [deepLink, setDeepLink] = useState(() => readSession('max-active-deep-link', readSession('max-active-inspection')));
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [roleErrorHouseId, setRoleErrorHouseId] = useState(null);
  const [authRevision, setAuthRevision] = useState(0);
  const systemScheme = useSystemColorScheme();
  const InnerPage = page ? pages[page] : null;
  const visibleTab = tab === 'admin' && !isAdmin ? 'home' : tab;
  const hideTabBar = page === 'report-problem' || deepLink?.kind === 'inspection';
  useEffect(() => { try { sessionStorage.setItem('max-active-tab', JSON.stringify(tab)); } catch { /* sessionStorage may be unavailable */ } }, [tab]);
  useEffect(() => { try { if (page) sessionStorage.setItem('max-active-page', JSON.stringify(page)); else sessionStorage.removeItem('max-active-page'); } catch { /* sessionStorage may be unavailable */ } }, [page]);
  useEffect(() => { try { if (deepLink) sessionStorage.setItem('max-active-deep-link', JSON.stringify(deepLink)); else sessionStorage.removeItem('max-active-deep-link'); } catch { /* sessionStorage may be unavailable */ } }, [deepLink]);
  const closePage = () => setPage(null);
  const changeTab = (nextTab) => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (nextTab === 'role') { setRoleError(''); setRoleErrorHouseId(null); }
    setPage(null);
    setDeepLink(null);
    setTab(nextTab);
  };
  const refreshMe = async (retainPage = false) => {
    const response = await apiFetch('/api/me');
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 403 && body.code === 'PREVIEW_ACCESS_DENIED') setPreviewDenied(body.maxUserId);
      if (response.status === 401) setAuthError('Сеанс MAX недействителен. Откройте мини-приложение заново.');
      throw new Error(body.message || 'Не удалось обновить доступ к дому. Повторите попытку.');
    }
    const nextMe = await response.json();
    setMe(nextMe);
    setIsAdmin(Boolean(nextMe.user?.isAdmin));
    setHouseId((current) => selectedHouseId(nextMe, current));
    if (!nextMe.user?.isAdmin) setTab((current) => current === 'admin' ? 'home' : current);
    if (!retainPage && !activeMembership(nextMe, houseId)) setPage(null);
    return nextMe;
  };
  const selectHouse = async (id, preservePage = false) => {
    const nextMe = await refreshMe(preservePage);
    if (!activeMembership(nextMe, id)) throw new Error('Активного доступа к этому дому нет.');
    await request('/api/me/last-house', jsonRequest('PUT', { houseId: id }));
    setHouseId(id);
    if (!preservePage) { setTab('home'); setPage(null); }
  };
  const membership = activeMembership(me, houseId);
  const role = houseRole(me, houseId);
  const currentRole = role === 'COUNCIL_MEMBER' ? 'council-member' : role?.toLowerCase() ?? 'resident';
  const openPage = (nextPage) => { if (nextPage !== 'report-problem' || membership?.permissions?.createObservation) setPage(nextPage); };
  const changeRole = async (targetHouseId, targetRole, targetCompany) => {
    if (roleBusy || !activeMembership(me, targetHouseId)) return;
    setRoleBusy(true); setRoleError(''); setRoleErrorHouseId(targetHouseId);
    try {
      await request(`/api/me/houses/${targetHouseId}/membership`, jsonRequest('PATCH', { role: targetRole, ...(targetRole === 'EXECUTOR' ? { executorCompanyName: targetCompany.trim() } : {}) }));
      await refreshMe(); hapticSuccess();
      return true;
    } catch (failure) { hapticError(); setRoleError(failure.message); if (failure.status === 409) await refreshMe(); return false; }
    finally { setRoleBusy(false); }
  };
  useEffect(() => {
    document.documentElement.dataset.colorScheme = systemScheme;
  }, [systemScheme]);
  useEffect(() => {
    let active = true;
    getMaxInitData().then((initData) => {
      if (!initData) throw new Error('Не удалось получить данные входа MAX. Откройте мини-приложение в MAX или настройте локальный DEV-доступ.');
      if (active) setMaxProfile(profileFromMaxInitData(initData));
      return apiFetch('/api/me', { headers: { 'X-Max-Init-Data': initData } });
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 403 && body.code === 'PREVIEW_ACCESS_DENIED') {
          if (active) setPreviewDenied(body.maxUserId);
          return null;
        }
        throw new Error(response.status === 401 ? 'Сеанс MAX недействителен. Откройте мини-приложение заново.' : body.message || 'Не удалось подтвердить доступ через MAX.');
      }
      const me = await response.json();
      if (active) {
        setMe(me);
        setIsAdmin(Boolean(me.user?.isAdmin));
        if (!me.user?.isAdmin) setTab((current) => current === 'admin' ? 'home' : current);
        setHouseId(selectedHouseId(me, me.lastHouseId));
        const match = /^(observation|work|join_request)_(\d+)$/.exec(me.start_param ?? '');
        if (match && Number.isSafeInteger(Number(match[2]))) {
          const link = { kind: match[1], id: Number(match[2]) };
          try {
            if (link.kind === 'join_request') {
              const chairmanHouses = me.houses.filter((house) => house.role === 'CHAIRMAN' && house.status === 'ACTIVE');
              const pages = await Promise.all(chairmanHouses.map((house) => allPages(`/api/houses/${house.id}/join-requests`, { status: 'PENDING' })));
              const target = chairmanHouses.find((house, index) => pages[index].items.some((item) => item.id === link.id));
              if (!target) throw new Error('Заявка уже обработана или недоступна.');
              if (active) { setHouseId(target.id); setDeepLink({ ...link, houseId: target.id }); }
            } else {
              let destination = link;
              if (link.kind === 'work') {
                const mapping = await request(`/api/works/${link.id}/observation`);
                if (mapping.observationId) destination = { kind: 'observation', id: mapping.observationId };
              }
              const detail = await request(`/api/${destination.kind === 'work' ? 'works' : 'observations'}/${destination.id}`);
              if (!activeMembership(me, detail.house?.id)) throw new Error('Обращение недоступно для выбранного дома.');
              if (active) { setHouseId(detail.house.id); setDeepLink(destination); }
            }
          } catch (failure) { if (active) setDeepLink({ kind: 'unavailable', message: failure.message }); }
        }
      }
    }).catch((failure) => { if (active) setAuthError(failure.message); }).finally(() => { if (active) setAuthPending(false); });
    return () => { active = false; };
  }, [authRevision]);
  if (authPending) return <div className="app-root app-root--boot"><div className="app-center"><LoadingSpinner /></div></div>;
  if (previewDenied) return <div className="app-root app-root--boot"><div className="app-center"><ErrorState message={`Доступ к закрытому тесту пока не открыт. Передайте администратору ваш MAX ID: ${previewDenied}`} onRetry={() => { setPreviewDenied(null); setAuthPending(true); setAuthRevision((value) => value + 1); }} /></div></div>;
  if (authError) return <div className="app-root app-root--boot"><div className="app-center"><ErrorState message={authError} onRetry={() => { setAuthPending(true); setAuthError(''); setAuthRevision((value) => value + 1); }} /></div></div>;
  return <div className="app-root" onClickCapture={handleSelectionClick} onChangeCapture={handleSelectionHaptic}>
    <div ref={scrollRef} className={`app-scroll${hideTabBar ? ' app-scroll--without-tabbar' : ''}`}>
      {deepLink?.kind === 'inspection' ? <CouncilWorkPage inspection={{ ...deepLink.inspection, apiKind: true }} onUpdated={() => {}} onBack={() => { sessionStorage.removeItem('max-active-inspection'); setDeepLink(null); }} /> : deepLink?.kind === 'work' ? currentRole === 'executor' ? <ExecutorWorkDetail workId={deepLink.id} onBack={() => setDeepLink(null)} /> : currentRole === 'chairman' ? <ChairmanWorkDetail houseId={houseId} workId={deepLink.id} onBack={() => setDeepLink(null)} /> : <ResidentWorkDetails workId={deepLink.id} onBack={() => setDeepLink(null)} /> : deepLink?.kind === 'observation' ? currentRole === 'executor' ? <ExecutorWorkDetail observationId={deepLink.id} onBack={() => setDeepLink(null)} /> : currentRole === 'chairman' ? <ChairmanWorkDetail houseId={houseId} observationId={deepLink.id} onBack={() => setDeepLink(null)} /> : <ObservationDetail observationId={deepLink.id} onBack={() => setDeepLink(null)} /> : deepLink?.kind === 'join_request' ? <ChairmanHome houseId={deepLink.houseId} houses={me.houses} onHouseChange={selectHouse} focusJoinRequestId={deepLink.id} onBack={() => setDeepLink(null)} /> : deepLink?.kind === 'unavailable' ? <Panel mode="primary" className="home-panel"><PanelBack onBack={() => setDeepLink(null)} /><main className="panel-content"><ErrorState message={deepLink.message} /></main></Panel> : page && InnerPage ? page === 'works' ? <WorksPage key={houseId} onBack={closePage} onOpenReport={() => openPage('report-problem')} houseId={houseId} canCreateObservation={membership?.permissions?.createObservation} canViewObservations={membership?.permissions?.viewObservations} userId={me.user?.id} houses={me.houses} onHouseChange={(id) => selectHouse(id, true)} /> : <InnerPage onBack={closePage} houseId={houseId} houses={me.houses} onAccessChanged={refreshMe} /> : visibleTab === 'home' ? <HomePage key={houseId} onOpen={openPage} onOpenInspection={(inspection) => { const next = { kind: 'inspection', inspection }; sessionStorage.setItem('max-active-inspection', JSON.stringify(next)); setDeepLink(next); }} role={currentRole} houseId={houseId} onHouseChange={selectHouse} houses={me.houses} userId={me.user?.id} /> : visibleTab === 'works' ? <WorksPage key={houseId} onBack={() => setTab('home')} onOpenReport={() => openPage('report-problem')} houseId={houseId} canCreateObservation={membership?.permissions?.createObservation} canViewObservations={membership?.permissions?.viewObservations} userId={me.user?.id} houses={me.houses} onHouseChange={(id) => selectHouse(id, true)} /> : visibleTab === 'role' ? <RolePage user={me.user} maxProfile={maxProfile} houses={me.houses} onSave={changeRole} busy={roleBusy} error={roleError} errorHouseId={roleErrorHouseId} /> : <AdminPage onMembershipChanged={refreshMe} />}
    </div>
    {!hideTabBar ? <BottomTabBar activeTab={visibleTab} onChange={changeTab} role={currentRole} isAdmin={isAdmin} /> : null}
  </div>;
}
