import { Typography } from '@maxhub/max-ui';
import { IconButton } from '../ui/LegacyButton';
import { Icon28ChevronBack } from '@vkontakte/icons';
import { useEffect } from 'react';
import { callMaxBridge } from '../../utils/maxFeedback';

import './PageHeader.css';

export function PageHeader({ title, onBack, rightContent, bridgeBack = true }) {
  useEffect(() => {
    if (!bridgeBack) return;
    const backButton = window.WebApp?.BackButton;
    if (!onBack) { callMaxBridge('BackButton.hide', () => backButton?.hide?.(), Boolean(backButton?.hide)); return; }
    callMaxBridge('BackButton.show', () => backButton?.show?.(), Boolean(backButton?.show));
    callMaxBridge('BackButton.onClick', () => backButton?.onClick?.(onBack), Boolean(backButton?.onClick));
    return () => {
      callMaxBridge('BackButton.offClick', () => backButton?.offClick?.(onBack), Boolean(backButton?.offClick));
      callMaxBridge('BackButton.hide', () => backButton?.hide?.(), Boolean(backButton?.hide));
    };
  }, [onBack, bridgeBack]);
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
