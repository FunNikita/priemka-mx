import { Button as MaxButton, IconButton as MaxIconButton } from '@maxhub/max-ui';
import { forwardRef } from 'react';

import './LegacyButton.css';

function buttonVariant(mode, appearance) {
  if (appearance === 'contrast-static') return mode === 'primary' ? 'primary-contrast' : 'secondary-contrast';
  if (appearance === 'negative') return 'destructive';
  if (mode === 'link' || mode === 'tertiary') return 'ghost';
  if (appearance === 'neutral') return mode === 'primary' ? 'primary-contrast' : 'secondary';
  if (mode === 'secondary') return 'secondary';
  return 'primary';
}

function legacyClass(base, mode, appearance, size, className) {
  return [base, `${base}--${size}`, `${base}--${mode}-${appearance}`, className].filter(Boolean).join(' ');
}

export const Button = forwardRef(function Button({ mode = 'primary', appearance = 'themed', size = 'medium', variant, className, ...props }, ref) {
  return <MaxButton ref={ref} size={size} variant={variant ?? buttonVariant(mode, appearance)} className={legacyClass('legacy-button', mode, appearance, size, className)} {...props} />;
});

export const IconButton = forwardRef(function IconButton({ mode = 'primary', appearance = 'themed', size = 'medium', variant, className, ...props }, ref) {
  return <MaxIconButton ref={ref} size={size} variant={variant ?? buttonVariant(mode, appearance)} className={legacyClass('legacy-icon-button', mode, appearance, size, className)} {...props} />;
});
