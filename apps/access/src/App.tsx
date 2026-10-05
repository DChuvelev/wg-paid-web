import { Navigate, Route, Routes, useLocation } from 'react-router';
import { lazy, Suspense } from 'react';
import { AccountPage } from './features/account/AccountPage';
import { InvitePage } from './features/auth/InvitePage';
import { LoginPage } from './features/auth/LoginPage';
import { MagicPage } from './features/auth/MagicPage';
import { LocaleProvider } from './i18n/LocaleProvider';
const PublicOfferPage = lazy(() => import('./features/legal/PublicOfferPage').then((module) => ({ default: module.PublicOfferPage })));

export function App() {
  const location = useLocation();
  return (
    <LocaleProvider>
      {location.pathname === '/' && location.hash === '#offer' ? <Suspense fallback={null}><PublicOfferPage /></Suspense> : (
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite" element={<InvitePage />} />
          <Route path="/auth/magic" element={<MagicPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </LocaleProvider>
  );
}
