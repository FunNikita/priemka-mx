export function hapticSelection() { window.WebApp?.HapticFeedback?.selectionChanged?.(); }
export function hapticSuccess() { window.WebApp?.HapticFeedback?.notificationOccurred?.('success'); }
export function hapticError() { window.WebApp?.HapticFeedback?.notificationOccurred?.('error'); }
export function hapticLight() { window.WebApp?.HapticFeedback?.impactOccurred?.('light'); }
