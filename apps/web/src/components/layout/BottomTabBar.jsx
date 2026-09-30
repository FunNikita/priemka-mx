import { Icon28HomeOutline, Icon28UserCircleOutline, Icon28WriteOutline } from '@vkontakte/icons';

import './BottomTabBar.css';

const tabs = [
  { id: 'home', label: 'Главная', icon: Icon28HomeOutline },
  { id: 'works', label: 'События', icon: Icon28WriteOutline },
  { id: 'role', label: 'Роль', icon: Icon28UserCircleOutline },
  { id: 'admin', label: 'Админка', icon: Icon28UserCircleOutline },
];

export function BottomTabBar({ activeTab, onChange, role = 'resident', isAdmin = false }) {
  const visibleTabs = tabs.filter((tab) => {
    if (tab.id === 'admin') return isAdmin;
    if (tab.id === 'works' && role === 'executor') return false;
    return true;
  });
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      <div className="tabbar-inner">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tabbar-item${activeTab === id ? ' tabbar-item--active' : ''}`} onClick={() => onChange(id)}>
            <Icon className="tabbar-icon-button" width={24} height={24} aria-hidden="true" />
            <span className="tabbar-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
