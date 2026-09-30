// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { hapticError, hapticSelection, hapticSuccess } from './maxFeedback';

afterEach(() => { delete window.WebApp; vi.restoreAllMocks(); });

it('вызывает поддерживаемые тактильные методы MAX Bridge', () => {
  const feedback = { notificationOccurred: vi.fn(), selectionChanged: vi.fn() };
  window.WebApp = { HapticFeedback: feedback };
  vi.spyOn(console, 'info').mockImplementation(() => {});
  hapticSelection();
  hapticSuccess();
  hapticError();
  expect(feedback.selectionChanged).toHaveBeenCalledOnce();
  expect(feedback.notificationOccurred).toHaveBeenNthCalledWith(1, 'success');
  expect(feedback.notificationOccurred).toHaveBeenNthCalledWith(2, 'error');
});

it('не ломает экран без тактильного API', () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  expect(() => hapticSelection()).not.toThrow();
  expect(console.info).toHaveBeenCalledWith('[MAX Bridge] HapticFeedback.selectionChanged: unavailable');
});
