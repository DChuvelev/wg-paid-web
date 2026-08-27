import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from './App';

test('identifies the private foundation app', () => {
  render(<App />);
  expect(screen.getByRole('heading').textContent).toBe('WG Paid Admin — Web Foundation');
});
