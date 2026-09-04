import { Navigate, Route, Routes } from 'react-router';
import { AccountPage } from './features/account/AccountPage';
import { InvitePage } from './features/auth/InvitePage';
import { LoginPage } from './features/auth/LoginPage';
import { MagicPage } from './features/auth/MagicPage';
import { LocaleProvider } from './i18n/LocaleProvider';

export function App() {
  return (
    <LocaleProvider>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/auth/magic" element={<MagicPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LocaleProvider>
  );
}
