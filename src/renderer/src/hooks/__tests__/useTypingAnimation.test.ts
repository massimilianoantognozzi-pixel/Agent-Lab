import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTypingAnimation } from '../useTypingAnimation';

describe('typing status after a language change', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('restarts from the translated text and cancels the previous animation', () => {
    const { result, rerender, unmount } = renderHook(({ text }) => useTypingAnimation(text, 10, 100), { initialProps: { text: 'Loading' } });
    act(() => vi.advanceTimersByTime(20));
    expect(result.current).toBe('Lo');
    rerender({ text: 'Caricamento' });
    expect(result.current).toBe('');
    act(() => vi.advanceTimersByTime(30));
    expect(result.current).toBe('Car');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up the pause timer and leaves empty statuses empty', () => {
    const { result, rerender, unmount } = renderHook(({ text }) => useTypingAnimation(text, 10, 100), { initialProps: { text: 'OK' } });
    act(() => vi.advanceTimersByTime(20));
    expect(result.current).toBe('OK');
    rerender({ text: '' });
    expect(result.current).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });
});
