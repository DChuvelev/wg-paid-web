/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { App } from '../App';
import { localeStorageKey } from '../i18n/localeContext';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

export function renderApp(route: string, options: { strict?: boolean } = {}) {
  window.localStorage.setItem(localeStorageKey, 'en');
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false }
    }
  });
  const content = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const wrapper = options.strict ? <StrictMode>{content}</StrictMode> : content;

  return { queryClient, ...render(wrapper) };
}
