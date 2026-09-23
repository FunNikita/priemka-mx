import { Icon28HomeOutline, Icon28UserCircleOutline, Icon28WriteOutline } from '@vkontakte/icons';

import './BottomTabBar.css';

const tabs = [
  { id: 'home', label: 'Главная', icon: Icon28HomeOutline },
  { id: 'works', label: 'События', icon: Icon28WriteOutline },
  { id: 'admin', label: 'Админка', icon: Icon28UserCircleOutline },
];

export function BottomTabBar({ activeTab, onChange }) {
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      <div className="tabbar-inner">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tabbar-item${activeTab === id ? ' tabbar-item--active' : ''}`} onClick={() => onChange(id)}>
            <Icon className="tabbar-icon-button" width={24} height={24} aria-hidden="true" />
            <span className="tabbar-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
