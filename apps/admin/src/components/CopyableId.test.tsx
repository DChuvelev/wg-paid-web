import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { CopyableId } from './CopyableId';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('copy feedback is visible on the button, resets, and cleans its timer on unmount', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  const view = render(<CopyableId label="User ID" value="user-1" />);
  const button = screen.getByRole('button', { name: 'Copy User ID' });

  fireEvent.click(button);
  await waitFor(() => expect(button.textContent).toBe('Copied'));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  fireEvent.click(button);
  await waitFor(() => expect(button.textContent).toBe('Copy failed'));
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(button.textContent).toBe('Copy failed');
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(button.textContent).toBe('Copy');

  fireEvent.click(button);
  await waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
