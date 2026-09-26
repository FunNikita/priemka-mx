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

const pages = { works: WorksPage, 'report-problem': ReportProblemPage, notifications: NotificationsPage, history: HistoryPage, achievements: AchievementsPage, showcase: ShowcasePage };

export default function App() {
  const [tab, setTab] = useState('home');
  const [page, setPage] = useState(null);
  const [currentRole, setCurrentRole] = useState('admin');
  const systemScheme = useSystemColorScheme();
  const InnerPage = page ? pages[page] : null;
  const closePage = () => setPage(null);
  useEffect(() => {
    document.documentElement.dataset.colorScheme = systemScheme;
  }, [systemScheme]);
  return <div className="app-root">
    <div className={`app-scroll${page ? ' app-scroll--without-tabbar' : ''}`}>
      {page && InnerPage ? page === 'works' ? <WorksPage onBack={closePage} onOpenReport={() => setPage('report-problem')} role={currentRole} /> : <InnerPage onBack={closePage} /> : tab === 'home' ? <HomePage onOpen={setPage} role={currentRole} /> : tab === 'inspections' ? <InspectionsPage /> : tab === 'works' ? <WorksPage onBack={() => setTab('home')} onOpenReport={() => setPage('report-problem')} role={currentRole} /> : <AdminPage onCurrentUserRoleChange={(role) => { setCurrentRole(role); setTab('home'); }} />}
    </div>
    {!page ? <BottomTabBar activeTab={tab} onChange={setTab} role={currentRole} /> : null}
  </div>;
}
