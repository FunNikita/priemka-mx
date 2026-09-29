import { Typography } from '@maxhub/max-ui';
import { IconButton } from '../ui/LegacyButton';
import { Icon28ChevronBack } from '@vkontakte/icons';
import { useEffect } from 'react';

import './PageHeader.css';

export function PageHeader({ title, onBack, rightContent }) {
  useEffect(() => {
    const backButton = window.WebApp?.BackButton;
    if (!onBack) { backButton?.hide?.(); return; }
    backButton?.show?.();
    backButton?.onClick?.(onBack);
    return () => { backButton?.offClick?.(onBack); backButton?.hide?.(); };
  }, [onBack]);
  return (
    <header className="page-header">
      <div className="page-header-side">
        {onBack ? (
          <IconButton aria-label="Назад" mode="link" appearance="neutral" className="page-header-back" onClick={onBack}>
            <Icon28ChevronBack />
          </IconButton>
        ) : null}
      </div>
      <Typography.Headline variant="medium-strong" className="page-header-title">{title}</Typography.Headline>
      <div className="page-header-side page-header-side--right">{rightContent}</div>
    </header>
  );
}
