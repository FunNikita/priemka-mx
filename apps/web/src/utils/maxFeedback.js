// Log method names only: bridge arguments may contain user data or credentials.
export function callMaxBridge(method, call, available = true, onError) {
  if (!available) {
    console.info(`[MAX Bridge] ${method}: unavailable`);
    return undefined;
  }
  try {
    const result = call();
    console.info(`[MAX Bridge] ${method}: called`);
    if (result && typeof result.catch === 'function') {
      result.catch((error) => { console.error(`[MAX Bridge] ${method}: error`, error?.name ?? 'unknown'); onError?.(); });
    }
    return result;
  } catch (error) {
    console.error(`[MAX Bridge] ${method}: error`, error?.name ?? 'unknown');
    onError?.();
    return undefined;
  }
}

export function hapticSelection() { callMaxBridge('HapticFeedback.selectionChanged', () => window.WebApp.HapticFeedback.selectionChanged(), Boolean(window.WebApp?.HapticFeedback?.selectionChanged)); }
export function hapticSuccess() { callMaxBridge('HapticFeedback.notificationOccurred(success)', () => window.WebApp.HapticFeedback.notificationOccurred('success'), Boolean(window.WebApp?.HapticFeedback?.notificationOccurred)); }
export function hapticError() { callMaxBridge('HapticFeedback.notificationOccurred(error)', () => window.WebApp.HapticFeedback.notificationOccurred('error'), Boolean(window.WebApp?.HapticFeedback?.notificationOccurred)); }
