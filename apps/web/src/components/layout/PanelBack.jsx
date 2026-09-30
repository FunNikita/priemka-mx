import { useEffect } from 'react';
import { callMaxBridge } from '../../utils/maxFeedback';

export function PanelBack({ onBack }) {
  useEffect(() => {
    const backButton = window.WebApp?.BackButton;
    callMaxBridge('BackButton.show', () => backButton.show(), Boolean(backButton?.show));
    callMaxBridge('BackButton.onClick', () => backButton.onClick(onBack), Boolean(backButton?.onClick));
    return () => {
      callMaxBridge('BackButton.offClick', () => backButton.offClick(onBack), Boolean(backButton?.offClick));
      callMaxBridge('BackButton.hide', () => backButton.hide(), Boolean(backButton?.hide));
    };
  }, [onBack]);

  return null;
}
