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

const pages = { works: WorksPage, 'report-problem': ReportProblemPage, notifications: NotificationsPage, history: HistoryPage, achievements: AchievementsPage, showcase: ShowcasePage };

export default function App() {
  const [tab, setTab] = useState('home');
  const [page, setPage] = useState(null);
  const [currentRole, setCurrentRole] = useState('admin');
  const [authPending, setAuthPending] = useState(Boolean(window.WebApp?.initData));
  const [authError, setAuthError] = useState('');
  const systemScheme = useSystemColorScheme();
  const InnerPage = page ? pages[page] : null;
  const closePage = () => setPage(null);
  useEffect(() => {
    document.documentElement.dataset.colorScheme = systemScheme;
  }, [systemScheme]);
  useEffect(() => {
    if (!window.WebApp?.initData) return;
    let active = true;
    apiFetch('/api/me').then(async (response) => {
      if (!response.ok) throw new Error('Не удалось подтвердить доступ через MAX. Откройте мини-приложение заново.');
      const me = await response.json();
      const memberships = me.houses?.filter((item) => item.status === 'ACTIVE') ?? [];
      const role = ['COUNCIL_MEMBER', 'CHAIRMAN', 'RESIDENT', 'EXECUTOR'].find((candidate) => memberships.some((item) => item.role === candidate));
      if (active) setCurrentRole(role ? role.toLowerCase().replace('_', '-') : me.user.isAdmin ? 'admin' : 'resident');
    }).catch((failure) => { if (active) setAuthError(failure.message); }).finally(() => { if (active) setAuthPending(false); });
    return () => { active = false; };
  }, []);
  if (authPending) return <div className="app-root" role="status">Загрузка профиля…</div>;
  if (authError) return <div className="app-root" role="alert">{authError}</div>;
  return <div className="app-root">
    <div className={`app-scroll${page ? ' app-scroll--without-tabbar' : ''}`}>
      {page && InnerPage ? page === 'works' ? <WorksPage onBack={closePage} onOpenReport={() => setPage('report-problem')} role={currentRole} /> : <InnerPage onBack={closePage} /> : tab === 'home' ? <HomePage onOpen={setPage} role={currentRole} /> : tab === 'inspections' ? <InspectionsPage /> : tab === 'works' ? <WorksPage onBack={() => setTab('home')} onOpenReport={() => setPage('report-problem')} role={currentRole} /> : <AdminPage onCurrentUserRoleChange={(role) => { setCurrentRole(role); setTab('home'); }} />}
    </div>
    {!page ? <BottomTabBar activeTab={tab} onChange={setTab} role={currentRole} /> : null}
  </div>;
}
